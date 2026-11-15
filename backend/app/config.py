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

    # Nguồn dữ liệu quán: "osm" (mặc định) hoặc "google" (bật lớp Google, có đường lùi về osm)
    PLACES_PROVIDER: str = "osm"

    # Key Google phía server (chỉ bật Places API (New)); rỗng = tắt lớp Google
    GOOGLE_MAPS_SERVER_KEY: str = ""

    # Trần số lần gọi Google Text Search mỗi ngày (miễn phí, chặn để phòng lạm dụng)
    GOOGLE_MATCH_DAILY_LIMIT: int = 1000

    # Trần số phần tử Routes API `computeRouteMatrix` mỗi ngày (T-84); quá trần → ước lượng
    GOOGLE_ROUTES_DAILY_LIMIT: int = 1000

    # Nguồn km/đường đi (gđ7, CR-15): "" (mặc định = như cũ: ước lượng, hoặc Google theo PLACES_PROVIDER) | "valhalla"
    ROUTING_PROVIDER: str = ""

    # Valhalla tự host qua tunnel (docs/phase7/VALHALLA.md). URL rỗng = chỉ đọc cache DB, không gọi mạng.
    VALHALLA_URL: str = ""

    # Khoá gửi trong header X-Route-Key (Caddy chặn yêu cầu thiếu khoá); rỗng = không gửi header
    VALHALLA_KEY: str = ""

    # Timeout mỗi yêu cầu Valhalla (giây); quá hạn → ước lượng, không ghi cache
    VALHALLA_TIMEOUT_S: float = 4.0

    # Thư mục chứa snapshot POI (pois_*.json.gz); rỗng = backend/app/data
    POI_DATA_DIR: str = ""

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
