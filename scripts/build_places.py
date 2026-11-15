"""Dựng snapshot quán `places_{hcm,hn}.json.gz` từ Overture Maps Places + OpenStreetMap (CR-17 A, T-100).

Chạy tay (~1 lần/tháng), không chạy trong test hay CI. DuckDB chỉ là dependency của script (không vào backend):

    python -m venv /tmp/places-venv && /tmp/places-venv/bin/pip install duckdb httpx
    cd backend && /tmp/places-venv/bin/python ../scripts/build_places.py \
        [--release 2026-10-21.0] [--only hcm|hn] [--cache-dir ~/.cache/didau-places] [--out DIR]

Overture đọc thẳng từ S3 công khai (`s3://overturemaps-us-west-2/release/<release>/theme=places`), lọc bbox vùng;
`--cache-dir` giữ bản cắt parquet + kết quả Overpass để chạy lại không phải tải lại. Cách gộp/điểm/minzoom:
`docs/phase7/MAP-POI.md` §3. Ghi công: © OpenStreetMap contributors (ODbL) · Overture Maps Foundation (CDLA-Permissive-2.0).
"""

from __future__ import annotations

import argparse
import gzip
import json
import math
import re
import sys
import time
from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "scripts"))

import places_clean
from places_clean import meters

from app.domain.patterns.category_detector.osm_mapping import (
    clean_kind,
    fold_text,
    kind_category,
    osm_address,
    osm_kind,
    overture_kind,
)

DEFAULT_RELEASE = "2026-10-21.0"
OVERTURE_MIN_CONF = 0.7  # người dùng chốt 2026-11-15 (MAP-POI §2)
OSM_ONLY_CONF = 0.6  # "độ tin cậy" giả định cho quán chỉ có ở OSM khi tính score
OVERTURE_S3 = "s3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*"
ATTRIBUTION = "© OpenStreetMap contributors (ODbL) · Overture Maps Foundation (CDLA-Permissive-2.0)"
OUT_DIR = ROOT / "backend" / "app" / "data"
GEOJSON_DIR = ROOT / "frontend" / "public" / "data"

# bbox = (min_lat, min_lng, max_lat, max_lng); HCM gồm cả vùng ven (Biên Hoà, Thủ Dầu Một, Tân An)
REGIONS: dict[str, dict] = {
    "hcm": {"iso": "VN-SG", "bbox": (10.35, 106.35, 11.17, 107.05)},
    "hn": {"iso": "VN-HN", "bbox": (20.85, 105.60, 21.25, 106.05)},
}

MERGE_NAME_M = 50.0  # cùng tên chuẩn hoá và cách < 50 m → một quán
MERGE_BRAND_M = 30.0  # cùng brand_key và cách < 30 m → một quán
DISTRICT_MAX_KM = 5.0  # xa mọi tâm khu vực hơn ngưỡng này thì lấy locality của Overture

KIND_WEIGHT = {
    "mall": 25,
    "cinema": 22,
    "museum": 18,
    "park": 18,
    "supermarket": 10,
    "play": 8,
    "karaoke": 8,
}
LANDMARK_KINDS = frozenset({"mall", "cinema", "museum", "park"})
# (zoom, ô lưới độ, N mỗi ô, chỉ kind nào) — MAP-POI §3.3; còn lại minzoom 17
MINZOOM_LEVELS: tuple[tuple[int, float, int, frozenset[str] | None], ...] = (
    (12, 0.08, 2, LANDMARK_KINDS),
    (13, 0.02, 3, None),
    (14, 0.01, 4, None),
    (15, 0.005, 5, None),
    (16, 0.0025, 6, None),
)
MAX_MINZOOM = 17

# Cụm từ chung bị bỏ khi so tên (MAP-POI §3: "cà phê/quán/coffee & tea…")
_NAME_NOISE = re.compile(
    r"\b(coffee and tea|coffee tea|ca phe|cafe|coffee|tra sua|quan|nha hang|tiem|restaurant)\b"
)

OSM_FILTERS = {
    "amenity": "restaurant|cafe|fast_food|food_court|bar|pub|biergarten|nightclub|ice_cream|cinema|karaoke_box",
    "shop": "bakery|pastry|coffee|tea|beverages|mall|department_store|supermarket",
    "leisure": "park|amusement_arcade|bowling_alley|escape_game|water_park",
    "tourism": "museum|gallery|zoo|theme_park",
}
_OSM_KEEP_TAGS = ("amenity", "shop", "leisure", "tourism", "cuisine", "opening_hours", "brand")


# ── Bản ghi trung gian ─────────────────────────────────────────────────────────────────────────


@dataclass
class Rec:
    external_id: str
    name: str
    kind: str
    lat: float
    lng: float
    confidence: float
    address: str | None = None
    locality: str | None = None
    brand: str | None = None
    cuisine: str | None = None
    opening_hours: str | None = None
    phone: str | None = None
    website: str | None = None
    has_social: bool = False
    datasets: set[str] = field(default_factory=set)
    sources: list[str] = field(default_factory=list)  # "overture" / "osm"
    aliases: list[str] = field(default_factory=list)  # id OSM khác đã gộp vào
    district: str | None = None
    score: int = 0
    minzoom: int = MAX_MINZOOM

    @property
    def brand_key(self) -> str | None:
        return brand_key(self.brand)

    @property
    def name_key(self) -> str:
        return name_key(self.name)


def name_key(name: str) -> str:
    """Tên để so trùng: bỏ dấu, bỏ ký tự lạ và cụm từ chung; rỗng sau khi bỏ thì giữ tên gốc đã bỏ dấu."""
    folded = re.sub(r"[^a-z0-9]+", " ", fold_text(name.replace("&", " and "))).strip()
    stripped = re.sub(r"\s+", " ", _NAME_NOISE.sub(" ", folded)).strip()
    return stripped or folded


def brand_key(brand: str | None) -> str | None:
    if not brand:
        return None
    key = re.sub(r"[^a-z0-9]+", "-", fold_text(brand)).strip("-")
    return key or None


# ── Overture ───────────────────────────────────────────────────────────────────────────────────

_OVERTURE_SELECT = """
SELECT id, names.primary AS name, confidence, bbox.xmin AS lng, bbox.ymin AS lat,
       basic_category, taxonomy.primary AS taxonomy,
       addresses[1].freeform AS street, addresses[1].locality AS locality,
       brand.names.primary AS brand, websites[1] AS website, len(socials) AS n_social, phones[1] AS phone,
       [s.dataset FOR s IN sources IF s.dataset NOT LIKE 'Overture%'] AS datasets
FROM {src}
WHERE bbox.ymin BETWEEN {min_lat} AND {max_lat} AND bbox.xmin BETWEEN {min_lng} AND {max_lng}
  AND confidence >= {min_conf} AND names.primary IS NOT NULL
  AND coalesce(operating_status, 'open') = 'open'
"""


def overture_rows(region: str, release: str, cache_dir: Path | None, min_conf: float) -> list[dict]:
    import duckdb  # dependency riêng của script

    bbox = REGIONS[region]["bbox"]
    con = duckdb.connect()
    s3 = f"read_parquet('{OVERTURE_S3.format(release=release)}', hive_partitioning=1)"
    src = s3
    if cache_dir is not None:
        cached = cache_dir / f"overture_{region}_{release}.parquet"
        if not cached.exists():
            con.sql("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
            print(f"  tải Overture {release} ({region}) từ S3 → {cached} …")
            con.sql(
                f"COPY (SELECT * FROM {s3} WHERE bbox.ymin BETWEEN {bbox[0]} AND {bbox[2]} "
                f"AND bbox.xmin BETWEEN {bbox[1]} AND {bbox[3]}) TO '{cached}' (FORMAT parquet)"
            )
        src = f"read_parquet('{cached}')"
    else:
        con.sql("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
    sql = _OVERTURE_SELECT.format(
        src=src,
        min_lat=bbox[0],
        min_lng=bbox[1],
        max_lat=bbox[2],
        max_lng=bbox[3],
        min_conf=min_conf,
    )
    cur = con.execute(sql)
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row, strict=True)) for row in cur.fetchall()]


def overture_address(street: str | None, locality: str | None) -> str | None:
    street = (street or "").strip()
    locality = (locality or "").strip()
    if street and locality and fold_text(locality) not in fold_text(street):
        return f"{street}, {locality}"
    return street or None


def from_overture(row: dict) -> Rec | None:
    name = (row.get("name") or "").strip()
    kind = clean_kind(
        overture_kind(row.get("basic_category"), row.get("taxonomy"), name, row.get("brand")),
        name,
        row.get("brand"),
    )
    if not name or kind is None or row.get("lat") is None or row.get("lng") is None:
        return None
    return Rec(
        external_id=f"ovt:{row['id']}",
        name=name,
        kind=kind,
        lat=round(float(row["lat"]), 6),
        lng=round(float(row["lng"]), 6),
        confidence=float(row.get("confidence") or 0.0),
        address=overture_address(row.get("street"), row.get("locality")),
        locality=(row.get("locality") or None),
        brand=(row.get("brand") or None),
        phone=row.get("phone") or None,
        website=row.get("website") or None,
        has_social=bool(row.get("n_social")),
        datasets=set(row.get("datasets") or ()),
        sources=["overture"],
    )


# ── OSM ────────────────────────────────────────────────────────────────────────────────────────


def overpass_query(iso_code: str) -> str:
    lines = ["[out:json][timeout:240];", f'area["ISO3166-2"="{iso_code}"]->.a;', "("]
    lines += [f'  nwr(area.a)["{key}"~"^({vals})$"]["name"];' for key, vals in OSM_FILTERS.items()]
    lines += [");", "out center tags;"]
    return "\n".join(lines)


def shrink_osm(element: dict) -> dict | None:
    """Phần tử Overpass → bản ghi gọn (giữ tag cần cho kind, giờ mở cửa, địa chỉ)."""
    tags = element.get("tags") or {}
    name = (tags.get("name") or "").strip()
    center = element.get("center") or element
    lat, lng = center.get("lat"), center.get("lon")
    if not name or lat is None or lng is None or osm_kind(tags) is None:
        return None
    rec = {
        "id": f"osm:{element['type']}/{element['id']}",
        "name": name,
        "lat": round(lat, 6),
        "lng": round(lng, 6),
        "tags": {k: v for k, v in tags.items() if k in _OSM_KEEP_TAGS or k.startswith("addr:")},
    }
    for key in ("phone", "contact:phone"):
        if tags.get(key):
            rec["phone"] = tags[key]
            break
    for key in ("website", "contact:website", "contact:facebook"):
        if tags.get(key):
            rec["website"] = tags[key]
            break
    return rec


def osm_rows(region: str, cache_dir: Path | None) -> list[dict]:
    import httpx
    from build_osm_pois import OVERPASS_URL, USER_AGENT

    cached = cache_dir / f"osm_{region}.json" if cache_dir is not None else None
    if cached is not None and cached.exists():
        return json.loads(cached.read_text(encoding="utf-8"))
    query = overpass_query(REGIONS[region]["iso"])
    last_error: Exception | None = None
    with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=300) as client:
        for attempt in range(1, 4):
            try:
                resp = client.post(OVERPASS_URL, data={"data": query})
                resp.raise_for_status()
                rows = [r for el in resp.json()["elements"] if (r := shrink_osm(el)) is not None]
                break
            except (httpx.HTTPError, KeyError, ValueError) as exc:
                last_error = exc
                print(f"  Overpass lần {attempt} lỗi: {exc}", file=sys.stderr)
                time.sleep(20 * attempt)
        else:
            raise SystemExit(f"Overpass không phản hồi cho {region}: {last_error}")
    if cached is not None:
        cached.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    return rows


def from_osm(row: dict) -> Rec | None:
    tags = row.get("tags") or {}
    kind = clean_kind(osm_kind({**tags, "name": row["name"]}), row["name"], tags.get("brand"))
    if kind is None:
        return None
    return Rec(
        external_id=row["id"],
        name=row["name"],
        kind=kind,
        lat=float(row["lat"]),
        lng=float(row["lng"]),
        confidence=OSM_ONLY_CONF,
        address=osm_address(tags),
        brand=tags.get("brand") or None,
        cuisine=tags.get("cuisine") or None,
        opening_hours=tags.get("opening_hours") or None,
        phone=row.get("phone"),
        website=row.get("website"),
        datasets={"OpenStreetMap"},
        sources=["osm"],
    )


# ── Gộp trùng ──────────────────────────────────────────────────────────────────────────────────


def is_duplicate(a: Rec, b: Rec) -> bool:
    """MAP-POI §3: cùng tên chuẩn hoá < 50 m, hoặc cùng brand_key < 30 m, và cùng category.
    Thêm: tên này là tiền tố của tên kia (≥ 4 ký tự), vd. "Phúc Long" ↔ "Phúc Long - Lê Lợi"."""
    if kind_category(a.kind) != kind_category(b.kind):
        return False  # quán trong mall không bị gộp vào mall
    dist = meters(a.lat, a.lng, b.lat, b.lng)
    if dist >= MERGE_NAME_M:
        return False
    ka, kb = a.name_key, b.name_key
    if ka == kb:
        return True
    short, long_ = sorted((ka, kb), key=len)
    if len(short) >= 4 and long_.startswith(short + " "):
        return True
    ba, bb = a.brand_key, b.brand_key
    return dist < MERGE_BRAND_M and ba is not None and ba == bb


def absorb(kept: Rec, other: Rec) -> None:
    """Gộp `other` vào `kept`: giữ tên/địa chỉ của bản Overture, giờ mở cửa + ẩm thực của OSM."""
    if "osm" in other.sources:
        if kept.external_id.startswith("osm:"):
            kept.aliases.append(other.external_id)
        else:
            kept.external_id = other.external_id
        kept.opening_hours = kept.opening_hours or other.opening_hours
        kept.cuisine = kept.cuisine or other.cuisine
    kept.aliases.extend(other.aliases)
    kept.address = kept.address or other.address
    kept.brand = kept.brand or other.brand
    kept.phone = kept.phone or other.phone
    kept.website = kept.website or other.website
    kept.has_social = kept.has_social or other.has_social
    kept.datasets |= other.datasets
    for src in other.sources:
        if src not in kept.sources:
            kept.sources.append(src)


def merge(overture: list[Rec], osm: list[Rec]) -> tuple[list[Rec], Counter]:
    """Gộp trùng một lượt: Overture (tin cậy giảm dần) rồi OSM; mỗi bản ghi tìm quán đã giữ gần nhất trùng với nó."""
    cell = 0.001  # ~110 m > ngưỡng gộp
    grid: dict[tuple[int, int], list[Rec]] = {}
    kept: list[Rec] = []
    stats: Counter = Counter()
    ordered = sorted(overture, key=lambda r: (-r.confidence, r.external_id)) + osm
    for rec in ordered:
        r0, c0 = math.floor(rec.lat / cell), math.floor(rec.lng / cell)
        best: Rec | None = None
        best_d = math.inf
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                for cand in grid.get((r0 + dr, c0 + dc), ()):
                    if is_duplicate(cand, rec):
                        d = meters(cand.lat, cand.lng, rec.lat, rec.lng)
                        if d < best_d:
                            best, best_d = cand, d
        if best is not None:
            pair = "+".join(sorted({best.sources[0], rec.sources[0]}))
            stats[f"gộp {pair}"] += 1
            absorb(best, rec)
            continue
        kept.append(rec)
        grid.setdefault((r0, c0), []).append(rec)
    return kept, stats


# ── district, score, minzoom ───────────────────────────────────────────────────────────────────


def load_districts(region: str) -> list[tuple[str, float, float]]:
    path = ROOT / "backend" / "app" / "data" / f"districts_{region}.json"
    if not path.exists():
        return []
    rows = json.loads(path.read_text(encoding="utf-8"))["districts"]
    return [(r.get("short") or r["name"], float(r["lat"]), float(r["lng"])) for r in rows]


_LOCALITY_PREFIX = re.compile(r"^(Quận|Huyện|Thành phố|Thị xã|TP\.?)\s+", re.IGNORECASE)


def assign_district(rec: Rec, districts: list[tuple[str, float, float]]) -> None:
    best, best_km = None, math.inf
    for short, lat, lng in districts:
        km = meters(rec.lat, rec.lng, lat, lng) / 1000
        if km < best_km:
            best, best_km = short, km
    if best is not None and best_km <= DISTRICT_MAX_KM:
        rec.district = best
    elif rec.locality:
        rec.district = _LOCALITY_PREFIX.sub("", rec.locality).strip() or None


def compute_score(rec: Rec) -> int:
    """MAP-POI §3.2."""
    n_sources = max(1, len(rec.datasets))
    matched_osm = "osm" in rec.sources and "overture" in rec.sources
    score = (
        40 * rec.confidence
        + 8 * min(n_sources - 1, 2)
        + 8 * bool(rec.website or rec.has_social)
        + 4 * bool(rec.phone)
        + 12 * bool(rec.brand_key)
        + 8 * matched_osm
        + KIND_WEIGHT.get(rec.kind, 0)
    )
    return max(0, min(100, round(score)))


def assign_minzoom(recs: list[Rec]) -> None:
    """MAP-POI §3.3: mỗi mức zoom chia lưới, mỗi ô giữ N quán điểm cao nhất chưa có minzoom."""
    for rec in recs:
        rec.minzoom = MAX_MINZOOM
    pending = sorted(recs, key=lambda r: (-r.score, r.external_id))
    for zoom, cell, quota, kinds in MINZOOM_LEVELS:
        used: Counter = Counter()
        rest: list[Rec] = []
        for rec in pending:
            key = (math.floor(rec.lat / cell), math.floor(rec.lng / cell))
            if (kinds is None or rec.kind in kinds) and used[key] < quota:
                used[key] += 1
                rec.minzoom = zoom
            else:
                rest.append(rec)
        pending = rest


def to_json(rec: Rec) -> dict:
    out = {
        "external_id": rec.external_id,
        "name": rec.name,
        "category": kind_category(rec.kind).value,
        "kind": rec.kind,
        "lat": rec.lat,
        "lng": rec.lng,
        "address": rec.address,
        "district": rec.district,
        "brand": rec.brand,
        "brand_key": rec.brand_key,
        "cuisine": rec.cuisine,
        "opening_hours": rec.opening_hours,
        "phone": rec.phone,
        "website": rec.website,
        "score": rec.score,
        "minzoom": rec.minzoom,
        "sources": rec.sources,
        "aliases": rec.aliases,
    }
    return {k: v for k, v in out.items() if v not in (None, [], "")}


def build_region(
    overture_raw: list[dict],
    osm_raw: list[dict],
    region: str,
    report: dict | None = None,
    overrides: dict | None = None,
) -> tuple[list[Rec], Counter]:
    """Dựng danh sách quán của một vùng. `report` (nếu truyền) nhận kết quả làm sạch để in/audit:
    `flags` = [(Rec, lý do)] nghi sai vị trí, `dropped` = [(Rec, lý do)] bị bỏ ở bước làm sạch."""
    report = report if report is not None else {}
    report.setdefault("flags", [])
    report.setdefault("dropped", [])
    ovt = [r for row in overture_raw if (r := from_overture(row)) is not None]
    osm = [
        r for row in osm_raw if (r := from_osm(row)) is not None
    ]  # OSM giữ cả vùng ISO, không cắt bbox
    recs, stats = merge(ovt, osm)
    stats["overture vào"] = len(ovt)
    stats["osm vào"] = len(osm)
    districts = load_districts(region)
    recs = clean_region(recs, districts, stats, report, overrides)
    for rec in recs:
        assign_district(rec, districts)
        rec.score = compute_score(rec)
    assign_minzoom(recs)
    recs.sort(key=lambda r: (-r.score, r.external_id))
    return recs, stats


def clean_region(
    recs: list[Rec],
    districts: list[tuple[str, float, float]],
    stats: Counter,
    report: dict,
    overrides: dict | None = None,
) -> list[Rec]:
    """T-104 (MAP-POI §10): gộp trùng mốc lớn → bỏ tenant trong mall → file ghi đè tay → bỏ quán sai vị trí."""
    recs, n_merged = places_clean.merge_landmarks(recs)
    stats["làm sạch: gộp mốc lớn"] = n_merged
    recs, typos = places_clean.drop_brand_typos(recs)
    stats["làm sạch: bỏ tên sai thương hiệu"] = len(typos)
    report["dropped"] += [(r, "tên viết sai thương hiệu, không nằm cạnh mall thật") for r in typos]
    recs, tenants = places_clean.drop_tenants(recs)
    stats["làm sạch: bỏ tenant"] = len(tenants)
    report["dropped"] += [(r, "tenant trong mall khác") for r in tenants]
    overrides = places_clean.load_overrides() if overrides is None else overrides
    recs, manual = places_clean.apply_overrides(recs, overrides)
    stats["làm sạch: ghi đè tay (bỏ)"] = len(manual)
    report["dropped"] += [(r, overrides["drop"].get(r.external_id, "ghi đè tay")) for r in manual]
    # sai vị trí: chỉ mall/rạp của riêng Overture (không khớp OSM) bị bỏ tự động; còn lại chỉ ghi báo cáo để duyệt
    flags = places_clean.position_flags(recs, districts)
    drop_ids = set()
    for rec, reason in flags:
        if rec.sources == ["overture"] and rec.kind in places_clean.COMMERCIAL_LANDMARKS:
            drop_ids.add(rec.external_id)
            report["dropped"].append((rec, f"sai vị trí: {reason}"))
        else:
            report["flags"].append((rec, reason))
    stats["làm sạch: sai vị trí (bỏ)"] = len(drop_ids)
    stats["làm sạch: sai vị trí (chỉ báo cáo)"] = len(report["flags"])
    return [r for r in recs if r.external_id not in drop_ids]


def print_stats(region: str, recs: list[Rec], stats: Counter) -> None:
    n = len(recs) or 1
    print(
        "    làm sạch: "
        + ", ".join(f"{k[10:]} {v}" for k, v in sorted(stats.items()) if k.startswith("làm sạch"))
    )
    with_addr = sum(1 for r in recs if r.address)
    with_any = sum(1 for r in recs if r.address or r.district)
    print(
        f"  [{region}] {len(recs)} quán sau gộp; vào: Overture {stats['overture vào']}, OSM {stats['osm vào']}"
    )
    print(
        "    gộp: " + ", ".join(f"{k} {v}" for k, v in sorted(stats.items()) if k.startswith("gộp"))
    )
    print(f"    có address {with_addr / n:.1%}, có address hoặc district {with_any / n:.1%}")
    src = Counter("+".join(r.sources) for r in recs)
    print("    nguồn: " + ", ".join(f"{k} {v}" for k, v in src.most_common()))
    kinds = Counter(r.kind for r in recs)
    print("    kind: " + ", ".join(f"{k} {v}" for k, v in kinds.most_common()))
    zooms = Counter(r.minzoom for r in recs)
    print("    minzoom: " + ", ".join(f"z{k} {v}" for k, v in sorted(zooms.items())))


def print_cleaning(report: dict) -> None:
    """Cờ sai vị trí chưa bỏ (cần người duyệt) + bản ghi bị bỏ ở bước làm sạch."""
    print(
        f"    cờ vị trí chưa bỏ (người duyệt, xem audit_places.py): {len(report.get('flags', []))}"
    )
    for rec, reason in report.get("dropped", []):
        print(f"    BỎ         {rec.external_id} {rec.kind} {rec.name!r}: {reason}")


def retired_records(region: str, recs: list[Rec], report: dict | None = None) -> list[dict]:
    """Quán của snapshot trước (`pois_{region}` cũ, `places_{region}` hiện có và mục retired của nó) không còn trong bản
    mới — bị OSM xoá/đổi tag, hoặc bị luật làm sạch bỏ: giữ nguyên bản ghi cũ để quán đã thêm vào phòng vẫn mở được
    chi tiết. Backend chỉ tra theo id, không đưa lên bản đồ/tìm kiếm."""
    ids = {r.external_id for r in recs} | {a for r in recs for a in r.aliases}
    old: dict[str, dict] = {}
    for name in (f"pois_{region}.json.gz", f"places_{region}.json.gz"):
        path = OUT_DIR / name
        if not path.exists():
            continue
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            payload = json.load(fh)
        for rec in [*payload.get("pois", []), *payload.get("retired", [])]:
            old.setdefault(rec["external_id"], rec)
    kept = {eid: rec for eid, rec in old.items() if eid not in ids}
    # id phụ (alias) của quán cũ đã bị bỏ: vẫn phải tra được → mỗi alias là một bản ghi retired mang dữ liệu của quán chính
    for rec in list(kept.values()):
        for alias in rec.get("aliases") or ():
            if alias not in ids and alias not in old:
                kept[alias] = {**rec, "external_id": alias, "aliases": []}
    return [{k: v for k, v in rec.items() if v != []} for rec in kept.values()]


def write_snapshot(
    path: Path, region: str, release: str, recs: list[Rec], retired: list[dict]
) -> None:
    payload = {
        "metadata": {
            "region": region,
            "iso3166_2": REGIONS[region]["iso"],
            "attribution": ATTRIBUTION,
            "overture_release": release,
            "overture_min_confidence": OVERTURE_MIN_CONF,
            "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
            "count": len(recs),
        },
        "pois": [to_json(r) for r in recs],
        "retired": retired,
    }
    with gzip.open(path, "wt", encoding="utf-8", compresslevel=9) as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))


def to_feature(rec: dict) -> dict:
    """Điểm GeoJSON rút gọn cho lớp quán tĩnh của bản đồ (T-103): id, n(ame), k(ind), c(ategory), z(minzoom), s(core).
    Nhận bản ghi dạng `to_json` để dựng được cả từ snapshot đã có (không cần mạng)."""
    props = {
        "id": rec["external_id"],
        "n": rec["name"],
        "k": rec.get("kind"),
        "c": rec["category"],
        "z": rec.get("minzoom"),
        "s": rec.get("score", 0),
    }
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [round(rec["lng"], 5), round(rec["lat"], 5)]},
        "properties": {k: v for k, v in props.items() if v is not None},
    }


def write_geojson(path: Path, records: list[dict]) -> None:
    """`frontend/public/data/places_{region}.geojson`: MapLibre cắt tile trong worker, bỏ tải theo bbox."""
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"type": "FeatureCollection", "features": [to_feature(r) for r in records]}
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--release", default=DEFAULT_RELEASE, help="Overture release (vd. 2026-10-21.0)"
    )
    parser.add_argument("--only", choices=sorted(REGIONS), help="chỉ dựng một vùng")
    parser.add_argument("--out", type=Path, default=OUT_DIR, help="thư mục đầu ra")
    parser.add_argument(
        "--cache-dir", type=Path, help="giữ bản cắt Overture + Overpass để chạy lại"
    )
    parser.add_argument(
        "--geojson-dir", type=Path, default=GEOJSON_DIR, help="thư mục GeoJSON tĩnh cho frontend"
    )
    parser.add_argument(
        "--geojson-only",
        action="store_true",
        help="chỉ dựng lại GeoJSON từ snapshot places_*.json.gz đang có (không gọi mạng)",
    )
    parser.add_argument("--min-conf", type=float, default=OVERTURE_MIN_CONF)
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    if args.cache_dir is not None:
        args.cache_dir.mkdir(parents=True, exist_ok=True)
    for region in [args.only] if args.only else list(REGIONS):
        print(f"Vùng {region}:")
        if args.geojson_only:
            with gzip.open(OUT_DIR / f"places_{region}.json.gz", "rt", encoding="utf-8") as fh:
                records = json.load(fh)["pois"]
            gj = args.geojson_dir / f"places_{region}.geojson"
            write_geojson(gj, records)
            print(f"  → {gj} ({gj.stat().st_size / 1024:.0f} KB, {len(records)} quán)")
            continue
        ovt = overture_rows(region, args.release, args.cache_dir, args.min_conf)
        osm = osm_rows(region, args.cache_dir)
        report: dict = {}
        recs, stats = build_region(ovt, osm, region, report)
        path = args.out / f"places_{region}.json.gz"
        retired = retired_records(region, recs, report)
        write_snapshot(path, region, args.release, recs, retired)
        gj = args.geojson_dir / f"places_{region}.geojson"
        write_geojson(gj, [to_json(r) for r in recs])
        print(f"  → {gj} ({gj.stat().st_size / 1024:.0f} KB)")
        print_stats(region, recs, stats)
        print_cleaning(report)
        print(f"    giữ {len(retired)} quán cũ đã mất khỏi nguồn (mục retired, chỉ tra theo id)")
        print(f"  → {path} ({path.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
