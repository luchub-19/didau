"""Đường đi (gđ7, CR-15 phần B): đường của chính người gọi + đường giữa các quán trên lịch. Không bao giờ có
đường/km xuất phát từ nhà người khác (CR-11)."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import (
    ensure_room_access,
    get_current_member,
    get_member_repository,
    get_place_repository,
    get_room_repository,
    get_schedule_repository,
)
from app.domain.models.member import Member
from app.repositories import (
    IMemberRepository,
    IPlaceRepository,
    IRoomRepository,
    IScheduleRepository,
)
from app.schemas.route import MyRoutesResponse, ScheduleRoutesResponse
from app.services.route_service import RouteService

router = APIRouter(prefix="/rooms/{room_id}", tags=["Routes"])


def get_route_service(
    room_repo: Annotated[IRoomRepository, Depends(get_room_repository)],
    member_repo: Annotated[IMemberRepository, Depends(get_member_repository)],
    place_repo: Annotated[IPlaceRepository, Depends(get_place_repository)],
    schedule_repo: Annotated[IScheduleRepository, Depends(get_schedule_repository)],
) -> RouteService:
    """Dependency cung cấp RouteService."""
    return RouteService(
        room_repo=room_repo,
        member_repo=member_repo,
        place_repo=place_repo,
        schedule_repo=schedule_repo,
    )


@router.get(
    "/routes/me",
    response_model=MyRoutesResponse,
    status_code=status.HTTP_200_OK,
    summary="Đường của tôi: nhà → quán và quán → nhà (CR-15)",
)
async def get_my_routes(
    room_id: UUID,
    current_member: Annotated[Member, Depends(get_current_member)],
    service: Annotated[RouteService, Depends(get_route_service)],
    place_id: Annotated[UUID, Query(description="Quán cần xem đường")],
) -> MyRoutesResponse:
    """Chỉ vị trí người gọi TỰ chia sẻ; chưa chia sẻ → 404 `NO_ORIGIN`; quán thiếu toạ độ → 404 `NO_PLACE_COORDS`."""
    ensure_room_access(current_member, room_id)
    return await service.my_routes(room_id, current_member, place_id)


@router.get(
    "/schedule/routes",
    response_model=ScheduleRoutesResponse,
    status_code=status.HTTP_200_OK,
    summary="Đường giữa các mục liên tiếp trên lịch ngày đầu (CR-15)",
)
async def get_schedule_routes(
    room_id: UUID,
    current_member: Annotated[Member, Depends(get_current_member)],
    service: Annotated[RouteService, Depends(get_route_service)],
) -> ScheduleRoutesResponse:
    """Cặp liên tiếp như ALGO-03; cặp có quán thiếu toạ độ chỉ được đếm ở `unknown_leg_count`."""
    ensure_room_access(current_member, room_id)
    return await service.schedule_routes(room_id)
