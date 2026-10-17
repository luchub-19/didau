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
from app.schemas.schedule import (
    BulkUpdateScheduleRequest,
    CreateScheduleItemRequest,
    DeleteScheduleItemResponse,
    ScheduleItemResponse,
)
from app.services.schedule_service import ScheduleService

router = APIRouter(prefix="/rooms/{room_id}/schedule", tags=["Schedule"])


def get_schedule_service(
    schedule_repo: Annotated[IScheduleRepository, Depends(get_schedule_repository)],
    room_repo: Annotated[IRoomRepository, Depends(get_room_repository)],
    place_repo: Annotated[IPlaceRepository, Depends(get_place_repository)],
    event_bus: Annotated[IEventBus, Depends(get_event_bus)],
    vote_repo: Annotated[IVoteRepository, Depends(get_vote_repository)],
    conflict_repo: Annotated[IConflictRepository, Depends(get_conflict_repository)],
) -> ScheduleService:
    """Dependency cung cấp ScheduleService."""
    return ScheduleService(
        schedule_repo=schedule_repo,
        room_repo=room_repo,
        place_repo=place_repo,
        event_bus=event_bus,
        vote_repo=vote_repo,
        conflict_repo=conflict_repo,
    )


_ensure_room_access = ensure_room_access


@router.get(
    "",
    response_model=list[ScheduleItemResponse],
    status_code=status.HTTP_200_OK,
    summary="Lấy danh sách lịch trình theo thứ tự thời gian",
)
async def get_schedule(
    room_id: UUID,
    current_member: Annotated[Member, Depends(get_current_member)],
    schedule_service: Annotated[ScheduleService, Depends(get_schedule_service)],
) -> list[ScheduleItemResponse]:
    """Lấy danh sách toàn bộ các mục lịch trình trong phòng."""
    _ensure_room_access(current_member, room_id)
    items = await schedule_service.get_schedule(room_id)
    return [ScheduleItemResponse.model_validate(i) for i in items]


@router.post(
    "",
    response_model=ScheduleItemResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Thêm một địa điểm vào lịch trình",
)
async def create_schedule_item(
    room_id: UUID,
    payload: CreateScheduleItemRequest,
    current_member: Annotated[Member, Depends(get_current_member)],
    schedule_service: Annotated[ScheduleService, Depends(get_schedule_service)],
) -> ScheduleItemResponse:
    """Thêm địa điểm vào khung giờ cụ thể và trả về cảnh báo xung đột tức thời nếu có."""
    _ensure_room_access(current_member, room_id)
    result = await schedule_service.add_item(room_id, payload.model_dump())
    return ScheduleItemResponse.model_validate(result)


@router.put(
    "",
    response_model=list[ScheduleItemResponse],
    status_code=status.HTTP_200_OK,
    summary="Cập nhật / Sắp xếp lại toàn bộ lịch trình (Bulk Update)",
)
async def update_schedule(
    room_id: UUID,
    payload: BulkUpdateScheduleRequest,
    current_member: Annotated[Member, Depends(get_current_member)],
    schedule_service: Annotated[ScheduleService, Depends(get_schedule_service)],
) -> list[ScheduleItemResponse]:
    """Bulk update danh sách lịch trình (đổi khung giờ, kéo thả thứ tự)."""
    _ensure_room_access(current_member, room_id)
    items_data = [item.model_dump() for item in payload.items]
    updated = await schedule_service.update_schedule(room_id, items_data)
    return [ScheduleItemResponse.model_validate(i) for i in updated]


@router.delete(
    "/{item_id}",
    response_model=DeleteScheduleItemResponse,
    status_code=status.HTTP_200_OK,
    summary="Xóa mục lịch trình",
)
async def delete_schedule_item(
    room_id: UUID,
    item_id: UUID,
    current_member: Annotated[Member, Depends(get_current_member)],
    schedule_service: Annotated[ScheduleService, Depends(get_schedule_service)],
) -> DeleteScheduleItemResponse:
    """Xóa một mục lịch trình khỏi phòng."""
    _ensure_room_access(current_member, room_id)
    await schedule_service.delete_item(room_id, item_id)
    return DeleteScheduleItemResponse(
        success=True,
        item_id=item_id,
        message="Đã xóa mục lịch trình thành công.",
    )

