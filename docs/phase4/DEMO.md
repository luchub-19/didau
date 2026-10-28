# Kịch bản demo 2 phút — "Đi Đâu"

Người demo cầm **laptop** (Chrome, cửa sổ ≥1280px, chủ phòng); một người bạn cầm **điện thoại** (khách).
Âm thanh tắt mặc định; bật ở bước 8 nếu phòng yên tĩnh.

## Checklist trước demo (làm trước 10 phút)

- [ ] **Mạng**: laptop và điện thoại cùng vào được URL demo (Vercel/Render, hoặc LAN nếu chạy local). Thử mở trên
      điện thoại trước 1 lần. Render free ngủ sau 15 phút: gọi `/health` 1 lần cho backend thức.
- [ ] **Tile bản đồ tải trước**: mở trang chủ 1 lần, cuộn hết phim 5 cảnh, rồi mở tab Bản đồ của một phòng bất kỳ.
      Tile OpenFreeMap vào cache trình duyệt, lần demo thật không bị ô xám.
- [ ] **Cửa sổ ẩn danh** cho lần demo thật: không còn "Tiếp tục phòng …" cũ, không token cũ, âm thanh về tắt.
      (Tile vẫn tải lại trong ẩn danh: chạy lại bước trên **trong chính cửa sổ ẩn danh** đó.)
- [ ] **Zoom trình duyệt 100%** (Ctrl+0). Cửa sổ ≥1280px để có phim 3D đầy đủ và bộ thẻ quẹt rộng.
- [ ] **Chế độ sáng** (Nhóm → Giao diện → Sáng) cho máy chiếu; chế độ tối "chạng vạng" để dành nếu phòng tối.
- [ ] Không bật "Giảm chuyển động" của hệ điều hành (nếu bật, app tự về bản tĩnh, vẫn dùng được nhưng mất phim).
- [ ] Chọn sẵn 3 quán **khác toà nhà** (gợi ý gần điểm hẹn thường trùng địa chỉ → cảnh báo "trông như cùng một quán").
- [ ] Điện thoại bạn: pin > 30%, tắt chế độ tiết kiệm pin (Safari/Chrome hạ rAF khi tiết kiệm pin).

## Kịch bản (≈ 2 phút)

| Thời điểm | Làm gì | Nói gì (gợi ý) |
| :--- | :--- | :--- |
| 0:00 | Mở trang chủ. Dừng ở cảnh 1 (bản đồ 3D Q1 xoay nhẹ một lần). | "Tối thứ Sáu, cả nhóm hỏi: đi đâu?" |
| 0:10 | **Cuộn chậm** qua phim 5 cảnh: quán 1 → 2 → 3, đường nối vẽ dần, trời ngả chạng vạng, đèn đường bật. | "Một tối thường có 3 điểm dừng. App lo cả chuỗi." |
| 0:30 | Cảnh 5: bấm **Tạo phòng**, nhập tên phòng + biệt danh. | |
| 0:40 | Bấm **Mời bạn bè** (tab Nhóm) → bạn mở link/nhập mã 6 ký tự trên điện thoại. Trên laptop thấy bạn **vào phòng**. | "Không cần tài khoản, chỉ cần mã." |
| 0:55 | Tab **Bản đồ**: bấm "+ Thêm" 3 quán ở cột gợi ý. Chỉ cho mọi người thấy **avatar bạn** hiện trên ghim/thẻ khi bạn xem cùng quán, và **con trỏ** của bạn (nếu bạn dùng laptop). | "Mọi người đang nhìn cùng một chỗ." |
| 1:10 | Tab **Quán** → banner "Hoà điểm" → **Chọn hộ** → **Quẹt thẻ** → **Bắt đầu phiên quẹt**. Cả hai quẹt: kéo thẻ, hoặc phím ← → trên laptop. Thấy "+1" bay vào thanh tiến độ khi bạn xong. | "Ai cũng có 90 giây." |
| 1:35 | Khi cả nhóm xong, chủ phòng bấm **Chốt quán được thích nhất**. | |
| 1:40 | **Reveal**: màn tối, (tab Bản đồ đang mở thì bản đồ bay tới quán), thẻ quán, nắng quét, nút. Cả **laptop và điện thoại cùng lúc**. | "Chốt!" |
| 1:50 | Bật **loa** (góc phải header trang chủ, hoặc Nhóm → Âm thanh) và phát lại bằng một lần chốt khác nếu còn thời gian; bấm **Thêm vào lịch** / **Đường đi**. | "Có lịch, có đường đi. Đi thôi." |

## Nếu có sự cố

- **Bản đồ trắng/xám**: mạng chậm → cứ cuộn tiếp, poster tĩnh vẫn kể đủ 5 cảnh. Không F5 giữa chừng.
- **Bạn không vào được phòng**: đọc mã to cho bạn nhập tay ở "Nhập mã".
- **Điện thoại không nhận reveal**: kiểm tra chấm "Trực tiếp" ở header (WS). Mất kết nối thì app tự nối lại;
  reveal không phát lại sau khi tải lại trang (cố ý), nên kể tiếp từ thẻ "Đã chốt" trên danh sách.
- **Hết 90 giây trước khi bạn quẹt xong**: banner hết giờ có nút **Chốt quán được thích nhất** cho chủ phòng.
- **Máy yếu, phim giật**: app tự hạ mức `lite` sau 2 s dưới 40 fps. Muốn chắc: thêm `?motion=lite` vào URL trang chủ.

## Gỡ lỗi nhanh (không dùng khi demo)

`?motion=slow` (chậm ×4) · `?motion=off` (bản tĩnh) · `?motion=lite`. Dev: `window.__stageLab.revealPlace(id)`
phát lại reveal; console lọc `[stage]`.
