"""Thời gian di chuyển thống nhất (ALGORITHMS §2, T-84).

Một nguồn duy nhất cho auto-plan, `TravelTimeConflictRule` và (T-86/T-87) ALGO-02/03/04:
xe máy, mỗi kết quả mang `source`. Ước lượng Haversine là mặc định miễn phí; Google Routes
`computeRouteMatrix` chỉ tồn tại khi `PLACES_PROVIDER=google` + có key (`get_travel_estimator`) và luôn lùi
về ước lượng khi lỗi/quá hạn/quá trần.

Hai lớp API: đồng bộ (`leg`/`matrix`/`minutes`) — KHÔNG bao giờ gọi mạng, chỉ trả cache Google nếu có hoặc
ước lượng; bất đồng bộ (`aleg`/`amatrix`) — nơi duy nhất Google được gọi. Chỗ cần số Google phải `await amatrix`
để làm ấm cache trước khi chạy phần đồng bộ.

Gđ7 (CR-15, `docs/phase7/ALGORITHMS.md` §5): `ROUTING_PROVIDER=valhalla` → `DbCachedEstimator`: cache DB
(`travel_legs`) → Valhalla tự host → ước lượng. Khác Google: `amatrix` của nó CHỈ đọc cache (không chờ mạng lúc
tính hoà); Valhalla chỉ được gọi ở `warm` (làm ấm sau commit) và `routes` (người xem đường của mình/lịch).
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
    VALHALLA = "VALHALLA"


@dataclass(frozen=True, slots=True)
class Leg:
    """Một chặng di chuyển. `minutes` KHÔNG gồm `BUFFER_MIN` (gửi xe/đi bộ)."""

    minutes: int
    distance_km: float
    source: TravelSource = TravelSource.ESTIMATE


def minutes_for_km(km: float, speed_kmh: float = cfg.MOTORBIKE_KMH) -> int:
    """`ceil(km ÷ MOTORBIKE_KMH × 60)` — phút cho mọi nguồn trừ Google (gđ7 §5)."""
    # round(…, 6): tránh ceil nhảy +1 vì sai số float khi quãng đường là bội đúng của vận tốc
    return math.ceil(round(km / max(1.0, speed_kmh) * 60.0, 6))


def coord_key(c: Coord) -> str:
    """Khoá cache `travel_legs`: toạ độ làm tròn `ROUTE_COORD_DECIMALS` số ("10.7725,106.6980"). Chỉ server dùng."""
    d = cfg.ROUTE_COORD_DECIMALS
    return f"{round(c[0], d):.{d}f},{round(c[1], d):.{d}f}"


@dataclass(frozen=True, slots=True)
class Route:
    """Một chặng kèm hình dạng đường (polyline mã hoá, độ chính xác 6). `shape` None = chưa có (ước lượng)."""

    leg: Leg
    shape: str | None = None


@dataclass(frozen=True, slots=True)
class CachedLeg:
    """Một dòng `travel_legs`. Phút KHÔNG lưu làm nguồn sự thật: tính lại từ km để đổi `MOTORBIKE_KMH` là có hiệu
    lực ngay (cột `minutes` trong DB chỉ để đọc tay)."""

    from_key: str
    to_key: str
    distance_km: float
    shape: str | None = None
    source: TravelSource = TravelSource.VALHALLA

    def to_leg(self) -> Leg:
        return Leg(minutes_for_km(self.distance_km), self.distance_km, self.source)


class ILegStore(ABC):
    """Kho bền của chặng (bảng `travel_legs`); hiện thực ở `app/repositories/travel_leg_repo.py`."""

    @abstractmethod
    async def get_many(self, keys: Sequence[tuple[str, str]]) -> dict[tuple[str, str], CachedLeg]:
        """Các dòng có trong kho cho các cặp (from_key, to_key); cặp thiếu không có mục."""

    @abstractmethod
    async def save_legs(self, legs: Sequence[CachedLeg]) -> None:
        """Ghi km (thêm hoặc cập nhật), GIỮ `shape` đã có."""

    @abstractmethod
    async def save_shapes(self, legs: Sequence[CachedLeg]) -> None:
        """Ghi `shape`; dòng chưa có thì thêm cùng km của `/route`, dòng đã có thì giữ km cũ (của ma trận)."""


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

    async def acached_matrix(
        self,
        origins: Sequence[Coord],
        dests: Sequence[Coord],
        depart_at: datetime | None = None,
    ) -> list[list[Leg]]:
        """Chỉ đọc cache (RAM/DB) rồi ước lượng — KHÔNG BAO GIỜ gọi mạng. Mặc định = `matrix` đồng bộ; estimator
        có cache DB ghi đè để đọc được DB (ALGO-04 chạy sau mỗi phiếu dùng hàm này)."""
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


class ValhallaEstimator(ITravelTimeEstimator):
    """Valhalla tự host (`motor_scooter`, km), lùi về ước lượng — gđ7 §5, `docs/phase7/VALHALLA.md`.

    `POST /sources_to_targets` cho km, `POST /route` cho hình dạng đường. Header `X-Route-Key` khi có khoá.
    Không bao giờ ném lỗi ra ngoài: lỗi toàn yêu cầu / ô rỗng → ước lượng cho ô đó (nơi gọi KHÔNG ghi cache ô có
    `source = ESTIMATE`). Sau một lỗi mạng/HTTP thì nghỉ `VALHALLA_COOLDOWN_S` giây (PC tắt → không chờ timeout mãi).
    """

    def __init__(
        self,
        url: str,
        key: str = "",
        fallback: ITravelTimeEstimator | None = None,
        client: "httpx.AsyncClient | None" = None,
        timeout_s: float = cfg.VALHALLA_TIMEOUT_S,
        cooldown_s: float = cfg.VALHALLA_COOLDOWN_S,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.url = url.rstrip("/")
        self.key = key
        self.fallback = fallback or HaversineTravelEstimator()
        self._client = client
        self.timeout_s = timeout_s
        self.cooldown_s = cooldown_s
        self._clock = clock
        self._down_until = 0.0

    def leg(self, a: Coord, b: Coord, depart_at: datetime | None = None) -> Leg:
        # Đồng bộ không gọi mạng; `DbCachedEstimator` bọc ngoài trả số Valhalla đã lưu nếu có.
        return self.fallback.leg(a, b, depart_at)

    async def amatrix(
        self,
        origins: Sequence[Coord],
        dests: Sequence[Coord],
        depart_at: datetime | None = None,
    ) -> list[list[Leg]]:
        result = self.fallback.matrix(origins, dests, depart_at)
        if not origins or not dests or len(dests) > cfg.VALHALLA_MAX_PAIRS:
            return result
        rows_per_call = max(1, cfg.VALHALLA_MAX_PAIRS // len(dests))
        for start in range(0, len(origins), rows_per_call):
            chunk = origins[start : start + rows_per_call]
            for i, j, leg in await self._fetch_matrix(chunk, dests):
                result[start + i][j] = leg
        return result

    async def aroute(self, a: Coord, b: Coord) -> Route | None:
        """Chặng a → b kèm `shape` (polyline 6); None khi lỗi / không có đường (nơi gọi lùi về ước lượng)."""
        body = {
            "locations": [_loc(a), _loc(b)],
            "costing": cfg.VALHALLA_COSTING,
            "units": "kilometers",
            "directions_type": "none",  # không cần chỉ dẫn từng ngã rẽ, chỉ cần hình dạng + tổng km
        }
        payload = await self._call("/route", body)
        return self._parse_route(payload)

    def _available(self) -> bool:
        return self._clock() >= self._down_until

    async def _call(self, path: str, body: dict[str, Any]) -> Any:
        """JSON trả về, hoặc None khi đang nghỉ / lỗi (lỗi thì bắt đầu nghỉ)."""
        if not self._available():
            return None
        try:
            return await asyncio.wait_for(self._post(path, body), self.timeout_s)
        except Exception as exc:  # noqa: BLE001 — hợp đồng: không ném lỗi ra ngoài, lùi về ước lượng
            self._down_until = self._clock() + self.cooldown_s
            logger.warning("Valhalla %s lỗi, lùi về ước lượng: %s", path, type(exc).__name__)
            return None

    async def _post(self, path: str, body: dict[str, Any]) -> Any:
        import httpx  # nạp lười: cờ tắt thì không bao giờ import

        headers = {"Content-Type": "application/json"}
        if self.key:
            headers["X-Route-Key"] = self.key
        url = self.url + path
        if self._client is not None:
            resp = await self._client.post(url, json=body, headers=headers)
        else:
            async with httpx.AsyncClient(timeout=self.timeout_s) as client:
                resp = await client.post(url, json=body, headers=headers)
        resp.raise_for_status()
        return resp.json()

    async def _fetch_matrix(
        self, origins: Sequence[Coord], dests: Sequence[Coord]
    ) -> list[tuple[int, int, Leg]]:
        body = {
            "sources": [_loc(c) for c in origins],
            "targets": [_loc(c) for c in dests],
            "costing": cfg.VALHALLA_COSTING,
            "units": "kilometers",
        }
        payload = await self._call("/sources_to_targets", body)
        if not isinstance(payload, dict):
            return []
        return self._parse_matrix(payload.get("sources_to_targets"), len(origins), len(dests))

    @staticmethod
    def _parse_matrix(data: Any, n_origins: int, n_dests: int) -> list[tuple[int, int, Leg]]:
        """Hai định dạng: mặc định (mảng hàng, mỗi ô `{from_index, to_index, distance, time}`) và gọn
        (`verbose: false` → `{distances: [[…]]}`). Ô thiếu/không có đường (`distance: null`) bị bỏ."""
        out: list[tuple[int, int, Leg]] = []

        def add(i: Any, j: Any, km: Any) -> None:
            if not (isinstance(i, int) and isinstance(j, int)):
                return
            if not (0 <= i < n_origins and 0 <= j < n_dests):
                return
            if isinstance(km, bool) or not isinstance(km, int | float):
                return
            if not math.isfinite(km) or km < 0:
                return
            out.append((i, j, Leg(minutes_for_km(float(km)), float(km), TravelSource.VALHALLA)))

        if isinstance(data, dict):
            rows = data.get("distances")
            if isinstance(rows, list):
                for i, row in enumerate(rows):
                    if isinstance(row, list):
                        for j, km in enumerate(row):
                            add(i, j, km)
            return out
        if not isinstance(data, list):
            return out
        for i, row in enumerate(data):
            if not isinstance(row, list):
                continue
            for j, cell in enumerate(row):
                if isinstance(cell, dict):
                    add(cell.get("from_index", i), cell.get("to_index", j), cell.get("distance"))
        return out

    @staticmethod
    def _parse_route(payload: Any) -> Route | None:
        if not isinstance(payload, dict):
            return None
        trip = payload.get("trip")
        if not isinstance(trip, dict):
            return None
        legs = trip.get("legs")
        summary = trip.get("summary")
        if not (isinstance(legs, list) and legs and isinstance(summary, dict)):
            return None
        shape = legs[0].get("shape") if isinstance(legs[0], dict) else None
        km = summary.get("length")
        if not isinstance(shape, str) or not shape:
            return None
        if isinstance(km, bool) or not isinstance(km, int | float) or not math.isfinite(km) or km < 0:
            return None
        return Route(Leg(minutes_for_km(float(km)), float(km), TravelSource.VALHALLA), shape)


def _loc(c: Coord) -> dict[str, float]:
    return {"lat": c[0], "lon": c[1]}


class DbCachedEstimator(ITravelTimeEstimator):
    """Cache DB (`travel_legs`, không TTL) → Valhalla → ước lượng (gđ7 §5).

    - Đồng bộ `leg`/`matrix`: bản sao RAM của những dòng đã đọc/ghi trong process, rồi ước lượng.
    - `amatrix`/`acached_matrix`: đọc RAM → DB, ô thiếu → ước lượng. KHÔNG gọi mạng (lúc tính hoà không chờ mạng).
    - `warm`: hỏi Valhalla các cặp còn thiếu bằng MỘT yêu cầu ma trận (hình chữ nhật nhỏ nhất), ghi ô thành công.
    - `routes`: chặng + `shape`; thiếu `shape` thì gọi `/route` (song song, có trần) và ghi lại.
    `fetcher` None (URL trống) = chỉ đọc cache. Lỗi DB không làm hỏng thao tác chính: coi như cache trống.
    """

    def __init__(
        self,
        store: ILegStore,
        fetcher: ValhallaEstimator | None = None,
        fallback: ITravelTimeEstimator | None = None,
        memory_limit: int = cfg.ROUTE_MEMORY_LIMIT,
    ) -> None:
        self.store = store
        self.fetcher = fetcher
        self.fallback = fallback or HaversineTravelEstimator()
        self.memory_limit = memory_limit
        self._mem: dict[tuple[str, str], CachedLeg] = {}

    @property
    def can_fetch(self) -> bool:
        return self.fetcher is not None

    def _remember(self, legs: Sequence[CachedLeg]) -> None:
        if len(self._mem) + len(legs) > self.memory_limit:
            self._mem.clear()
        for cl in legs[: self.memory_limit]:
            self._mem[(cl.from_key, cl.to_key)] = cl

    def leg(self, a: Coord, b: Coord, depart_at: datetime | None = None) -> Leg:
        hit = self._mem.get((coord_key(a), coord_key(b)))
        return hit.to_leg() if hit is not None else self.fallback.leg(a, b, depart_at)

    async def load(self, pairs: Sequence[tuple[Coord, Coord]]) -> dict[tuple[str, str], CachedLeg]:
        """Các dòng cache có cho các cặp (RAM trước, thiếu thì một truy vấn DB). Không gọi mạng."""
        keys = list(dict.fromkeys((coord_key(a), coord_key(b)) for a, b in pairs))
        found = {k: self._mem[k] for k in keys if k in self._mem}
        missing = [k for k in keys if k not in found]
        if missing:
            try:
                got = await self.store.get_many(missing)
            except Exception:  # DB lỗi → coi như chưa có cache, lùi về ước lượng
                logger.exception("Không đọc được cache travel_legs")
                got = {}
            self._remember(list(got.values()))
            found.update(got)
        return found

    async def amatrix(
        self,
        origins: Sequence[Coord],
        dests: Sequence[Coord],
        depart_at: datetime | None = None,
    ) -> list[list[Leg]]:
        found = await self.load([(o, d) for o in origins for d in dests])
        return [
            [
                found[(coord_key(o), coord_key(d))].to_leg()
                if (coord_key(o), coord_key(d)) in found
                else self.fallback.leg(o, d, depart_at)
                for d in dests
            ]
            for o in origins
        ]

    async def acached_matrix(
        self,
        origins: Sequence[Coord],
        dests: Sequence[Coord],
        depart_at: datetime | None = None,
    ) -> list[list[Leg]]:
        return await self.amatrix(origins, dests, depart_at)

    async def warm(self, pairs: Sequence[tuple[Coord, Coord]]) -> int:
        """Lấy km Valhalla cho các cặp chưa có trong cache bằng MỘT yêu cầu ma trận; trả số dòng đã ghi.

        Cặp trùng điểm (cùng khoá) bỏ qua — ước lượng đã là 0. Ô lỗi/rỗng không ghi (lần sau thử lại).
        """
        if self.fetcher is None:
            return 0
        wanted = {
            (coord_key(a), coord_key(b)): (a, b) for a, b in pairs if coord_key(a) != coord_key(b)
        }
        if not wanted:
            return 0
        found = await self.load(list(wanted.values()))
        todo = [ab for k, ab in wanted.items() if k not in found]
        if not todo:
            return 0
        # Hình chữ nhật nhỏ nhất chứa mọi cặp còn thiếu (theo khoá, để không hỏi trùng điểm)
        srcs = list({coord_key(a): a for a, _ in todo}.values())
        dsts = list({coord_key(b): b for _, b in todo}.values())
        grid = await self.fetcher.amatrix(srcs, dsts)
        row = {coord_key(c): i for i, c in enumerate(srcs)}
        col = {coord_key(c): j for j, c in enumerate(dsts)}
        fresh: list[CachedLeg] = []
        for a, b in todo:
            got = grid[row[coord_key(a)]][col[coord_key(b)]]
            if got.source is TravelSource.VALHALLA:
                fresh.append(CachedLeg(coord_key(a), coord_key(b), got.distance_km))
        if fresh:
            try:
                await self.store.save_legs(fresh)
            except Exception:
                logger.exception("Không ghi được cache travel_legs")
                return 0
            self._remember(fresh)
        return len(fresh)

    async def routes(
        self,
        pairs: Sequence[tuple[Coord, Coord]],
        *,
        fetch: bool = True,
        limit: int | None = None,
    ) -> list[Route]:
        """Chặng + hình dạng cho từng cặp (cùng thứ tự). Thiếu `shape` và `fetch` → gọi `/route` cho tối đa `limit`
        cặp (song song `ROUTE_SHAPE_CONCURRENCY`), ghi lại; còn lại trả km cache/ước lượng với `shape` None."""
        found = await self.load(pairs)
        need: dict[tuple[str, str], tuple[Coord, Coord]] = {}
        if fetch and self.fetcher is not None:
            for a, b in pairs:
                k = (coord_key(a), coord_key(b))
                if k[0] != k[1] and (k not in found or found[k].shape is None):
                    need.setdefault(k, (a, b))
            if limit is not None:
                need = dict(list(need.items())[: max(0, limit)])
        if need:
            fetcher = self.fetcher
            assert fetcher is not None
            sem = asyncio.Semaphore(cfg.ROUTE_SHAPE_CONCURRENCY)

            async def one(a: Coord, b: Coord) -> Route | None:
                async with sem:
                    return await fetcher.aroute(a, b)

            got = await asyncio.gather(*(one(a, b) for a, b in need.values()))
            fresh: list[CachedLeg] = []
            for k, r in zip(need, got, strict=True):
                if r is None:
                    continue
                old = found.get(k)
                km = old.distance_km if old is not None else r.leg.distance_km
                fresh.append(CachedLeg(k[0], k[1], km, r.shape))
            if fresh:
                try:
                    await self.store.save_shapes(fresh)
                except Exception:
                    logger.exception("Không ghi được hình dạng đường vào travel_legs")
                self._remember(fresh)
                found.update({(cl.from_key, cl.to_key): cl for cl in fresh})
        out: list[Route] = []
        for a, b in pairs:
            hit = found.get((coord_key(a), coord_key(b)))
            out.append(
                Route(hit.to_leg(), hit.shape) if hit is not None else Route(self.fallback.leg(a, b))
            )
        return out


_instance: ITravelTimeEstimator | None = None
_instance_key: tuple | None = None


def get_travel_estimator(settings: "Settings | None" = None) -> ITravelTimeEstimator:
    """Estimator dùng chung của backend (singleton theo cấu hình).

    `ROUTING_PROVIDER=valhalla` → `DbCachedEstimator` (cache DB; + `ValhallaEstimator` khi có `VALHALLA_URL`);
    ngược lại `PLACES_PROVIDER=google` + `GOOGLE_MAPS_SERVER_KEY` → `CachedEstimator(GoogleRouteMatrixEstimator)`;
    ngược lại → `HaversineTravelEstimator` thuần, không bao giờ import/gọi mạng hay đọc DB.
    """
    global _instance, _instance_key
    from app.config import get_settings

    s = settings or get_settings()
    routing = s.ROUTING_PROVIDER.strip().lower()
    key = (
        s.PLACES_PROVIDER,
        s.GOOGLE_MAPS_SERVER_KEY,
        routing,
        s.VALHALLA_URL,
        s.VALHALLA_KEY,
        s.VALHALLA_TIMEOUT_S,
    )
    if _instance is not None and _instance_key == key:
        return _instance
    base = HaversineTravelEstimator()
    if routing == "valhalla":
        # Nạp lười: tầng domain chỉ biết ILegStore; kho thật mở session riêng (đọc dữ liệu đã commit)
        from app.repositories.travel_leg_repo import SessionLegStore

        fetcher = (
            ValhallaEstimator(
                s.VALHALLA_URL, s.VALHALLA_KEY, fallback=base, timeout_s=s.VALHALLA_TIMEOUT_S
            )
            if s.VALHALLA_URL.strip()
            else None
        )
        _instance = DbCachedEstimator(SessionLegStore(), fetcher=fetcher, fallback=base)
    elif s.PLACES_PROVIDER == "google" and s.GOOGLE_MAPS_SERVER_KEY:
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
