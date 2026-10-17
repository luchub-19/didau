from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.api.deps import (
    ensure_room_access,
    get_current_member,
    get_event_bus,
    get_place_repository,
    get_room_repository,
    get_vote_repository,
)
from app.domain.models.member import Member
from app.domain.patterns.event_bus import IEventBus
from app.repositories import (
    IPlaceRepository,
    IRoomRepository,
    IVoteRepository,
)
from app.schemas.place import (
    CreatePlaceRequest,
    DeletePlaceResponse,
    PlaceResponse,
    UpdatePlaceRequest,
)
from app.services.place_service import PlaceService

router = APIRouter(prefix="/rooms/{room_id}/places", tags=["Places"])


def get_place_service(
    place_repo: Annotated[IPlaceRepository, Depends(get_place_repository)],
    room_repo: Annotated[IRoomRepository, Depends(get_room_repository)],
    vote_repo: Annotated[IVoteRepository, Depends(get_vote_repository)],
    event_bus: Annotated[IEventBus, Depends(get_event_bus)],
) -> PlaceService:
    """Dependency cung cấp PlaceService."""
    return PlaceService(
        place_repo=place_repo,
        room_repo=room_repo,
        vote_repo=vote_repo,
        event_bus=event_bus,
    )


_ensure_room_access = ensure_room_access


@router.post(
    "",
    response_model=PlaceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Đề xuất địa điểm mới vào phòng",
)
async def create_place(
    room_id: UUID,
    payload: CreatePlaceRequest,
    current_member: Annotated[Member, Depends(get_current_member)],
    place_service: Annotated[PlaceService, Depends(get_place_service)],
) -> PlaceResponse:
    """Thêm địa điểm đề xuất mới, tự động nhận diện danh mục và phát sự kiện PLACE_ADDED."""
    _ensure_room_access(current_member, room_id)
    result = await place_service.add_place(
        room_id=room_id,
        member_id=current_member.id,
        data=payload.model_dump(),
    )
    return PlaceResponse.model_validate(result)


@router.get(
    "",
    response_model=list[PlaceResponse],
    status_code=status.HTTP_200_OK,
    summary="Lấy danh sách địa điểm đề xuất trong phòng",
)
async def list_places(
    room_id: UUID,
    current_member: Annotated[Member, Depends(get_current_member)],
    place_service: Annotated[PlaceService, Depends(get_place_service)],
) -> list[PlaceResponse]:
    """Lấy danh sách các địa điểm kèm điểm vote và vote của thành viên hiện tại."""
    _ensure_room_access(current_member, room_id)
    results = await place_service.list_places(
        room_id=room_id,
        current_member_id=current_member.id,
    )
    return [PlaceResponse.model_validate(item) for item in results]


@router.get(
    "/{place_id}",
    response_model=PlaceResponse,
    status_code=status.HTTP_200_OK,
    summary="Lấy chi tiết một địa điểm theo ID",
)
async def get_place(
    room_id: UUID,
    place_id: UUID,
    current_member: Annotated[Member, Depends(get_current_member)],
    place_service: Annotated[PlaceService, Depends(get_place_service)],
) -> PlaceResponse:
    """Lấy chi tiết một địa điểm cụ thể."""
    _ensure_room_access(current_member, room_id)
    result = await place_service.get_place(
        room_id=room_id,
        place_id=place_id,
        current_member_id=current_member.id,
    )
    return PlaceResponse.model_validate(result)


@router.patch(
    "/{place_id}",
    response_model=PlaceResponse,
    status_code=status.HTTP_200_OK,
    summary="Chỉnh sửa thông tin địa điểm",
)
async def update_place(
    room_id: UUID,
    place_id: UUID,
    payload: UpdatePlaceRequest,
    current_member: Annotated[Member, Depends(get_current_member)],
    place_service: Annotated[PlaceService, Depends(get_place_service)],
) -> PlaceResponse:
    """Cập nhật thông tin địa điểm (chỉ người đề xuất hoặc Chủ phòng có quyền)."""
    _ensure_room_access(current_member, room_id)
    result = await place_service.update_place(
        room_id=room_id,
        place_id=place_id,
        member=current_member,
        data=payload.model_dump(exclude_unset=True),
    )
    return PlaceResponse.model_validate(result)


@router.delete(
    "/{place_id}",
    response_model=DeletePlaceResponse,
    status_code=status.HTTP_200_OK,
    summary="Xóa địa điểm khỏi phòng",
)
async def delete_place(
    room_id: UUID,
    place_id: UUID,
    current_member: Annotated[Member, Depends(get_current_member)],
    place_service: Annotated[PlaceService, Depends(get_place_service)],
) -> DeletePlaceResponse:
    """Xóa địa điểm đề xuất (chỉ người đề xuất hoặc Chủ phòng có quyền)."""
    _ensure_room_access(current_member, room_id)
    await place_service.delete_place(
        room_id=room_id,
        place_id=place_id,
        member=current_member,
    )
    return DeletePlaceResponse(
        success=True,
        place_id=place_id,
        message="Đã xóa địa điểm thành công.",
    )

