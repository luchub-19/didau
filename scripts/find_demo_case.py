#!/usr/bin/env python3
"""Dò bộ 3 quán Ăn cho demo "Vì sao?" (T-106, giai đoạn 8) — không đụng backend/DB; mạng chỉ khi `--valhalla`.

Dùng (python của venv backend vì cần `app.*`):
    ~/.cache/pypoetry/virtualenvs/didau-backend-*/bin/python scripts/find_demo_case.py [--top 10] [--min-gap 10]
        [--max-total-ratio 1.25] [--min-s 40] [--hangout] [--valhalla http://localhost:8002] [--json FILE]

Cần: bộ 3 quán mà OMP đề xuất B ≠ quán A có tổng km khứ hồi nhỏ nhất ("cộng tổng km" / MinSum), người xa nhất ở A đi
lâu hơn ở B ≥ `--min-gap` phút, và tổng km của B không quá `--max-total-ratio` lần của A (để A là phương án "nghe hợp
lý"). Km khứ hồi; xếp hạng bằng CHÍNH `decide` → `rank_candidates` của backend (không viết lại Ψ).
- Mặc định km = haversine × DETOUR_FACTOR (`HaversineTravelEstimator` của backend).
- `--valhalla URL [--valhalla-key K]`: km thật từ `ValhallaEstimator.amatrix` của backend (một ma trận 4 nhà →
  mọi quán và một ma trận ngược lại; ô lỗi → bỏ quán đó). NÊN dùng: đo 2026-11-19, ước lượng đảo cả 3 bộ tốt nhất
  (từ Q7 sang Thảo Điền phải vòng qua sông: Xeko 71′ thật so với 54′ ước lượng). Bộ chọn xong vẫn phải dựng phòng
  và đọc lại API gợi ý hoà (T-106 bước 2).

Ứng viên: quán Ăn (`c = FOOD`) trong `frontend/public/data/places_hcm.geojson`, tên khớp một chuỗi quen với người trẻ
(`BRANDS`, vì geojson không có `brand_key`), `s ≥ --min-s` (bỏ bản ghi trùng/rác điểm thấp), trong khung bao 4 nơi
xuất phát nới thêm `PAD` độ. Mỗi bộ 3 quán thuộc 3 thương hiệu khác nhau.

Độ "chắc" của một bộ = biên nhỏ nhất (theo tỉ lệ) giữa quán thắng và quán thua ở cả hai cách chọn: Ψ (B thắng A, C) và
tổng km (A thắng B, C). Biên càng lớn thì km Valhalla càng khó đảo kết quả. In các bộ chắc nhất, mỗi cặp (A, B) một lần.
"""

import argparse
import asyncio
import json
import re
import sys
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app.domain.algorithms.tie_travel import TieGroup, TieMember, TiePlace, decide
from app.domain.enums import PlaceCategory, PlaceStatus
from app.domain.patterns.itinerary.travel import (
    HaversineTravelEstimator,
    Leg,
    TravelSource,
    ValhallaEstimator,
)

sys.path.insert(0, str(ROOT / "scripts"))
from seed_demo_genz import MEMBERS  # giữ đúng 4 nơi xuất phát của phòng demo

GEOJSON = ROOT / "frontend/public/data/places_hcm.geojson"
PAD = 0.02  # độ (~2,2 km) nới khung bao quanh 4 nhà

# Chuỗi thương hiệu quen với người trẻ (khớp không phân biệt hoa thường); giá trị = tên thương hiệu để so trùng.
# HANGOUT = quán ngồi lâu đi nhóm (lẩu/nướng/pizza/sushi) — `--hangout` chỉ lấy nhóm này; còn lại là fast-food.
HANGOUT = {"Haidilao", "Dookki", "Pizza 4P's", "Gogi House", "Kichi-Kichi", "Manwah", "King BBQ", "Sumo BBQ",
           "Hotpot Story", "Sushi Hokkaido Sachi", "Gyu-Kaku", "Ippudo"}
BRANDS = {
    r"haidilao": "Haidilao",
    r"dookki": "Dookki",
    r"pizza 4p": "Pizza 4P's",
    r"gogi": "Gogi House",
    r"kichi": "Kichi-Kichi",
    r"manwah": "Manwah",
    r"king bbq": "King BBQ",
    r"sumo ?bbq|sumo yakiniku": "Sumo BBQ",
    r"hotpot story": "Hotpot Story",
    r"jollibee": "Jollibee",
    r"mcdonald": "McDonald's",
    r"\bkfc\b": "KFC",
    r"lotteria": "Lotteria",
    r"popeyes": "Popeyes",
    r"texas chicken": "Texas Chicken",
    r"burger king": "Burger King",
    r"pizza hut": "Pizza Hut",
    r"domino": "Domino's",
    r"the pizza company": "The Pizza Company",
    r"sushi hokkaido": "Sushi Hokkaido Sachi",
    r"marukame": "Marukame Udon",
    r"sasin": "Mì cay Sasin",
    r"tokbokki": "Dookki",
    r"gyu-?kaku": "Gyu-Kaku",
    r"sukiya": "Sukiya",
    r"pepper lunch": "Pepper Lunch",
    r"ippudo": "Ippudo",
    r"phở 2000|pho 2000": "Phở 2000",
    r"don chicken": "Don Chicken",
}
_BRAND_RX = [(re.compile(p, re.IGNORECASE), b) for p, b in BRANDS.items()]
_JUNK = re.compile(r"careers|cửa hàng pizza", re.IGNORECASE)  # bản ghi văn phòng/trùng


def brand_of(name: str) -> str | None:
    if _JUNK.search(name):
        return None
    for rx, b in _BRAND_RX:
        if rx.search(name):
            return b
    return None


def load_candidates(min_s: int, hangout_only: bool) -> list[dict]:
    lats = [m[2] for m in MEMBERS]
    lngs = [m[3] for m in MEMBERS]
    box = (min(lats) - PAD, max(lats) + PAD, min(lngs) - PAD, max(lngs) + PAD)
    feats = json.loads(GEOJSON.read_text(encoding="utf-8"))["features"]
    out = []
    for f in feats:
        p = f["properties"]
        if p.get("c") != "FOOD" or p.get("s", 0) < min_s:
            continue
        lng, lat = f["geometry"]["coordinates"]
        if not (box[0] <= lat <= box[1] and box[2] <= lng <= box[3]):
            continue
        b = brand_of(p["n"])
        if b and (b in HANGOUT or not hangout_only):
            out.append({"id": p["id"], "name": p["n"], "brand": b, "s": p["s"], "lat": lat, "lng": lng})
    return out


def _members() -> list[TieMember]:
    return [
        TieMember(uuid.UUID(int=i + 1), nick, (lat, lng)) for i, (nick, _area, lat, lng) in enumerate(MEMBERS)
    ]


Legs = dict[str, tuple[list[Leg], list[Leg]]]  # id quán → (nhà người i → quán, quán → nhà người i)


def build_legs(cands: list[dict], valhalla: str | None, key: str) -> Legs:
    """Km một chiều cả hai hướng cho mọi quán. Valhalla: quán có ô lỗi (lùi về ước lượng) bị bỏ khỏi kết quả."""
    homes = [m.origin for m in _members()]
    coords = [(c["lat"], c["lng"]) for c in cands]
    if valhalla is None:
        est = HaversineTravelEstimator()
        go, back = est.matrix(homes, coords), est.matrix(coords, homes)
    else:
        est = ValhallaEstimator(valhalla, key, timeout_s=120.0)
        go = asyncio.run(est.amatrix(homes, coords))
        back = asyncio.run(est.amatrix(coords, homes))
    legs: Legs = {}
    for j, c in enumerate(cands):
        to_place = [go[i][j] for i in range(len(homes))]
        to_home = [back[j][i] for i in range(len(homes))]
        if valhalla is not None and any(lg.source != TravelSource.VALHALLA for lg in to_place + to_home):
            continue
        legs[c["id"]] = (to_place, to_home)
    return legs


def evaluate(cands: list[dict], legs: Legs):
    """Gọi `decide` của backend cho một nhóm quán (đúng như service). Trả (outcome, rows theo place_id)."""
    members = _members()
    t0 = datetime(2026, 11, 23, tzinfo=UTC)
    places = tuple(
        TiePlace(
            place_id=uuid.uuid5(uuid.NAMESPACE_URL, c["id"]),
            name=c["name"],
            status=PlaceStatus.PROPOSED,
            upvotes=3,
            created_at=t0 + timedelta(seconds=j),
            coord=(c["lat"], c["lng"]),
            category=PlaceCategory.FOOD,
        )
        for j, c in enumerate(cands)
    )
    to_place = [[legs[c["id"]][0][i] for c in cands] for i in range(len(members))]
    to_home = [[legs[c["id"]][1][i] for c in cands] for i in range(len(members))]
    out = decide(TieGroup(PlaceCategory.FOOD, places), members, to_place, to_home)
    rows = {}
    for r in out.ranking:
        j = next(j for j, p in enumerate(places) if p.place_id == r.place_id)
        km = [to_place[i][j].distance_km + to_home[i][j].distance_km for i in range(len(members))]
        mins = [to_place[i][j].minutes + to_home[i][j].minutes for i in range(len(members))]
        far = max(range(len(members)), key=lambda i: km[i])
        rows[r.place_id] = {
            **cands[j],
            "place_id": r.place_id,
            "rank": r.rank,
            "psi": r.psi,
            "total_km": r.total_km,
            "max_km": r.max_km,
            "max_min": r.max_min,
            "farthest": MEMBERS[far][0],
            "minutes": mins,
        }
    return out, rows


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--top", type=int, default=10)
    ap.add_argument("--min-gap", type=int, default=10, help="phút: max_min(A) − max_min(B) tối thiểu")
    ap.add_argument("--max-total-ratio", type=float, default=1.25, help="total_km(B) / total_km(A) tối đa")
    ap.add_argument("--max-third-ratio", type=float, default=1.35,
                    help="total_km(C) / total_km(A) tối đa — quán thứ 3 cũng phải là phương án nghe hợp lý")
    ap.add_argument("--min-s", type=int, default=40)
    ap.add_argument("--hangout", action="store_true", help="chỉ thương hiệu đi nhóm (HANGOUT), bỏ fast-food")
    ap.add_argument("--valhalla", help="URL Valhalla (vd http://localhost:8002) — km thật thay ước lượng")
    ap.add_argument("--valhalla-key", default="", help="header X-Route-Key nếu đi qua cổng khoá")
    ap.add_argument("--json", help="ghi các bộ tìm được ra file JSON (để dựng phòng kiểm Valhalla)")
    a = ap.parse_args()

    cands = load_candidates(a.min_s, a.hangout)
    legs = build_legs(cands, a.valhalla, a.valhalla_key)
    if a.valhalla and len(legs) < len(cands):
        print(f"Bỏ {len(cands) - len(legs)} quán Valhalla không trả đường đủ 8 ô")
    cands = [c for c in cands if c["id"] in legs]
    _, rows = evaluate(cands, legs)  # Ψ một quán không phụ thuộc quán khác (K = 1) → tính một lần cho cả nhóm
    pool = sorted(rows.values(), key=lambda r: r["psi"])
    print(f"Km: {'VALHALLA ' + a.valhalla if a.valhalla else 'ước lượng'} · "
          f"{len(cands)} ứng viên, {len({c['brand'] for c in cands})} thương hiệu; 4 nhà: "
          + ", ".join(f"{m[0]} ({m[1]})" for m in MEMBERS))

    # Duyệt cặp (A = thắng cộng tổng, B = OMP đề xuất), rồi chọn C làm bộ chắc nhất
    found = []
    for b in pool:
        for ar in pool:
            if ar is b or ar["brand"] == b["brand"]:
                continue
            if not (ar["total_km"] < b["total_km"] <= a.max_total_ratio * ar["total_km"]):
                continue
            if ar["psi"] <= b["psi"] or ar["max_min"] - b["max_min"] < a.min_gap:
                continue
            best_c, best_m = None, -1.0
            for c in pool:
                if c["brand"] in (ar["brand"], b["brand"]):
                    continue
                if c["psi"] <= b["psi"] or not (ar["total_km"] < c["total_km"] <= a.max_third_ratio * ar["total_km"]):
                    continue
                m = min(c["psi"] / b["psi"] - 1, c["total_km"] / ar["total_km"] - 1)
                if m > best_m:
                    best_c, best_m = c, m
            if best_c is None:
                continue
            margin = min(ar["psi"] / b["psi"] - 1, b["total_km"] / ar["total_km"] - 1, best_m)
            found.append((margin, ar, b, best_c))
    found.sort(key=lambda t: (-t[0], -(t[1]["max_min"] - t[2]["max_min"])))

    # Một dòng mỗi cặp thương hiệu (A, B) cho đa dạng; kiểm lại cả bộ bằng `decide` trên đúng 3 quán
    seen: set[tuple[str, str]] = set()
    picked = []
    for margin, ar, b, c in found:
        key = (ar["brand"], b["brand"])
        if key in seen:
            continue
        seen.add(key)
        out, rr = evaluate([ar, b, c], legs)
        rec = rr[out.recommended_place_id]
        sum_win = min(rr.values(), key=lambda r: r["total_km"])
        assert rec["id"] == b["id"] and sum_win["id"] == ar["id"], "decide() không khớp tiền tính"
        picked.append((margin, ar, b, c))
        if len(picked) >= a.top:
            break

    for n, (margin, ar, b, c) in enumerate(picked, 1):
        print(f"\n#{n}  biên {margin:.1%}  ·  người xa nhất bớt {ar['max_min'] - b['max_min']}′  ·  "
              f"tổng km +{b['total_km'] / ar['total_km'] - 1:.1%}")
        for tag, r in (("OMP  ", b), ("TỔNG ", ar), ("thứ 3", c)):
            print(f"  {tag} {r['name']} [{r['brand']}] ({r['lat']}, {r['lng']})  Ψ={r['psi']:.0f}  "
                  f"total={r['total_km']:.1f} km  max={r['max_km']:.1f} km / {r['max_min']}′ ({r['farthest']})  "
                  f"phút={r['minutes']}")
    if not picked:
        print("\nKhông có bộ nào đạt với 4 nhà cố định (T-106 bước 4: hỏi người dùng có cho dời một nơi xuất phát).")

    if a.json:
        keep = ("id", "name", "brand", "lat", "lng", "psi", "total_km", "max_km", "max_min", "farthest")
        data = [
            {"margin": m, **{tag: {k: r[k] for k in keep} for tag, r in (("omp", b), ("sum", ar), ("third", c))}}
            for m, ar, b, c in picked
        ]
        Path(a.json).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nĐã ghi {a.json}")


if __name__ == "__main__":
    main()
