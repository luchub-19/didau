from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.api.deps import (
    ensure_room_access,
    get_current_member,
    get_member_repository,
    get_place_repository,
    get_room_repository,
    get_schedule_repository,
    get_vote_repository,
)
from app.domain.models.member import Member
from app.repositories import (
    IMemberRepository,
    IPlaceRepository,
    IRoomRepository,
    IScheduleRepository,
    IVoteRepository,
)
from app.schemas.algorithm import GroupCenterResponse, ScheduleFeasibility, TieSuggestion
from app.services.algorithm_service import AlgorithmService

router = APIRouter(prefix="/rooms/{room_id}", tags=["Algorithms"])


def get_algorithm_service(
    room_repo: Annotated[IRoomRepository, Depends(get_room_repository)],
    member_repo: Annotated[IMemberRepository, Depends(get_member_repository)],
    place_repo: Annotated[IPlaceRepository, Depends(get_place_repository)],
    vote_repo: Annotated[IVoteRepository, Depends(get_vote_repository)],
    schedule_repo: Annotated[IScheduleRepository, Depends(get_schedule_repository)],
) -> AlgorithmService:
    """Dependency cung cấp AlgorithmService."""
    return AlgorithmService(
        room_repo=room_repo,
        member_repo=member_repo,
        place_repo=place_repo,
        vote_repo=vote_repo,
        schedule_repo=schedule_repo,
    )


@router.get(
    "/group-center",
    response_model=GroupCenterResponse,
    status_code=status.HTTP_200_OK,
    summary="Tâm nhóm + quán gần tâm (ALGO-01)",
)
async def get_group_center(
    room_id: UUID,
    current_member: Annotated[Member, Depends(get_current_member)],
    service: Annotated[AlgorithmService, Depends(get_algorithm_service)],
) -> GroupCenterResponse:
    """Tâm đã làm tròn 3 chữ số; không bao giờ có toạ độ từng thành viên (CR-11)."""
    ensure_room_access(current_member, room_id)
    return await service.group_center(room_id)


@router.get(
    "/tie-break/suggestion",
    response_model=TieSuggestion,
    status_code=status.HTTP_200_OK,
    summary="Gợi ý hoà phiếu bằng Ordered Median theo từng loại quán (ALGO-02, CR-15)",
)
async def get_tie_suggestion(
    room_id: UUID,
    current_member: Annotated[Member, Depends(get_current_member)],
    service: Annotated[AlgorithmService, Depends(get_algorithm_service)],
) -> TieSuggestion:
    """Mỗi loại đang hoà một mục `suggestions`; `available:false` kèm `reason` (NO_TIE | NO_ORIGINS |
    NO_PLACE_COORDS) khi chưa có gợi ý. Không có toạ độ thành viên (CR-11)."""
    ensure_room_access(current_member, room_id)
    return await service.tie_suggestion(room_id)


@router.get(
    "/schedule/feasibility",
    response_model=ScheduleFeasibility,
    status_code=status.HTTP_200_OK,
    summary="Tổng khả thi của lịch (ALGO-03)",
)
async def get_schedule_feasibility(
    room_id: UUID,
    current_member: Annotated[Member, Depends(get_current_member)],
    service: Annotated[AlgorithmService, Depends(get_algorithm_service)],
) -> ScheduleFeasibility:
    """Khung giờ phòng so với tổng thời lượng + mọi chặng (đi + dự phòng + gửi xe) của ngày phòng (CR-12)."""
    ensure_room_access(current_member, room_id)
    return await service.schedule_feasibility(room_id)
