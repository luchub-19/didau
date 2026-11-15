# Dữ liệu đóng gói (backend/app/data)

## `districts_hcm.json`, `districts_hn.json` — tâm khu vực để gắn nhãn tâm nhóm (ALGO-01, T-86)
- **Nguồn:** OpenStreetMap qua Overpass API, lấy MỘT LẦN ngày 2026-11-08, không gọi mạng lúc chạy.
- **Giấy phép:** Open Database License (ODbL 1.0) — © OpenStreetMap contributors. Phải giữ ghi công này khi
  phân phối lại file.
- **Dạng:** `{"metadata": {...}, "districts": [{"name", "short", "lat", "lng"}]}`; `short` là nhãn hiển thị
  ("Q3", "Phú Nhuận"). Nhiều dòng có thể chung `short` (TP Thủ Đức gồm nhiều phường) — nhãn gộp bỏ trùng.
- **HCM (33 dòng):** 16 quận + 5 huyện cũ (tâm = tâm hộp bao của quan hệ ranh giới, `out center`), cộng
  12 phường vùng Thủ Đức cũ (Q2/Q9/Thủ Đức) vì sau cải tổ hành chính 2025 OSM không còn quận ở đó.
  Chỉ lấy đơn vị của TP.HCM trước sáp nhập (bỏ phần Bình Dương, Bà Rịa – Vũng Tàu).
- **HN (49 dòng):** OSM không còn quan hệ quận/huyện; dùng nút `place=suburb` (phường sau 2025) trong hộp
  20.9–21.15 N, 105.7–105.95 E.
- **Cập nhật:** chạy lại các truy vấn Overpass (`rel["name"~"^(Quận|Huyện) "]["boundary"]` trong khu vực
  TP.HCM; `node["place"~"^(suburb|city_district)$"]` trong hộp Hà Nội) rồi ghi đè hai file; thứ tự dòng không quan trọng.

## `places_hcm.json.gz`, `places_hn.json.gz` — snapshot quán (CR-17 A, T-100) — `PoiService` đọc file này
- **Nguồn:** (1) **Overture Maps Places** release `2026-10-21.0` (Meta, Microsoft, Foursquare, AllThePlaces…),
  lọc `confidence ≥ 0,7`, bỏ điểm `operating_status` khác `open`; (2) **OpenStreetMap** qua Overpass (ăn uống,
  `shop=mall/supermarket/bakery/coffee/tea…`, `leisure=park/…`, `tourism=museum/…`, `amenity=cinema/karaoke_box`).
  Dựng ngày 2026-11-15 bằng `scripts/build_places.py`; không gọi mạng lúc chạy.
- **Giấy phép / ghi công:** Overture — CDLA-Permissive-2.0 (một phần nguồn CC0/Apache-2.0); OSM — ODbL 1.0.
  Phải hiện "© OpenStreetMap contributors · Overture Maps Foundation" (bản đồ có sẵn: `MapView` `customAttribution`).
- **Dạng:** `{"metadata": {...}, "pois": [...], "retired": [...]}`. Mỗi quán: `external_id` (`osm:{type}/{id}` nếu khớp
  OSM, ngược lại `ovt:{gers_id}`), `name, category, kind, lat, lng, address, district, brand, brand_key, cuisine,
  opening_hours, phone, website, score, minzoom, sources[], aliases[]` (trường rỗng bị bỏ). `aliases` = id OSM khác đã
  gộp vào quán này; `retired` = quán của snapshot `pois_*` cũ đã mất khỏi nguồn (chỉ tra theo id cho quán phòng cũ).
  Cách gộp, `score`, `minzoom`: `docs/phase7/MAP-POI.md` §3.
- **Cập nhật** (~1 lần/tháng; script cần DuckDB, không vào runtime backend):
  ```bash
  python -m venv /tmp/places-venv && /tmp/places-venv/bin/pip install duckdb httpx
  cd backend && /tmp/places-venv/bin/python ../scripts/build_places.py --release <bản Overture mới> --cache-dir ~/.cache/didau-places
  ```
  Làm sạch (T-104): luật ở `app/domain/patterns/category_detector/osm_mapping.py` + `scripts/places_clean.py`, ghi đè tay `scripts/places_overrides.json`, báo cáo `scripts/audit_places.py` (xem `MAP-POI.md` §10).
  Release mới: <https://docs.overturemaps.org/release/latest/>. Bản cắt parquet theo vùng (~140 MB cả hai) nằm trong
  `--cache-dir`; xoá để tải lại. Overpass hay trả 502/504 → script tự thử lại 3 lần.

## `pois_*.json.gz` — snapshot quán OSM cũ (2026-10-17, `scripts/build_osm_pois.py`), ODbL
Chỉ đọc khi thiếu `places_*` (dự phòng); `build_places.py` đọc nó để sinh mục `retired`.
