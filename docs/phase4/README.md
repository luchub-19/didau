# Giai đoạn 4: "Sân khấu" (cách làm cho mỗi session)

Mỗi session CLI làm **đúng 1 task**, bàn giao qua `docs/phase4/PROGRESS.md`. Kế hoạch tổng: `docs/phase4/PLAN.md`
(đọc theo mục). Luật thiết kế: `docs/phase4/DESIGN.md` (T-58 viết) cho vùng **Stage**; `docs/phase3/DESIGN.md` vẫn là
luật của vùng **Operate**. Không đọc `docs/TASKS.md`, `docs/PROGRESS.md`, `docs/ARCHITECTURE.md` (lưu trữ, rất dài).

## Bắt đầu
1. Làm trên nhánh `stage/redesign` (`git switch stage/redesign`); mọi task giai đoạn 4 commit vào nhánh này.
2. Đọc `docs/phase4/PROGRESS.md`. Lấy task đầu tiên còn `TODO` có phụ thuộc đã `DONE` và cổng đã qua.
   Cổng chưa qua → **dừng, hỏi người dùng**.
3. Đổi trạng thái sang `DOING` + 8 ký tự đầu session id.
4. Đọc `docs/phase4/tasks/T-xx.md`, rồi chỉ các mục PLAN/DESIGN mà file đó ghi (Grep heading rồi Read offset/limit).
5. Đọc code thật trong "Được phép tạo/sửa" trước khi viết. Sửa file Stage thì skill `didau-stage` (T-58 tạo) áp dụng;
   sửa file Operate thì `didau-ui` áp dụng.

## Nhịp nhanh (khác giai đoạn 3)
- Task to hơn (1 buổi), không bắt buộc session reviewer riêng; người dùng tự xem ảnh/video ở cổng.
- Vẫn bắt buộc: build/test xanh, PROGRESS ≤6 dòng, commit 1 lần `feat(T-xx): …`, không push nếu người dùng chưa bảo.
- Được thêm đúng các dependency mà task ghi; ghi phiên bản vào PROGRESS.

## Vòng làm UI (bắt buộc với mọi task có giao diện)
1. Chạy `cd frontend && VITE_ENABLE_MOCK=true npm run dev`.
2. Claude in Chrome: chụp **1280px và 1440px** (demo laptop) + **390px** (phải dùng được), VI và EN, sáng (tối nếu task ghi).
3. Tự chấm theo DESIGN mới (thứ bậc, nhịp, có hiệu ứng thừa không), sửa ≥3 lỗi rõ nhất, chụp lại.
4. Với chuyển động: quay GIF ngắn (`gif_creator`) vào `docs/phase4/screens/`; thử `?motion=slow` và `?motion=off`.
5. Không chạy được Chrome → ghi "chưa kiểm tra trực quan" trong PROGRESS, **không** báo là đã kiểm tra.

## Lệnh kiểm tra (xanh trước khi DONE)
```bash
cd frontend && npm run lint && npm test && npm run build
cd backend && poetry run ruff check . && poetry run pytest   # chỉ T-63 (đụng backend)
```

## Kết thúc session
1. Mọi tiêu chí trong file task pass; thiếu thì giữ `DOING`, ghi rõ còn gì.
2. Cập nhật dòng task trong PROGRESS (đã làm + số test; quyết định/lệch; việc task sau cần biết). Chi tiết dài ghi vào
   mục "Nhật ký" cuối file task.
3. Commit 1 lần. Context gần 200k mà chưa xong: dừng ở trạng thái xanh, ghi tiến độ dở (giữ `DOING`).

## Câu lệnh gợi ý cho người dùng
Mở session mới trong thư mục dự án và gõ:
```
Làm task tiếp theo của giai đoạn 4 theo docs/phase4/README.md.
```
Muốn chỉ định: `Làm T-60 theo docs/phase4/README.md.` Hai task độc lập (T-60, T-62) có thể chạy song song ở hai
worktree, mỗi session một task, rồi gộp vào `stage/redesign`.
