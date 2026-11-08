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

## `pois_*.json.gz` — snapshot quán OSM (xem `scripts/build_osm_pois.py`), cùng giấy phép ODbL.
