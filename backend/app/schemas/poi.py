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
