# Giai đoạn 10 "Ảnh quán" (T-116 → T-121)

Lập 2026-11-21 (session plan, không code), sau 3 đợt hỏi người dùng. Làm **sau buổi trình bày 2026-11-23**; không đụng
gđ9 (đang chờ G2). Mục tiêu là sản phẩm dài hạn, **gần như không làm tay**.

## 1. Mục tiêu

Mọi thẻ quán (danh sách bình chọn `PlaceRow`, dải gợi ý `DiscoveryCard`, trang chi tiết `PhotoGallery`) đều có **một hình
riêng, đúng sự thật** thay cho icon loại quán; quán nào có ảnh thật hợp lệ (bản quyền rõ) thì hiện ảnh thật. Không gọi dịch vụ trả
phí ở thẻ; không cào Facebook/Foody/Google; không ảnh AI giả làm ảnh quán.

## 2. Hiện trạng (đã kiểm 2026-11-21)

1. Snapshot `backend/app/data/places_hcm.json.gz`: **44 226 quán** (FOOD 22 127, DRINK 19 834, ENTERTAINMENT 1 121, SHOPPING 635,
   SIGHTSEEING 509). Trường: `address, brand, brand_key, category, district, external_id, kind, lat, lng, minzoom, name, phone,
   score, sources, website` — **không có ảnh** (Overture và OSM đều không cấp ảnh). `build_places.py` bỏ `brand.wikidata` của
   Overture.
2. Chuỗi: 4 401 quán có `brand_key`, 862 thương hiệu (Highlands 291, Trung Nguyên 250 + E-Coffee 230, Phúc Long 93, KFC 85…).
   `brand_key` có trong `Poi` (CR-17 A) nhưng **không có trong `Place`** của phòng (`types/models.ts`).
3. Website: 13 851 quán, nhưng top domain là facebook (564), maps.app.goo.gl (317), instagram, tiktok, shopeefood, foody — không
   dùng được làm nguồn ảnh hợp lệ.
4. Tuyển chọn T-70 (`frontend/src/curated/hcm.json`): 38 quán, 114 ô ảnh khai báo, **`photos.json` rỗng — 0 file**. Pipeline
   `scripts/curated_images.py` sẵn (xoay EXIF, cắt 4:3, WebP + thumb ≤320 px), nhưng `source` chỉ ghi `"user"`.
5. Thiếu ảnh ⇒ `placeThumb()` (`room/placeView.ts:153`) trả `src: null` ⇒ icon Phosphor duotone theo loại (`PlaceRow.tsx:80`).
6. Tầng Google ở trang chi tiết **đã code**: `GooglePlaceCard` (`<gmp-place-details>`, Places UI Kit) sau cờ + key, chỉ tải khi
   mở trang (DESIGN gđ5 §6 tầng 2). Đang tắt vì chưa có key (mục "Việc của người" ở `CLAUDE.md`).
7. Bản đồ: MapLibre `^4.7.1`, style OpenFreeMap `liberty` (vector, không có tile raster để cắt ảnh sẵn).

## 3. Các nguồn đã cân nhắc

| Nguồn | Phủ | Chi phí / pháp lý | Quyết định |
| :--- | :--- | :--- | :--- |
| Bản đồ thu nhỏ quanh quán (render client) | 100 % | Miễn phí; ghi công OpenFreeMap/OSM | **Làm** — tầng đáy (T-117) |
| Ảnh đại diện thương hiệu (Wikidata P18 → Commons) | ≤ 4 401 quán, tuỳ số hãng có ảnh | Miễn phí; chỉ nhận license tự do, ghi công | **Làm** (T-118) — người dùng chọn ảnh mặt tiền/sản phẩm thay vì logo, chấp nhận ảnh không đúng chi nhánh |
| Mapillary (ảnh đường phố CC-BY-SA, bán kính ≤ 50 m) | chưa biết ở TP.HCM | Miễn phí, token; bắt buộc ghi công; URL thumb ký có hạn | **Đo trước** (T-116) → G1 |
| Wikimedia Commons theo toạ độ | ~509 SIGHTSEEING + vài quán nổi tiếng | Miễn phí, ghi công | **Làm** cùng T-119 |
| Google Places UI Kit (trang chi tiết) | gần 100 % | Có free tier (DEPLOY.md: ~10 000/tháng), cần billing; backend không lưu gì | **Giữ như cũ, chỉ trang chi tiết, sau cờ** (T-120 kiểm) |
| Google Place Photos API ở thẻ | gần 100 % | Enterprise SKU: 1 000 miễn phí/tháng rồi ~$7/1 000; 20 thẻ/phòng ⇒ ~50 lượt mở phòng/tháng | **Không** |
| Ảnh người dùng đóng góp | tăng dần | Cần lưu trữ + kiểm duyệt + CR | **Không** (người dùng 2026-11-21) |
| Cào `og:image` Facebook/Foody/website | ~30 % | Vi phạm ToS, ảnh của người khác | **Không** |
| Ảnh AI tạo | 100 % | Gây hiểu nhầm (không phải quán thật) | **Không** |
| Minh hoạ vẽ theo loại quán | 100 % | Miễn phí | Không — người dùng chọn bản đồ thu nhỏ |

## 4. Đặc tả (bản nháp; chốt sau G1 và T-121)

### 4.1 Thứ tự tầng ảnh (mỗi thẻ lấy tầng cao nhất có)
1. Ảnh tuyển chọn (`curated`, T-70; nay có thể đến từ Commons/Mapillary đã duyệt, T-119).
2. Ảnh thật của đúng quán từ nguồn mở (Commons / Mapillary nếu qua G1), dựng sẵn bằng script, có ghi công.
3. Ảnh đại diện thương hiệu (quán có `brand_key`), chú thích nhỏ "Ảnh của thương hiệu" ở trang chi tiết.
4. Bản đồ thu nhỏ quanh quán + ghim màu loại (T-117) — luôn có.
5. Icon loại hiện tại — chỉ khi `lite`/reduced data, WebGL lỗi, hoặc trong lúc bản đồ thu nhỏ chưa vẽ xong.

Trang chi tiết: bộ ảnh lấy tầng 1–3 (nhiều ảnh), nếu không có thì ô đầu là bản đồ thu nhỏ khổ 16:9; khối Google UI Kit giữ chỗ cũ
(phần "Đánh giá"), không đưa ảnh Google vào `PhotoGallery` của mình (ToS: UI Kit tự hiện, giữ logo).

### 4.2 Bản đồ thu nhỏ (T-117)
- **Một** MapLibre ẩn dùng chung (offscreen, `preserveDrawingBuffer: true`, khổ = ô lớn nhất cần × DPR ≤ 2), hàng đợi FIFO ưu tiên
  thẻ đang trong khung nhìn (IntersectionObserver); mỗi việc: `jumpTo` → chờ `idle` → `canvas.toBlob(webp)` → object URL.
- Style rút gọn từ `liberty`: bỏ nhãn chữ và POI nền (ô 72–84 px không đọc được chữ), giữ đường, nước, công viên, toà nhà;
  zoom ~16; ghim vẽ bằng canvas 2D đè lên (màu theo `CATEGORY_METADATA`, giống `PoiLayer`).
- Cache: IndexedDB theo khoá `(lat, lng làm tròn 5 số, theme, cỡ, phiên bản style)`; bọc try/catch, hỏng thì chỉ mất cache.
- Pin (luật rice: không polling): map ẩn chỉ tạo khi hàng đợi có việc, **huỷ** (`map.remove()`, giải phóng WebGL context) sau
  10 s rảnh; không render khi tab ẩn. Mục tiêu: ≤ 150 ms/thẻ lần đầu trên máy dev, 0 ms khi cache trúng.
- Không giao với 16 WebGL context: map phòng (1) + map ẩn (1) + quả cầu gđ9 (canvas 2D, không phải WebGL).
- Ghi công: dòng "© OpenFreeMap © OpenMapTiles © OpenStreetMap" ở trang chi tiết dưới ô bản đồ thu nhỏ; ở thẻ nhỏ không ghi
  từng ô (G1 câu 4).

### 4.3 Ảnh thương hiệu (T-118)
- `build_places.py` giữ `brand_wikidata` (Q-id) vào snapshot; script chạy tay `scripts/brand_images.py`: với mỗi Q-id có ≥ N quán
  (mặc định N = 3), lấy P18 (ảnh) — **không** lấy P154 (logo, thường không phải license tự do) — tải từ Commons, đọc
  `extmetadata` (`LicenseShortName`, `Artist`), **chỉ nhận** CC0/PD/CC-BY/CC-BY-SA; cắt 4:3, WebP + thumb, ghi
  `frontend/public/brands/<brand_key>.webp` + manifest `frontend/src/brands/brands.json` (`brand_key → {file, author, license,
  source_url}`).
- FE cần biết `brand_key` của quán trong phòng ⇒ **CR-20** (PROPOSED ở T-118): thêm `brand_key?: string | null` vào `Place`
  (backend điền khi thêm quán từ POI có `external_id`), hoặc FE tra `external_id` qua `/pois/...`. Chọn ở G1 câu 5.

### 4.4 Ảnh thật từ nguồn mở (T-116 đo → T-119)
- Mapillary: `GET graph.mapillary.com/images?lat&lng&radius≤50&limit` (thêm bán kính 2026-04, theo tài liệu Mapillary). Lọc ảnh
  **nhìn về quán**: `|compass_angle − bearing(ảnh → quán)| ≤ 45°`, khoảng cách ≥ 5 m, ưu tiên ảnh mới, không 360°. URL thumb có
  hạn ⇒ snapshot chỉ lưu **image id**; FE lấy `thumb_256_url`/`thumb_1024_url` lúc chạy bằng client token công khai (biến
  `VITE_MAPILLARY_TOKEN`), lỗi/hết quota thì xuống tầng dưới.
- Commons: `list=geosearch` bán kính ≤ 100 m + khớp tên (dùng `normalizeName` như `curated.ts`), chỉ license tự do.
- Mọi ảnh nguồn mở hiện **ghi công** trong `PhotoGallery` (tác giả · license · link) — bắt buộc với CC-BY-SA.
- 38 quán tuyển chọn: script đề xuất ứng viên vào `curated-inbox/` kèm `source` đầy đủ (URL, tác giả, license); người duyệt bằng
  `docs/phase5/curated-checklist.html` (một lượt bấm giữ/bỏ, không phải đi chụp). `curated_images.py` ghi `source` thật thay `"user"`.

## 5. Câu hỏi cho người dùng (G1, trả lời sau khi xem số đo T-116 + ảnh mẫu T-117)
1. Mapillary: nếu ≥ X % quán có ảnh nhìn về quán trong 50 m **và** contact sheet trông dùng được thì đưa vào tầng 2. Đề xuất
   X = 15 %. Dưới ngưỡng ⇒ chỉ dùng cho 38 tuyển chọn + sightseeing.
2. Bản đồ thu nhỏ theo theme (sáng/tối) hay **luôn sáng** như lớp quán `PoiLayer` (đề xuất: theo theme, vì thẻ nằm trên nền theme).
3. Zoom và khung: ghim ở giữa, zoom 16 (thấy 2–3 dãy phố) hay zoom 17 (thấy mặt tiền khối nhà)?
4. Ghi công bản đồ: chỉ ở trang chi tiết + trang giới thiệu (đề xuất) hay mỗi thẻ một chữ ⓘ?
5. CR-20: thêm `brand_key` vào `Place` (đề xuất, 1 cột + 1 dòng ở `add_place`) hay FE tự tra qua POI?
6. Ngưỡng hãng: chỉ làm ảnh cho hãng có ≥ 3 chi nhánh (đề xuất) hay mọi hãng có Q-id?

## 6. Task, thứ tự, cổng

| Task | Việc | Phụ thuộc | Được phép tạo/sửa (sơ bộ) | Model / effort |
| :--- | :--- | :--- | :--- | :--- |
| T-116 | Script đo `scripts/probe_place_photos.py` (chạy tay, không trong test): 200 quán ngẫu nhiên phân tầng theo `category` × quận + 38 tuyển chọn + 509 SIGHTSEEING; Mapillary (cần `MAPILLARY_TOKEN`) + Commons geosearch; ra `docs/phase10/PROBE.md` (% có ảnh, % nhìn về quán, phân theo loại/quận) + contact sheet HTML ở scratchpad | – (token là việc của người) | `scripts/probe_place_photos.py`, `docs/phase10/PROBE.md` | Sonnet / medium |
| T-117 | Bản đồ thu nhỏ §4.2: `room/mapThumb.ts` (hàng đợi, map ẩn, cache IndexedDB), hook `useMapThumb`, nối `placeThumb` + `PlaceRow` + `DiscoveryCard` + `PhotoGallery`; test hàng đợi/cache/huỷ map bằng mock MapLibre; ảnh chụp 1280/390 sáng/tối | – (chạy song song T-116) | `frontend/src/room/mapThumb.ts`, `room/placeView.ts`, `components/places/{PlaceRow,DiscoveryCard,PhotoGallery,PlaceDetail}.tsx`, i18n, test | Opus / high |
| **G1** | Người dùng xem PROBE.md + ảnh T-117, trả lời §5 | T-116, T-117 | – | – |
| T-118 | Ảnh thương hiệu §4.3 + CR-20 (PROPOSED → chờ duyệt → áp) | G1 | `scripts/build_places.py`, `scripts/brand_images.py`, snapshot, `frontend/public/brands/`, `frontend/src/brands/`, `placeView.ts`, CR-20 | Sonnet / high |
| T-119 | Ảnh nguồn mở §4.4: snapshot id Mapillary/Commons (nếu G1 câu 1 = có), tầng 2 ở FE + ghi công trong `PhotoGallery`; lấp 38 tuyển chọn bằng ứng viên tự động + `curated_images.py` ghi `source` thật | G1, T-118 (dùng chung manifest ghi công) | `scripts/curated_images.py`, `scripts/place_photos.py`, `frontend/src/curated/`, `PhotoGallery.tsx`, i18n | Opus / high |
| T-120 | Kiểm tầng Google ở trang chi tiết với key thật (sau việc của người): UI Kit có hiện ảnh, không tải ở thẻ, không trùng với bộ ảnh của mình, quota/budget alert đúng DEPLOY.md | – (cần key) | `components/map/GooglePlaceCard.tsx` (nếu cần), `docs/DEPLOY.md` | Sonnet / medium |
| T-121 | Đo + ảnh + `docs/phase10/DESIGN.md`: % thẻ theo từng tầng trên 5 phòng mẫu, thời gian/thẻ, bộ nhớ GPU, CPU/pin khi cuộn danh sách 100 quán, kích thước bundle + `public/` | T-117 → T-120 | `docs/phase10/DESIGN.md`, `docs/phase10/screens/`, `CLAUDE.md` | Sonnet / medium |
| **G2** | Người dùng dùng thử bản build thật, duyệt ảnh | T-121 | – | – |

## 7. Việc của người
- Tạo token Mapillary (miễn phí, tài khoản Mapillary → Developers → app mới, quyền đọc) — đưa cho session T-116 qua biến môi trường
  `MAPILLARY_TOKEN`, **không commit**. Nếu G1 cho vào FE: một client token riêng làm `VITE_MAPILLARY_TOKEN` trên Vercel.
- T-120: các bước key Google trong `CLAUDE.md` mục "Việc của người" (đã có từ trước).
- G1: một lượt duyệt contact sheet Mapillary/Commons (~10 phút); T-119: một lượt bấm giữ/bỏ ứng viên cho 38 tuyển chọn.
