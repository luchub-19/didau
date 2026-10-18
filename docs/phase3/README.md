# Giai đoạn 3: làm lại giao diện + song ngữ (cách làm cho mỗi session)

Mỗi session CLI làm **đúng 1 task**, bàn giao qua `docs/phase3/PROGRESS.md`. Trong giai đoạn 3 **không đọc**
`docs/TASKS.md`, `docs/PROGRESS.md`, `docs/ARCHITECTURE.md` (file lưu trữ, rất dài). Chỉ đọc đúng những gì file task ghi.

## Bắt đầu
1. Đọc `docs/phase3/PROGRESS.md` (ngắn). **Nếu có task cột Review = `CẦN SỬA`**: làm các mục CHẶN trong
   `docs/phase3/reviews/T-xx.md` trước (commit `fix(T-xx): sửa theo review`), rồi mới nhận task mới.
   Sau đó lấy task đầu tiên còn `TODO` theo bảng dưới, với điều kiện phụ thuộc đã `DONE` và cổng (nếu có) đã qua.
2. Đổi trạng thái sang `DOING` + 8 ký tự đầu session id.
3. Đọc `docs/phase3/tasks/T-xx.md` (3–5 KB), rồi **chỉ** các mục `DESIGN.md` / `PLAN.md` mà file đó liệt kê
   (Grep heading rồi Read với offset/limit).
4. Đọc code thật trong "Được phép tạo/sửa" trước khi viết. Skill dự án `didau-ui` tự nạp khi sửa UI: làm theo nó.

## Thứ tự làm
| # | Task | Tên ngắn | Phụ thuộc | Cổng |
| :-: | :--- | :--- | :--- | :--- |
| 1 | T-38 | Token, font, icon, trang mẫu | – | Người dùng duyệt ảnh trang mẫu |
| 2 | T-39 | Lõi i18n + lưới an toàn | T-38 | |
| 3 | T-40 | Bộ khung component `ui/` | T-38 duyệt, T-39 | |
| 4 | T-41 | Khung phòng + thanh tab dưới | T-40 | |
| 5 | T-42 | Backend CR-06: mã lý do/tham số | – | CR-06 = ACCEPTED |
| 6 | T-43 | FE dịch chữ từ server | T-39 (+T-42 nếu CR-06 duyệt) | |
| 7 | T-44 | Trang chủ, tạo/vào phòng | T-41 | |
| 8 | T-45 | Tab Quán + vote | T-41 | |
| 9 | T-46 | Tab Lịch + xung đột + auto-plan | T-41, T-43 | |
| 10 | T-47 | Tab Bản đồ + đánh giá | T-41, T-43 | |
| 11 | T-48 | Chọn hộ phần 1 (banner, gợi ý, phân định hoà) | T-45, T-43 | |
| 12 | T-49 | Chọn hộ phần 2 (vòng quay, quẹt, thang) | T-48 | |
| 13 | T-50 | Tab Nhóm + chia sẻ | T-41 | |
| 14 | T-51 | Độ bền, a11y, kiểm tra song ngữ | T-44 → T-50 | Người dùng duyệt bản đứng yên |
| 15 | T-52 | Nền chuyển động | T-51 duyệt | |
| 16 | T-53 | Khoảnh khắc (chốt quán, kết quả chọn hộ) | T-52 | |
| 17 | T-54 | Dark mode | T-51 | |
| 18 | T-55 | Đánh bóng, tài liệu, review cuối | tất cả | |

Nếu một cổng chưa qua (người dùng chưa duyệt, CR-06 chưa quyết): **dừng, hỏi người dùng**, không nhảy cóc trừ khi
task sau không phụ thuộc (ví dụ đang chờ CR-06 thì vẫn làm T-44, T-45, T-50 được).

## Luật riêng giai đoạn 3 (bổ sung cho `CLAUDE.md` gốc)
- Chỉ sửa file trong "Được phép tạo/sửa" của task. Cần sửa ngoài phạm vi thì ghi vào cột "Cho task sau" ở PROGRESS.
- **Không đổi logic**: store, `services/api`, `services/websocket`, `hooks/useRoom|useWebSocket` chỉ được sửa ở chỗ
  task ghi rõ (thường là bỏ chuỗi tiếng Việt, trả mã thay vì câu).
- Chữ hiển thị **luôn qua i18n** (`t('...')`), thêm khoá vào cả `vi.ts` và `en.ts`. Comment trong code vẫn tiếng Việt.
- Thêm dependency: chỉ những gói task cho phép; ghi phiên bản vào PROGRESS.
- Test cũ phải xanh. Đổi câu chữ thì sửa chuỗi mong đợi trong test ngay trong task đó, không xoá test.
- Kiểm tra trực quan bắt buộc theo `DESIGN.md` §12 (Claude in Chrome, 390px + 1280px, VI + EN, `VITE_ENABLE_MOCK=true`).
  Nếu không chạy được Chrome: ghi rõ "chưa kiểm tra trực quan" trong PROGRESS, **không** báo là đã kiểm tra.

## Session kiểm tra (reviewer)
Sau mỗi task (hoặc mỗi mốc), người dùng có thể mở một session riêng chỉ để kiểm tra code theo `docs/phase3/REVIEW.md`.
Session làm task **không** tự review mình; session reviewer **không** làm task mới.

## Lệnh kiểm tra (xanh trước khi DONE)
```bash
cd frontend && npm run lint && npm test && npm run build
cd backend && poetry run ruff check . && poetry run pytest   # chỉ khi task đụng backend (T-42)
```

## Kết thúc session
1. Mọi tiêu chí trong file task pass. Thiếu thì giữ `DOING`, ghi rõ còn gì.
2. Cập nhật dòng của task trong `docs/phase3/PROGRESS.md`: **tối đa 6 dòng** gạch đầu dòng (đã làm + số test,
   quyết định/lệch, ảnh đã chụp, cho task sau). Chi tiết dài ghi vào cuối file task (mục "Nhật ký"), không phình PROGRESS.
3. Commit 1 lần: `feat(T-xx): <tóm tắt>` (hoặc `style(T-xx)`). Không push trừ khi người dùng bảo.
4. Context gần 200k mà chưa xong: dừng ở trạng thái build/test xanh, ghi tiến độ dở vào PROGRESS (giữ `DOING`).
