# Kịch bản demo 2 phút — "Đi Đâu" giai đoạn 5 (Không gian phòng)

Người demo cầm **laptop** (Chrome, cửa sổ ≥1280 px, chủ phòng); một người bạn cầm **điện thoại** (khách).
Âm thanh tắt mặc định. Bản cũ (giai đoạn 4, tab Bản đồ/Quán/Nhóm) ở `docs/phase4/DEMO.md` — **không còn đúng** với giao diện phòng mới
nhưng phần trang chủ 3D vẫn dùng được.

## Checklist trước demo (làm trước 10 phút)
- [ ] **Mạng**: laptop và điện thoại cùng vào được URL demo; Render free ngủ sau 15 phút → gọi `/health` một lần.
- [ ] **Cửa sổ ẩn danh**, zoom 100% (Ctrl+0), cửa sổ ≥1280 px (3 cột đủ; 1024–1279 px thì Kế hoạch là ngăn kéo).
- [ ] **Tile bản đồ tải trước** trong chính cửa sổ ẩn danh: mở trang chủ, cuộn hết phim, rồi vào một phòng bất kỳ.
- [ ] Chế độ **sáng** cho máy chiếu (avatar góc phải → Giao diện); tối để dành.
- [ ] Không bật "Giảm chuyển động" của hệ điều hành (nếu bật app tự về bản tĩnh, vẫn dùng được nhưng mất chuyển cảnh).
- [ ] Điện thoại: pin > 30%, tắt tiết kiệm pin.
- [ ] Biết trước: **ảnh quán** chỉ có cho các quán tuyển chọn đã có ảnh (`docs/phase5/curated-checklist.html`); quán khác hiện minh hoạ danh mục.
- [ ] Chọn sẵn 3 quán **khác toà nhà** (gợi ý trùng địa chỉ → cảnh báo "trông như cùng một quán").

## Kịch bản (≈ 2 phút)
| Thời điểm | Làm gì | Nói gì (gợi ý) |
| :--- | :--- | :--- |
| 0:00 | Trang chủ, cuộn nhanh phim 3D, bấm **Tạo phòng**. | "Tối thứ Sáu, cả nhóm hỏi: đi đâu?" |
| 0:10 | **Tạo phòng một màn**: bấm "Đổi nhân vật", gõ biệt danh + tên buổi; chọn **Ngày mai** + khung giờ; điểm hẹn **Chỗ tôi đang đứng** (hoặc Tìm địa điểm); chip ngân sách **200–500k**; bấm **Tạo phòng**. | "Một màn, 20 giây, không tài khoản." |
| 0:30 | Vào phòng: bước **① Tìm quán** — "Tối nay đi đâu?", 4 dải gợi ý. Avatar góc phải → **mời** → bạn nhập mã trên điện thoại; laptop thấy "2 người đang xem". | "Gợi ý quanh điểm hẹn, hợp giờ và ngân sách." |
| 0:45 | Bấm **＋** trên 3 thẻ gợi ý (một chạm, kèm giá). Bấm một thẻ để xem **chi tiết quán** (ảnh, giờ mở khớp khung giờ nhóm, giá); Esc đóng. Cột trái tự đổi sang **② Bình chọn**. | "Thêm một chạm; xem chi tiết không rời trang." |
| 1:00 | Cả hai bấm **♥ Muốn đi** (điện thoại: tab *Khám phá*, kéo sheet lên). Chỉ avatar bạn hiện trên thẻ; hai quán **hoà** → thẻ "Hoà rồi". | "Mọi người thấy nhau chọn gì." |
| 1:15 | Bấm **Để trọng tài chọn** (mặc định SMART) → ra kết quả. Chủ phòng chốt. **Reveal** trên cả hai máy cùng lúc. | "Chốt!" |
| 1:30 | Bước **③ Chốt kèo**: quán chính ảnh lớn bên trái. Mở **Kế hoạch**: ngân sách "x / y", timeline giờ — nếu có chip xung đột thì bấm **Sửa** đổi giờ. | "Ngân sách cả buổi, không lo vượt." |
| 1:45 | Bước **④ Gửi lịch**: **Gửi kế hoạch cho nhóm** (chia sẻ link), **Thêm vào lịch** (tải `.ics`). | "Có lịch, có đường đi. Đi thôi." |

## Nếu có sự cố
- **Bản đồ trắng/xám**: mạng chậm; cứ tiếp tục, danh sách vẫn dùng được. Không F5 giữa chừng.
- **Bạn không vào được phòng**: đọc mã to cho bạn nhập tay.
- **Banner "Mất kết nối, đang thử lại"**: WS rớt; app tự nối lại. Banner làm cả phòng nhích xuống một chút — bình thường.
- **Không thấy ảnh quán**: quán chưa có ảnh tuyển chọn → minh hoạ danh mục (đúng thiết kế, không phải lỗi).
- **Dải "Hợp giờ & ngân sách" trống**: chỉ hiện quán đã biết giờ và giá; đổi ngân sách chip sang "Không giới hạn" để thấy nhiều thẻ hơn.
- **Máy yếu, chuyển động giật**: thêm `?motion=lite` (hoặc `?motion=off`) vào URL.
- **`.ics` không mở được**: chưa thử với Google Calendar/GNOME Calendar ở T-75 (xem PROGRESS) — mở trước khi demo.

## Gỡ lỗi nhanh (không dùng khi demo)
`?motion=slow` (chậm ×4) · `?motion=off` · `?motion=lite` · `?place=<id>` mở thẳng chi tiết quán · `?tab=plan` mở Kế hoạch (mobile).
Ảnh chụp từng bước: `docs/phase5/screens/final/` (xem README trong thư mục đó).
