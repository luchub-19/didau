"""Helper chung phát sự kiện kèm `state_version` (CR-13)."""

from typing import Any

from app.core.state_version import record_state_version


async def publish_versioned(room_repo: Any, event_bus: Any, event: Any) -> int:
    """Tăng `rooms.state_version` (cùng transaction với thay đổi) rồi phát sự kiện mang số mới.

    Mỗi tin WS thay đổi trạng thái nhận đúng một số liên tiếp, nên client phát hiện được tin trễ
    (số nhỏ hơn đã áp) và tin mất (nhảy cóc > +1). Trả về số mới (0 nếu repo không hỗ trợ).
    """
    version = await room_repo.bump_state_version(event.room_id)
    if version:
        event.state_version = version
        record_state_version(version)
    await event_bus.publish(event)
    return version
