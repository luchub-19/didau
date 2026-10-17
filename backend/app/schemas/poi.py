from pydantic import BaseModel, Field

from app.domain.enums import PlaceCategory


class PoiResponse(BaseModel):
    """Một điểm quán từ snapshot OSM (khớp `Poi` ở frontend/src/types/models.ts)."""

    external_id: str = Field(description="osm:{type}/{id}")
    name: str
    category: PlaceCategory
    lat: float
    lng: float
    address: str | None = None
    cuisine: str | None = None
    opening_hours_raw: str | None = None
    open_minute: int | None = Field(default=None, ge=0, le=1439)
    close_minute: int | None = Field(default=None, ge=0, le=1439)
    distance_km: float | None = Field(default=None, description="Chỉ có khi truyền lat/lng")
    tags: dict[str, str] = Field(default_factory=dict)


class GoogleMatchRequest(BaseModel):
    """Yêu cầu khớp một quán OSM với Google place_id."""

    external_id: str = Field(min_length=1, max_length=100, description="osm:{type}/{id}")
    name: str = Field(min_length=1, max_length=200)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class GoogleMatchResponse(BaseModel):
    """`google_place_id` null kèm `reason` khi không khớp được (không bao giờ là lỗi 5xx)."""

    google_place_id: str | None = None
    reason: str = Field(description="OK | NOT_FOUND | REJECTED | QUOTA | NO_KEY | DISABLED | ERROR")
