from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.exceptions import AppException, ValidationError
from app.domain.enums import PlaceCategory
from app.schemas.poi import PoiResponse
from app.services.poi_service import Poi, PoiService, get_poi_service

router = APIRouter(prefix="/pois", tags=["POIs"])

MAX_BBOX_SPAN_DEG = 0.2

PoiServiceDep = Annotated[PoiService, Depends(get_poi_service)]


def _to_response(poi: Poi) -> PoiResponse:
    return PoiResponse.model_validate(poi, from_attributes=True)


def _parse_bbox(raw: str) -> tuple[float, float, float, float]:
    """`min_lat,min_lng,max_lat,max_lng`; lỗi định dạng hoặc quá lớn → 422."""
    try:
        parts = [float(v) for v in raw.split(",")]
    except ValueError:
        parts = []
    if len(parts) != 4:
        raise ValidationError("bbox phải có dạng min_lat,min_lng,max_lat,max_lng.")
    min_lat, min_lng, max_lat, max_lng = parts
    if not (-90 <= min_lat < max_lat <= 90 and -180 <= min_lng < max_lng <= 180):
        raise ValidationError("bbox không hợp lệ: cần min < max và toạ độ trong phạm vi hợp lệ.")
    if max_lat - min_lat > MAX_BBOX_SPAN_DEG or max_lng - min_lng > MAX_BBOX_SPAN_DEG:
        raise ValidationError(
            f"bbox quá lớn: tối đa {MAX_BBOX_SPAN_DEG}° × {MAX_BBOX_SPAN_DEG}°.",
            details={"max_span_deg": MAX_BBOX_SPAN_DEG},
        )
    return min_lat, min_lng, max_lat, max_lng


@router.get("", response_model=list[PoiResponse])
async def list_pois(
    service: PoiServiceDep,
    bbox: Annotated[str, Query(description="min_lat,min_lng,max_lat,max_lng")],
    category: PlaceCategory | None = None,
    limit: Annotated[int, Query(ge=1, le=1000)] = 500,
) -> list[PoiResponse]:
    """POI OSM trong khung bản đồ."""
    return [_to_response(p) for p in service.in_bbox(_parse_bbox(bbox), category, limit)]


@router.get("/search", response_model=list[PoiResponse])
async def search_pois(
    service: PoiServiceDep,
    q: Annotated[str, Query(min_length=1, max_length=100)],
    lat: Annotated[float | None, Query(ge=-90, le=90)] = None,
    lng: Annotated[float | None, Query(ge=-180, le=180)] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
) -> list[PoiResponse]:
    """Tìm không dấu theo tên/ẩm thực; có lat+lng thì kèm `distance_km` và ưu tiên gần."""
    near = (lat, lng) if lat is not None and lng is not None else None
    return [_to_response(p) for p in service.search(q, near, limit)]


@router.get("/{external_id:path}", response_model=PoiResponse)
async def get_poi(external_id: str, service: PoiServiceDep) -> PoiResponse:
    """Chi tiết một POI theo `osm:{type}/{id}`."""
    poi = service.get(external_id)
    if poi is None:
        raise AppException(
            code="POI_NOT_FOUND",
            message="Không tìm thấy địa điểm.",
            status_code=404,
            details={"external_id": external_id},
        )
    return _to_response(poi)
