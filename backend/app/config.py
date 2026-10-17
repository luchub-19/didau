from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Cấu hình ứng dụng toàn cục cho Đi Đâu Backend."""

    APP_NAME: str = "Đi Đâu API"
    APP_VERSION: str = "1.0.0"
    APP_ENV: str = "development"
    DEBUG: bool = True

    HOST: str = "0.0.0.0"
    PORT: int = 8000

    TIMEZONE: str = "Asia/Ho_Chi_Minh"

    # PostgreSQL Database URL mặc định
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/didau"

    # Allowed Origins (danh sách phân tách bằng dấu phẩy)
    ALLOWED_ORIGINS: str = "http://localhost:5173"

    # Seed demo khi khởi động container
    SEED_DEMO: bool = False

    # Nominatim User-Agent
    NOMINATIM_USER_AGENT: str = "DiDau/1.0 (student project)"

    @property
    def cors_origins(self) -> list[str]:
        """Danh sách các allowed origins sau khi tách dấu phẩy.

        Bỏ dấu "/" cuối: trình duyệt gửi Origin không có "/", CORSMiddleware so khớp chính xác.
        """
        origins = (o.strip().rstrip("/") for o in self.ALLOWED_ORIGINS.split(","))
        return [o for o in origins if o]

    @property
    def CORS_ORIGINS(self) -> list[str]:
        """Tương thích ngược với các module gọi settings.CORS_ORIGINS."""
        return self.cors_origins

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    """Trả về cấu hình singleton được cache."""
    return Settings()
