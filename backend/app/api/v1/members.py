from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.api.deps import get_current_member
from app.domain.models.member import Member
from app.schemas.member import MemberResponse

router = APIRouter(prefix="/members", tags=["Members"])


@router.get(
    "/me",
    response_model=MemberResponse,
    status_code=status.HTTP_200_OK,
    summary="Lấy thông tin thành viên hiện tại từ X-Member-Token",
)
async def get_current_member_info(
    current_member: Annotated[Member, Depends(get_current_member)],
) -> MemberResponse:
    """Trả về thông tin hồ sơ của thành viên tương ứng với token."""
    return MemberResponse.model_validate(current_member)
