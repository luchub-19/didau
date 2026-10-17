from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

settings = get_settings()


class Base(DeclarativeBase):
    """Lớp cơ sở Declarative Base cho toàn bộ models SQLAlchemy 2.0."""



import urllib.parse
from typing import Any

def normalize_database_url(url: str) -> tuple[str, dict[str, Any]]:
    """Chuẩn hóa Database URL cho asyncpg và tạo connect_args phù hợp."""
    parsed = urllib.parse.urlsplit(url)
    scheme = parsed.scheme

    # Chuyển postgres:// hoặc postgresql:// thành postgresql+asyncpg://
    if scheme in ("postgres", "postgresql"):
        scheme = "postgresql+asyncpg"

    host = parsed.hostname or ""
    query_params = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)

    has_sslmode_require = False
    cleaned_params: list[tuple[str, str]] = []
    for k, v in query_params:
        if k == "sslmode":
            if v.lower() == "require":
                has_sslmode_require = True
            continue
        if k == "channel_binding":
            continue
        cleaned_params.append((k, v))

    connect_args: dict[str, Any] = {}

    # Nếu URL ban đầu có sslmode=require, hoặc host chứa "neon.tech", thì đặt connect_args={"ssl": True}
    if has_sslmode_require or "neon.tech" in host:
        connect_args["ssl"] = True

    # Nếu host chứa "-pooler" thì thêm "statement_cache_size": 0 vào connect_args
    if "-pooler" in host:
        connect_args["statement_cache_size"] = 0

    new_query = urllib.parse.urlencode(cleaned_params)
    normalized_url = urllib.parse.urlunsplit(
        (scheme, parsed.netloc, parsed.path, new_query, parsed.fragment)
    )

    return normalized_url, connect_args


normalized_db_url, db_connect_args = normalize_database_url(settings.DATABASE_URL)

# Khởi tạo Async Engine
engine: AsyncEngine = create_async_engine(
    normalized_db_url,
    echo=settings.DEBUG and settings.APP_ENV != "production",
    future=True,
    pool_size=5,
    max_overflow=5,
    pool_pre_ping=True,
    pool_recycle=300,
    connect_args=db_connect_args,
)

# Async Session Factory
AsyncSessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Dependency cung cấp session kết nối cơ sở dữ liệu bất đồng bộ."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
