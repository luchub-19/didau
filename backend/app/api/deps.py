from collections.abc import AsyncGenerator
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.exceptions import ForbiddenHostOnlyError, UnauthorizedError
from app.domain.enums import MemberRole
from app.domain.models.member import Member
from app.domain.patterns.event_bus import IEventBus, InMemoryEventBus
from app.repositories import (
    ConflictRepository,
    IConflictRepository,
    IMemberRepository,
    IPlaceRepository,
    IRoomRepository,
    IScheduleRepository,
    IVoteRepository,
    MemberRepository,
    PlaceRepository,
    RoomRepository,
    ScheduleRepository,
    VoteRepository,
)
from app.services.member_service import MemberService
from app.services.room_service import RoomService

# Singleton InMemoryEventBus
_event_bus_instance: IEventBus | None = None


def get_event_bus() -> IEventBus:
    """Dependency cung cấp EventBus singleton cho toàn bộ ứng dụng."""
    global _event_bus_instance
    if _event_bus_instance is None:
        _event_bus_instance = InMemoryEventBus()
    return _event_bus_instance


def set_event_bus(event_bus: IEventBus) -> None:
    """Thiết lập EventBus cho testing hoặc mocking."""
    global _event_bus_instance
    _event_bus_instance = event_bus


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency cung cấp AsyncSession từ database với transaction commit/rollback tự động."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


def get_room_repository(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> IRoomRepository:
    """Dependency cung cấp RoomRepository."""
    return RoomRepository(session)


def get_member_repository(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> IMemberRepository:
    """Dependency cung cấp MemberRepository."""
    return MemberRepository(session)


def get_place_repository(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> IPlaceRepository:
    """Dependency cung cấp PlaceRepository."""
    return PlaceRepository(session)


def get_vote_repository(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> IVoteRepository:
    """Dependency cung cấp VoteRepository."""
    return VoteRepository(session)


def get_schedule_repository(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> IScheduleRepository:
    """Dependency cung cấp ScheduleRepository."""
    return ScheduleRepository(session)


def get_conflict_repository(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> IConflictRepository:
    """Dependency cung cấp ConflictRepository."""
    return ConflictRepository(session)


def get_member_service(
    member_repo: Annotated[IMemberRepository, Depends(get_member_repository)],
) -> MemberService:
    """Dependency cung cấp MemberService."""
    return MemberService(member_repo=member_repo)


def get_room_service(
    room_repo: Annotated[IRoomRepository, Depends(get_room_repository)],
    member_repo: Annotated[IMemberRepository, Depends(get_member_repository)],
    place_repo: Annotated[IPlaceRepository, Depends(get_place_repository)],
    event_bus: Annotated[IEventBus, Depends(get_event_bus)],
) -> RoomService:
    """Dependency cung cấp RoomService."""
    return RoomService(
        room_repo=room_repo,
        member_repo=member_repo,
        place_repo=place_repo,
        event_bus=event_bus,
    )


def ensure_room_access(member: Member, room_id: UUID) -> None:
    """Xác minh thành viên có quyền truy cập vào phòng theo token."""
    if member.room_id != room_id:
        raise UnauthorizedError(
            message="Bạn không có quyền truy cập hoặc thao tác trên phòng này.",
            details={
                "requested_room_id": str(room_id),
                "member_room_id": str(member.room_id),
            },
        )


async def get_current_member(
    member_service: Annotated[MemberService, Depends(get_member_service)],
    x_member_token: Annotated[str | None, Header(alias="X-Member-Token")] = None,
) -> Member:
    """Dependency xác thực người dùng dựa trên header X-Member-Token."""
    return await member_service.validate_token(x_member_token)


async def get_current_host(
    current_member: Annotated[Member, Depends(get_current_member)],
) -> Member:
    """Dependency đảm bảo người dùng hiện tại là HOST của phòng."""
    role_val = (
        current_member.role.value
        if isinstance(current_member.role, MemberRole)
        else str(current_member.role)
    )
    if role_val != MemberRole.HOST.value:
        raise ForbiddenHostOnlyError(
            message="Thao tác này chỉ dành riêng cho Chủ phòng (HOST).",
            details={"member_id": str(current_member.id), "role": role_val},
        )
    return current_member
