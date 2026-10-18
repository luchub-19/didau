import logging
from collections.abc import Callable
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.exceptions import RoomNotFoundError
from app.domain.enums import PlaceCategory, PlaceStatus
from app.domain.models.conflict import Conflict
from app.domain.patterns.conflict_rule.engine import ConflictDetectionEngine
from app.domain.patterns.conflict_rule.rule import (
    ConflictContext,
    ConflictResult,
    PlaceVoteSummary,
)
from app.domain.patterns.event_bus import (
    ConflictDetectedEvent,
    DomainEvent,
    IEventBus,
    IEventHandler,
    PlaceAddedEvent,
    ScheduleUpdatedEvent,
)
from app.repositories import (
    ConflictRepository,
    IConflictRepository,
    IPlaceRepository,
    IRoomRepository,
    IScheduleRepository,
    IVoteRepository,
    PlaceRepository,
    RoomRepository,
    ScheduleRepository,
    VoteRepository,
)

logger = logging.getLogger(__name__)


class ConflictService:
    """Application Service quản lý việc kiểm tra, đánh giá và lưu trữ cảnh báo xung đột."""

    def __init__(
        self,
        conflict_repo: IConflictRepository,
        room_repo: IRoomRepository,
        place_repo: IPlaceRepository,
        schedule_repo: IScheduleRepository,
        event_bus: IEventBus,
        vote_repo: IVoteRepository | None = None,
        engine: ConflictDetectionEngine | None = None,
    ) -> None:
        self.conflict_repo = conflict_repo
        self.room_repo = room_repo
        self.place_repo = place_repo
        self.schedule_repo = schedule_repo
        self.event_bus = event_bus
        self.vote_repo = vote_repo
        self.engine = engine or ConflictDetectionEngine()

    async def _build_context(self, room_id: UUID) -> ConflictContext:
        """Thu thập dữ liệu phòng, địa điểm, phiếu bầu và lịch trình để xây dựng ConflictContext."""
        room = await self.room_repo.get_by_id(room_id)
        if room is None:
            raise RoomNotFoundError(
                message="Không tìm thấy phòng với mã yêu cầu.",
                details={"room_id": str(room_id)},
            )

        all_places = await self.place_repo.list_by_room(room_id)
        vote_summaries: dict[UUID, dict[str, int]] = {}
        if self.vote_repo is not None:
            vote_summaries = await self.vote_repo.get_vote_summary_by_room(room_id)

        places_summaries: list[PlaceVoteSummary] = []
        for p in all_places:
            stats = vote_summaries.get(p.id, {"upvotes": 0, "downvotes": 0, "score": 0})
            upvotes = stats["upvotes"]
            downvotes = stats["downvotes"]
            score = stats["score"]

            cat_val = (
                p.category
                if isinstance(p.category, PlaceCategory)
                else PlaceCategory(str(p.category))
            )
            st_val = p.status if isinstance(p.status, PlaceStatus) else PlaceStatus(str(p.status))

            places_summaries.append(
                PlaceVoteSummary(
                    place_id=p.id,
                    name=p.name,
                    category=cat_val,
                    status=st_val,
                    submitted_by_id=p.submitted_by_id,
                    estimated_cost=int(p.estimated_cost or 0),
                    open_minute=p.open_minute,
                    close_minute=p.close_minute,
                    created_at=p.created_at,
                    upvotes=upvotes,
                    downvotes=downvotes,
                    score=score,
                    latitude=p.latitude,
                    longitude=p.longitude,
                    address=p.address,
                )
            )

        all_schedule = await self.schedule_repo.list_by_room(room_id)
        schedule_dicts = [
            {
                "id": s.id,
                "place_id": s.place_id,
                "place_name": s.place.name if s.place else "",
                "day_offset": s.day_offset,
                "start_minute": s.start_minute,
                "end_minute": s.end_minute,
                "order_index": s.order_index,
                "note": s.note,
            }
            for s in all_schedule
        ]

        return ConflictContext(
            room_id=room_id,
            budget_limit=room.budget_limit,
            places=places_summaries,
            schedule_items=schedule_dicts,
        )

    async def list_conflicts(self, room_id: UUID) -> list[Conflict]:
        """Lấy danh sách các cảnh báo xung đột hiện tại của phòng từ database."""
        room = await self.room_repo.get_by_id(room_id)
        if room is None:
            raise RoomNotFoundError(
                message="Không tìm thấy phòng với mã yêu cầu.",
                details={"room_id": str(room_id)},
            )
        return await self.conflict_repo.list_by_room(room_id)

    async def evaluate_conflicts(self, room_id: UUID) -> list[ConflictResult]:
        """Đánh giá xung đột trên dữ liệu phòng và trả về danh sách ConflictResult theo interface."""
        context = await self._build_context(room_id)
        return self.engine.evaluate_all(context)

    async def evaluate_and_save(self, room_id: UUID) -> list[Conflict]:
        """Thực thi đánh giá xung đột, lưu mới vào database và phát tán ConflictDetectedEvent."""
        conflict_results = await self.evaluate_conflicts(room_id)
        saved_conflicts = await self.conflict_repo.replace_conflicts(room_id, conflict_results)

        conflicts_payload = [
            {
                "id": str(c.id),
                "room_id": str(c.room_id),
                "rule_code": c.rule_code,
                "level": c.level,
                "message": c.message,
                "entity_type": c.entity_type,
                "entity_ids": c.entity_ids,
                "params": c.params or {},
                "resolved": c.resolved,
                "created_at": (
                    c.created_at.isoformat()
                    if hasattr(c.created_at, "isoformat")
                    else str(c.created_at)
                ),
            }
            for c in saved_conflicts
        ]

        await self.event_bus.publish(
            ConflictDetectedEvent(room_id=room_id, conflicts=conflicts_payload)
        )
        return saved_conflicts


class ConflictEvaluationHandler(IEventHandler[DomainEvent]):
    """Event Handler lắng nghe ScheduleUpdatedEvent và PlaceAddedEvent để tự động đánh giá xung đột ngầm."""

    def __init__(
        self,
        session_factory: Callable[[], AsyncSession] | None = None,
        event_bus: IEventBus | None = None,
        engine: ConflictDetectionEngine | None = None,
    ) -> None:
        self.session_factory = session_factory or AsyncSessionLocal
        self.event_bus = event_bus
        self.engine = engine or ConflictDetectionEngine()

    async def handle(self, event: DomainEvent) -> None:
        """Xử lý sự kiện và kích hoạt đánh giá lại xung đột ngầm."""
        room_id = getattr(event, "room_id", None)
        if room_id is None:
            return

        try:
            async with self.session_factory() as session:
                conflict_repo = ConflictRepository(session)
                room_repo = RoomRepository(session)
                place_repo = PlaceRepository(session)
                schedule_repo = ScheduleRepository(session)
                vote_repo = VoteRepository(session)
                bus = self.event_bus

                # Nếu không có event_bus riêng, tạo dummy bus để không lặp vô tận
                if bus is None:
                    from app.domain.patterns.event_bus import InMemoryEventBus

                    bus = InMemoryEventBus()

                service = ConflictService(
                    conflict_repo=conflict_repo,
                    room_repo=room_repo,
                    place_repo=place_repo,
                    schedule_repo=schedule_repo,
                    event_bus=bus,
                    vote_repo=vote_repo,
                    engine=self.engine,
                )
                await service.evaluate_and_save(room_id)
                await session.commit()
                logger.info(
                    "Đã hoàn thành đánh giá xung đột ngầm cho phòng %s sau sự kiện %s",
                    room_id,
                    type(event).__name__,
                )
        except Exception:
            logger.exception(
                "Lỗi khi đánh giá xung đột ngầm cho phòng %s",
                room_id,
            )


def register_conflict_evaluation_handlers(
    event_bus: IEventBus,
    session_factory: Callable[[], AsyncSession] | None = None,
    engine: ConflictDetectionEngine | None = None,
) -> ConflictEvaluationHandler:
    """Đăng ký ConflictEvaluationHandler vào EventBus lắng nghe ScheduleUpdatedEvent và PlaceAddedEvent."""
    handler = ConflictEvaluationHandler(
        session_factory=session_factory,
        event_bus=event_bus,
        engine=engine,
    )
    event_bus.register(ScheduleUpdatedEvent, handler)
    event_bus.register(PlaceAddedEvent, handler)
    return handler
