from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    ensure_room_access,
    get_current_host,
    get_current_member,
    get_db,
    get_event_bus,
    get_member_repository,
    get_place_repository,
    get_room_repository,
    get_vote_repository,
)
from app.domain.models.member import Member
from app.domain.patterns.event_bus import IEventBus
from app.repositories import (
    DecisionRepository,
    IMemberRepository,
    IPlaceRepository,
    IRoomRepository,
    IVoteRepository,
)
from app.schemas.decision import (
    CreateDecisionRequest,
    CreateDecisionResponse,
    DecisionActionResponse,
    DecisionHintItem,
    DecisionHintsResponse,
    SmartPickItem,
    SubmitSwipeRequest,
    SubmitSwipeResponse,
)
from app.services.decision_service import DecisionService
from app.services.voting_service import VotingService

router = APIRouter(tags=["Decisions"])


def get_decision_service(
    session: Annotated[AsyncSession, Depends(get_db)],
    room_repo: Annotated[IRoomRepository, Depends(get_room_repository)],
    place_repo: Annotated[IPlaceRepository, Depends(get_place_repository)],
    member_repo: Annotated[IMemberRepository, Depends(get_member_repository)],
    vote_repo: Annotated[IVoteRepository, Depends(get_vote_repository)],
    event_bus: Annotated[IEventBus, Depends(get_event_bus)],
) -> DecisionService:
    """Dependency cung cấp DecisionService."""
    decision_repo = DecisionRepository(session)
    voting_service = VotingService(
        vote_repo=vote_repo,
        place_repo=place_repo,
        room_repo=room_repo,
        member_repo=member_repo,
        event_bus=event_bus,
    )
    return DecisionService(
        decision_repo=decision_repo,
        room_repo=room_repo,
        place_repo=place_repo,
        member_repo=member_repo,
        vote_repo=vote_repo,
        voting_service=voting_service,
        event_bus=event_bus,
    )


@router.get(
    "/rooms/{room_id}/decisions/hints",
    response_model=DecisionHintsResponse,
    status_code=status.HTTP_200_OK,
    summary="Lấy gợi ý kích hoạt Chọn hộ và smart picks",
)
async def get_decision_hints(
    room_id: UUID,
    current_member: Annotated[Member, Depends(get_current_member)],
    decision_service: Annotated[DecisionService, Depends(get_decision_service)],
) -> DecisionHintsResponse:
    """Thành viên trong phòng lấy gợi ý trigger Chọn hộ (DeciderTrigger) và Top 3 Smart Picks."""
    ensure_room_access(current_member, room_id)
    result = await decision_service.get_hints(room_id)
    return DecisionHintsResponse(
        hints=[DecisionHintItem.model_validate(h) for h in result["hints"]],
        smart_picks=[SmartPickItem.model_validate(p) for p in result["smart_picks"]],
    )


@router.post(
    "/rooms/{room_id}/decisions",
    response_model=CreateDecisionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tạo phiên Chọn hộ mới (Host only)",
)
async def create_decision(
    room_id: UUID,
    payload: CreateDecisionRequest,
    current_host: Annotated[Member, Depends(get_current_host)],
    decision_service: Annotated[DecisionService, Depends(get_decision_service)],
) -> CreateDecisionResponse:
    """Chủ phòng (HOST) khởi tạo phiên Chọn hộ (SMART, WHEEL, SWIPE, LADDER)."""
    ensure_room_access(current_host, room_id)
    result = await decision_service.create_decision_session(
        room_id=room_id,
        host_member=current_host,
        payload=payload,
    )
    return CreateDecisionResponse(**result)


@router.post(
    "/rooms/{room_id}/decisions/{session_id}/swipes",
    response_model=SubmitSwipeResponse,
    status_code=status.HTTP_200_OK,
    summary="Quẹt thẻ bình chọn trong phiên SWIPE",
)
async def submit_swipe(
    room_id: UUID,
    session_id: UUID,
    payload: SubmitSwipeRequest,
    current_member: Annotated[Member, Depends(get_current_member)],
    decision_service: Annotated[DecisionService, Depends(get_decision_service)],
) -> SubmitSwipeResponse:
    """Thành viên thực hiện quẹt thẻ (like/dislike) cho một địa điểm trong phiên SWIPE."""
    ensure_room_access(current_member, room_id)
    result = await decision_service.submit_swipe(
        room_id=room_id,
        session_id=session_id,
        member=current_member,
        payload=payload,
    )
    return SubmitSwipeResponse(**result)


@router.post(
    "/rooms/{room_id}/decisions/{session_id}/accept",
    response_model=DecisionActionResponse,
    status_code=status.HTTP_200_OK,
    summary="Chấp nhận kết quả phiên Chọn hộ (Host only)",
)
async def accept_decision(
    room_id: UUID,
    session_id: UUID,
    current_host: Annotated[Member, Depends(get_current_host)],
    decision_service: Annotated[DecisionService, Depends(get_decision_service)],
) -> DecisionActionResponse:
    """Chủ phòng (HOST) chốt áp dụng kết quả của phiên Chọn hộ vào danh sách địa điểm (ACCEPTED)."""
    ensure_room_access(current_host, room_id)
    result = await decision_service.accept_decision(
        room_id=room_id,
        session_id=session_id,
        host_member=current_host,
    )
    return DecisionActionResponse(**result)


@router.post(
    "/rooms/{room_id}/decisions/{session_id}/cancel",
    response_model=DecisionActionResponse,
    status_code=status.HTTP_200_OK,
    summary="Hủy phiên Chọn hộ đang mở (Host only)",
)
async def cancel_decision(
    room_id: UUID,
    session_id: UUID,
    current_host: Annotated[Member, Depends(get_current_host)],
    decision_service: Annotated[DecisionService, Depends(get_decision_service)],
) -> DecisionActionResponse:
    """Chủ phòng (HOST) hủy phiên Chọn hộ đang diễn ra."""
    ensure_room_access(current_host, room_id)
    result = await decision_service.cancel_decision(
        room_id=room_id,
        session_id=session_id,
        host_member=current_host,
    )
    return DecisionActionResponse(**result)
