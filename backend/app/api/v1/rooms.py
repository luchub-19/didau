from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Request, status

from app.api.deps import (
    ensure_room_access,
    get_current_host,
    get_current_member,
    get_room_service,
)
from app.core.exceptions import RateLimitExceededError
from app.core.rate_limiter import room_creation_limiter
from app.domain.models.member import Member
from app.schemas.room import (
    CreateRoomRequest,
    CreateRoomResponse,
    JoinRoomRequest,
    JoinRoomResponse,
    RoomDetailResponse,
    RoomResponse,
    UpdateRoomRequest,
)
from app.services.room_service import RoomService

router = APIRouter(prefix="/rooms", tags=["Rooms"])


@router.post(
    "",
    response_model=CreateRoomResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tạo phòng lập kế hoạch mới",
)
async def create_room(
    request: Request,
    payload: CreateRoomRequest,
    room_service: Annotated[RoomService, Depends(get_room_service)],
) -> CreateRoomResponse:
    """Tạo phòng mới và cấp quyền HOST cho người khởi tạo."""
    # Rate limit: 5 lần/phút/IP
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    elif request.client:
        client_ip = request.client.host
    else:
        client_ip = "127.0.0.1"

    if not room_creation_limiter.is_allowed(client_ip):
        raise RateLimitExceededError(
            message="Quá nhiều yêu cầu tạo nhóm. Vui lòng thử lại sau 1 phút.",
            details={"ip": client_ip, "limit": "5 requests/minute"},
        )

    result = await room_service.create_room(payload.model_dump())
    return CreateRoomResponse.model_validate(result)


@router.post(
    "/join",
    response_model=JoinRoomResponse,
    status_code=status.HTTP_200_OK,
    summary="Tham gia phòng qua mã chia sẻ",
)
async def join_room(
    payload: JoinRoomRequest,
    room_service: Annotated[RoomService, Depends(get_room_service)],
) -> JoinRoomResponse:
    """Tham gia phòng bằng mã phòng và nickname."""
    result = await room_service.join_room(
        code=payload.room_code,
        nickname=payload.nickname,
        avatar_url=payload.avatar_url,
    )
    return JoinRoomResponse.model_validate(result)


@router.get(
    "/{room_id}",
    response_model=RoomDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Lấy chi tiết toàn diện của phòng",
)
async def get_room(
    room_id: UUID,
    current_member: Annotated[Member, Depends(get_current_member)],
    room_service: Annotated[RoomService, Depends(get_room_service)],
) -> RoomDetailResponse:
    """Lấy toàn bộ thông tin phòng, danh sách thành viên và tổng số địa điểm."""
    ensure_room_access(current_member, room_id)
    result = await room_service.get_room_details(room_id)
    return RoomDetailResponse.model_validate(result)


@router.patch(
    "/{room_id}",
    response_model=RoomResponse,
    status_code=status.HTTP_200_OK,
    summary="Cập nhật cấu hình phòng (Host only)",
)
async def update_room(
    room_id: UUID,
    payload: UpdateRoomRequest,
    host: Annotated[Member, Depends(get_current_host)],
    room_service: Annotated[RoomService, Depends(get_room_service)],
) -> RoomResponse:
    """Cập nhật tiêu đề, ngày, ngân sách, thành phố, điểm hẹn, khung giờ; phát ROOM_UPDATED."""
    ensure_room_access(host, room_id)
    room = await room_service.update_room(room_id, payload.model_dump(exclude_unset=True))
    return RoomResponse.model_validate(room)
