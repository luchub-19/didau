"""T-95: `ValhallaEstimator` (mock httpx: thành công, timeout, 403, ô rỗng) + `DbCachedEstimator` (kho giả trong RAM).

Mã test theo `docs/phase7/ALGORITHMS.md` §8: VAL-xx. Không test nào gọi mạng thật (MockTransport).
"""

import asyncio
import json
import math
from collections.abc import Sequence

import httpx
import pytest

from app.config import Settings
from app.core import algo_config as cfg
from app.domain.patterns.itinerary.travel import (
    CachedEstimator,
    CachedLeg,
    DbCachedEstimator,
    HaversineTravelEstimator,
    ILegStore,
    TravelSource,
    ValhallaEstimator,
    coord_key,
    get_travel_estimator,
    minutes_for_km,
    reset_travel_estimator,
)

A = (10.7725, 106.6980)  # Bến Thành
B = (10.7798, 106.6992)  # Nhà thờ
C = (10.7290, 106.7180)  # Phú Mỹ Hưng
D = (10.8015, 106.6186)


@pytest.fixture(autouse=True)
def _fresh_singleton():
    reset_travel_estimator()
    yield
    reset_travel_estimator()


def km_of(a, b) -> float:
    """Km giả định của Valhalla: khác ước lượng và KHÔNG đối xứng (đường một chiều)."""
    return round(abs(a[0] - b[0]) * 200 + abs(a[1] - b[1]) * 100 + (0.5 if a < b else 0.7), 3)


class FakeValhalla:
    """MockTransport: `/sources_to_targets` trả km_of (định dạng mặc định hoặc gọn), `/route` trả shape giả."""

    def __init__(
        self,
        status: int = 200,
        delay: float = 0.0,
        exc: Exception | None = None,
        empty: set[tuple[int, int]] | None = None,
        concise: bool = False,
        route_status: int = 200,
    ) -> None:
        self.status, self.delay, self.exc = status, delay, exc
        self.empty = empty or set()
        self.concise = concise
        self.route_status = route_status
        self.requests: list[httpx.Request] = []

    def bodies(self, path: str) -> list[dict]:
        return [json.loads(r.content) for r in self.requests if r.url.path == path]

    async def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.delay:
            await asyncio.sleep(self.delay)
        if self.exc:
            raise self.exc
        body = json.loads(request.content)
        if request.url.path == "/route":
            if self.route_status != 200:
                return httpx.Response(self.route_status, json={"error": "x"})
            a, b = ((loc["lat"], loc["lon"]) for loc in body["locations"])
            return httpx.Response(
                200,
                json={
                    "trip": {
                        "legs": [{"shape": f"shape:{coord_key(a)}>{coord_key(b)}", "summary": {}}],
                        "summary": {"length": km_of(a, b) + 0.05, "time": 600},
                        "status": 0,
                    }
                },
            )
        if self.status != 200:
            return httpx.Response(self.status, json={"error": "Forbidden"})
        srcs = [(x["lat"], x["lon"]) for x in body["sources"]]
        dsts = [(x["lat"], x["lon"]) for x in body["targets"]]
        if self.concise:
            dist = [
                [None if (i, j) in self.empty else km_of(s, t) for j, t in enumerate(dsts)]
                for i, s in enumerate(srcs)
            ]
            return httpx.Response(200, json={"sources_to_targets": {"distances": dist, "durations": dist}})
        rows = [
            [
                {
                    "from_index": i,
                    "to_index": j,
                    "distance": None if (i, j) in self.empty else km_of(s, t),
                    "time": None if (i, j) in self.empty else 300,
                }
                for j, t in enumerate(dsts)
            ]
            for i, s in enumerate(srcs)
        ]
        return httpx.Response(200, json={"sources_to_targets": rows, "units": "kilometers"})

    def client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(self))


class Clock:
    def __init__(self) -> None:
        self.t = 1000.0

    def __call__(self) -> float:
        return self.t


def valhalla(fake: FakeValhalla, **kw) -> ValhallaEstimator:
    return ValhallaEstimator("http://valhalla.test/", "secret-key", client=fake.client(), **kw)


class MemStore(ILegStore):
    """Kho giả: dict trong RAM, đếm số lần đọc; `fail=True` ném lỗi như DB sập."""

    def __init__(self, fail: bool = False) -> None:
        self.rows: dict[tuple[str, str], CachedLeg] = {}
        self.reads = 0
        self.fail = fail

    async def get_many(self, keys: Sequence[tuple[str, str]]):
        self.reads += 1
        if self.fail:
            raise RuntimeError("db down")
        return {k: self.rows[k] for k in keys if k in self.rows}

    async def save_legs(self, legs):
        if self.fail:
            raise RuntimeError("db down")
        for cl in legs:
            old = self.rows.get((cl.from_key, cl.to_key))
            self.rows[(cl.from_key, cl.to_key)] = CachedLeg(
                cl.from_key, cl.to_key, cl.distance_km, old.shape if old else None, cl.source
            )

    async def save_shapes(self, legs):
        if self.fail:
            raise RuntimeError("db down")
        for cl in legs:
            old = self.rows.get((cl.from_key, cl.to_key))
            km = old.distance_km if old else cl.distance_km
            self.rows[(cl.from_key, cl.to_key)] = CachedLeg(cl.from_key, cl.to_key, km, cl.shape, cl.source)


# ── Hàm phụ ─────────────────────────────────────────────────────────────────────────────────────────
def test_val01_minutes_for_km_and_coord_key():
    assert minutes_for_km(0) == 0
    assert minutes_for_km(25.0) == 60  # đúng bội vận tốc: không nhảy +1 vì float
    assert minutes_for_km(1.0) == math.ceil(1.0 / cfg.MOTORBIKE_KMH * 60)
    assert coord_key((10.77254, 106.69804)) == "10.7725,106.6980"
    assert coord_key((10.77256, 106.69806)) == "10.7726,106.6981"  # làm tròn 4 số (~11 m)


# ── ValhallaEstimator ───────────────────────────────────────────────────────────────────────────────
async def test_val02_matrix_success_request_shape_and_parsing():
    fake = FakeValhalla()
    m = await valhalla(fake).amatrix([A, B], [C, D])
    (req,) = fake.requests
    assert str(req.url) == "http://valhalla.test/sources_to_targets"
    assert req.headers["X-Route-Key"] == "secret-key"
    body = json.loads(req.content)
    assert body["costing"] == "motor_scooter" and body["units"] == "kilometers"
    assert body["sources"] == [{"lat": A[0], "lon": A[1]}, {"lat": B[0], "lon": B[1]}]
    assert body["targets"] == [{"lat": C[0], "lon": C[1]}, {"lat": D[0], "lon": D[1]}]
    for i, o in enumerate([A, B]):
        for j, d in enumerate([C, D]):
            leg = m[i][j]
            assert leg.source is TravelSource.VALHALLA
            assert leg.distance_km == km_of(o, d)
            assert leg.minutes == math.ceil(km_of(o, d) / cfg.MOTORBIKE_KMH * 60)


async def test_val03_concise_format_is_parsed_too():
    m = await valhalla(FakeValhalla(concise=True, empty={(0, 1)})).amatrix([A], [C, D])
    assert m[0][0].source is TravelSource.VALHALLA and m[0][0].distance_km == km_of(A, C)
    assert m[0][1].source is TravelSource.ESTIMATE


async def test_val04_empty_cell_falls_back_for_that_cell_only():
    m = await valhalla(FakeValhalla(empty={(1, 0)})).amatrix([A, B], [C])
    assert m[0][0].source is TravelSource.VALHALLA
    assert m[1][0] == HaversineTravelEstimator().leg(B, C)


async def test_val05_403_falls_back_and_no_key_header_when_key_empty():
    fake = FakeValhalla(status=403)
    est = ValhallaEstimator("http://valhalla.test", "", client=fake.client())
    m = await est.amatrix([A], [C])
    assert m[0][0] == HaversineTravelEstimator().leg(A, C)
    assert "X-Route-Key" not in fake.requests[0].headers


async def test_val06_timeout_falls_back_then_cooldown_skips_network():
    clock = Clock()
    fake = FakeValhalla(delay=0.2)
    est = valhalla(fake, timeout_s=0.01, cooldown_s=60, clock=clock)
    m = await est.amatrix([A, B], [C])
    assert [r[0].source for r in m] == [TravelSource.ESTIMATE] * 2
    assert len(fake.requests) == 1
    # Đang nghỉ: không gọi mạng nữa (PC tắt thì request không phải chờ timeout mãi)
    await est.amatrix([A], [C])
    assert await est.aroute(A, C) is None
    assert len(fake.requests) == 1
    clock.t += 61
    fake.delay = 0.0
    assert (await est.amatrix([A], [C]))[0][0].source is TravelSource.VALHALLA
    assert len(fake.requests) == 2


async def test_val07_connection_error_and_garbage_json_fall_back():
    m = await valhalla(FakeValhalla(exc=httpx.ConnectError("x"))).amatrix([A], [C])
    assert m[0][0].source is TravelSource.ESTIMATE
    assert ValhallaEstimator._parse_matrix("oops", 1, 1) == []
    assert ValhallaEstimator._parse_matrix([[{"from_index": 5, "to_index": 0, "distance": 1}]], 1, 1) == []
    assert ValhallaEstimator._parse_matrix([[{"distance": -1}], [{"distance": True}]], 2, 1) == []


async def test_val08_sync_leg_never_calls_network():
    fake = FakeValhalla()
    est = valhalla(fake)
    assert est.leg(A, C) == HaversineTravelEstimator().leg(A, C)
    assert est.matrix([A], [C])[0][0].source is TravelSource.ESTIMATE
    assert fake.requests == []


async def test_val09_route_returns_shape_and_km_or_none():
    fake = FakeValhalla()
    r = await valhalla(fake).aroute(A, C)
    assert r is not None and r.shape == f"shape:{coord_key(A)}>{coord_key(C)}"
    assert r.leg.source is TravelSource.VALHALLA and r.leg.distance_km == pytest.approx(km_of(A, C) + 0.05)
    body = fake.bodies("/route")[0]
    assert body["costing"] == "motor_scooter" and body["locations"][0] == {"lat": A[0], "lon": A[1]}
    assert await valhalla(FakeValhalla(route_status=400)).aroute(A, C) is None
    assert ValhallaEstimator._parse_route({"trip": {"legs": [{}], "summary": {"length": 1}}}) is None


async def test_val10_matrix_splits_requests_over_pair_limit(monkeypatch):
    monkeypatch.setattr(cfg, "VALHALLA_MAX_PAIRS", 4)
    fake = FakeValhalla()
    origins = [A, B, C, D, (10.75, 106.65)]
    m = await valhalla(fake).amatrix(origins, [A, C])
    assert [len(b["sources"]) for b in fake.bodies("/sources_to_targets")] == [2, 2, 1]
    assert all(m[i][j].distance_km == km_of(o, d) for i, o in enumerate(origins) for j, d in enumerate([A, C]))


# ── DbCachedEstimator ───────────────────────────────────────────────────────────────────────────────
def cached(fake: FakeValhalla | None = None, store: MemStore | None = None) -> DbCachedEstimator:
    return DbCachedEstimator(store or MemStore(), fetcher=valhalla(fake) if fake else None)


async def test_val11_amatrix_reads_cache_only_and_never_calls_network():
    fake = FakeValhalla()
    store = MemStore()
    store.rows[(coord_key(A), coord_key(C))] = CachedLeg(coord_key(A), coord_key(C), 9.0)
    est = cached(fake, store)
    m = await est.amatrix([A, B], [C])
    assert (m[0][0].distance_km, m[0][0].minutes, m[0][0].source) == (9.0, minutes_for_km(9.0), TravelSource.VALHALLA)
    assert m[1][0] == HaversineTravelEstimator().leg(B, C)  # ô thiếu → ước lượng, không chờ mạng
    assert fake.requests == []
    # Đã nạp vào RAM: lần sau không đọc DB, phần đồng bộ cũng thấy
    reads = store.reads
    await est.acached_matrix([A], [C])
    assert store.reads == reads and est.leg(A, C).distance_km == 9.0


async def test_val12_warm_uses_one_matrix_request_for_missing_pairs_only():
    fake = FakeValhalla()
    store = MemStore()
    store.rows[(coord_key(A), coord_key(C))] = CachedLeg(coord_key(A), coord_key(C), 9.0)
    est = cached(fake, store)
    pairs = [(A, C), (C, A), (B, C), (C, B), (A, A), (C, C)]
    assert await est.warm(pairs) == 3  # (A,C) đã có; cặp trùng điểm bỏ qua
    (body,) = fake.bodies("/sources_to_targets")
    # Thiếu (C,A), (B,C), (C,B) → một hình chữ nhật {C, B} × {A, C, B}
    assert {coord_key((x["lat"], x["lon"])) for x in body["sources"]} == {coord_key(C), coord_key(B)}
    assert {coord_key((x["lat"], x["lon"])) for x in body["targets"]} == {coord_key(A), coord_key(C), coord_key(B)}
    assert store.rows[(coord_key(C), coord_key(A))].distance_km == km_of(C, A)
    assert store.rows[(coord_key(A), coord_key(C))].distance_km == 9.0  # không ghi đè số đã có
    # Không đối xứng: đi và về là hai dòng khác nhau
    assert store.rows[(coord_key(B), coord_key(C))].distance_km != store.rows[(coord_key(C), coord_key(B))].distance_km
    assert await est.warm(pairs) == 0 and len(fake.requests) == 1  # đủ rồi: không gọi nữa


async def test_val13_warm_does_not_cache_errors_or_empty_cells():
    store = MemStore()
    assert await cached(FakeValhalla(status=403), store).warm([(A, C), (B, C)]) == 0
    assert store.rows == {}
    est = cached(FakeValhalla(empty={(1, 0)}), store)
    assert await est.warm([(A, C), (B, C)]) == 1
    assert set(store.rows) == {(coord_key(A), coord_key(C))}  # ô rỗng không ghi → lần sau thử lại


async def test_val14_without_url_is_read_only():
    store = MemStore()
    est = cached(None, store)
    assert not est.can_fetch
    assert await est.warm([(A, C)]) == 0
    (r,) = await est.routes([(A, C)])
    assert r.shape is None and r.leg.source is TravelSource.ESTIMATE


async def test_val15_routes_fetch_missing_shapes_keep_matrix_km_and_respect_limit():
    fake = FakeValhalla()
    store = MemStore()
    store.rows[(coord_key(A), coord_key(C))] = CachedLeg(coord_key(A), coord_key(C), 9.0)
    est = cached(fake, store)
    r1, r2 = await est.routes([(A, C), (C, A)])
    assert r1.shape == f"shape:{coord_key(A)}>{coord_key(C)}" and r1.leg.distance_km == 9.0  # km ma trận giữ nguyên
    assert r2.leg.distance_km == pytest.approx(km_of(C, A) + 0.05)  # chưa có dòng: km của /route
    assert store.rows[(coord_key(A), coord_key(C))].shape == r1.shape
    n = len(fake.requests)
    await est.routes([(A, C), (C, A)])
    assert len(fake.requests) == n  # có shape rồi: không gọi lại
    (r3, r4) = await est.routes([(B, D), (D, B)], limit=1)
    assert r3.shape is not None and r4.shape is None and r4.leg.source is TravelSource.ESTIMATE
    (r5,) = await est.routes([(B, C)], fetch=False)
    assert r5.shape is None and len(fake.requests) == n + 1


async def test_val16_route_failure_returns_estimate_and_writes_nothing():
    store = MemStore()
    (r,) = await cached(FakeValhalla(route_status=500), store).routes([(A, C)])
    assert r.shape is None and r.leg == HaversineTravelEstimator().leg(A, C)
    assert store.rows == {}


async def test_val17_store_failure_falls_back_to_estimate():
    est = cached(FakeValhalla(), MemStore(fail=True))
    m = await est.amatrix([A], [C])
    assert m[0][0].source is TravelSource.ESTIMATE
    assert await est.warm([(A, C)]) == 0  # ghi lỗi → không coi là đã lưu
    (r,) = await est.routes([(A, C)])
    assert r.shape is not None  # vẫn vẽ được, chỉ không lưu


async def test_val18_memory_limit_clears_then_reloads_from_store():
    store = MemStore()
    est = DbCachedEstimator(store, fetcher=valhalla(FakeValhalla()), memory_limit=2)
    await est.warm([(A, C), (C, A), (B, C)])
    assert len(est._mem) <= 2 and len(store.rows) == 3
    m = await est.amatrix([A, B], [C])
    assert all(r[0].source is TravelSource.VALHALLA for r in m)


# ── get_travel_estimator ────────────────────────────────────────────────────────────────────────────
@pytest.fixture
def no_http(monkeypatch):
    def boom(*a, **k):
        raise AssertionError("cờ tắt nhưng vẫn dựng httpx.AsyncClient")

    monkeypatch.setattr(httpx.AsyncClient, "__init__", boom)


async def test_val19_default_provider_is_unchanged_and_never_calls_httpx(no_http):
    est = get_travel_estimator(Settings(_env_file=None))
    assert type(est) is HaversineTravelEstimator
    assert (await est.acached_matrix([A], [C])) == est.matrix([A], [C])
    est = get_travel_estimator(Settings(PLACES_PROVIDER="google", GOOGLE_MAPS_SERVER_KEY="k", _env_file=None))
    assert isinstance(est, CachedEstimator)  # Google giữ sau cờ cũ


def test_val20_valhalla_flag_builds_db_cached_estimator():
    s = Settings(
        ROUTING_PROVIDER="valhalla",
        VALHALLA_URL="http://pc.ts.net",
        VALHALLA_KEY="k",
        VALHALLA_TIMEOUT_S=2.5,
        PLACES_PROVIDER="google",
        GOOGLE_MAPS_SERVER_KEY="g",
        _env_file=None,
    )
    est = get_travel_estimator(s)
    assert isinstance(est, DbCachedEstimator) and est.can_fetch
    assert est.fetcher is not None and (est.fetcher.url, est.fetcher.key, est.fetcher.timeout_s) == ("http://pc.ts.net", "k", 2.5)
    assert get_travel_estimator(s) is est
    ro = get_travel_estimator(Settings(ROUTING_PROVIDER="Valhalla", _env_file=None))
    assert isinstance(ro, DbCachedEstimator) and not ro.can_fetch  # URL trống: chỉ đọc cache DB
