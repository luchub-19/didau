import logging
from uuid import UUID

from app.core.exceptions import MemberNotFoundError, UnauthorizedError, ValidationError
from app.domain.algorithms import compute_group_center
from app.domain.algorithms.group_center import MIN_MEMBERS
from app.domain.models.member import Member
from app.domain.patterns.event_bus import GroupCenterUpdatedEvent, IEventBus, MemberUpdatedEvent
from app.repositories import IMemberRepository, IRoomRepository
from app.services.algorithm_service import publish_priority_update, shared_origins
from app.services.state_version import publish_versioned

logger = logging.getLogger(__name__)


class MemberService:
    """Application Service quản lý nghiệp vụ thành viên (Member) và xác thực."""

    def __init__(
        self,
        member_repo: IMemberRepository,
        room_repo: IRoomRepository | None = None,
        event_bus: IEventBus | None = None,
    ) -> None:
        self.member_repo = member_repo
        self.room_repo = room_repo
        self.event_bus = event_bus

    async def get_by_token(self, token: str) -> Member | None:
        """Tìm thành viên theo token."""
        clean_token = token.strip()
        if not clean_token:
            return None
        return await self.member_repo.get_by_token(clean_token)

    async def validate_token(self, token: str | None) -> Member:
        """Xác thực member_token và đảm bảo tài khoản đang hoạt động."""
        if not token or not token.strip():
            raise UnauthorizedError(
                message="Yêu cầu xác thực token không hợp lệ hoặc đã hết hạn.",
                details={"reason": "MISSING_TOKEN"},
            )

        member = await self.get_by_token(token)
        if member is None:
            raise UnauthorizedError(
                message="Yêu cầu xác thực token không hợp lệ hoặc đã hết hạn.",
                details={"reason": "TOKEN_NOT_FOUND"},
            )

        if not member.is_active:
            raise UnauthorizedError(
                message="Tài khoản thành viên đã bị vô hiệu hóa.",
                details={"reason": "MEMBER_INACTIVE"},
            )

        # Cập nhật thời gian hoạt động
        try:
            await self.member_repo.update_last_active(member.id)
        except (RuntimeError, OSError) as err:
            logger.warning("Không thể cập nhật last_active cho member %s: %s", member.id, err)

        return member

    async def list_by_room(self, room_id: UUID) -> list[Member]:
        """Lấy danh sách thành viên trong phòng."""
        return await self.member_repo.list_by_room(room_id)

    async def get_by_room_and_nickname(self, room_id: UUID, nickname: str) -> Member | None:
        """Tìm kiếm thành viên theo nickname trong phòng."""
        return await self.member_repo.get_by_room_and_nickname(room_id, nickname)

    async def update_origin(
        self,
        member: Member,
        origin_lat: float | None,
        origin_lng: float | None,
    ) -> Member:
        """Đặt/xoá vị trí xuất phát riêng của chính thành viên và phát MEMBER_UPDATED (CR-11).

        Cả hai `None` = xoá; chỉ một `None` = lỗi 422. Sự kiện WS chỉ mang `has_origin`.
        """
        if (origin_lat is None) != (origin_lng is None):
            raise ValidationError(
                "origin_lat và origin_lng phải cùng có giá trị hoặc cùng là null.",
                details={"fields": ["origin_lat", "origin_lng"]},
            )

        had_center = await self._center_available(member.room_id)
        updated = await self.member_repo.set_origin(member.id, origin_lat, origin_lng)
        if updated is None:
            raise MemberNotFoundError(details={"member_id": str(member.id)})

        if self.room_repo is not None and self.event_bus is not None:
            await publish_versioned(
                self.room_repo,
                self.event_bus,
                MemberUpdatedEvent(
                    room_id=updated.room_id,
                    member_id=updated.id,
                    has_origin=updated.has_origin,
                ),
            )
            await self._publish_group_center(updated.room_id, had_center)
            # ALGO-04: người đi xa nhất có thể đổi (CR-12)
            await publish_priority_update(self.room_repo, self.event_bus, updated.room_id)
        return updated

    async def _center_available(self, room_id: UUID) -> bool:
        """Hiện đã có tâm nhóm (≥2 người chia sẻ) chưa — để chỉ phát khi widget có gì để đổi."""
        members = await self.member_repo.list_by_room(room_id)
        return len(shared_origins(members)) >= MIN_MEMBERS

    async def _publish_group_center(self, room_id: UUID, had_center: bool) -> None:
        """Phát GROUP_CENTER_UPDATED (tâm đã làm tròn, không toạ độ cá nhân) khi tâm vừa có / đổi / mất.

        Dưới 2 người chia sẻ cả trước lẫn sau thì không có gì để vẽ → không phát (không tốn `state_version`).
        """
        assert self.room_repo is not None and self.event_bus is not None
        room = await self.room_repo.get_by_id(room_id)
        members = await self.member_repo.list_by_room(room_id)
        result = compute_group_center(shared_origins(members), room.city if room else "HCM")
        if not had_center and not result.available:
            return
        await publish_versioned(
            self.room_repo,
            self.event_bus,
            GroupCenterUpdatedEvent(
                room_id=room_id,
                available=result.available,
                center={"lat": result.center[0], "lng": result.center[1]} if result.center else None,
                area_label=result.area_label,
                member_count=result.member_count,
            ),
        )
