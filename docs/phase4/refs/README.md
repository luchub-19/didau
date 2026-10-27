# Moodboard T-58 (chụp 2026-10-27, Chrome headless 1440×900)

Chỉ để tham chiếu nội bộ, không đưa vào app. Mỗi dòng: lấy gì / không lấy gì.

| Ảnh | Lấy gì | Không lấy gì |
| :--- | :--- | :--- |
| `landonorris.png`, `landonorris-mobile.png` | Một chủ thể chiếm cả khung, chữ hiệu to, **một** màu nhấn (vàng chanh) chỉ cho CTA "Store" luôn ở góc; bản mobile giữ nguyên chủ thể, bỏ chi tiết | Lớp loading dài trước khi thấy gì; chữ nhỏ viết hoa giãn ("NEXT RACE"); font thể thao lạnh |
| `abeto-messenger-loading.png` | Màn chờ có cá tính (nét vẽ tay + một chữ) thay vì spinner; trải nghiệm 3D là "thế giới" người dùng tự đi | Bắt chờ tải WebGL mới thấy nội dung (headless chờ 60 s vẫn chưa xong) → Đi Đâu phải có **poster tĩnh** hiện ngay |
| `linear.png` | Tiêu đề 2 dòng rất to, câu phụ một dòng nhỏ, sản phẩm thật ngay dưới màn đầu; nhịp chữ to/nhỏ rõ; gần như không màu | Nền đen toàn trang; pill "New"; ảnh UI dày đặc không hợp mobile |
| `stripe.png` | Một dải màu ánh sáng chéo làm "nhân vật" (→ `--stage-sunlight` 115°); CTA chính + phụ rõ giữa hiệu ứng; chữ phụ đổi màu thay vì đổi cỡ | Gradient cầu vồng nhiều màu; logo wall; banner cookie che CTA |
| `openfreemap-3d.png` | Style Liberty gốc: nền kem nhạt, đường vàng, chữ địa danh xanh → hợp sẵn với giấy nắng, ít phải chỉnh | Nhãn POI xanh dương chen nhiều; trong hero nên ẩn bớt nhãn POI/bus |

Apple Maps Look Around/Flyover: trang apple.com/maps chỉ tải nội dung khi cuộn bằng trình duyệt thật, headless
ra trang trống, nên **chưa có ảnh**. Ghi nhận từ clip giới thiệu (xem bằng mắt khi có Chrome thật): camera bay chậm,
pitch tăng dần rồi xoay bearing quanh một mốc, không cắt cảnh → khớp kịch bản `hero.shot` (`--ease-camera`).

Ghi nhận chung: mỗi cảnh **1 màu nhấn**; chữ chính rất to, chữ phụ nhỏ và nhạt; CTA không bao giờ mờ đi khi hiệu
ứng chạy; camera chuyển cảnh 1–2 giây, ease đối xứng.
