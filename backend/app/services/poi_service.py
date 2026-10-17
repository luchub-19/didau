import gzip
import json
import logging
import math
import re
import unicodedata
from dataclasses import dataclass, field, replace
from datetime import datetime
from functools import lru_cache
from pathlib import Path

from app.config import get_settings
from app.domain.enums import PlaceCategory
from app.domain.patterns.category_detector.osm_mapping import osm_address, osm_category
from app.domain.patterns.itinerary.opening_hours import parse_opening_hours
from app.domain.patterns.itinerary.travel import haversine_distance_km

logger = logging.getLogger(__name__)

GRID_DEG = 0.01
DEFAULT_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
SNAPSHOT_GLOB = "pois_*.json.gz"
_EXTRA_TAGS = ("phone", "website", "brand")


def normalize_text(text: str) -> str:
    """Bỏ dấu tiếng Việt, hạ chữ thường, gộp khoảng trắng (đ → d)."""
    text = text.replace("đ", "d").replace("Đ", "d")
    decomposed = unicodedata.normalize("NFD", text)
    stripped = "".join(c for c in decomposed if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", stripped.lower()).strip()


@dataclass(frozen=True)
class Poi:
    external_id: str
    name: str
    category: PlaceCategory
    lat: float
    lng: float
    address: str | None = None
    cuisine: str | None = None
    opening_hours_raw: str | None = None
    open_minute: int | None = None
    close_minute: int | None = None
    distance_km: float | None = None
    tags: dict[str, str] = field(default_factory=dict)
    norm_name: str = ""
    norm_text: str = ""


def _hours_for_today(raw: str | None, weekday: int) -> tuple[int | None, int | None]:
    """Khoảng mở cửa đầu tiên → (open_minute, close_minute); nhiều ca thì lấy mở sớm nhất, đóng muộn nhất."""
    intervals = parse_opening_hours(raw, weekday)
    if not intervals:
        return None, None
    return intervals[0][0], intervals[-1][1]


def _build_poi(rec: dict, weekday: int) -> Poi | None:
    name = (rec.get("name") or "").strip()
    try:
        lat, lng = float(rec["lat"]), float(rec["lng"])
        external_id = rec["external_id"]
    except (KeyError, TypeError, ValueError):
        return None
    if not name:
        return None
    tags = {k: str(rec[k]) for k in _EXTRA_TAGS if rec.get(k)}
    raw_hours = rec.get("opening_hours") or None
    open_minute, close_minute = _hours_for_today(raw_hours, weekday)
    address = osm_address({f"addr:{k}": v for k, v in (rec.get("addr") or {}).items()})
    cuisine = rec.get("cuisine") or None
    norm_name = normalize_text(name)
    return Poi(
        external_id=external_id,
        name=name,
        category=osm_category({"amenity": rec.get("amenity", "")}),
        lat=lat,
        lng=lng,
        address=address,
        cuisine=cuisine,
        opening_hours_raw=raw_hours,
        open_minute=open_minute,
        close_minute=close_minute,
        tags=tags,
        norm_name=norm_name,
        norm_text=" ".join(filter(None, (norm_name, normalize_text(cuisine or "")))),
    )


class PoiService:
    """Nạp snapshot OSM vào bộ nhớ, tra theo bbox (grid 0,01°) và tìm không dấu."""

    def __init__(self, data_dir: Path | None = None, weekday: int | None = None) -> None:
        self._weekday = datetime.now().weekday() if weekday is None else weekday
        self._pois: dict[str, Poi] = {}
        self._grid: dict[tuple[int, int], list[Poi]] = {}
        self.attribution: str = "© OpenStreetMap contributors (ODbL)"
        self._load(data_dir or DEFAULT_DATA_DIR)

    def _load(self, data_dir: Path) -> None:
        files = sorted(data_dir.glob(SNAPSHOT_GLOB)) if data_dir.is_dir() else []
        if not files:
            logger.warning("Không có snapshot POI trong %s; /pois sẽ trả rỗng.", data_dir)
        for path in files:
            with gzip.open(path, "rt", encoding="utf-8") as fh:
                payload = json.load(fh)
            self.attribution = payload.get("metadata", {}).get("attribution", self.attribution)
            for rec in payload.get("pois", []):
                poi = _build_poi(rec, self._weekday)
                if poi is None or poi.external_id in self._pois:
                    continue
                self._pois[poi.external_id] = poi
                self._grid.setdefault(self._cell(poi.lat, poi.lng), []).append(poi)

    @staticmethod
    def _cell(lat: float, lng: float) -> tuple[int, int]:
        return math.floor(lat / GRID_DEG), math.floor(lng / GRID_DEG)

    def __len__(self) -> int:
        return len(self._pois)

    def get(self, external_id: str) -> Poi | None:
        return self._pois.get(external_id)

    def in_bbox(
        self,
        bbox: tuple[float, float, float, float],
        category: PlaceCategory | None,
        limit: int,
    ) -> list[Poi]:
        """bbox = (min_lat, min_lng, max_lat, max_lng). Kết quả sắp theo tên để ổn định."""
        min_lat, min_lng, max_lat, max_lng = bbox
        r0, c0 = self._cell(min_lat, min_lng)
        r1, c1 = self._cell(max_lat, max_lng)
        found: list[Poi] = []
        for row in range(r0, r1 + 1):
            for col in range(c0, c1 + 1):
                for poi in self._grid.get((row, col), ()):
                    if not (min_lat <= poi.lat <= max_lat and min_lng <= poi.lng <= max_lng):
                        continue
                    if category is not None and poi.category != category:
                        continue
                    found.append(poi)
        found.sort(key=lambda p: (p.norm_name, p.external_id))
        return found[:limit]

    def search(self, q: str, near: tuple[float, float] | None, limit: int) -> list[Poi]:
        """Khớp không dấu trên tên + ẩm thực. Xếp: khớp từ/đầu tên > chứa chuỗi, rồi gần nhất."""
        query = normalize_text(q)
        if not query:
            return []
        tokens = query.split()
        scored: list[tuple[int, float, str, Poi]] = []
        for poi in self._pois.values():
            if not all(t in poi.norm_text for t in tokens):
                continue
            name_words = poi.norm_name.split()
            if poi.norm_name == query:
                rank = 0
            elif poi.norm_name.startswith(query):
                rank = 1
            elif all(t in name_words for t in tokens):
                rank = 2
            elif all(t in poi.norm_name for t in tokens):
                rank = 3
            else:
                rank = 4  # chỉ khớp qua cuisine
            dist = (
                haversine_distance_km(near[0], near[1], poi.lat, poi.lng)
                if near is not None
                else 0.0
            )
            scored.append((rank, dist, poi.external_id, poi))
        scored.sort(key=lambda row: row[:3])
        results = []
        for _, dist, _, poi in scored[:limit]:
            results.append(replace(poi, distance_km=round(dist, 3)) if near is not None else poi)
        return results


@lru_cache
def get_poi_service() -> PoiService:
    """Singleton nạp snapshot một lần lúc gọi đầu."""
    data_dir = get_settings().POI_DATA_DIR
    return PoiService(Path(data_dir) if data_dir else None)
