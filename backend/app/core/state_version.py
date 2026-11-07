"""Theo dõi `state_version` của phòng trong phạm vi một request HTTP (CR-13).

Middleware ASGI (`StateVersionHeaderMiddleware`) cấp một "hộp" rỗng cho mỗi request; dependency
xác thực và helper tăng version ghi số mới nhất vào hộp; khi trả response, middleware đọc hộp và
gắn header `X-State-Version`. Dùng hộp (dict) thay vì gán trực tiếp ContextVar vì handler chạy trong
task con — gán trong task con không thấy được ở middleware, còn đổi nội dung cùng một dict thì thấy.
"""

from contextvars import ContextVar
from typing import Any

STATE_VERSION_HEADER = "X-State-Version"

_box: ContextVar[dict[str, int] | None] = ContextVar("state_version_box", default=None)


def record_state_version(version: int | None) -> None:
    """Ghi số phiên bản mới nhất của phòng cho response hiện tại (bỏ qua nếu ngoài request)."""
    box = _box.get()
    if box is not None and version is not None:
        box["v"] = int(version)


class StateVersionHeaderMiddleware:
    """Middleware ASGI thuần gắn header `X-State-Version` vào response HTTP nếu biết số."""

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        box: dict[str, int] = {}
        token = _box.set(box)

        async def send_wrapper(message: Any) -> None:
            if message["type"] == "http.response.start" and "v" in box:
                headers = list(message.get("headers", []))
                headers.append((STATE_VERSION_HEADER.lower().encode(), str(box["v"]).encode()))
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            _box.reset(token)
