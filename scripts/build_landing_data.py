#!/usr/bin/env python3
"""Sinh dữ liệu tĩnh cho landing (gđ11, T-122) — CHẠY TAY, gọi Valhalla thật, không nằm trong test.

Dùng (python của venv backend vì cần `app.*`):
    ~/.cache/pypoetry/virtualenvs/didau-backend-9ytkEAsm-py3.14/bin/python scripts/build_landing_data.py \
        --valhalla http://localhost:8002 [--key K] [--step 0.01] [--out-dir frontend/src/landing/data] [--cache DIR]

Ra: `demoCase.json` (4 bạn × 3 quán, km/phút KHỨ HỒI + khối `expected` do `ordered_median` của backend tính) và
`grid.json` (lưới điểm → 3 quán, kèm hệ số `estimate {a, b}`). Lệch bất kỳ số nào của DEMO gđ8 → dừng, KHÔNG ghi file.
Mỗi lô gọi Valhalla được cache ở `--cache` (mặc định thư mục tạm), chạy lại sau khi rớt mạng sẽ ghi tiếp.
Toạ độ trong file là toạ độ quán + tâm quận đại diện + nút lưới, không có toạ độ người dùng thật.
"""

import argparse
import asyncio
import hashlib
import json
import math
import sys
import tempfile
import time
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "scripts"))

from app.domain.algorithms.tie_travel import TieGroup, TieMember, TiePlace, decide
from app.domain.enums import PlaceCategory, PlaceStatus
from app.domain.patterns.itinerary.travel import Leg, TravelSource, ValhallaEstimator
from seed_demo_genz import MEMBERS  # 4 nơi xuất phát của phòng demo (nguồn sự thật)

BBOX = (106.58, 10.68, 106.84, 10.90)  # west, south, east, north
BATCH = 40  # nguồn mỗi lần gọi (ma trận 40 × 3, rất xa trần VALHALLA_MAX_PAIRS)
DETOUR = 1.3
DISTRICTS = {"Nobita": "q1", "Doraemon": "bt", "Xuka": "td", "Xeko": "q7"}  # khớp landing/cast.ts

# id ngắn dùng trong dữ liệu landing → (tên đầy đủ, tên ngắn, địa chỉ, lat, lng) — đúng quán của seed_demo_genz.PLACES
PLACES = [
    ("pizza", "Pizza 4P's Thiso Mall Sala", "Pizza 4P's", "Thiso Mall Sala, 10 Mai Chí Thọ, Thủ Thiêm", 10.77227, 106.72284),
    ("haidilao", "Haidilao Giga Mall", "Haidilao", "Giga Mall, 240–242 Phạm Văn Đồng, Thủ Đức", 10.82777, 106.722),
    ("dookki", "Dookki SC VivoCity", "Dookki", "SC VivoCity, 1058 Nguyễn Văn Linh, Quận 7", 10.73017, 106.70325),
]

# DEMO gđ8 (docs/phase8/DEMO.md): người xa nhất ở mỗi quán (phút khứ hồi), tổng km, cột từng người ở Pizza 4P's
DEMO_MAX_MIN = {"pizza": 60, "haidilao": 74, "dookki": 94}
DEMO_TOTAL_KM = {"pizza": 68.2, "haidilao": 63.5, "dookki": 81.5}
DEMO_PIZZA_MIN = {"Xuka": 60, "Xeko": 54, "Doraemon": 28, "Nobita": 26}


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p = math.pi / 180
    a = math.sin((lat2 - lat1) * p / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lng2 - lng1) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(a))


class Cache:
    """Kết quả từng lô theo băm của yêu cầu → ghi tiếp được khi mạng rớt giữa chừng."""

    def __init__(self, folder: Path) -> None:
        self.folder = folder
        folder.mkdir(parents=True, exist_ok=True)

    def get(self, key: str):
        f = self.folder / f"{hashlib.sha1(key.encode()).hexdigest()}.json"
        return json.loads(f.read_text()) if f.exists() else None

    def put(self, key: str, value) -> None:
        (self.folder / f"{hashlib.sha1(key.encode()).hexdigest()}.json").write_text(json.dumps(value))


async def matrix(est: ValhallaEstimator, cache: Cache, origins, dests):
    """[[(km, phút) | None]] — None khi ô không phải số Valhalla (lùi ước lượng). Cache theo lô."""
    key = json.dumps([origins, dests])
    hit = cache.get(key)
    if hit is not None:
        return hit
    legs = await est.amatrix(origins, dests)
    out = [[[lg.distance_km, lg.minutes] if lg.source == TravelSource.VALHALLA else None for lg in row] for row in legs]
    if any(c is None for row in out for c in row) and est._down_until > time.monotonic():
        raise RuntimeError("Valhalla đang lỗi/nghỉ — không cache lô này")
    cache.put(key, out)
    return out


async def round_trip(est, cache, homes, places):
    """Khứ hồi homes × places: (km, phút) đi + về; ô nào một chiều lỗi → None."""
    go = await matrix(est, cache, homes, places)
    back = await matrix(est, cache, places, homes)
    res = []
    for i in range(len(homes)):
        row = []
        for j in range(len(places)):
            g, b = go[i][j], back[j][i]
            row.append(None if g is None or b is None else (g[0] + b[0], g[1] + b[1]))
        res.append(row)
    return res


async def build_demo(est, cache):
    homes = [(m[2], m[3]) for m in MEMBERS]
    pl = [(p[4], p[5]) for p in PLACES]
    go = await matrix(est, cache, homes, pl)
    back = await matrix(est, cache, pl, homes)
    if any(c is None for r in go for c in r) or any(c is None for r in back for c in r):
        sys.exit("Valhalla không trả đủ 24 ô cho 4 bạn × 3 quán — dừng.")
    # Leg theo từng chiều để `decide` tính giống service (phút = tổng hai chặng, mỗi chặng đã làm tròn lên)
    to_place = [[Leg(go[i][j][1], go[i][j][0], TravelSource.VALHALLA) for j in range(3)] for i in range(4)]
    to_home = [[Leg(back[j][i][1], back[j][i][0], TravelSource.VALHALLA) for j in range(3)] for i in range(4)]
    members = [TieMember(uuid.UUID(int=i + 1), m[0], (m[2], m[3])) for i, m in enumerate(MEMBERS)]
    t0 = datetime(2026, 11, 23, tzinfo=UTC)
    tp = tuple(
        TiePlace(uuid.uuid5(uuid.NAMESPACE_URL, p[0]), p[1], PlaceStatus.PROPOSED, 3, t0 + timedelta(seconds=j),
                 (p[4], p[5]), PlaceCategory.FOOD)
        for j, p in enumerate(PLACES)
    )
    out = decide(TieGroup(PlaceCategory.FOOD, tp), members, to_place, to_home)
    idx = {tp[j].place_id: j for j in range(3)}
    km = lambda i, j: round(go[i][j][0] + back[j][i][0], 3)
    mn = lambda i, j: go[i][j][1] + back[j][i][1]
    trips = {MEMBERS[i][0]: {PLACES[j][0]: {"km": km(i, j), "min": mn(i, j)} for j in range(3)} for i in range(4)}
    totals = {PLACES[j][0]: round(sum(go[i][j][0] + back[j][i][0] for i in range(4)), 1) for j in range(3)}
    omp = [
        {"placeId": PLACES[idx[r.place_id]][0], "psi": r.psi, "maxKm": r.max_km, "sumKm": r.total_km}
        for r in out.ranking
    ]
    by_sum = sorted(range(3), key=lambda j: sum(go[i][j][0] + back[j][i][0] for i in range(4)))
    sums = [{"placeId": PLACES[j][0], "sumKm": totals[PLACES[j][0]]} for j in by_sum]

    # Đối chiếu DEMO gđ8: lệch → dừng
    print(f"{'quán':10} {'xa nhất (′)':>12} {'DEMO':>6} {'tổng km':>9} {'DEMO':>6}")
    bad = []
    for j, p in enumerate(PLACES):
        mx = max(mn(i, j) for i in range(4))
        print(f"{p[0]:10} {mx:>12} {DEMO_MAX_MIN[p[0]]:>6} {totals[p[0]]:>9} {DEMO_TOTAL_KM[p[0]]:>6}")
        if mx != DEMO_MAX_MIN[p[0]] or abs(totals[p[0]] - DEMO_TOTAL_KM[p[0]]) > 0.05:
            bad.append(p[0])
    for name, want in DEMO_PIZZA_MIN.items():
        got = trips[name]["pizza"]["min"]
        print(f"Pizza {name:9} {got:>3}′ (DEMO {want}′)")
        if got != want:
            bad.append(f"pizza/{name}")
    if omp[0]["placeId"] != "pizza" or sums[0]["placeId"] != "haidilao":
        bad.append(f"chọn quán: OMP={omp[0]['placeId']} (cần pizza), tổng km={sums[0]['placeId']} (cần haidilao)")
    if bad:
        sys.exit(f"LỆCH DEMO gđ8: {bad} — seed hoặc Valhalla đã đổi, KHÔNG ghi file.")

    return {
        "measuredAt": datetime.now(UTC).date().isoformat(),
        "source": "Valhalla self-host, costing motor_scooter; km va phut = di + ve (khu hoi); expected = ordered_median backend (lambda=1, k=2)",
        "members": [
            {"id": m[0], "district": DISTRICTS[m[0]], "ll": [m[3], m[2]]} for m in MEMBERS
        ],
        "places": [
            {"id": p[0], "name": p[1], "short": p[2], "address": p[3], "ll": [p[5], p[4]]} for p in PLACES
        ],
        "trips": trips,
        "totals": totals,
        "expected": {"omp": omp, "sum": sums},
    }


async def build_grid(est, cache, step: float):
    west, south, east, north = BBOX
    cols = round((east - west) / step) + 1
    rows = round((north - south) / step) + 1
    pts = [(round(south + r * step, 5), round(west + c * step, 5)) for r in range(rows) for c in range(cols)]
    pl = [(p[4], p[5]) for p in PLACES]
    km = [[None] * len(pts) for _ in PLACES]
    mins = [[None] * len(pts) for _ in PLACES]
    for s in range(0, len(pts), BATCH):
        chunk = pts[s : s + BATCH]
        rt = await round_trip(est, cache, chunk, pl)
        for i, row in enumerate(rt):
            for j, v in enumerate(row):
                if v is not None:
                    km[j][s + i] = round(v[0], 1)
                    mins[j][s + i] = int(v[1])
        print(f"  lưới {min(s + BATCH, len(pts))}/{len(pts)}", end="\r", flush=True)
        await asyncio.sleep(0.2)  # nghỉ giữa lô
    print()
    # Hiệu chỉnh: phút khứ hồi ≈ a · (chim bay × 1,3 MỘT chiều) + b
    xs, ys = [], []
    for j, p in enumerate(PLACES):
        for k, (la, ln) in enumerate(pts):
            if mins[j][k] is not None:
                xs.append(haversine_km(la, ln, p[4], p[5]) * DETOUR)
                ys.append(mins[j][k])
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    a = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
    b = my - a * mx
    nulls = sum(v is None for row in km for v in row)
    return {
        "bbox": list(BBOX),
        "step": step,
        "rows": rows,
        "cols": cols,
        "places": [p[0] for p in PLACES],
        "placeLl": [[p[5], p[4]] for p in PLACES],
        "km": km,
        "min": mins,
        "estimate": {"a": round(a, 3), "b": round(b, 2)},
    }, nulls


def dump_compact(obj) -> str:
    """JSON gọn: mỗi hàng km/min một dòng, không khoảng trắng thừa (grid.json ≤ 40 KB)."""
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n"


async def main_async(a) -> None:
    est = ValhallaEstimator(a.valhalla, a.key, timeout_s=120.0, cooldown_s=0.0)
    cache = Cache(Path(a.cache))
    demo = await build_demo(est, cache)
    grid, nulls = await build_grid(est, cache, a.step)
    total = len(PLACES) * grid["rows"] * grid["cols"]
    print(f"Lưới {grid['rows']}×{grid['cols']} = {grid['rows'] * grid['cols']} điểm × 3 quán, null {nulls}/{total} "
          f"({nulls / total:.1%}); estimate a={grid['estimate']['a']} b={grid['estimate']['b']}")
    out = Path(a.out_dir)
    (out / "demoCase.json").write_text(json.dumps(demo, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    (out / "grid.json").write_text(dump_compact(grid), encoding="utf-8")
    print(f"Đã ghi {out}/demoCase.json ({(out / 'demoCase.json').stat().st_size} B), "
          f"{out}/grid.json ({(out / 'grid.json').stat().st_size} B)")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--valhalla", required=True)
    ap.add_argument("--key", default="", help="header X-Route-Key nếu đi qua cổng khoá")
    ap.add_argument("--step", type=float, default=0.01)
    ap.add_argument("--out-dir", default=str(ROOT / "frontend/src/landing/data"))
    ap.add_argument("--cache", default=str(Path(tempfile.gettempdir()) / "landing-data-cache"))
    asyncio.run(main_async(ap.parse_args()))


if __name__ == "__main__":
    main()
