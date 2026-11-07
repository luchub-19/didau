import asyncio
import logging
from abc import ABC, abstractmethod
from typing import Any
from uuid import UUID

logger = logging.getLogger(__name__)


class IWebSocketConnectionManager(ABC):
    """Interface quản lý kết nối WebSocket và broadcast theo CONTRACTS.md."""

    @abstractmethod
    async def connect(self, room_id: UUID, member_id: UUID, websocket: Any) -> None:
        """Đăng ký kết nối WebSocket của thành viên vào phòng."""

    @abstractmethod
    async def disconnect(self, room_id: UUID, member_id: UUID) -> None:
        """Ngắt đăng ký kết nối của thành viên khỏi phòng."""

    @abstractmethod
    async def broadcast_to_room(self, room_id: UUID, message: dict[str, Any]) -> None:
        """Phát tán thông điệp (envelope) tới toàn bộ thành viên đang kết nối trong phòng."""


class WebSocketConnectionManager(IWebSocketConnectionManager):
    """Hiện thực WebSocket Connection Manager quản lý socket theo từng room_id."""

    def __init__(self) -> None:
        # room_id -> {member_id -> set of active websocket connections}
        self._rooms: dict[UUID, dict[UUID, set[Any]]] = {}
        # room_id -> state_version mới nhất đã thấy (CR-13), để đóng dấu tin không đổi trạng thái
        self._versions: dict[UUID, int] = {}
        self._lock = asyncio.Lock()

    def note_state_version(self, room_id: UUID, version: int | None) -> None:
        """Ghi nhận state_version lớn nhất đã biết của phòng (không bao giờ giảm)."""
        if version is None:
            return
        if version > self._versions.get(room_id, -1):
            self._versions[room_id] = version

    def get_state_version(self, room_id: UUID) -> int | None:
        """state_version đã biết của phòng, hoặc None nếu chưa từng thấy."""
        return self._versions.get(room_id)

    def stamp(self, room_id: UUID, message: dict[str, Any]) -> dict[str, Any]:
        """Đính `state_version` vào tin (CR-13).

        Tin đã mang số (sự kiện đổi trạng thái) thì chỉ ghi nhận; tin tạm thời (chat, gõ, hiện diện,
        PING/PONG, lỗi) mang số hiện tại của phòng mà không tăng. Trả bản sao, không sửa tin gốc.
        """
        if message.get("state_version") is not None:
            self.note_state_version(room_id, int(message["state_version"]))
            return message
        current = self._versions.get(room_id)
        if current is None:
            return message
        return {**message, "state_version": current}

    async def connect(self, room_id: UUID, member_id: UUID, websocket: Any) -> None:
        """Lưu trữ kết nối WebSocket của thành viên."""
        async with self._lock:
            if room_id not in self._rooms:
                self._rooms[room_id] = {}
            if member_id not in self._rooms[room_id]:
                self._rooms[room_id][member_id] = set()
            self._rooms[room_id][member_id].add(websocket)

        logger.info(
            "WebSocket connected: room=%s, member=%s, total_in_room=%d",
            room_id,
            member_id,
            self.get_active_room_count(room_id),
        )

    async def disconnect(
        self,
        room_id: UUID,
        member_id: UUID,
        websocket: Any | None = None,
    ) -> None:
        """Loại bỏ kết nối WebSocket của thành viên và dọn dẹp phòng nếu rỗng."""
        async with self._lock:
            if room_id in self._rooms:
                if member_id in self._rooms[room_id]:
                    if websocket is not None:
                        self._rooms[room_id][member_id].discard(websocket)
                    else:
                        self._rooms[room_id][member_id].clear()

                    if not self._rooms[room_id][member_id]:
                        del self._rooms[room_id][member_id]

                if not self._rooms[room_id]:
                    del self._rooms[room_id]
                    self._versions.pop(room_id, None)

        logger.info(
            "WebSocket disconnected: room=%s, member=%s, remaining_in_room=%d",
            room_id,
            member_id,
            self.get_active_room_count(room_id),
        )

    async def broadcast_to_room(
        self,
        room_id: UUID,
        message: dict[str, Any],
        exclude_member_id: UUID | None = None,
        exclude_websocket: Any | None = None,
    ) -> None:
        """Phát tán thông điệp JSON tới tất cả các client trong phòng.

        Tự động dọn dẹp các socket đã ngắt kết nối không bình thường.
        """
        message = self.stamp(room_id, message)
        async with self._lock:
            if room_id not in self._rooms:
                return
            # Tạo snapshot các kết nối để gửi an toàn ngoài lock
            targets: list[tuple[UUID, Any]] = []
            for m_id, sockets in self._rooms[room_id].items():
                if exclude_member_id is not None and m_id == exclude_member_id:
                    continue
                for ws in sockets:
                    if exclude_websocket is not None and ws == exclude_websocket:
                        continue
                    targets.append((m_id, ws))

        stale_connections: list[tuple[UUID, Any]] = []

        for m_id, ws in targets:
            try:
                await ws.send_json(message)
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "Lỗi khi gửi WebSocket message tới member=%s trong room=%s: %s",
                    m_id,
                    room_id,
                    exc,
                )
                stale_connections.append((m_id, ws))

        if stale_connections:
            async with self._lock:
                if room_id in self._rooms:
                    for m_id, ws in stale_connections:
                        if m_id in self._rooms[room_id]:
                            self._rooms[room_id][m_id].discard(ws)
                            if not self._rooms[room_id][m_id]:
                                del self._rooms[room_id][m_id]
                    if not self._rooms[room_id]:
                        del self._rooms[room_id]
                        self._versions.pop(room_id, None)

    async def send_personal_message(
        self, websocket: Any, message: dict[str, Any], room_id: UUID | None = None
    ) -> None:
        """Gửi trực tiếp thông điệp tới một kết nối cụ thể (đóng dấu state_version nếu biết phòng)."""
        if room_id is not None:
            message = self.stamp(room_id, message)
        try:
            await websocket.send_json(message)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Lỗi khi gửi personal WebSocket message: %s", exc)


    def is_member_connected(self, room_id: UUID, member_id: UUID) -> bool:
        """Kiểm tra thành viên có đang giữ kết nối WebSocket trong phòng không."""
        return (
            room_id in self._rooms
            and member_id in self._rooms[room_id]
            and len(self._rooms[room_id][member_id]) > 0
        )

    def get_active_room_count(self, room_id: UUID) -> int:
        """Tổng số WebSocket client đang kết nối trong phòng."""
        if room_id not in self._rooms:
            return 0
        return sum(len(sockets) for sockets in self._rooms[room_id].values())

    def get_connected_members(self, room_id: UUID) -> list[UUID]:
        """Danh sách member_id có ít nhất một kết nối đang hoạt động trong phòng."""
        if room_id not in self._rooms:
            return []
        return [m_id for m_id, sockets in self._rooms[room_id].items() if sockets]


# Singleton instance
_websocket_manager_instance: WebSocketConnectionManager | None = None


def get_websocket_manager() -> WebSocketConnectionManager:
    """Lấy singleton instance của WebSocketConnectionManager."""
    global _websocket_manager_instance
    if _websocket_manager_instance is None:
        _websocket_manager_instance = WebSocketConnectionManager()
    return _websocket_manager_instance


def set_websocket_manager(manager: WebSocketConnectionManager | None) -> None:
    """Thiết lập singleton instance phục vụ testing."""
    global _websocket_manager_instance
    _websocket_manager_instance = manager


def reset_websocket_manager() -> None:
    """Reset singleton instance về trạng thái mới."""
    global _websocket_manager_instance
    _websocket_manager_instance = WebSocketConnectionManager()
