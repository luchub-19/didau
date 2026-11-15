import gzip
import json
import logging
import math
from dataclasses import dataclass, field, replace
from datetime import datetime
from functools import lru_cache
from pathlib import Path

from app.config import get_settings
from app.domain.enums import PlaceCategory
from app.domain.patterns.category_detector.osm_mapping import (
    KIND_CATEGORY,
    fold_text,
    kind_category,
    osm_address,
    osm_kind,
)
from app.domain.patterns.itinerary.opening_hours import parse_opening_hours
from app.domain.patterns.itinerary.travel import haversine_distance_km

logger = logging.getLogger(__name__)

GRID_DEG = 0.01
DEFAULT_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
SNAPSHOT_GLOB = "places_*.json.gz"  # CR-17 A (Overture + OSM)
LEGACY_GLOB = "pois_*.json.gz"  # snapshot OSM cũ, chỉ đọc khi thiếu file mới
DEFAULT_ATTRIBUTION = "© OpenStreetMap contributors (ODbL)"
SEARCH_DISTANCE_BAND_KM = 3.0  # MAP-POI §5: khoảng cách thắng score khi chênh > 3 km
_EXTRA_TAGS = ("phone", "website", "brand")


def normalize_text(text: str) -> str:
    """Bỏ dấu tiếng Việt, hạ chữ thường, gộp khoảng trắng (đ → d)."""
    return fold_text(text)


@dataclass(frozen=True, slots=True)
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
    kind: str | None = None
    district: str | None = None
    brand: str | None = None
    brand_key: str | None = None
    score: int = 0
    minzoom: int = 17
    norm_name: str = ""
    norm_text: str = ""


def _hours_for_today(raw: str | None, weekday: int) -> tuple[int | None, int | None]:
    """Khoảng mở cửa đầu tiên → (open_minute, close_minute); nhiều ca thì lấy mở sớm nhất, đóng muộn nhất."""
    intervals = parse_opening_hours(raw, weekday)
    if not intervals:
        return None, None
    return intervals[0][0], intervals[-1][1]


_EMPTY_TAGS: dict[str, str] = {}


def _build_poi(rec: dict, weekday: int) -> Poi | None:
    """Một bản ghi snapshot → Poi. Đọc được cả dạng mới (`kind`, `address` sẵn) lẫn `pois_*` cũ (`amenity`, `addr`)."""
    name = (rec.get("name") or "").strip()
    try:
        lat, lng = float(rec["lat"]), float(rec["lng"])
        external_id = rec["external_id"]
    except (KeyError, TypeError, ValueError):
        return None
    if not name:
        return None
    kind = rec.get("kind")
    if kind not in KIND_CATEGORY:
        kind = osm_kind({"amenity": rec.get("amenity", "")})
    address = rec.get("address") or osm_address(
        {f"addr:{k}": v for k, v in (rec.get("addr") or {}).items()}
    )
    tags = {k: str(rec[k]) for k in _EXTRA_TAGS if rec.get(k)} or _EMPTY_TAGS
    raw_hours = rec.get("opening_hours") or None
    open_minute, close_minute = _hours_for_today(raw_hours, weekday)
    cuisine = rec.get("cuisine") or None
    brand = rec.get("brand") or None
    norm_name = normalize_text(name)
    norm_text = " ".join(
        dict.fromkeys(  # bỏ từ lặp, giữ thứ tự
            " ".join(
                filter(
                    None, (norm_name, normalize_text(cuisine or ""), normalize_text(brand or ""))
                )
            ).split()
        )
    )
    return Poi(
        external_id=external_id,
        name=name,
        category=kind_category(kind),
        lat=lat,
        lng=lng,
        address=address,
        cuisine=cuisine,
        opening_hours_raw=raw_hours,
        open_minute=open_minute,
        close_minute=close_minute,
        tags=tags,
        kind=kind,
        district=rec.get("district") or None,
        brand=brand,
        brand_key=rec.get("brand_key") or None,
        score=int(rec.get("score") or 0),
        minzoom=int(rec.get("minzoom") or 17),
        norm_name=norm_name,
        norm_text=norm_text,
    )


class PoiService:
    """Nạp snapshot quán vào bộ nhớ, tra theo bbox (grid 0,01°) và tìm không dấu (chỉ mục từ → quán)."""

    def __init__(self, data_dir: Path | None = None, weekday: int | None = None) -> None:
        self._weekday = datetime.now().weekday() if weekday is None else weekday
        self._pois: dict[str, Poi] = {}
        self._aliases: dict[str, str] = {}
        self._retired: dict[str, Poi] = {}
        self._grid: dict[tuple[int, int], list[Poi]] = {}
        self._words: dict[str, list[str]] = {}  # từ (không dấu) → external_id
        self.attribution: str = DEFAULT_ATTRIBUTION
        self._load(data_dir or DEFAULT_DATA_DIR)

    def _load(self, data_dir: Path) -> None:
        files: list[Path] = []
        if data_dir.is_dir():
            files = sorted(data_dir.glob(SNAPSHOT_GLOB)) or sorted(data_dir.glob(LEGACY_GLOB))
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
                for alias in rec.get("aliases") or ():
                    self._aliases.setdefault(alias, poi.external_id)
                self._grid.setdefault(self._cell(poi.lat, poi.lng), []).append(poi)
                for word in set(poi.norm_text.split()):
                    self._words.setdefault(word, []).append(poi.external_id)
            # Quán cũ đã mất khỏi nguồn: chỉ tra theo id (quán đã thêm vào phòng), không lên bản đồ/tìm kiếm
            for rec in payload.get("retired", []):
                poi = _build_poi(rec, self._weekday)
                if poi is not None and poi.external_id not in self._pois:
                    self._retired[poi.external_id] = poi
            del payload

    @staticmethod
    def _cell(lat: float, lng: float) -> tuple[int, int]:
        return math.floor(lat / GRID_DEG), math.floor(lng / GRID_DEG)

    def __len__(self) -> int:
        return len(self._pois)

    def get(self, external_id: str) -> Poi | None:
        """Tra theo id; id OSM đã gộp vào quán khác (alias) trả về quán đó."""
        poi = self._pois.get(external_id)
        if poi is None and external_id in self._aliases:
            poi = self._pois.get(self._aliases[external_id])
        return poi or self._retired.get(external_id)

    def in_bbox(
        self,
        bbox: tuple[float, float, float, float],
        category: PlaceCategory | None,
        limit: int,
    ) -> list[Poi]:
        """bbox = (min_lat, min_lng, max_lat, max_lng). Xếp `score` giảm dần (CR-17 A) để `limit` giữ quán nổi bật."""
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
        found.sort(key=_rank_key)
        return found[:limit]

    def _candidates(self, tokens: list[str]) -> set[str]:
        """id quán có MỌI token là chuỗi con của một từ nào đó (giữ nghĩa "chứa chuỗi" như bản quét cũ)."""
        result: set[str] | None = None
        for token in sorted(set(tokens), key=len, reverse=True):
            ids: set[str] = set()
            for word, word_ids in self._words.items():
                if token in word:
                    ids.update(word_ids)
            result = ids if result is None else result & ids
            if not result:
                return set()
        return result or set()

    def search(self, q: str, near: tuple[float, float] | None, limit: int) -> list[Poi]:
        """Khớp không dấu trên tên + ẩm thực + brand. Xếp (MAP-POI §5): độ khớp tên → score → khoảng cách;
        có `near` thì khoảng cách chia dải 3 km thắng score (quán cách xa hơn 3 km xếp sau dù điểm cao)."""
        query = normalize_text(q)
        if not query:
            return []
        tokens = query.split()
        scored: list[tuple[int, int, int, float, str, Poi]] = []
        for pid in self._candidates(tokens):
            poi = self._pois[pid]
            if not all(t in poi.norm_text for t in tokens):
                continue  # token khớp ở các từ khác nhau nhưng chuỗi đầy đủ không khớp (hiếm)
            rank = _match_tier(poi, query, tokens)
            if near is not None:
                dist = haversine_distance_km(near[0], near[1], poi.lat, poi.lng)
                band = int(dist // SEARCH_DISTANCE_BAND_KM)
            else:
                dist, band = 0.0, 0
            scored.append((rank, band, -poi.score, dist, poi.external_id, poi))
        scored.sort(key=lambda row: row[:5])
        results = []
        for _, _, _, dist, _, poi in scored[:limit]:
            results.append(replace(poi, distance_km=round(dist, 3)) if near is not None else poi)
        return results


def _match_tier(poi: Poi, query: str, tokens: list[str]) -> int:
    """Độ khớp tên: 0 = trùng/đầu tên/đủ từ ("phuc long" ↔ "Phúc Long - Lê Lợi"), 1 = chứa chuỗi, 2 = chỉ khớp
    ẩm thực/brand. Không tách "trùng khít" khỏi "đầu tên": quán tên đúng "Highlands" ở Hà Nội không được vượt
    "Highlands Coffee" cách 400 m khi đang xem TP.HCM."""
    name_words = poi.norm_name.split()
    if poi.norm_name.startswith(query) or all(t in name_words for t in tokens):
        return 0
    if all(t in poi.norm_name for t in tokens):
        return 1
    return 2


def _rank_key(poi: Poi) -> tuple[int, str, str]:
    return -poi.score, poi.norm_name, poi.external_id


@lru_cache
def get_poi_service() -> PoiService:
    """Singleton nạp snapshot một lần lúc gọi đầu."""
    data_dir = get_settings().POI_DATA_DIR
    return PoiService(Path(data_dir) if data_dir else None)
