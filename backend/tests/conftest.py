from collections.abc import Generator

import pytest

from app.core.rate_limiter import chat_message_limiter, room_creation_limiter


@pytest.fixture(autouse=True)
def reset_rate_limiters() -> Generator[None, None, None]:
    """Tự động reset bộ đếm rate limiter trước và sau mỗi bài test."""
    room_creation_limiter.reset()
    chat_message_limiter.reset()
    yield
    room_creation_limiter.reset()
    chat_message_limiter.reset()
