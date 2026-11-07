import asyncio
import json
import math
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import httpx
import pytest

from app.config import Settings
from app.domain.enums import PlaceCategory, PlaceStatus
from app.domain.patterns.conflict_rule import (
    ConflictContext,
    PlaceVoteSummary,
    TravelTimeConflictRule,
)
from app.domain.patterns.itinerary import (
    CachedEstimator,
    GoogleRouteMatrixEstimator,
    HaversineTravelEstimator,
    ITravelTimeEstimator,
    Leg,
    TravelSource,
    get_travel_estimator,
    haversine_distance_km,
    reset_travel_estimator,
)

BEN_THANH = (10.7725, 106.6980)
NHA_THO = (10.7798, 106.6992)
KM_PER_DEG_LAT = 2 * math.pi * 6371.0 / 360.0  # 1 độ vĩ ≈ 111,195 km


def at_km(origin: tuple[float, float], km: float) -> tuple[float, float]:
    """Điểm cách `origin` đúng `km` km theo hướng Bắc (Haversine)."""
    return (origin[0] + km / KM_PER_DEG_LAT, origin[1])


@pytest.fixture(autouse=True)
def _fresh_singleton():
    reset_travel_estimator()
    yield
    reset_travel_estimator()


# ── Ước lượng (ALGORITHMS §2) ─────────────────────────────────────────────────


def test_interface_is_abstract():
    with pytest.raises(TypeError):
        ITravelTimeEstimator()  # type: ignore[abstract]


def test_zero_km_is_zero_minutes_and_no_parking():
    leg = HaversineTravelEstimator().leg(BEN_THANH, BEN_THANH)
    assert (leg.minutes, leg.distance_km, leg.source) == (0, 0.0, TravelSource.ESTIMATE)
    assert HaversineTravelEstimator().minutes(BEN_THANH, BEN_THANH) == 0


def test_one_km_rounds_up():
    # 1 km chim bay × 1,3 / 25 km/h × 60 = 3,12 phút → 4
    leg = HaversineTravelEstimator().leg(BEN_THANH, at_km(BEN_THANH, 1.0))
    assert leg.minutes == 4
    assert leg.distance_km == pytest.approx(1.3, abs=1e-6)


def test_exact_multiple_does_not_round_up_by_float_noise():
    # 60 km/h, không đường vòng: đúng 1 km = đúng 1 phút (không nhảy thành 2)
    est = HaversineTravelEstimator(average_speed_kmh=60, detour_factor=1.0)
    assert est.minutes(BEN_THANH, at_km(BEN_THANH, 1.0)) == 1
    assert est.minutes(BEN_THANH, at_km(BEN_THANH, 1.01)) == 2


def test_formula_matches_spec_and_hand_calculation():
    km = haversine_distance_km(*BEN_THANH, *NHA_THO)
    assert HaversineTravelEstimator().minutes(BEN_THANH, NHA_THO) == math.ceil(km * 1.3 / 25.0 * 60.0)
    assert HaversineTravelEstimator().minutes(BEN_THANH, NHA_THO) == 3  # 0,82 km → 1,07 km → 2,57'


def test_custom_parameters_and_parking():
    est = HaversineTravelEstimator(average_speed_kmh=60, detour_factor=1.0, parking_minutes=0)
    km = haversine_distance_km(*BEN_THANH, *NHA_THO)
    assert est.minutes(BEN_THANH, NHA_THO) == math.ceil(km)
    assert HaversineTravelEstimator(parking_minutes=10).minutes(BEN_THANH, BEN_THANH) == 10


def test_matrix_shape_and_values():
    o = [BEN_THANH, NHA_THO]
    d = [BEN_THANH, NHA_THO, at_km(BEN_THANH, 5)]
    est = HaversineTravelEstimator()
    m = est.matrix(o, d)
    assert len(m) == 2 and all(len(r) == 3 for r in m)
    assert m[0][0].minutes == 0
    assert m[1][2] == est.leg(NHA_THO, d[2])
    assert est.matrix([], d) == []


# ── Rule dùng estimator chung ─────────────────────────────────────────────────

def _context(gap: int) -> ConflictContext:
    pa, pb = uuid4(), uuid4()
    sub = uuid4()

    def mk(pid, name, pos):
        return PlaceVoteSummary(
            place_id=pid,
            name=name,
            category=PlaceCategory.FOOD,
            status=PlaceStatus.ACCEPTED,
            submitted_by_id=sub,
            created_at=datetime.now(UTC),
            latitude=pos[0],
            longitude=pos[1],
        )

    items = [
        {"id": uuid4(), "place_id": pa, "day_offset": 0, "start_minute": 1000, "end_minute": 1060},
        {
            "id": uuid4(),
            "place_id": pb,
            "day_offset": 0,
            "start_minute": 1060 + gap,
            "end_minute": 1120 + gap,
        },
    ]
    return ConflictContext(
        room_id=uuid4(),
        places=[mk(pa, "A", BEN_THANH), mk(pb, "B", NHA_THO)],
        schedule_items=items,
    )


def test_rule_uses_shared_estimator_by_default():
    # BEN_THANH → NHA_THO = 3 phút (25 km/h, không gồm gửi xe): gap 2 → cảnh báo, gap 3 → ổn
    results = TravelTimeConflictRule().evaluate(_context(gap=2))
    assert len(results) == 1
    assert results[0].rule_code == "TRAVEL_TIME"
    assert results[0].params["travel_min"] == 3
    assert results[0].params["distance_km"] == 1.07
    assert TravelTimeConflictRule().evaluate(_context(gap=3)) == []


def test_rule_with_custom_estimator_is_used():
    est = HaversineTravelEstimator(parking_minutes=10)
    results = TravelTimeConflictRule(estimator=est).evaluate(_context(gap=10))
    assert len(results) == 1 and results[0].params["travel_min"] == 13


def test_rule_passes_with_enough_gap():
    assert TravelTimeConflictRule().evaluate(_context(gap=30)) == []


# ── Google Routes (mock httpx, không gọi mạng) ────────────────────────────────

A = (10.7626, 106.6820)
B = (10.7950, 106.7218)
C = (10.8015, 106.6185)
FUTURE = datetime.now(UTC) + timedelta(days=2)


def element(i: int, j: int, seconds: int, meters: int, condition: str = "ROUTE_EXISTS") -> dict:
    el: dict = {"originIndex": i, "destinationIndex": j, "condition": condition}
    if condition == "ROUTE_EXISTS":
        el.update(duration=f"{seconds}s", distanceMeters=meters)
    return {k: v for k, v in el.items() if not (k.endswith("Index") and v == 0)}  # protobuf bỏ số 0


class FakeRoutes:
    """httpx.MockTransport ghi lại yêu cầu và trả mảng phần tử định sẵn."""

    def __init__(self, elements=None, status: int = 200, delay: float = 0.0, exc=None) -> None:
        self.elements, self.status, self.delay, self.exc = elements or [], status, delay, exc
        self.requests: list[httpx.Request] = []

    async def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.delay:
            await asyncio.sleep(self.delay)
        if self.exc:
            raise self.exc
        return httpx.Response(self.status, json=self.elements)

    def client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(self))


def google(fake: FakeRoutes, **kw) -> GoogleRouteMatrixEstimator:
    return GoogleRouteMatrixEstimator("test-key", client=fake.client(), **kw)


async def test_google_success_request_shape_and_parsing():
    fake = FakeRoutes([element(0, 0, 125, 2400), element(0, 1, 60, 1000), element(1, 0, 0, 0)])
    est = google(fake)
    m = await est.amatrix([A, B], [C, A], depart_at=FUTURE)

    assert m[0][0] == Leg(3, 2.4, TravelSource.GOOGLE)  # 125 s → làm tròn lên 3 phút
    assert m[0][1] == Leg(1, 1.0, TravelSource.GOOGLE)
    assert m[1][0].source is TravelSource.GOOGLE and m[1][0].minutes == 0
    assert m[1][1].source is TravelSource.ESTIMATE  # Google không trả phần tử này

    (req,) = fake.requests
    assert str(req.url) == "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix"
    assert req.headers["X-Goog-Api-Key"] == "test-key"
    assert req.headers["X-Goog-FieldMask"] == (
        "originIndex,destinationIndex,duration,distanceMeters,condition"
    )
    body = json.loads(req.content)
    assert body["travelMode"] == "TWO_WHEELER" and body["routingPreference"] == "TRAFFIC_AWARE"
    assert body["origins"][1]["waypoint"]["location"]["latLng"] == {
        "latitude": B[0],
        "longitude": B[1],
    }
    assert len(body["destinations"]) == 2
    assert body["departureTime"].endswith("Z")


async def test_google_past_departure_time_is_omitted():
    fake = FakeRoutes([element(0, 0, 60, 500)])
    await google(fake).amatrix([A], [B], depart_at=datetime.now(UTC) - timedelta(hours=1))
    assert "departureTime" not in json.loads(fake.requests[0].content)


async def test_google_one_element_error_falls_back_for_that_element_only():
    fake = FakeRoutes([element(0, 0, 600, 5000), element(0, 1, 0, 0, "ROUTE_NOT_FOUND")])
    row = (await google(fake).amatrix([A], [B, C]))[0]
    assert row[0] == Leg(10, 5.0, TravelSource.GOOGLE)
    assert row[1] == HaversineTravelEstimator().leg(A, C)
    assert row[1].source is TravelSource.ESTIMATE


@pytest.mark.parametrize(
    "fake",
    [
        FakeRoutes(status=500),
        FakeRoutes(exc=httpx.ConnectTimeout("boom")),
        FakeRoutes(elements={"error": "not a list"}),
        FakeRoutes(elements=[{"originIndex": 9, "duration": "5s"}, "rác", {"duration": "abc"}]),
    ],
    ids=["http-500", "network-error", "bad-shape", "garbage-elements"],
)
async def test_google_total_failure_falls_back_to_estimate(fake):
    m = await google(fake).amatrix([A, B], [C])
    assert m == HaversineTravelEstimator().matrix([A, B], [C])
    assert all(leg.source is TravelSource.ESTIMATE for row in m for leg in row)


async def test_google_timeout_falls_back_to_estimate():
    fake = FakeRoutes([element(0, 0, 60, 500)], delay=1.0)
    m = await google(fake, timeout_s=0.05).amatrix([A], [B])
    assert m[0][0] == HaversineTravelEstimator().leg(A, B)


async def test_google_daily_limit_then_estimate():
    fake = FakeRoutes([element(0, 0, 60, 500)])
    est = google(fake, daily_limit=1)
    assert (await est.amatrix([A], [B]))[0][0].source is TravelSource.GOOGLE
    assert (await est.amatrix([A], [B]))[0][0].source is TravelSource.ESTIMATE
    assert len(fake.requests) == 1


async def test_google_splits_requests_over_625_elements():
    dests = [at_km(A, 0.1 * k) for k in range(300)]
    fake = FakeRoutes([])
    m = await google(fake, daily_limit=10_000).amatrix([A, B, C], dests)
    assert len(fake.requests) == 2  # 625 // 300 = 2 hàng mỗi lần
    assert len(m) == 3 and len(m[0]) == 300


def test_google_sync_leg_never_calls_network():
    fake = FakeRoutes([element(0, 0, 60, 500)])
    est = google(fake)
    assert est.leg(A, B) == HaversineTravelEstimator().leg(A, B)
    assert fake.requests == []


# ── Cache 15' ─────────────────────────────────────────────────────────────────


async def test_cache_hit_avoids_second_call_and_sync_leg_sees_it():
    fake = FakeRoutes([element(0, 0, 300, 4000)])
    est = CachedEstimator(google(fake))
    first = await est.amatrix([A], [B], FUTURE)
    second = await est.amatrix([A], [B], FUTURE + timedelta(minutes=3))  # cùng khung 15'
    assert first == second and first[0][0].source is TravelSource.GOOGLE
    assert len(fake.requests) == 1
    assert est.leg(A, B, FUTURE).source is TravelSource.GOOGLE  # phần đồng bộ thấy số đã ấm


async def test_cache_key_rounds_coords_and_splits_buckets_and_expires():
    now = [0.0]
    fake = FakeRoutes([element(0, 0, 300, 4000)])
    est = CachedEstimator(google(fake), ttl_s=900, clock=lambda: now[0])
    bucket_start = FUTURE.replace(minute=0, second=0, microsecond=0) + timedelta(hours=24)
    await est.amatrix([A], [B], bucket_start)
    await est.amatrix([(A[0] + 0.0001, A[1])], [B], bucket_start)  # lệch ~11 m → cùng khoá
    assert len(fake.requests) == 1
    await est.amatrix([A], [B], bucket_start + timedelta(minutes=16))  # khung khác
    assert len(fake.requests) == 2
    now[0] = 901.0  # quá TTL
    await est.amatrix([A], [B], bucket_start)
    assert len(fake.requests) == 3


async def test_cache_only_requests_missing_cells_and_never_caches_estimates():
    fake = FakeRoutes([element(0, 0, 300, 4000)])
    est = CachedEstimator(google(fake))
    await est.amatrix([A], [B], FUTURE)
    fake.elements = [element(0, 0, 120, 1500)]  # chỉ ô (A→C) còn thiếu
    m = await est.amatrix([A], [B, C], FUTURE)
    assert m[0][0].minutes == 5 and m[0][1].minutes == 2
    body = json.loads(fake.requests[1].content)
    assert len(body["origins"]) == 1 and len(body["destinations"]) == 1

    fake2 = FakeRoutes(status=500)
    est2 = CachedEstimator(google(fake2))
    await est2.amatrix([A], [B])
    await est2.amatrix([A], [B])
    assert len(fake2.requests) == 2  # ước lượng do lỗi không bị cache → lần sau thử lại Google


# ── Cờ Google & singleton ─────────────────────────────────────────────────────


@pytest.fixture
def no_http(monkeypatch):
    """Mọi lần gọi httpx.AsyncClient đều làm hỏng test."""

    def boom(*a, **k):
        raise AssertionError("cờ tắt nhưng vẫn dựng httpx.AsyncClient")

    monkeypatch.setattr(httpx.AsyncClient, "__init__", boom)


@pytest.mark.parametrize(
    ("provider", "key"), [("osm", ""), ("osm", "k"), ("google", "")], ids=["osm", "osm+key", "google-no-key"]
)
async def test_flag_off_returns_plain_estimator_and_never_calls_httpx(no_http, provider, key):
    est = get_travel_estimator(Settings(PLACES_PROVIDER=provider, GOOGLE_MAPS_SERVER_KEY=key, _env_file=None))
    assert type(est) is HaversineTravelEstimator
    m = await est.amatrix([A, B], [C], FUTURE)
    assert m == est.matrix([A, B], [C]) and (await est.aleg(A, C)).source is TravelSource.ESTIMATE


def test_flag_on_builds_cached_google_and_caches_singleton():
    s = Settings(PLACES_PROVIDER="google", GOOGLE_MAPS_SERVER_KEY="k", GOOGLE_ROUTES_DAILY_LIMIT=7, _env_file=None)
    est = get_travel_estimator(s)
    assert isinstance(est, CachedEstimator) and isinstance(est.inner, GoogleRouteMatrixEstimator)
    assert est.inner.daily_limit == 7 and est.inner.api_key == "k"
    assert get_travel_estimator(s) is est
    other = get_travel_estimator(Settings(PLACES_PROVIDER="osm", _env_file=None))
    assert type(other) is HaversineTravelEstimator and other is not est
