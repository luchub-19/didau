from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.api.deps import (
    ensure_room_access,
    get_conflict_repository,
    get_current_member,
    get_event_bus,
    get_place_repository,
    get_room_repository,
    get_schedule_repository,
    get_vote_repository,
)
from app.domain.models.member import Member
from app.domain.patterns.event_bus import IEventBus
from app.repositories import (
    IConflictRepository,
    IPlaceRepository,
    IRoomRepository,
    IScheduleRepository,
    IVoteRepository,
)
from app.schemas.conflict import ConflictResponse
from app.services.conflict_service import ConflictService

router = APIRouter(prefix="/rooms/{room_id}/conflicts", tags=["Conflicts"])


def get_conflict_service(
    conflict_repo: Annotated[IConflictRepository, Depends(get_conflict_repository)],
    room_repo: Annotated[IRoomRepository, Depends(get_room_repository)],
    place_repo: Annotated[IPlaceRepository, Depends(get_place_repository)],
    schedule_repo: Annotated[IScheduleRepository, Depends(get_schedule_repository)],
    event_bus: Annotated[IEventBus, Depends(get_event_bus)],
    vote_repo: Annotated[IVoteRepository, Depends(get_vote_repository)],
) -> ConflictService:
    """Dependency cung cấp ConflictService."""
    return ConflictService(
        conflict_repo=conflict_repo,
        room_repo=room_repo,
        place_repo=place_repo,
        schedule_repo=schedule_repo,
        event_bus=event_bus,
        vote_repo=vote_repo,
    )


_ensure_room_access = ensure_room_access


@router.get(
    "",
    response_model=list[ConflictResponse],
    status_code=status.HTTP_200_OK,
    summary="Lấy danh sách cảnh báo xung đột hiện tại của phòng",
)
async def get_conflicts(
    room_id: UUID,
    current_member: Annotated[Member, Depends(get_current_member)],
    conflict_service: Annotated[ConflictService, Depends(get_conflict_service)],
) -> list[ConflictResponse]:
    """Lấy danh sách toàn bộ các cảnh báo xung đột hiện tại được lưu trong database."""
    _ensure_room_access(current_member, room_id)
    conflicts = await conflict_service.list_conflicts(room_id)
    return [ConflictResponse.model_validate(c) for c in conflicts]


@router.post(
    "/evaluate",
    response_model=list[ConflictResponse],
    status_code=status.HTTP_200_OK,
    summary="Kích hoạt đánh giá thủ công xung đột của phòng",
)
async def evaluate_conflicts(
    room_id: UUID,
    current_member: Annotated[Member, Depends(get_current_member)],
    conflict_service: Annotated[ConflictService, Depends(get_conflict_service)],
) -> list[ConflictResponse]:
    """Đánh giá toàn bộ quy tắc xung đột, lưu vào database và trả về danh sách xung đột mới nhất."""
    _ensure_room_access(current_member, room_id)
    conflicts = await conflict_service.evaluate_and_save(room_id)
    return [ConflictResponse.model_validate(c) for c in conflicts]

