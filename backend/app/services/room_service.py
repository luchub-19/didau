import logging
from typing import Any
from uuid import UUID

from app.core.exceptions import NicknameTakenError, RoomNotFoundError, ValidationError
from app.core.id_generator import generate_room_code
from app.domain.enums import MemberRole, RoomStatus, TieBreakStrategyName
from app.domain.patterns.event_bus import IEventBus, MemberJoinedEvent, RoomUpdatedEvent
from app.repositories import IMemberRepository, IPlaceRepository, IRoomRepository

logger = logging.getLogger(__name__)


class RoomService:
    """Application Service quản lý nghiệp vụ phòng (Room) và người tham gia."""

    def __init__(
        self,
        room_repo: IRoomRepository,
        member_repo: IMemberRepository,
        event_bus: IEventBus,
        place_repo: IPlaceRepository | None = None,
    ) -> None:
        self.room_repo = room_repo
        self.member_repo = member_repo
        self.event_bus = event_bus
        self.place_repo = place_repo

    async def create_room(self, data: dict[str, Any]) -> dict[str, Any]:
        """Tạo phòng mới và cấp quyền HOST cho người khởi tạo."""
        title = str(data.get("title", "")).strip()
        if not title:
            raise ValidationError("Tiêu đề phòng không được để trống.", details={"field": "title"})

        creator_nickname = str(data.get("creator_nickname", "")).strip()
        if not creator_nickname:
            raise ValidationError(
                "Biệt danh người tạo không được để trống.", details={"field": "creator_nickname"}
            )

        event_date = data.get("event_date")
        if not event_date:
            raise ValidationError(
                "Ngày diễn ra sự kiện là bắt buộc.", details={"field": "event_date"}
            )

        # Sinh mã phòng 6 ký tự ngẫu nhiên duy nhất
        room_code = data.get("code")
        if not room_code:
            for _ in range(10):
                candidate_code = generate_room_code()
                existing = await self.room_repo.get_by_code(candidate_code)
                if existing is None:
                    room_code = candidate_code
                    break
            if not room_code:
                room_code = generate_room_code()
        else:
            room_code = str(room_code).strip().upper()
            existing = await self.room_repo.get_by_code(room_code)
            if existing is not None:
                raise ValidationError(
                    f"Mã phòng '{room_code}' đã tồn tại.", details={"code": room_code}
                )

        tie_break_strategy = data.get(
            "tie_break_strategy", TieBreakStrategyName.EARLIEST_SUBMISSION
        )
        if isinstance(tie_break_strategy, TieBreakStrategyName):
            tie_break_strategy_val = tie_break_strategy.value
        else:
            tie_break_strategy_val = str(tie_break_strategy)

        # 1. Tạo bản ghi Room
        room_dict = {
            "code": room_code,
            "title": title,
            "description": data.get("description"),
            "event_date": event_date,
            "status": RoomStatus.PLANNING.value,
            "tie_break_strategy": tie_break_strategy_val,
            "budget_limit": data.get("budget_limit"),
        }
        room = await self.room_repo.create(room_dict)

        # 2. Tạo thành viên khởi tạo với role HOST
        member_dict = {
            "room_id": room.id,
            "nickname": creator_nickname,
            "avatar_url": data.get("creator_avatar_url"),
            "role": MemberRole.HOST.value,
            "is_active": True,
        }
        creator_member = await self.member_repo.create(member_dict)

        logger.info(
            "Đã tạo phòng mới '%s' (code: %s) với HOST '%s'",
            room.title,
            room.code,
            creator_member.nickname,
        )

        return {
            "room": room,
            "creator_member": creator_member,
            "member_token": creator_member.token,
        }

    async def join_room(
        self, code: str, nickname: str, avatar_url: str | None = None
    ) -> dict[str, Any]:
        """Tham gia phòng bằng mã phòng và nickname."""
        clean_code = str(code).strip().upper()
        if not clean_code:
            raise ValidationError("Mã phòng không được để trống.", details={"field": "room_code"})

        clean_nickname = str(nickname).strip()
        if not clean_nickname:
            raise ValidationError("Biệt danh không được để trống.", details={"field": "nickname"})

        # 1. Tìm phòng qua mã chia sẻ
        room = await self.room_repo.get_by_code(clean_code)
        if room is None:
            raise RoomNotFoundError(
                message=f"Không tìm thấy phòng với mã '{clean_code}'.",
                details={"room_code": clean_code},
            )

        # 2. Kiểm tra trùng biệt danh trong phòng
        existing = await self.member_repo.get_by_room_and_nickname(room.id, clean_nickname)
        if existing is not None:
            raise NicknameTakenError(
                message=f"Biệt danh '{clean_nickname}' đã được sử dụng bởi một thành viên khác trong phòng.",
                details={"nickname": clean_nickname, "room_id": str(room.id)},
            )

        # 3. Tạo thành viên mới với vai trò MEMBER
        member_dict = {
            "room_id": room.id,
            "nickname": clean_nickname,
            "avatar_url": avatar_url,
            "role": MemberRole.MEMBER.value,
            "is_active": True,
        }
        member = await self.member_repo.create(member_dict)

        # 4. Phát Domain Event MemberJoinedEvent qua EventBus
        event = MemberJoinedEvent(
            room_id=room.id,
            member_id=member.id,
            nickname=member.nickname,
            role=member.role,
            avatar_url=member.avatar_url,
        )
        await self.event_bus.publish(event)

        logger.info(
            "Thành viên '%s' đã tham gia phòng '%s' (code: %s)",
            member.nickname,
            room.title,
            room.code,
        )

        return {
            "room": room,
            "member": member,
            "member_token": member.token,
        }

    async def get_room_details(self, room_id: UUID) -> dict[str, Any]:
        """Lấy toàn bộ thông tin phòng, danh sách thành viên và tổng số địa điểm."""
        room = await self.room_repo.get_by_id(room_id)
        if room is None:
            raise RoomNotFoundError(
                message="Không tìm thấy phòng với ID yêu cầu.",
                details={"room_id": str(room_id)},
            )

        members = await self.member_repo.list_by_room(room_id)

        total_places = 0
        if self.place_repo is not None:
            places = await self.place_repo.list_by_room(room_id)
            total_places = len(places)

        return {
            "id": room.id,
            "code": room.code,
            "title": room.title,
            "description": room.description,
            "event_date": room.event_date,
            "status": room.status,
            "tie_break_strategy": room.tie_break_strategy,
            "budget_limit": room.budget_limit,
            "city": room.city,
            "origin_lat": room.origin_lat,
            "origin_lng": room.origin_lng,
            "start_minute": room.start_minute,
            "end_minute": room.end_minute,
            "members": members,
            "total_places": total_places,
            "created_at": room.created_at,
            "updated_at": room.updated_at,
        }

    async def update_room(self, room_id: UUID, data: dict[str, Any]) -> Any:
        """Cập nhật cấu hình phòng (Host only, kiểm tra ở router) và phát ROOM_UPDATED (CR-03)."""
        room = await self.room_repo.get_by_id(room_id)
        if room is None:
            raise RoomNotFoundError(
                message="Không tìm thấy phòng với ID yêu cầu.",
                details={"room_id": str(room_id)},
            )

        changes: dict[str, Any] = {}
        for key, value in data.items():
            if value is None:
                continue
            changes[key] = getattr(value, "value", value)

        if "title" in changes and not str(changes["title"]).strip():
            raise ValidationError("Tiêu đề phòng không được để trống.", details={"field": "title"})

        start = changes.get("start_minute", room.start_minute)
        end = changes.get("end_minute", room.end_minute)
        if start >= end:
            raise ValidationError(
                "Giờ bắt đầu phải nhỏ hơn giờ kết thúc.",
                details={"start_minute": start, "end_minute": end},
            )

        updated = await self.room_repo.update(room_id, changes) if changes else room
        if updated is None:
            raise RoomNotFoundError(
                message="Không tìm thấy phòng với ID yêu cầu.",
                details={"room_id": str(room_id)},
            )

        from app.schemas.room import RoomResponse

        room_payload = RoomResponse.model_validate(updated).model_dump(mode="json")
        if changes:
            await self.event_bus.publish(RoomUpdatedEvent(room_id=room_id, room=room_payload))
        return updated
