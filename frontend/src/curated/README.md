# Bộ dữ liệu quán tuyển chọn (T-70)

Tầng 1 của DESIGN gđ5 §6: ảnh, giới thiệu vi/en, "nên thử", mức giá, chủ đề cho ~38 quán TP.HCM, không cần Google.

## Schema (`hcm.json` → `places[]`)
`id` (slug, tiền tố tên ảnh) · `wave` (1 = đợt đầu, 2 = bổ sung) · `external_id` (OSM, khớp snapshot `pois_hcm.json.gz`) ·
`name` · `address` · `lat` · `lng` · `category` (`PlaceCategory`) · `price_per_person` (VND, **ước lượng**) ·
`collections` (`view|latenight|date|cheap|local|chill`, nhãn i18n `curated.collection.*`) · `intro {vi,en}` ·
`try {vi[],en[]}` · `photos [{file,kind,source}]` (`kind` = `cover|dish|view`, đúng 1 `cover`; `file` = `<id>-<n>.webp`;
`source` để trống, script điền `"user"`) · `hours_note? {vi,en}`.
Không có rating/số đánh giá. Giới thiệu tự viết, không chép Foody/Google.

## Thêm quán
1. Tìm `external_id` bằng grep tên trong snapshot (đừng đọc cả file). 2. Thêm object vào `hcm.json` (đủ vi+en, 2–3 `photos`).
3. `cd frontend && npm test` (test schema bắt thiếu sót). 4. Chạy lại checklist.

## Quy trình ảnh (đợt 1 trước, 10–15 quán)
```bash
python3 scripts/curated_checklist.py          # sinh docs/phase5/curated-checklist.html (mở bằng trình duyệt)
# Bấm link Google Maps/Foody → lưu ảnh vào curated-inbox/ đặt tên <id>-<n>.jpg (đuôi gì cũng được)
# Cần Pillow (Arch: sudo pacman -S python-pillow; không dùng pip install vì PEP 668). HEIC: python-pillow-heif
python3 scripts/curated_images.py --dry-run   # xem sẽ làm gì
python3 scripts/curated_images.py             # xử lý; --force để ghi đè ảnh đã có
```
Script: xoay EXIF, bỏ metadata, `cover` cắt giữa 4:3, cạnh dài ≤1200px, WebP ~80 →
`frontend/public/curated/<id>-<n>.webp` + `.thumb.webp` (≤320px), điền `source`, ghi `photos.json` (manifest) và cập nhật checklist.
Ảnh thô trong `curated-inbox/` bị `.gitignore`. Ảnh phải là ảnh bạn có quyền dùng (tự chụp hoặc được phép).

## Dùng trong code (`room/curated.ts`)
`await loadCurated()` (import động → chunk riêng, ngoài entry bundle) rồi `findCurated(place)`,
`curatedByCollection(code)`, `curatedPhotos(entry)` (chỉ ảnh có trong manifest).
Dữ liệu vị trí: © OpenStreetMap contributors (ODbL).
