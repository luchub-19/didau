"""WebSocketConnectionManager.stamp (CR-13): tin thay đổi giữ số riêng, tin tạm thời mang số hiện tại."""

from uuid import uuid4

import pytest

from app.services.websocket_manager import WebSocketConnectionManager


class _Sock:
    def __init__(self) -> None:
        self.sent: list[dict] = []

    async def send_json(self, data: dict) -> None:
        self.sent.append(data)


def test_stamp_keeps_own_version_and_never_goes_back() -> None:
    m, room = WebSocketConnectionManager(), uuid4()
    assert m.stamp(room, {"type": "CHAT_MESSAGE"}) == {"type": "CHAT_MESSAGE"}  # chưa biết số
    m.stamp(room, {"type": "X", "state_version": 5})
    m.stamp(room, {"type": "Y", "state_version": 3})  # tin trễ không kéo số lùi
    assert m.get_state_version(room) == 5
    original = {"type": "PONG"}
    stamped = m.stamp(room, original)
    assert stamped["state_version"] == 5 and "state_version" not in original  # không sửa tin gốc


@pytest.mark.asyncio
async def test_broadcast_stamps_and_clears_when_room_empties() -> None:
    m, room, member, sock = WebSocketConnectionManager(), uuid4(), uuid4(), _Sock()
    await m.connect(room, member, sock)
    await m.broadcast_to_room(room, {"type": "A", "payload": {}, "state_version": 7})
    await m.broadcast_to_room(room, {"type": "TYPING_PLACE", "payload": {}})
    assert [s["state_version"] for s in sock.sent] == [7, 7]
    await m.disconnect(room, member, sock)
    assert m.get_state_version(room) is None
