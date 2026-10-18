# Đi Đâu — hướng dẫn cho mỗi session AI

Mỗi session CLI làm **đúng 1 task** (T-xx), rồi bàn giao qua file tiến độ của giai đoạn. Session sau không nhớ gì
ngoài repo, nên mọi quyết định phát sinh phải ghi vào docs, không chỉ nói trong chat.

## Giai đoạn hiện tại: 3, làm lại giao diện + song ngữ VI/EN (T-38 → T-55)
**Đọc `docs/phase3/README.md` trước tiên**: thứ tự task, cổng chờ người dùng, luật riêng, cách bàn giao.
Mỗi task là một file nhỏ `docs/phase3/tasks/T-xx.md` ghi rõ cần đọc gì; tiến độ ở `docs/phase3/PROGRESS.md`.
Trong giai đoạn 3 **không đọc** `docs/TASKS.md`, `docs/PROGRESS.md`, `docs/ARCHITECTURE.md` (lưu trữ giai đoạn 1–2,
mỗi file khoảng 50 KB). Skill dự án `didau-ui` (`.claude/skills/`) áp dụng khi sửa giao diện.
Người dùng bảo "review" / "kiểm tra code" → đây là session reviewer: làm theo `docs/phase3/REVIEW.md`, không nhận task mới.

Giai đoạn 1–2 (T-01 → T-37) đã DONE; lịch sử ở `docs/PROGRESS.md`, chi tiết task ở `docs/TASKS.md`.

## Bắt đầu session
1. Đọc file tiến độ của giai đoạn hiện tại. Nếu người dùng không chỉ định task, lấy task **đầu tiên còn TODO**
   theo thứ tự làm, với điều kiện mọi task phụ thuộc đã DONE và cổng (nếu có) đã qua.
2. Đổi trạng thái task sang `DOING` + mã session (8 ký tự đầu session id).
3. **Chỉ đọc những gì file task ghi.** Đọc theo mục (dùng Grep tìm heading rồi Read với offset/limit), không đọc cả file.
4. Đọc code thật trong danh sách "Được phép tạo/sửa" của task trước khi viết.

## Luật
- Chỉ sửa file trong "Được phép tạo/sửa" của task. Cần sửa ngoài phạm vi thì ghi vào PROGRESS cho task sau,
  đừng tự làm.
- `docs/CONTRACTS.md` là hợp đồng. Muốn lệch khỏi nó thì thêm CR mới (CR-07…) vào `CHANGE_REQUESTS.md`
  với trạng thái PROPOSED rồi hỏi người dùng; không tự sửa contract (trừ task được giao áp CR: T-23 áp CR-02,
  T-42 áp CR-06).
- Không gọi dịch vụ trả phí. Mọi thứ Google phải sau cờ `PLACES_PROVIDER=google` và có đường lùi về OSM.
  Backend không đọc/lưu rating, review, ảnh của Google; chỉ lưu `google_place_id`.
- Test không được gọi mạng thật (mock httpx / MSW). Ngoại lệ: `scripts/build_osm_pois.py` gọi Overpass khi chạy tay.
- Khung giờ mặc định của phòng: 17:00–23:00 (`start_minute=1020`, `end_minute=1380`).
- Comment trong code: tiếng Việt. Chuỗi hiển thị cho người dùng: qua i18n, có đủ bản tiếng Việt và tiếng Anh
  (`frontend/src/i18n/locales/`), không trộn ngôn ngữ (luật chi tiết: `docs/phase3/DESIGN.md` §9). Code chưa
  chuyển sang i18n vẫn còn chuỗi tiếng Việt hardcode cho đến khi task của nó làm.

## Lệnh kiểm tra (phải xanh trước khi DONE)
```bash
cd backend && poetry run ruff check . && poetry run pytest
cd frontend && npm run lint && npm test && npm run build
```
Test tích hợp backend dùng Postgres thật qua `DATABASE_URL` (mặc định `localhost:5432/didau`): chạy
`docker compose up -d db` trước. Nếu không bật được DB, ghi rõ trong PROGRESS là test tích hợp **chưa chạy**,
không được báo là pass.

## Kết thúc session (bàn giao)
1. Mọi tiêu chí trong mục "Tiêu chí hoàn thành" của task đều pass. Nếu còn thiếu, giữ `DOING` và ghi rõ còn gì.
2. Cập nhật dòng của task trong file tiến độ của giai đoạn (giai đoạn 3: `docs/phase3/PROGRESS.md`, tối đa
   6 gạch đầu dòng), chuyển sang `DONE`. Cột ghi chú phải có:
   - đã làm gì, số test;
   - **quyết định hoặc lệch khỏi plan** (kèm lý do);
   - **việc task sau cần biết** (tên hàm/endpoint mới, bẫy gặp phải).
3. Commit 1 lần cho task: `feat(T-xx): <tóm tắt>`. Không push trừ khi người dùng bảo.
4. Nếu context gần 200k mà task chưa xong: dừng ở trạng thái build/test xanh, ghi tiến độ dở vào PROGRESS
   (giữ `DOING`) để session sau làm tiếp.

## Việc của người (session không tự làm được)
Cần trước khi test thật chế độ Google (T-26, T-28, T-37); các session khác cứ dùng mock:
- Tạo project Google Cloud, gắn billing. Bật *Places API (New)*, *Maps JavaScript API*, *Places UI Kit*.
- Browser key (giới hạn referrer: domain Vercel + `localhost`), server key (chỉ Places API (New)).
- Quota/ngày: Places UI Kit ≤300, Autocomplete ≤300, Text Search ≤1000; budget alert $1.
- Đặt `VITE_GOOGLE_MAPS_BROWSER_KEY` (Vercel) và `GOOGLE_MAPS_SERVER_KEY`, `PLACES_PROVIDER=google` (Render).
