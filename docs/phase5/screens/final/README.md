# Bộ ảnh cuối giai đoạn 5 (T-75, cho cổng G3)

Chụp bằng Chrome headless (SwiftShader) + MSW, dữ liệu mock (3 quán, ngân sách 600k, điểm hẹn Q1). Bản đồ là OpenFreeMap thật. Ảnh quán là **minh hoạ danh mục**
(chưa có ảnh tuyển chọn thật). Dữ liệu dựng bằng cách đặt state store (như T-66/T-69): người dùng thật sẽ đi qua nhiều bước hơn.
Tên tệp: `<màn>-<rộng>-<sáng|tối>-<ngôn ngữ>.webp`. Mỗi cặp dùng **sáng + VI** và **tối + EN** (hai ngôn ngữ × hai giao diện đều có mặt).

| Màn | 1440 | 500 |
| :--- | :--- | :--- |
| ① `gather` Tìm quán | `gather-1440-light-vi` · `gather-1440-dark-en` | `gather-500-light-vi` · `gather-500-dark-en` |
| ② `vote` Bình chọn | `vote-1440-*` | `vote-500-*` |
| ② `tie` Hoà phiếu | `tie-1440-*` | `tie-500-*` |
| ③ `lock` Chốt kèo | `lock-1440-*` | `lock-500-*` |
| ④ `send` Gửi lịch (mobile = tab Kế hoạch) | `send-1440-*` | `send-500-*` |
| Tạo phòng (một màn) | `create-1440-*` | `create-500-*` |
| Chi tiết quán (panel / toàn màn) | `detail-1440-*` | `detail-500-*` |

GIF: `flow-4-steps-1440.gif` (đổi 5 giai đoạn trên desktop, chuyển động bật) · `flow-mobile-explore-detail-vote-500.gif` (khám phá → mở chi tiết → ♥ Muốn đi).
Banner "Mất kết nối" (mock không có WS) và màn reveal "Chốt!" được ẩn/đóng trước khi chụp để thấy bố cục.
Chưa chụp: reveal và dải "Hợp giờ" có thẻ (cần POI trùng quán tuyển chọn), ảnh quán thật.
