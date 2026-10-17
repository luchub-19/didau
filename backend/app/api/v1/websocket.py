import asyncio
import json
import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status

from app.api.deps import get_event_bus
from app.config import get_settings
from app.core.database import AsyncSessionLocal
from app.core.rate_limiter import chat_message_limiter
from app.core.time_utils import now_utc
from app.domain.patterns.event_bus.handlers import register_websocket_broadcast_handlers
from app.repositories import (
    ConflictRepository,
    MemberRepository,
    PlaceRepository,
    RoomRepository,
    ScheduleRepository,
    VoteRepository,
)
from app.schemas.conflict import ConflictResponse
from app.schemas.member import MemberResponse
from app.schemas.place import PlaceResponse
from app.schemas.room import RoomResponse
from app.schemas.schedule import ScheduleItemResponse
from app.services.conflict_service import ConflictService
from app.services.member_service import MemberService
from app.services.place_service import PlaceService
from app.services.room_service import RoomService
from app.services.schedule_service import ScheduleService
from app.services.websocket_manager import get_websocket_manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["WebSocket"])

_session_factory = AsyncSessionLocal


def get_session_factory():
    return _session_factory


def set_session_factory(factory):
    global _session_factory
    _session_factory = factory



async def _authenticate_socket_member(
    token: str | None,
    room_id: UUID,
) -> tuple[bool, str, Any | None, str]:
    """Xác thực token thành viên khi kết nối WebSocket."""
    if not token or not str(token).strip():
        return False, "Thiếu member_token xác thực.", None, "UNAUTHORIZED"

    async with get_session_factory()() as session:
        member_service = MemberService(member_repo=MemberRepository(session))
        member = await member_service.get_by_token(token.strip())
        if member is None:
            return (
                False,
                "Token không hợp lệ hoặc thành viên không tồn tại.",
                None,
                "UNAUTHORIZED",
            )

        if str(member.room_id) != str(room_id):
            return (
                False,
                "Thành viên không thuộc phòng này.",
                None,
                "FORBIDDEN",
            )

        return True, "", member, ""


async def _gather_room_state_sync(room_id: UUID, current_member_id: UUID) -> dict[str, Any]:
    """Thu thập toàn bộ trạng thái dữ liệu phòng khi vừa kết nối hoặc yêu cầu SUBSCRIBE_ROOM."""
    async with get_session_factory()() as session:
        event_bus = get_event_bus()
        room_repo = RoomRepository(session)
        member_repo = MemberRepository(session)
        place_repo = PlaceRepository(session)
        vote_repo = VoteRepository(session)
        schedule_repo = ScheduleRepository(session)
        conflict_repo = ConflictRepository(session)

        room_service = RoomService(
            room_repo=room_repo,
            member_repo=member_repo,
            event_bus=event_bus,
            place_repo=place_repo,
        )
        member_service = MemberService(member_repo=member_repo)
        place_service = PlaceService(
            place_repo=place_repo,
            room_repo=room_repo,
            vote_repo=vote_repo,
            event_bus=event_bus,
        )
        schedule_service = ScheduleService(
            schedule_repo=schedule_repo,
            place_repo=place_repo,
            room_repo=room_repo,
            event_bus=event_bus,
        )
        conflict_service = ConflictService(
            conflict_repo=conflict_repo,
            room_repo=room_repo,
            place_repo=place_repo,
            schedule_repo=schedule_repo,
            event_bus=event_bus,
            vote_repo=vote_repo,
        )

        room_details = await room_service.get_room_details(room_id)
        members = await member_service.list_by_room(room_id)
        places = await place_service.list_places(room_id, current_member_id)
        schedule = await schedule_service.get_schedule(room_id)
        conflicts = await conflict_service.list_conflicts(room_id)

        room_payload = {
            k: v for k, v in room_details.items() if k not in ("members", "total_places")
        }

        return {
            "room": (
                RoomResponse.model_validate(room_payload).model_dump(mode="json")
                if room_payload
                else {}
            ),
            "members": [
                MemberResponse.model_validate(m).model_dump(mode="json")
                for m in members
            ],
            "places": [
                PlaceResponse.model_validate(p).model_dump(mode="json")
                for p in places
            ],
            "schedule": [
                ScheduleItemResponse.model_validate(s).model_dump(mode="json")
                for s in schedule
            ],
            "conflicts": [
                ConflictResponse.model_validate(c).model_dump(mode="json")
                for c in conflicts
            ],
        }


async def _handle_websocket_room(
    websocket: WebSocket,
    room_id: UUID,
    token: str | None = None,
) -> None:
    """Xử lý vòng đời kết nối WebSocket cho phòng theo CONTRACTS.md."""
    # 0. Kiểm tra Origin header theo ALLOWED_ORIGINS
    origin = websocket.headers.get("origin")
    if origin:
        allowed = get_settings().cors_origins
        norm_origin = origin.rstrip("/")
        is_allowed = "*" in allowed or any(a == "*" or a.rstrip("/") == norm_origin for a in allowed)
        if not is_allowed:
            logger.warning("WebSocket từ chối kết nối do Origin không hợp lệ: %s", origin)
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

    # 1. Xác thực token thành viên
    is_valid, err_msg, member, err_code = await _authenticate_socket_member(token, room_id)
    if not is_valid:
        await websocket.accept()
        await websocket.send_json(
            {
                "type": "ERROR",
                "payload": {"code": err_code, "message": err_msg},
                "ts": int(now_utc().timestamp() * 1000),
            }
        )
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # 2. Chấp nhận kết nối và đăng ký vào WebSocketConnectionManager
    await websocket.accept()
    ws_manager = get_websocket_manager()
    await ws_manager.connect(room_id, member.id, websocket)

    # 3. Server WebSocket gửi ping mỗi 25 giây
    async def _server_ping_loop() -> None:
        try:
            while True:
                await asyncio.sleep(25)
                await websocket.send_json(
                    {
                        "type": "PING",
                        "payload": {},
                        "ts": int(now_utc().timestamp() * 1000),
                    }
                )
        except (asyncio.CancelledError, WebSocketDisconnect, RuntimeError, OSError):
            logger.debug("Ping loop dừng: socket đã đóng hoặc task bị huỷ.")

    ping_task = asyncio.create_task(_server_ping_loop())

    try:
        while True:
            raw_text = await websocket.receive_text()
            if not raw_text:
                continue

            try:
                data = json.loads(raw_text)
            except json.JSONDecodeError:
                await websocket.send_json(
                    {
                        "type": "ERROR",
                        "payload": {
                            "code": "INVALID_JSON",
                            "message": "Định dạng JSON gửi lên không hợp lệ.",
                        },
                        "ts": int(now_utc().timestamp() * 1000),
                    }
                )
                continue

            msg_type = str(data.get("type", "")).strip().upper()
            payload = data.get("payload", {})

            # Heartbeat PING -> PONG
            if msg_type == "PING":
                await websocket.send_json(
                    {
                        "type": "PONG",
                        "payload": {},
                        "ts": int(now_utc().timestamp() * 1000),
                    }
                )

            elif msg_type == "PONG":
                pass

            # Đồng bộ toàn diện trạng thái phòng
            elif msg_type == "SUBSCRIBE_ROOM":
                state = await _gather_room_state_sync(room_id, member.id)
                await websocket.send_json(
                    {
                        "type": "ROOM_STATE_SYNC",
                        "payload": state,
                        "ts": int(now_utc().timestamp() * 1000),
                    }
                )

            # Báo hiệu thành viên đang nhập địa điểm
            elif msg_type == "TYPING_PLACE":
                is_typing = bool(payload.get("is_typing", True))
                await ws_manager.broadcast_to_room(
                    room_id,
                    {
                        "type": "TYPING_PLACE",
                        "payload": {
                            "member_id": str(member.id),
                            "nickname": member.nickname,
                            "is_typing": is_typing,
                        },
                        "ts": int(now_utc().timestamp() * 1000),
                    },
                    exclude_member_id=member.id,
                )

            # Giới hạn tin chat: tối đa 500 ký tự, rate limit 20 tin/10 giây/member
            elif msg_type in ("CHAT_MESSAGE", "CHAT", "SEND_CHAT", "SEND_MESSAGE"):
                raw_msg = payload.get("message") or payload.get("content") or payload.get("text") or ""
                content = str(raw_msg).strip()
                if not content:
                    continue

                if len(content) > 500:
                    await websocket.send_json(
                        {
                            "type": "ERROR",
                            "payload": {
                                "code": "MESSAGE_TOO_LONG",
                                "message": "Tin nhắn vượt quá giới hạn 500 ký tự.",
                            },
                            "ts": int(now_utc().timestamp() * 1000),
                        }
                    )
                    continue

                if not chat_message_limiter.is_allowed(str(member.id)):
                    await websocket.send_json(
                        {
                            "type": "ERROR",
                            "payload": {
                                "code": "RATE_LIMIT_EXCEEDED",
                                "message": "Bạn gửi tin quá nhanh. Giới hạn 20 tin/10 giây.",
                            },
                            "ts": int(now_utc().timestamp() * 1000),
                        }
                    )
                    continue

                await ws_manager.broadcast_to_room(
                    room_id,
                    {
                        "type": "CHAT_MESSAGE",
                        "payload": {
                            "member_id": str(member.id),
                            "nickname": member.nickname,
                            "avatar_url": member.avatar_url,
                            "message": content,
                        },
                        "ts": int(now_utc().timestamp() * 1000),
                    },
                )

            else:
                logger.debug(
                    "Nhận thông điệp WebSocket không xác định: %s từ member %s",
                    msg_type,
                    member.id,
                )

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected: room=%s, member=%s", room_id, member.id)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Lỗi kết nối WebSocket phòng %s, member %s: %s",
            room_id,
            member.id,
            exc,
        )
    finally:
        ping_task.cancel()
        await ws_manager.disconnect(room_id, member.id, websocket)


@router.websocket("/ws/rooms/{room_id}")
async def websocket_rooms_endpoint(
    websocket: WebSocket,
    room_id: UUID,
    token: str | None = Query(default=None),
) -> None:
    """Endpoint WebSocket chuẩn theo CONTRACTS.md: /ws/rooms/{room_id}?token={member_token}."""
    await _handle_websocket_room(websocket, room_id, token)


@router.websocket("/rooms/{room_id}/ws")
async def websocket_rooms_alias_endpoint(
    websocket: WebSocket,
    room_id: UUID,
    token: str | None = Query(default=None),
) -> None:
    """Endpoint alias hỗ trợ: /rooms/{room_id}/ws?token={member_token}."""
    await _handle_websocket_room(websocket, room_id, token)


# Tự động đăng ký WebSocketBroadcastHandler vào singleton EventBus
try:
    _global_bus = get_event_bus()
    _global_manager = get_websocket_manager()
    register_websocket_broadcast_handlers(_global_bus, _global_manager)
except Exception as _e:  # noqa: BLE001
    logger.debug("Không thể khởi tạo WebSocketBroadcastHandler lúc import: %s", _e)

