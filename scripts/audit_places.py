"""Kiểm chất lượng snapshot quán `places_{hcm,hn}.json.gz` (T-104, MAP-POI §10). Chạy lại được sau mỗi lần build:

    cd backend && python ../scripts/audit_places.py [--dir DIR] [--only hcm|hn] [--sample 50] [--flags 40]
        [--cache-dir ~/.cache/didau-places]   # thêm bảng "kind theo taxonomy/basic_category Overture" (cần duckdb)

In: số quán mỗi kind; cờ vị trí; mốc lớn nhiều bản ghi; tên nghi ngờ mỗi kind (không khớp mẫu của kind); mẫu ngẫu nhiên
seed cố định để duyệt bằng mắt; tiện lợi/công ty còn sót. Không ghi file, không gọi mạng.
"""

from __future__ import annotations

import argparse
import gzip
import json
import random
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "scripts"))

import places_clean

from app.domain.patterns.category_detector.osm_mapping import fold_text, is_excluded

DATA_DIR = ROOT / "backend" / "app" / "data"
REGIONS = ("hcm", "hn")
OVERTURE_RELEASE = "2026-10-21.0"

# Tên "hợp lý" của từng kind; không khớp = nghi ngờ (chỉ để người duyệt, không tự sửa)
_PLAUSIBLE = {
    "supermarket": r"sieu thi|mart|market|co ?\.? ?op|bach hoa|aeon|big ?c|lotte|kingfood|satra|annam|nam an|fuji|tops|metro|famall|citi|go\b",
    "cafe": r"cafe|coffee|ca phe|\bcf\b|highland|starbucks|phuc long|trung nguyen|espresso|roaster|brew|cong ca|bistro|house|lounge|station|garden|tiem|quan",
    "tea": r"tra|tea|sinh to|juice|nuoc|smoothie|milk|boba|bubble|gong cha|koi|tocotoco|ding tea|\bche\b|yogurt|kem|drink",
    "mall": r"mall|plaza|tttm|trung tam|center|centre|vincom|aeon|lotte|parkson|takashimaya|pearl|landmark|diamond|crescent|estella|vivo|giga|city|square|tower|market|bitexco|saigon|mart|department|galaxy|garden|thuong mai",
    "cinema": r"cgv|bhd|lotte|galaxy|cinema|\brap\b|cine|beta|mega gs|dcine|platinum|phim|theater|theatre|movie|studio",
    "park": r"cong vien|park|vuon|\bho\b|lake|khu |sinh thai|garden|quang truong|dam |dao |cay xanh|tuong dai",
    "museum": r"bao tang|museum|gallery|trien lam|di tich|\bart\b|thu vien|dinh |chua|den |van mieu|nha tu|lang |cung",
}
_BRANDS = (
    "vincom",
    "aeon",
    "lotte",
    "crescent",
    "parkson",
    "takashimaya",
    "saigon centre",
    "pearl",
    "estella",
    "diamond",
)


def load(region: str, directory: Path) -> tuple[dict, list]:
    with gzip.open(directory / f"places_{region}.json.gz", "rt", encoding="utf-8") as fh:
        payload = json.load(fh)
    recs = [
        SimpleNamespace(
            external_id=p["external_id"],
            name=p["name"],
            kind=p["kind"],
            lat=p["lat"],
            lng=p["lng"],
            address=p.get("address"),
            sources=p.get("sources", []),
            brand=p.get("brand"),
        )
        for p in payload["pois"]
    ]
    return payload, recs


def load_districts(region: str) -> list[tuple[str, float, float]]:
    rows = json.loads((DATA_DIR / f"districts_{region}.json").read_text(encoding="utf-8"))[
        "districts"
    ]
    return [(r.get("short") or r["name"], float(r["lat"]), float(r["lng"])) for r in rows]


def audit(region: str, directory: Path, sample: int, max_flags: int) -> None:
    payload, recs = load(region, directory)
    print(f"\n══ {region.upper()} — {len(recs)} quán, {len(payload.get('retired', []))} retired ══")
    kinds = Counter(r.kind for r in recs)
    print("kind: " + ", ".join(f"{k} {v}" for k, v in kinds.most_common()))

    left = [r for r in recs if is_excluded(r.name, r.brand)]
    print(f"\n[tiện lợi/công ty/điện máy… còn sót, mọi kind] {len(left)}")
    for r in left[:10]:
        print(f"  {r.kind:11} {r.name}")

    flags = places_clean.position_flags(recs, load_districts(region))
    print(f"\n[cờ vị trí] {len(flags)} (hiện tối đa {max_flags})")
    for r, why in flags[:max_flags]:
        print(
            f"  {r.external_id[:22]:22} {r.kind:9} {r.name[:38]!r} ({r.lat:.4f},{r.lng:.4f}) {why}"
        )

    print("\n[mốc lớn nhiều bản ghi: cùng kind, < 400 m, chung ≥ 2 từ có nghĩa]")
    lm = [r for r in recs if r.kind in places_clean.LANDMARK_KINDS]
    toks = {r.external_id: set(places_clean.tokens(r.name)) for r in lm}
    pairs = []
    for i, a in enumerate(lm):
        for b in lm[i + 1 :]:
            if (
                a.kind == b.kind
                and abs(a.lat - b.lat) < 0.004
                and abs(a.lng - b.lng) < 0.004
                and len(toks[a.external_id] & toks[b.external_id]) >= 2
                and places_clean.meters(a.lat, a.lng, b.lat, b.lng) < 400
            ):
                pairs.append((a, b))
    for a, b in pairs[:15]:
        print(
            f"  {a.name[:40]!r} ~ {b.name[:40]!r} ({places_clean.meters(a.lat, a.lng, b.lat, b.lng):.0f} m)"
        )
    print(f"  tổng cặp: {len(pairs)}")

    by_brand: dict[str, int] = defaultdict(int)
    for r in recs:
        if r.kind == "mall":
            f = fold_text(r.name)
            for b in _BRANDS:
                if b in f:
                    by_brand[b] += 1
    print(
        "[mall theo thương hiệu lớn] " + ", ".join(f"{b} {n}" for b, n in sorted(by_brand.items()))
    )

    print("\n[tên nghi ngờ: không khớp mẫu kind] đếm/tổng + ≤ 8 ví dụ")
    for kind, pat in _PLAUSIBLE.items():
        rx = re.compile(pat)
        odd = [r for r in recs if r.kind == kind and not rx.search(fold_text(r.name))]
        print(
            f"  {kind:11} {len(odd):5}/{kinds.get(kind, 0):<5} "
            + " | ".join(r.name[:28] for r in odd[:8])
        )

    rnd = random.Random(104)
    print(f"\n[mẫu ngẫu nhiên seed 104, {sample}/kind]")
    for kind in kinds:
        pool = [r for r in recs if r.kind == kind]
        print(
            f"  {kind}: "
            + " | ".join(r.name[:30] for r in rnd.sample(pool, min(sample, len(pool))))
        )


def overture_categories(region: str, cache_dir: Path) -> None:
    import duckdb

    from app.domain.patterns.category_detector.osm_mapping import overture_kind

    path = cache_dir / f"overture_{region}_{OVERTURE_RELEASE}.parquet"
    rows = (
        duckdb.connect()
        .execute(
            f"SELECT taxonomy.primary, basic_category, names.primary, brand.names.primary FROM read_parquet('{path}') "
            "WHERE confidence >= 0.7 AND names.primary IS NOT NULL AND coalesce(operating_status,'open')='open'"
        )
        .fetchall()
    )
    table: Counter = Counter()
    for tax, basic, name, brand in rows:
        k = overture_kind(basic, tax, name, brand)
        if k:
            table[(k, tax or basic)] += 1
    print(f"\n[{region}] kind ← Overture taxonomy/basic_category (sau luật làm sạch, trước gộp)")
    for (k, src), n in sorted(table.items(), key=lambda x: (x[0][0], -x[1])):
        print(f"  {k:11} {src:32} {n}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dir", type=Path, default=DATA_DIR)
    parser.add_argument("--only", choices=REGIONS)
    parser.add_argument("--sample", type=int, default=50)
    parser.add_argument("--flags", type=int, default=40)
    parser.add_argument("--cache-dir", type=Path)
    args = parser.parse_args()
    for region in [args.only] if args.only else REGIONS:
        audit(region, args.dir, args.sample, args.flags)
        if args.cache_dir:
            overture_categories(region, args.cache_dir)


if __name__ == "__main__":
    main()
