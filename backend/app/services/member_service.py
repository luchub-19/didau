import logging
from uuid import UUID

from app.core.exceptions import UnauthorizedError
from app.domain.models.member import Member
from app.repositories import IMemberRepository

logger = logging.getLogger(__name__)


class MemberService:
    """Application Service quản lý nghiệp vụ thành viên (Member) và xác thực."""

    def __init__(self, member_repo: IMemberRepository) -> None:
        self.member_repo = member_repo

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
