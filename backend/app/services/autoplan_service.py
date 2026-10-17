import hashlib
import logging
from datetime import date
from typing import Any
from uuid import UUID

from app.core.exceptions import AppException, RoomNotFoundError
from app.domain.enums import PlaceCategory, PlaceStatus
from app.domain.patterns.itinerary import (
    HeuristicItineraryPlanner,
    PlanConstraints,
    PlannedSlot,
    select_candidates,
)
from app.domain.patterns.tie_break.strategy import PlaceVoteSummary
from app.repositories import IPlaceRepository, IRoomRepository, IVoteRepository
from app.schemas.schedule import (
    AutoPlanPreviewResponse,
    DroppedPlaceResponse,
    PlannedSlotResponse,
)
from app.services.schedule_service import ScheduleService

logger = logging.getLogger(__name__)


class AutoPlanService:
    """Application Service quản lý việc xem trước và áp dụng lịch trình tự động (Auto-plan)."""

    def __init__(
        self,
        room_repo: IRoomRepository,
        place_repo: IPlaceRepository,
        vote_repo: IVoteRepository,
        schedule_service: ScheduleService,
        planner: HeuristicItineraryPlanner | None = None,
    ) -> None:
        self.room_repo = room_repo
        self.place_repo = place_repo
        self.vote_repo = vote_repo
        self.schedule_service = schedule_service
        self.planner = planner or HeuristicItineraryPlanner()

    def _build_place_vote_summaries(
        self,
        all_places: list[Any],
        vote_summaries: dict[UUID, dict[str, int]],
    ) -> list[PlaceVoteSummary]:
        """Tổng hợp danh sách PlaceVoteSummary từ các entities Place và số liệu vote."""
        summaries: list[PlaceVoteSummary] = []
        for p in all_places:
            stats = vote_summaries.get(p.id, {"upvotes": 0, "downvotes": 0, "score": 0})
            cat = (
                p.category
                if isinstance(p.category, PlaceCategory)
                else PlaceCategory(str(p.category))
            )
            stat = (
                p.status
                if isinstance(p.status, PlaceStatus)
                else PlaceStatus(str(p.status))
            )
            summaries.append(
                PlaceVoteSummary(
                    place_id=p.id,
                    name=p.name,
                    category=cat,
                    status=stat,
                    submitted_by_id=p.submitted_by_id,
                    estimated_cost=int(p.estimated_cost or 0),
                    open_minute=p.open_minute,
                    close_minute=p.close_minute,
                    created_at=p.created_at,
                    upvotes=stats["upvotes"],
                    downvotes=stats["downvotes"],
                    score=stats["score"],
                    latitude=p.latitude,
                    longitude=p.longitude,
                    address=p.address,
                )
            )
        return summaries

    def compute_plan_hash(
        self,
        room_id: UUID,
        room_date: date | None,
        start_minute: int,
        end_minute: int,
        places: list[PlaceVoteSummary],
        slots: list[PlannedSlot] | list[PlannedSlotResponse] | list[dict[str, Any]],
    ) -> str:
        """Tính toán plan_hash đại diện cho trạng thái phòng và các slots nháp."""
        places_repr = [
            f"{p.place_id}:{p.status.value if hasattr(p.status, 'value') else p.status}:{p.score}"
            for p in sorted(places, key=lambda x: str(x.place_id))
        ]
        slots_repr: list[str] = []
        for s in slots:
            if isinstance(s, dict):
                pid = str(s.get("place_id", ""))
                do = s.get("day_offset", 0)
                sm = s.get("start_minute", 0)
                em = s.get("end_minute", 0)
            else:
                pid = str(getattr(s, "place_id", ""))
                do = getattr(s, "day_offset", 0)
                sm = getattr(s, "start_minute", 0)
                em = getattr(s, "end_minute", 0)
            slots_repr.append(f"{pid}:{do}:{sm}:{em}")

        raw_str = (
            f"{room_id}|{room_date}|{start_minute}|{end_minute}|"
            f"{';'.join(places_repr)}|{';'.join(slots_repr)}"
        )
        return hashlib.sha256(raw_str.encode("utf-8")).hexdigest()[:16]

    async def preview(
        self,
        room_id: UUID,
        day_offset: int = 0,
        duration_overrides: dict[UUID, int] | None = None,
    ) -> AutoPlanPreviewResponse:
        """Xem trước lịch trình tự động mà không ghi dữ liệu vào database."""
        room = await self.room_repo.get_by_id(room_id)
        if room is None:
            raise RoomNotFoundError(
                message="Không tìm thấy phòng với mã yêu cầu.",
                details={"room_id": str(room_id)},
            )

        all_places = await self.place_repo.list_by_room(room_id)
        vote_summaries = await self.vote_repo.get_vote_summary_by_room(room_id)
        places_summaries = self._build_place_vote_summaries(all_places, vote_summaries)

        candidates, used_fallback = select_candidates(places_summaries)

        start_minute = room.start_minute if room.start_minute is not None else 1020
        end_minute = room.end_minute if room.end_minute is not None else 1380
        event_date = room.event_date or date.today()

        if not candidates:
            plan_hash = self.compute_plan_hash(
                room_id=room_id,
                room_date=event_date,
                start_minute=start_minute,
                end_minute=end_minute,
                places=places_summaries,
                slots=[],
            )
            return AutoPlanPreviewResponse(
                slots=[],
                dropped=[],
                total_travel_min=0,
                total_cost=0,
                used_fallback=False,
                plan_hash=plan_hash,
            )

        raw_hours_map = {
            p.id: p.opening_hours_raw
            for p in all_places
            if getattr(p, "opening_hours_raw", None)
        }
        meeting_point = (
            (room.origin_lat, room.origin_lng)
            if (room.origin_lat is not None and room.origin_lng is not None)
            else None
        )

        constraints = PlanConstraints(
            event_date=event_date,
            day_offset=day_offset,
            num_days=1,
            start_minute=start_minute,
            end_minute=end_minute,
            meeting_point=meeting_point,
            duration_overrides=duration_overrides or {},
            opening_hours_raw=raw_hours_map,
        )

        planned_slots, dropped_places = await self.planner.plan_day(
            candidates, constraints
        )

        total_travel_min = sum(s.travel_from_prev_min for s in planned_slots)
        cost_map = {p.place_id: p.estimated_cost for p in candidates}
        total_cost = sum(cost_map.get(s.place_id, 0) for s in planned_slots)

        slot_responses = [
            PlannedSlotResponse(
                place_id=s.place_id,
                day_offset=s.day_offset,
                start_minute=s.start_minute,
                end_minute=s.end_minute,
                travel_from_prev_min=s.travel_from_prev_min,
                reasons=s.reasons,
            )
            for s in planned_slots
        ]
        dropped_responses = [
            DroppedPlaceResponse(
                place_id=d.place_id,
                reason=d.reason,
            )
            for d in dropped_places
        ]

        plan_hash = self.compute_plan_hash(
            room_id=room_id,
            room_date=event_date,
            start_minute=start_minute,
            end_minute=end_minute,
            places=places_summaries,
            slots=slot_responses,
        )

        return AutoPlanPreviewResponse(
            slots=slot_responses,
            dropped=dropped_responses,
            total_travel_min=total_travel_min,
            total_cost=total_cost,
            used_fallback=used_fallback,
            plan_hash=plan_hash,
        )

    async def apply(
        self,
        room_id: UUID,
        plan_hash: str,
        slots: list[PlannedSlotResponse],
    ) -> list[dict[str, Any]]:
        """Áp dụng phương án lịch trình vào database sau khi kiểm tra plan_hash."""
        room = await self.room_repo.get_by_id(room_id)
        if room is None:
            raise RoomNotFoundError(
                message="Không tìm thấy phòng với mã yêu cầu.",
                details={"room_id": str(room_id)},
            )

        all_places = await self.place_repo.list_by_room(room_id)
        vote_summaries = await self.vote_repo.get_vote_summary_by_room(room_id)
        places_summaries = self._build_place_vote_summaries(all_places, vote_summaries)

        start_minute = room.start_minute if room.start_minute is not None else 1020
        end_minute = room.end_minute if room.end_minute is not None else 1380
        event_date = room.event_date or date.today()

        expected_hash = self.compute_plan_hash(
            room_id=room_id,
            room_date=event_date,
            start_minute=start_minute,
            end_minute=end_minute,
            places=places_summaries,
            slots=slots,
        )

        if not plan_hash or plan_hash != expected_hash:
            raise AppException(
                code="STALE_PLAN",
                message="Dữ liệu phòng đã thay đổi, vui lòng xem trước lại.",
                status_code=409,
                details={"provided_hash": plan_hash, "expected_hash": expected_hash},
            )

        slots_data = [s.model_dump() for s in slots]
        return await self.schedule_service.replace_all(room_id, slots_data)
