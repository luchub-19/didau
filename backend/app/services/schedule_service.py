import logging
from typing import Any
from uuid import UUID

from app.core.exceptions import (
    AppException,
    PlaceNotFoundError,
    RoomNotFoundError,
    ValidationError,
)
from app.domain.enums import PlaceCategory, PlaceStatus
from app.domain.models.schedule import ScheduleItem
from app.domain.patterns.conflict_rule.engine import ConflictDetectionEngine
from app.domain.patterns.conflict_rule.rule import (
    ConflictContext,
    ConflictResult,
    PlaceVoteSummary,
)
from app.domain.patterns.event_bus import IEventBus, ScheduleUpdatedEvent
from app.repositories import (
    IConflictRepository,
    IPlaceRepository,
    IRoomRepository,
    IScheduleRepository,
    IVoteRepository,
)

logger = logging.getLogger(__name__)


class ScheduleService:
    """Application Service quản lý lịch trình phòng (ScheduleItem) theo CONTRACTS.md."""

    def __init__(
        self,
        schedule_repo: IScheduleRepository,
        room_repo: IRoomRepository,
        place_repo: IPlaceRepository,
        event_bus: IEventBus,
        vote_repo: IVoteRepository | None = None,
        conflict_repo: IConflictRepository | None = None,
        conflict_engine: ConflictDetectionEngine | None = None,
    ) -> None:
        self.schedule_repo = schedule_repo
        self.room_repo = room_repo
        self.place_repo = place_repo
        self.event_bus = event_bus
        self.vote_repo = vote_repo
        self.conflict_repo = conflict_repo
        self.conflict_engine = conflict_engine or ConflictDetectionEngine()

    def _format_schedule_item(
        self,
        item: ScheduleItem,
        conflicts: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Chuẩn hóa đối tượng ScheduleItem thành dictionary đáp ứng ScheduleItemResponse."""
        place_name = item.place.name if item.place is not None else ""
        place_address = item.place.address if item.place is not None else None

        result: dict[str, Any] = {
            "id": item.id,
            "room_id": item.room_id,
            "place_id": item.place_id,
            "place_name": place_name,
            "place_address": place_address,
            "day_offset": item.day_offset,
            "start_minute": item.start_minute,
            "end_minute": item.end_minute,
            "order_index": item.order_index,
            "note": item.note,
        }
        if conflicts is not None:
            result["conflicts"] = conflicts
        return result

    async def _build_conflict_context(
        self,
        room_id: UUID,
        schedule_items: list[ScheduleItem],
    ) -> ConflictContext:
        """Chuẩn bị ConflictContext phục vụ đánh giá quy tắc xung đột."""
        room = await self.room_repo.get_by_id(room_id)
        budget_limit = room.budget_limit if room is not None else None

        all_places = await self.place_repo.list_by_room(room_id)
        places_summaries: list[PlaceVoteSummary] = []

        vote_summaries: dict[UUID, dict[str, int]] = {}
        if self.vote_repo is not None:
            vote_summaries = await self.vote_repo.get_vote_summary_by_room(room_id)

        for p in all_places:
            stats = vote_summaries.get(p.id, {"upvotes": 0, "downvotes": 0, "score": 0})
            upvotes = stats["upvotes"]
            downvotes = stats["downvotes"]
            score = stats["score"]

            category_val = (
                p.category
                if isinstance(p.category, PlaceCategory)
                else PlaceCategory(str(p.category))
            )
            status_val = (
                p.status if isinstance(p.status, PlaceStatus) else PlaceStatus(str(p.status))
            )

            places_summaries.append(
                PlaceVoteSummary(
                    place_id=p.id,
                    name=p.name,
                    category=category_val,
                    status=status_val,
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
            for s in schedule_items
        ]

        return ConflictContext(
            room_id=room_id,
            budget_limit=budget_limit,
            places=places_summaries,
            schedule_items=schedule_dicts,
        )

    async def get_schedule(self, room_id: UUID) -> list[dict[str, Any]]:
        """Lấy danh sách các mục lịch trình của phòng sắp xếp theo thời gian."""
        room = await self.room_repo.get_by_id(room_id)
        if room is None:
            raise RoomNotFoundError(
                message="Không tìm thấy phòng với mã yêu cầu.",
                details={"room_id": str(room_id)},
            )

        items = await self.schedule_repo.list_by_room(room_id)
        return [self._format_schedule_item(item) for item in items]

    async def add_item(self, room_id: UUID, data: dict[str, Any]) -> dict[str, Any]:
        """Thêm một địa điểm vào khung giờ cụ thể trong lịch trình và đánh giá xung đột tức thời."""
        room = await self.room_repo.get_by_id(room_id)
        if room is None:
            raise RoomNotFoundError(
                message="Không tìm thấy phòng với mã yêu cầu.",
                details={"room_id": str(room_id)},
            )

        place_id_raw = data.get("place_id")
        if place_id_raw is None:
            raise ValidationError(
                message="Thiếu thông tin place_id bắt buộc.",
                details={"field": "place_id"},
            )
        place_id = UUID(str(place_id_raw)) if not isinstance(place_id_raw, UUID) else place_id_raw

        place = await self.place_repo.get_by_id(place_id)
        if place is None or place.room_id != room_id:
            raise PlaceNotFoundError(
                message="Không tìm thấy địa điểm được yêu cầu trong phòng này.",
                details={"place_id": str(place_id), "room_id": str(room_id)},
            )

        start_minute = int(data.get("start_minute", 0))
        end_minute = int(data.get("end_minute", 0))
        day_offset = int(data.get("day_offset", 0))

        if start_minute >= end_minute:
            raise ValidationError(
                message="Thời điểm bắt đầu (start_minute) phải nhỏ hơn thời điểm kết thúc (end_minute).",
                details={"start_minute": start_minute, "end_minute": end_minute},
            )
        if not (0 <= start_minute <= 1439) or not (0 <= end_minute <= 1439):
            raise ValidationError(
                message="Khung giờ (phút) phải nằm trong khoảng từ 0 đến 1439.",
                details={"start_minute": start_minute, "end_minute": end_minute},
            )
        if day_offset < 0:
            raise ValidationError(
                message="day_offset không được là số âm.",
                details={"day_offset": day_offset},
            )

        existing_items = await self.schedule_repo.list_by_room(room_id)
        order_index = data.get("order_index")
        if order_index is None:
            day_items = [i for i in existing_items if i.day_offset == day_offset]
            order_index = max([i.order_index for i in day_items], default=-1) + 1

        create_data = {
            "room_id": room_id,
            "place_id": place_id,
            "day_offset": day_offset,
            "start_minute": start_minute,
            "end_minute": end_minute,
            "order_index": order_index,
            "note": data.get("note"),
        }

        created_item = await self.schedule_repo.create(create_data)

        # Lấy danh sách toàn bộ mục lịch trình mới cập nhật
        all_schedule_items = await self.schedule_repo.list_by_room(room_id)

        # Đánh giá xung đột tức thời
        conflict_context = await self._build_conflict_context(room_id, all_schedule_items)
        detected_conflicts: list[ConflictResult] = self.conflict_engine.evaluate_all(
            conflict_context
        )

        # Lưu xung đột vào DB nếu có conflict_repo
        if self.conflict_repo is not None:
            await self.conflict_repo.replace_conflicts(room_id, detected_conflicts)

        # Phát sự kiện ScheduleUpdatedEvent qua EventBus
        schedule_dicts = [
            {
                "id": str(s.id),
                "place_id": str(s.place_id),
                "place_name": s.place.name if s.place else "",
                "day_offset": s.day_offset,
                "start_minute": s.start_minute,
                "end_minute": s.end_minute,
                "order_index": s.order_index,
                "note": s.note,
            }
            for s in all_schedule_items
        ]
        await self.event_bus.publish(ScheduleUpdatedEvent(room_id=room_id, items=schedule_dicts))

        conflicts_payload = [
            {
                "rule_code": cr.rule_code,
                "level": cr.level.value if hasattr(cr.level, "value") else str(cr.level),
                "message": cr.message,
                "entity_type": cr.entity_type,
                "entity_ids": [str(eid) for eid in cr.entity_ids],
            }
            for cr in detected_conflicts
        ]

        return self._format_schedule_item(created_item, conflicts=conflicts_payload)

    async def update_schedule(
        self,
        room_id: UUID,
        items: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Cập nhật hàng loạt (Reorder / Thay đổi khung giờ kéo thả) các mục lịch trình."""
        room = await self.room_repo.get_by_id(room_id)
        if room is None:
            raise RoomNotFoundError(
                message="Không tìm thấy phòng với mã yêu cầu.",
                details={"room_id": str(room_id)},
            )

        for item_data in items:
            start_m = item_data.get("start_minute")
            end_m = item_data.get("end_minute")
            if start_m is not None and end_m is not None and int(start_m) >= int(end_m):
                raise ValidationError(
                    message="Thời điểm bắt đầu (start_minute) phải nhỏ hơn thời điểm kết thúc (end_minute).",
                    details={
                        "item_id": str(item_data.get("id")),
                        "start_minute": start_m,
                        "end_minute": end_m,
                    },
                )

        updated_items = await self.schedule_repo.bulk_update(room_id, items)

        # Đánh giá xung đột cập nhật
        conflict_context = await self._build_conflict_context(room_id, updated_items)
        detected_conflicts: list[ConflictResult] = self.conflict_engine.evaluate_all(
            conflict_context
        )

        if self.conflict_repo is not None:
            await self.conflict_repo.replace_conflicts(room_id, detected_conflicts)

        # Phát sự kiện ScheduleUpdatedEvent
        schedule_dicts = [
            {
                "id": str(s.id),
                "place_id": str(s.place_id),
                "place_name": s.place.name if s.place else "",
                "day_offset": s.day_offset,
                "start_minute": s.start_minute,
                "end_minute": s.end_minute,
                "order_index": s.order_index,
                "note": s.note,
            }
            for s in updated_items
        ]
        await self.event_bus.publish(ScheduleUpdatedEvent(room_id=room_id, items=schedule_dicts))

        return [self._format_schedule_item(item) for item in updated_items]

    async def delete_item(self, room_id: UUID, item_id: UUID) -> bool:
        """Xóa một mục lịch trình khỏi phòng."""
        room = await self.room_repo.get_by_id(room_id)
        if room is None:
            raise RoomNotFoundError(
                message="Không tìm thấy phòng với mã yêu cầu.",
                details={"room_id": str(room_id)},
            )

        existing_items = await self.schedule_repo.list_by_room(room_id)
        target = next((i for i in existing_items if i.id == item_id), None)
        if target is None:
            raise AppException(
                code="SCHEDULE_ITEM_NOT_FOUND",
                message="Không tìm thấy mục lịch trình yêu cầu trong phòng này.",
                status_code=404,
                details={"item_id": str(item_id), "room_id": str(room_id)},
            )

        success = await self.schedule_repo.delete(item_id)
        if not success:
            return False

        remaining_items = await self.schedule_repo.list_by_room(room_id)

        # Đánh giá lại xung đột sau khi xóa mục
        conflict_context = await self._build_conflict_context(room_id, remaining_items)
        detected_conflicts: list[ConflictResult] = self.conflict_engine.evaluate_all(
            conflict_context
        )

        if self.conflict_repo is not None:
            await self.conflict_repo.replace_conflicts(room_id, detected_conflicts)

        schedule_dicts = [
            {
                "id": str(s.id),
                "place_id": str(s.place_id),
                "place_name": s.place.name if s.place else "",
                "day_offset": s.day_offset,
                "start_minute": s.start_minute,
                "end_minute": s.end_minute,
                "order_index": s.order_index,
                "note": s.note,
            }
            for s in remaining_items
        ]
        await self.event_bus.publish(ScheduleUpdatedEvent(room_id=room_id, items=schedule_dicts))

        return True
