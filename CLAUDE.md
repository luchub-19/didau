# Đi Đâu — hướng dẫn cho mỗi session AI

Mỗi session CLI làm **đúng 1 task** (T-xx), rồi bàn giao qua `docs/PROGRESS.md`. Session sau không nhớ gì
ngoài repo, nên mọi quyết định phát sinh phải ghi vào docs, không chỉ nói trong chat.

## Bắt đầu session
1. Đọc `docs/PROGRESS.md`. Nếu người dùng không chỉ định task, lấy task **đầu tiên còn TODO** theo
   "Thứ tự làm" ở dưới, với điều kiện mọi task phụ thuộc đã DONE.
2. Đổi trạng thái task sang `DOING` + mã session (8 ký tự đầu session id).
3. **Chỉ đọc những gì cột "Đọc" ghi.** Không đọc toàn bộ `docs/`, vì riêng docs đã khoảng 185 KB.
   Đọc theo mục (dùng Grep tìm heading rồi Read với offset/limit), không đọc cả file.
4. Đọc code thật trong danh sách "Được phép tạo/sửa" của task trước khi viết.

## Thứ tự làm (giai đoạn 2, tuần tự 1 session/lần)
| # | Task | Đọc (ngoài mục T-xx trong `docs/TASKS.md` mục 3) |
| :-: | :--- | :--- |
| 1 | T-23 | CR-02 trong `CHANGE_REQUESTS.md`; `CONTRACTS.md` mục 1, 2, 3.3, 4, 5 |
| 2 | T-34 | Plan mục 5; `conflict_rule/implementations.py` |
| 3 | T-30 | Plan mục 4 |
| 4 | T-24 | `CONTRACTS.md` (đã có CR-02) mục 3, 4, 6 |
| 5 | T-25 | Plan mục 2.1, 3.2 |
| 6 | T-35 | Plan mục 5; `CONTRACTS.md` mục auto-plan |
| 7 | T-27 | Plan mục 3 |
| 8 | T-36 | Plan mục 5.1 |
| 9 | T-28 | Plan mục 2.3, 3 |
| 10 | T-31 | Plan mục 4; `CONTRACTS.md` mục decisions + WS |
| 11 | T-32 | Plan mục 4 |
| 12 | T-29 | Plan mục 6 |
| 13 | T-26 | Plan mục 2.3, 3.3 |
| 14 | T-33 | Plan mục 4.2 |
| 15 | T-37 | Plan mục 3.3, 7; `DEPLOY.md` |

Sau bước 8 là đã có bản demo P0: map, thêm quán và tự lên lịch.

"Plan" = `docs/PLAN_MAP_DECIDE_AUTOPLAN.md`. Ranh giới file và tiêu chí xong của từng task nằm ở `docs/TASKS.md` mục 3.

## Luật
- Chỉ sửa file trong "Được phép tạo/sửa" của task. Cần sửa ngoài phạm vi thì ghi vào PROGRESS cho task sau,
  đừng tự làm.
- `docs/CONTRACTS.md` là hợp đồng. Muốn lệch khỏi nó thì thêm CR mới (CR-03…) vào `CHANGE_REQUESTS.md`
  với trạng thái PROPOSED rồi hỏi người dùng; không tự sửa contract (trừ T-23 áp CR-02).
- Không gọi dịch vụ trả phí. Mọi thứ Google phải sau cờ `PLACES_PROVIDER=google` và có đường lùi về OSM.
  Backend không đọc/lưu rating, review, ảnh của Google; chỉ lưu `google_place_id`.
- Test không được gọi mạng thật (mock httpx / MSW). Ngoại lệ: `scripts/build_osm_pois.py` gọi Overpass khi chạy tay.
- Khung giờ mặc định của phòng: 17:00–23:00 (`start_minute=1020`, `end_minute=1380`).
- Chuỗi hiển thị cho người dùng và comment trong code: tiếng Việt, giống code hiện có.

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
2. Cập nhật dòng của task trong `docs/PROGRESS.md`, chuyển sang `DONE`. Cột ghi chú phải có:
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
