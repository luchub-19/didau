from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.api.deps import (
    ensure_room_access,
    get_current_host,
    get_current_member,
    get_event_bus,
    get_member_repository,
    get_place_repository,
    get_room_repository,
    get_vote_repository,
)
from app.domain.models.member import Member
from app.domain.patterns.event_bus import IEventBus
from app.repositories import (
    IMemberRepository,
    IPlaceRepository,
    IRoomRepository,
    IVoteRepository,
)
from app.schemas.vote import (
    CastVoteRequest,
    ResolveVotingRequest,
    ResolveVotingResponse,
    VoteResponse,
)
from app.services.voting_service import VotingService

router = APIRouter(tags=["Votes"])


def get_voting_service(
    vote_repo: Annotated[IVoteRepository, Depends(get_vote_repository)],
    place_repo: Annotated[IPlaceRepository, Depends(get_place_repository)],
    room_repo: Annotated[IRoomRepository, Depends(get_room_repository)],
    member_repo: Annotated[IMemberRepository, Depends(get_member_repository)],
    event_bus: Annotated[IEventBus, Depends(get_event_bus)],
) -> VotingService:
    """Dependency cung cấp VotingService."""
    return VotingService(
        vote_repo=vote_repo,
        place_repo=place_repo,
        room_repo=room_repo,
        member_repo=member_repo,
        event_bus=event_bus,
    )


_ensure_room_access = ensure_room_access


@router.post(
    "/rooms/{room_id}/places/{place_id}/votes",
    response_model=VoteResponse,
    status_code=status.HTTP_200_OK,
    summary="Bỏ phiếu cho địa điểm",
)
async def cast_vote(
    room_id: UUID,
    place_id: UUID,
    payload: CastVoteRequest,
    current_member: Annotated[Member, Depends(get_current_member)],
    voting_service: Annotated[VotingService, Depends(get_voting_service)],
) -> VoteResponse:
    """Bỏ phiếu +1 (Upvote), -1 (Downvote) hoặc 0 (Neutral) cho một địa điểm."""
    _ensure_room_access(current_member, room_id)
    result = await voting_service.cast_vote(
        room_id=room_id,
        place_id=place_id,
        member_id=current_member.id,
        vote_value=payload.vote_value,
    )
    return VoteResponse.model_validate(result)


@router.delete(
    "/rooms/{room_id}/places/{place_id}/votes",
    response_model=VoteResponse,
    status_code=status.HTTP_200_OK,
    summary="Rút phiếu bầu (Hủy vote)",
)
async def retract_vote(
    room_id: UUID,
    place_id: UUID,
    current_member: Annotated[Member, Depends(get_current_member)],
    voting_service: Annotated[VotingService, Depends(get_voting_service)],
) -> VoteResponse:
    """Rút/Hủy lá phiếu bầu của thành viên hiện tại cho một địa điểm."""
    _ensure_room_access(current_member, room_id)
    result = await voting_service.retract_vote(
        room_id=room_id,
        place_id=place_id,
        member_id=current_member.id,
    )
    return VoteResponse.model_validate(result)


@router.post(
    "/rooms/{room_id}/voting/resolve",
    response_model=ResolveVotingResponse,
    status_code=status.HTTP_200_OK,
    summary="Chốt kết quả bình chọn với TieBreak (HOST only)",
)
async def resolve_voting(
    room_id: UUID,
    payload: ResolveVotingRequest,
    current_member: Annotated[Member, Depends(get_current_host)],
    voting_service: Annotated[VotingService, Depends(get_voting_service)],
) -> ResolveVotingResponse:
    """Chốt kết quả bình chọn bằng chiến lược TieBreak. Chỉ Chủ phòng (HOST) mới có quyền."""
    _ensure_room_access(current_member, room_id)
    result = await voting_service.resolve_voting(
        room_id=room_id,
        host_member=current_member,
        strategy_name=payload.strategy.value,
        max_accepted_places=payload.max_accepted_places,
    )
    return ResolveVotingResponse.model_validate(result)
