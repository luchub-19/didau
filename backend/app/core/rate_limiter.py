import time
from collections import defaultdict


class InMemoryRateLimiter:
    """Sliding-window in-memory rate limiter."""

    def __init__(self, max_requests: int, window_seconds: float) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._history: dict[str, list[float]] = defaultdict(list)

    def is_allowed(self, key: str) -> bool:
        """Kiểm tra xem key có được phép thực hiện thao tác hay không."""
        now = time.time()
        cutoff = now - self.window_seconds
        recent = [t for t in self._history[key] if t > cutoff]
        if len(recent) >= self.max_requests:
            self._history[key] = recent
            return False
        recent.append(now)
        self._history[key] = recent
        return True

    def reset(self) -> None:
        """Xóa toàn bộ lịch sử (dùng cho testing)."""
        self._history.clear()


# Giới hạn tạo phòng: 5 lần/phút/IP
room_creation_limiter = InMemoryRateLimiter(max_requests=5, window_seconds=60.0)

# Giới hạn gửi chat: 20 tin/10 giây/member
chat_message_limiter = InMemoryRateLimiter(max_requests=20, window_seconds=10.0)
