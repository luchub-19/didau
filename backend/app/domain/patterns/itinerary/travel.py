"""Thời gian di chuyển thống nhất (ALGORITHMS §2, T-84).

Một nguồn duy nhất cho auto-plan, `TravelTimeConflictRule` và (T-86/T-87) ALGO-02/03/04:
xe máy, mỗi kết quả mang `source`. Ước lượng Haversine là mặc định miễn phí; Google Routes
`computeRouteMatrix` chỉ tồn tại khi `PLACES_PROVIDER=google` + có key (`get_travel_estimator`) và luôn lùi
về ước lượng khi lỗi/quá hạn/quá trần.

Hai lớp API: đồng bộ (`leg`/`matrix`/`minutes`) — KHÔNG bao giờ gọi mạng, chỉ trả cache Google nếu có hoặc
ước lượng; bất đồng bộ (`aleg`/`amatrix`) — nơi duy nhất Google được gọi. Chỗ cần số Google phải `await amatrix`
để làm ấm cache trước khi chạy phần đồng bộ.
"""

import asyncio
import logging
import math
import time
from abc import ABC, abstractmethod
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime
from enum import Enum
from typing import TYPE_CHECKING, Any

from app.core import algo_config as cfg

if TYPE_CHECKING:
    import httpx

    from app.config import Settings

Coord = tuple[float, float]

logger = logging.getLogger(__name__)


def haversine_distance_km(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> float:
    """Tính khoảng cách đường chim bay giữa hai tọa độ địa lý theo công thức Haversine (km)."""
    radius = 6371.0  # Bán kính Trái Đất xấp xỉ tính bằng km
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return radius * c


class TravelSource(str, Enum):
    """Nguồn của một chặng; giao diện ghi "ước lượng" khi `ESTIMATE`."""

    ESTIMATE = "ESTIMATE"
    GOOGLE = "GOOGLE"


@dataclass(frozen=True, slots=True)
class Leg:
    """Một chặng di chuyển. `minutes` KHÔNG gồm `BUFFER_MIN` (gửi xe/đi bộ)."""

    minutes: int
    distance_km: float
    source: TravelSource = TravelSource.ESTIMATE


class ITravelTimeEstimator(ABC):
    """Ước lượng thời gian di chuyển giữa các toạ độ (CR-02, mở rộng ở T-84)."""

    @abstractmethod
    def leg(self, a: Coord, b: Coord, depart_at: datetime | None = None) -> Leg:
        """Chặng từ a=(lat, lng) đến b=(lat, lng), không gọi mạng."""

    def minutes(self, a: Coord, b: Coord) -> int:
        """Số phút di chuyển từ a đến b (tương thích ngược, không gồm gửi xe)."""
        return self.leg(a, b).minutes

    def matrix(
        self,
        origins: Sequence[Coord],
        dests: Sequence[Coord],
        depart_at: datetime | None = None,
    ) -> list[list[Leg]]:
        """Ma trận `[i][j]` = chặng từ origins[i] đến dests[j] (đồng bộ, không gọi mạng)."""
        return [[self.leg(o, d, depart_at) for d in dests] for o in origins]

    async def aleg(self, a: Coord, b: Coord, depart_at: datetime | None = None) -> Leg:
        """Bản bất đồng bộ của `leg` (Google chỉ được gọi từ đây)."""
        return (await self.amatrix([a], [b], depart_at))[0][0]

    async def amatrix(
        self,
        origins: Sequence[Coord],
        dests: Sequence[Coord],
        depart_at: datetime | None = None,
    ) -> list[list[Leg]]:
        """Bản bất đồng bộ của `matrix`; mặc định giống bản đồng bộ."""
        return self.matrix(origins, dests, depart_at)


class HaversineTravelEstimator(ITravelTimeEstimator):
    """`minutes = ceil(haversine × DETOUR_FACTOR / MOTORBIKE_KMH × 60)` (§2).

    Không cộng gửi xe: `parking_minutes` mặc định 0 (trước T-84 là 10 và vận tốc 30 km/h). `depart_at` bị bỏ
    qua (ước lượng không biết giờ cao điểm — biên dự phòng do ALGO-03/04 tính).
    """

    def __init__(
        self,
        average_speed_kmh: float = cfg.MOTORBIKE_KMH,
        detour_factor: float = cfg.DETOUR_FACTOR,
        parking_minutes: int = 0,
    ) -> None:
        self.average_speed_kmh = max(1.0, average_speed_kmh)
        self.detour_factor = max(1.0, detour_factor)
        self.parking_minutes = max(0, parking_minutes)

    def leg(self, a: Coord, b: Coord, depart_at: datetime | None = None) -> Leg:
        distance_km = haversine_distance_km(a[0], a[1], b[0], b[1]) * self.detour_factor
        # round(…, 6): tránh ceil nhảy +1 vì sai số float khi quãng đường là bội đúng của vận tốc
        driving = math.ceil(round(distance_km / self.average_speed_kmh * 60.0, 6))
        return Leg(driving + self.parking_minutes, distance_km, TravelSource.ESTIMATE)


def _parse_duration_s(raw: Any) -> float | None:
    """`"160s"` (protobuf Duration dạng JSON) → 160.0; sai định dạng → None."""
    if not isinstance(raw, str) or not raw.endswith("s"):
        return None
    try:
        value = float(raw[:-1])
    except ValueError:
        return None
    return value if value >= 0 and math.isfinite(value) else None


def _departure_time(depart_at: datetime | None) -> str | None:
    """RFC 3339 UTC cho `departureTime`; None khi không có hoặc đã qua (Google từ chối giờ quá khứ)."""
    if depart_at is None:
        return None
    if depart_at.tzinfo is None:
        # Giờ trên phòng là giờ Việt Nam; datetime ngây thơ coi như UTC+7
        from app.core.time_utils import VIETNAM_TZ

        depart_at = depart_at.replace(tzinfo=VIETNAM_TZ)
    utc = depart_at.astimezone(UTC)
    if utc <= datetime.now(UTC):
        return None
    return utc.strftime("%Y-%m-%dT%H:%M:%SZ")


class GoogleRouteMatrixEstimator(ITravelTimeEstimator):
    """Google Routes API `computeRouteMatrix` (xe máy, có giao thông), lùi về ước lượng.

    Chỉ dựng qua `get_travel_estimator()` khi `PLACES_PROVIDER=google` + key; `httpx` chỉ được import lúc
    thật sự gọi. Không bao giờ ném lỗi ra ngoài: mọi sự cố → ước lượng cho phần tử/chặng đó. Backend không đọc
    hay lưu thứ gì của Google ngoài `duration`/`distanceMeters`/`condition`.
    """

    URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix"
    FIELD_MASK = "originIndex,destinationIndex,duration,distanceMeters,condition"

    def __init__(
        self,
        api_key: str,
        fallback: ITravelTimeEstimator | None = None,
        client: "httpx.AsyncClient | None" = None,
        timeout_s: float = cfg.GOOGLE_ROUTES_TIMEOUT_S,
        daily_limit: int = cfg.GOOGLE_DAILY_ELEMENT_LIMIT,
        today: Callable[[], date] | None = None,
    ) -> None:
        self.api_key = api_key
        self.fallback = fallback or HaversineTravelEstimator()
        self._client = client
        self.timeout_s = timeout_s
        self.daily_limit = daily_limit
        self._today = today or (lambda: datetime.now(UTC).date())
        self._quota_day: date | None = None
        self._quota_used = 0

    def leg(self, a: Coord, b: Coord, depart_at: datetime | None = None) -> Leg:
        # Đồng bộ không gọi mạng; `CachedEstimator` bọc ngoài sẽ trả số Google đã làm ấm nếu có.
        return self.fallback.leg(a, b, depart_at)

    async def amatrix(
        self,
        origins: Sequence[Coord],
        dests: Sequence[Coord],
        depart_at: datetime | None = None,
    ) -> list[list[Leg]]:
        result = self.fallback.matrix(origins, dests, depart_at)
        if not origins or not dests or len(dests) > cfg.GOOGLE_MAX_ELEMENTS:
            return result
        rows_per_call = max(1, cfg.GOOGLE_MAX_ELEMENTS // len(dests))
        for start in range(0, len(origins), rows_per_call):
            chunk = origins[start : start + rows_per_call]
            if not self._take_quota(len(chunk) * len(dests)):
                break  # hết trần ngày: phần còn lại giữ ước lượng
            for el in await self._fetch(chunk, dests, depart_at):
                i, j = el[0], el[1]
                result[start + i][j] = el[2]
        return result

    def _take_quota(self, elements: int) -> bool:
        today = self._today()
        if self._quota_day != today:
            self._quota_day, self._quota_used = today, 0
        if self._quota_used + elements > self.daily_limit:
            return False
        self._quota_used += elements
        return True

    async def _fetch(
        self,
        origins: Sequence[Coord],
        dests: Sequence[Coord],
        depart_at: datetime | None,
    ) -> list[tuple[int, int, Leg]]:
        """Các phần tử Google trả được (đã lọc lỗi); mọi lỗi toàn yêu cầu → danh sách rỗng."""

        def waypoint(c: Coord) -> dict[str, Any]:
            return {"waypoint": {"location": {"latLng": {"latitude": c[0], "longitude": c[1]}}}}

        body: dict[str, Any] = {
            "origins": [waypoint(c) for c in origins],
            "destinations": [waypoint(c) for c in dests],
            "travelMode": cfg.TRAVEL_MODE,
            "routingPreference": "TRAFFIC_AWARE",
        }
        departure = _departure_time(depart_at)
        if departure is not None:
            body["departureTime"] = departure
        headers = {
            "X-Goog-Api-Key": self.api_key,
            "X-Goog-FieldMask": self.FIELD_MASK,
            "Content-Type": "application/json",
        }
        try:
            payload = await asyncio.wait_for(self._post(body, headers), self.timeout_s)
        except Exception as exc:  # noqa: BLE001 — hợp đồng: không ném lỗi ra ngoài, lùi về ước lượng
            logger.warning("Routes API lỗi, lùi về ước lượng: %s", type(exc).__name__)
            return []
        if not isinstance(payload, list):
            return []
        out: list[tuple[int, int, Leg]] = []
        for el in payload:
            parsed = self._parse_element(el, len(origins), len(dests))
            if parsed is not None:
                out.append(parsed)
        return out

    async def _post(self, body: dict[str, Any], headers: dict[str, str]) -> Any:
        import httpx  # nạp lười: cờ tắt thì không bao giờ import

        if self._client is not None:
            resp = await self._client.post(self.URL, json=body, headers=headers)
        else:
            async with httpx.AsyncClient(timeout=self.timeout_s) as client:
                resp = await client.post(self.URL, json=body, headers=headers)
        resp.raise_for_status()
        return resp.json()

    @staticmethod
    def _parse_element(el: Any, n_origins: int, n_dests: int) -> tuple[int, int, Leg] | None:
        if not isinstance(el, dict):
            return None
        i, j = el.get("originIndex", 0), el.get("destinationIndex", 0)  # protobuf bỏ trường = 0
        if not (isinstance(i, int) and isinstance(j, int) and 0 <= i < n_origins and 0 <= j < n_dests):
            return None
        if el.get("condition") != "ROUTE_EXISTS":
            return None
        seconds = _parse_duration_s(el.get("duration"))
        meters = el.get("distanceMeters", 0)  # protobuf bỏ trường = 0
        if seconds is None or not isinstance(meters, int | float) or meters < 0:
            return None
        return i, j, Leg(math.ceil(round(seconds / 60.0, 6)), meters / 1000.0, TravelSource.GOOGLE)


class CachedEstimator(ITravelTimeEstimator):
    """Cache RAM 15' cho kết quả Google; kết quả ước lượng KHÔNG cache (rẻ, và để lần sau thử lại Google).

    Khoá = (toạ độ làm tròn 3 số, đích, khung `GOOGLE_CACHE_BUCKET_MIN` phút của giờ khởi hành).
    """

    def __init__(
        self,
        inner: ITravelTimeEstimator,
        ttl_s: float = cfg.GOOGLE_CACHE_TTL_S,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.inner = inner
        self.ttl_s = ttl_s
        self._clock = clock
        self._store: dict[tuple, tuple[float, Leg]] = {}

    @staticmethod
    def _key(a: Coord, b: Coord, depart_at: datetime | None) -> tuple:
        d = cfg.GOOGLE_COORD_DECIMALS
        bucket = (
            None
            if depart_at is None
            else int(depart_at.timestamp() // (cfg.GOOGLE_CACHE_BUCKET_MIN * 60))
        )
        return (round(a[0], d), round(a[1], d), round(b[0], d), round(b[1], d), bucket)

    def _peek(self, a: Coord, b: Coord, depart_at: datetime | None) -> Leg | None:
        key = self._key(a, b, depart_at)
        hit = self._store.get(key)
        if hit is None:
            return None
        if self._clock() - hit[0] >= self.ttl_s:
            del self._store[key]
            return None
        return hit[1]

    def leg(self, a: Coord, b: Coord, depart_at: datetime | None = None) -> Leg:
        return self._peek(a, b, depart_at) or self.inner.leg(a, b, depart_at)

    async def amatrix(
        self,
        origins: Sequence[Coord],
        dests: Sequence[Coord],
        depart_at: datetime | None = None,
    ) -> list[list[Leg]]:
        result: list[list[Leg | None]] = [
            [self._peek(o, d, depart_at) for d in dests] for o in origins
        ]
        rows = [i for i, row in enumerate(result) if any(x is None for x in row)]
        cols = sorted({j for i in rows for j, x in enumerate(result[i]) if x is None})
        if rows:
            # Chỉ hỏi hình chữ nhật nhỏ nhất chứa các ô còn thiếu
            fresh = await self.inner.amatrix(
                [origins[i] for i in rows], [dests[j] for j in cols], depart_at
            )
            now = self._clock()
            for ri, i in enumerate(rows):
                for ci, j in enumerate(cols):
                    got = fresh[ri][ci]
                    if result[i][j] is None:
                        result[i][j] = got
                    if got.source is TravelSource.GOOGLE:
                        self._store[self._key(origins[i], dests[j], depart_at)] = (now, got)
        return [[x for x in row if x is not None] for row in result]


_instance: ITravelTimeEstimator | None = None
_instance_key: tuple[str, str] | None = None


def get_travel_estimator(settings: "Settings | None" = None) -> ITravelTimeEstimator:
    """Estimator dùng chung của backend (singleton theo cấu hình).

    `PLACES_PROVIDER=google` + `GOOGLE_MAPS_SERVER_KEY` → `CachedEstimator(GoogleRouteMatrixEstimator)`;
    ngược lại → `HaversineTravelEstimator` thuần, không bao giờ import/gọi mạng.
    """
    global _instance, _instance_key
    from app.config import get_settings

    s = settings or get_settings()
    key = (s.PLACES_PROVIDER, s.GOOGLE_MAPS_SERVER_KEY)
    if _instance is not None and _instance_key == key:
        return _instance
    base = HaversineTravelEstimator()
    if s.PLACES_PROVIDER == "google" and s.GOOGLE_MAPS_SERVER_KEY:
        _instance = CachedEstimator(
            GoogleRouteMatrixEstimator(
                s.GOOGLE_MAPS_SERVER_KEY, fallback=base, daily_limit=s.GOOGLE_ROUTES_DAILY_LIMIT
            )
        )
    else:
        _instance = base
    _instance_key = key
    return _instance


def reset_travel_estimator() -> None:
    """Xoá singleton (test, hoặc khi đổi cấu hình lúc chạy)."""
    global _instance, _instance_key
    _instance, _instance_key = None, None
