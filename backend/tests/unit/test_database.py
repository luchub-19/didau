from app.core.database import normalize_database_url


def test_normalize_database_url_local() -> None:
    """Trường hợp 1: URL local chuẩn postgresql+asyncpg không có sslmode."""
    local_url = "postgresql+asyncpg://postgres:postgres@localhost:5432/didau"
    url, connect_args = normalize_database_url(local_url)
    assert url == "postgresql+asyncpg://postgres:postgres@localhost:5432/didau"
    assert connect_args == {}


def test_normalize_database_url_neon_direct() -> None:
    """Trường hợp 2: URL Neon direct có sslmode=require và domain neon.tech."""
    neon_url = "postgresql://user:pass@ep-cool-123.ap-southeast-1.neon.tech/didau?sslmode=require"
    url, connect_args = normalize_database_url(neon_url)
    assert url == "postgresql+asyncpg://user:pass@ep-cool-123.ap-southeast-1.neon.tech/didau"
    assert "sslmode" not in url
    assert connect_args == {"ssl": True}


def test_normalize_database_url_neon_pooler() -> None:
    """Trường hợp 3: URL Neon pooler có -pooler và channel_binding/sslmode."""
    pooler_url = (
        "postgresql://user:pass@ep-cool-123-pooler.ap-southeast-1.neon.tech/didau"
        "?sslmode=require&channel_binding=prefer"
    )
    url, connect_args = normalize_database_url(pooler_url)
    assert url == "postgresql+asyncpg://user:pass@ep-cool-123-pooler.ap-southeast-1.neon.tech/didau"
    assert "sslmode" not in url
    assert "channel_binding" not in url
    assert connect_args == {"ssl": True, "statement_cache_size": 0}


def test_normalize_database_url_postgres_prefix() -> None:
    """Trường hợp 4: URL dạng postgres:// thay vì postgresql://."""
    legacy_url = "postgres://user:pass@localhost:5432/didau"
    url, connect_args = normalize_database_url(legacy_url)
    assert url == "postgresql+asyncpg://user:pass@localhost:5432/didau"
    assert connect_args == {}
