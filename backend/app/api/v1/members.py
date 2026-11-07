from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.api.deps import ensure_room_access, get_current_member, get_member_service
from app.domain.models.member import Member
from app.schemas.member import SelfMemberResponse, UpdateMyOriginRequest
from app.services.member_service import MemberService

router = APIRouter(prefix="/members", tags=["Members"])
room_members_router = APIRouter(prefix="/rooms/{room_id}/members", tags=["Members"])


@router.get(
    "/me",
    response_model=SelfMemberResponse,
    status_code=status.HTTP_200_OK,
    summary="Lấy thông tin thành viên hiện tại từ X-Member-Token (kèm vị trí xuất phát riêng)",
)
async def get_current_member_info(
    current_member: Annotated[Member, Depends(get_current_member)],
) -> SelfMemberResponse:
    """Trả về hồ sơ của thành viên tương ứng với token, gồm toạ độ của CHÍNH họ (CR-11)."""
    return SelfMemberResponse.model_validate(current_member)


@room_members_router.patch(
    "/me",
    response_model=SelfMemberResponse,
    status_code=status.HTTP_200_OK,
    summary="Đặt hoặc xoá vị trí xuất phát riêng của mình",
)
async def update_my_origin(
    room_id: UUID,
    payload: UpdateMyOriginRequest,
    current_member: Annotated[Member, Depends(get_current_member)],
    member_service: Annotated[MemberService, Depends(get_member_service)],
) -> SelfMemberResponse:
    """Cả hai toạ độ `null` = xoá; chỉ một `null` = 422. Phát WS `MEMBER_UPDATED {has_origin}`."""
    ensure_room_access(current_member, room_id)
    updated = await member_service.update_origin(
        current_member, payload.origin_lat, payload.origin_lng
    )
    return SelfMemberResponse.model_validate(updated)
