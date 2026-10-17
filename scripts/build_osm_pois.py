"""Dựng snapshot POI quán ăn/uống từ OpenStreetMap (Overpass) cho TP.HCM và Hà Nội.

Chạy tay (~1 lần/tháng), không chạy trong test hay CI:

    cd backend && poetry run python ../scripts/build_osm_pois.py [--only hcm|hn] [--out DIR]

Ghi `pois_hcm.json.gz` và `pois_hn.json.gz` vào `backend/app/data/`.
Dữ liệu © OpenStreetMap contributors (ODbL): phải ghi nguồn khi hiển thị.
"""

import argparse
import gzip
import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

import httpx

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "DiDau/1.0 (student project)"
ATTRIBUTION = "© OpenStreetMap contributors (ODbL)"
AMENITIES = "restaurant|cafe|fast_food|food_court|bar|pub|ice_cream"
REGIONS = {"hcm": "VN-SG", "hn": "VN-HN"}
OUT_DIR = Path(__file__).resolve().parent.parent / "backend" / "app" / "data"

ADDR_KEYS = ("housenumber", "street", "subdistrict", "district", "city")
EXTRA_KEYS = ("phone", "website")


def build_query(iso_code: str) -> str:
    return (
        "[out:json][timeout:180];\n"
        f'area["ISO3166-2"="{iso_code}"]->.a;\n'
        f'nwr(area.a)["amenity"~"^({AMENITIES})$"]["name"];\n'
        "out center tags;"
    )


def shrink(element: dict) -> dict | None:
    """Rút gọn một phần tử Overpass; bỏ phần tử không tên hoặc không toạ độ."""
    tags = element.get("tags") or {}
    name = (tags.get("name") or "").strip()
    center = element.get("center") or element
    lat, lng = center.get("lat"), center.get("lon")
    if not name or lat is None or lng is None:
        return None
    rec: dict = {
        "external_id": f"osm:{element['type']}/{element['id']}",
        "name": name,
        "amenity": tags.get("amenity", ""),
        "lat": round(lat, 6),
        "lng": round(lng, 6),
    }
    for key in ("cuisine", "opening_hours"):
        if tags.get(key):
            rec[key] = tags[key]
    addr = {k: tags[f"addr:{k}"] for k in ADDR_KEYS if tags.get(f"addr:{k}")}
    if addr:
        rec["addr"] = addr
    for key in EXTRA_KEYS:
        if tags.get(key):
            rec[key] = tags[key]
    return rec


def fetch_region(client: httpx.Client, iso_code: str) -> list[dict]:
    last_error: Exception | None = None
    for attempt in range(1, 4):
        try:
            resp = client.post(OVERPASS_URL, data={"data": build_query(iso_code)})
            resp.raise_for_status()
            elements = resp.json()["elements"]
            return [rec for el in elements if (rec := shrink(el)) is not None]
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            last_error = exc
            print(f"  lần {attempt} lỗi: {exc}", file=sys.stderr)
            time.sleep(15 * attempt)
    raise SystemExit(f"Overpass không phản hồi cho {iso_code}: {last_error}")


def write_snapshot(path: Path, region: str, iso_code: str, pois: list[dict]) -> None:
    payload = {
        "metadata": {
            "region": region,
            "iso3166_2": iso_code,
            "attribution": ATTRIBUTION,
            "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
            "count": len(pois),
        },
        "pois": pois,
    }
    with gzip.open(path, "wt", encoding="utf-8", compresslevel=9) as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--only", choices=sorted(REGIONS), help="chỉ dựng một vùng")
    parser.add_argument("--out", type=Path, default=OUT_DIR, help="thư mục đầu ra")
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    regions = {args.only: REGIONS[args.only]} if args.only else REGIONS
    with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=240) as client:
        for region, iso_code in regions.items():
            print(f"Đang lấy {region} ({iso_code}) từ Overpass...")
            pois = fetch_region(client, iso_code)
            path = args.out / f"pois_{region}.json.gz"
            write_snapshot(path, region, iso_code, pois)
            print(f"  {len(pois)} quán -> {path} ({path.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
