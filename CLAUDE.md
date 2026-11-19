# Đi Đâu — hướng dẫn cho mỗi session AI

Mỗi session CLI làm **đúng 1 task** (T-xx), rồi bàn giao qua file tiến độ của giai đoạn. Session sau không nhớ gì
ngoài repo, nên mọi quyết định phát sinh phải ghi vào docs, không chỉ nói trong chat.

## Giai đoạn 8 "Vì sao? cho buổi demo" (T-106 → T-109) — G1 QUA 2026-11-19; trình bày thứ Hai 2026-11-23
Làm "Vì sao?" của thẻ hoà cho thầy thấy ý đồ OMP (công bằng cho người ở xa) trong ≤ 3′ chiếu laptop, không làm rối màn mặc định.
- Plan, quyết định (13 mục), lý do tâm lý/sắp xếp, đặc tả panel: `docs/phase8/PLAN.md`. Tiến độ: `docs/phase8/PROGRESS.md`.
- **Bẫy:** ca demo cũ (genz, omp) có OMP = cộng tổng km → T-106 phải dò ca mới trên km Valhalla. Thẻ đề xuất giữ nguyên;
  không tầng 3, không hiện Ψ/trọng số; không vẽ gì từ nhà người khác (CR-11). CR-19 APPROVED (áp ở T-107).

## Giai đoạn 7 "Thuật toán OMP của Sơn" (T-93 → T-97 MVP) — T-93 XONG, G1 QUA 2026-11-15; hạn MVP thứ Hai 2026-11-16
Thay ALGO-02 bằng Ordered Median (OMP) của Sơn (nhánh orphan `origin/feat/tie-breaker` — đọc bằng `git show`, KHÔNG merge),
giải bằng DP; km từ Valhalla tự host (xe máy) + cache DB, lùi về ước lượng; vẽ đường của mình + đường giữa các quán.
- Quyết định (18 mục), lệch có chủ ý ở MVP, câu hỏi UI: `docs/phase7/PLAN.md`. Tiến độ: `docs/phase7/PROGRESS.md`.
- **Đặc tả đã chốt: `docs/phase7/ALGORITHMS.md`** (thay `docs/phase6/ALGORITHMS.md` §4; §1–§3, §5–§6 gđ6 vẫn dùng).
- **Bẫy:** không gì tự động — mọi đề xuất chỉ host xác nhận; chồng/thiếu giờ chỉ cảnh báo. Hoà = bằng ĐIỂM theo từng loại
  quán. Không bao giờ trả đường/km xuất phát từ nhà người khác (CR-11). T-96 không tự chọn UI khi PLAN §5 chưa được trả lời.
- Dữ liệu quán + bản đồ kiểu Google Maps (T-100 → T-103, CR-17 A + B APPROVED; T-102 xong: tìm Postgres `pg_trgm` + "Xem N chi nhánh"): `docs/phase7/MAP-POI.md`. Chỉ ẩn POI nền nhóm mình
  thay thế; quán chưa tới `minzoom` hiện chấm nhỏ không chữ; Overture `confidence ≥ 0,7`; mall/siêu thị/rạp/công viên được bình chọn (chốt 2026-11-15).
- Lớp quán trên bản đồ (T-101 xong): 3 lớp symbol trong `PoiLayer.ts`, luôn bảng màu sáng cả theme tối. Lỗi dữ liệu quán → T-104.
- Tên hiển thị: **Hangoutplanner** (T-98 xong) — logo dùng `components/shell/Wordmark.tsx` (`<Wordmark />`, ô `variant="mark"`), không tự viết tên.

## Giai đoạn 6 "Lịch chung & Algorithm Engine" (T-76 → T-92) — XONG (T-92 đóng 2026-11-14), G2/G3 chưa có góp ý
Mạch A (FE): lịch kéo thả kiểu Google Calendar ở cột Kế hoạch, popup xem/sửa giờ + ghi chú, xuất kế hoạch (PNG, văn bản
emoji, `.ics`, link), form tạo phòng bỏ ngân sách + điểm hẹn, chip khung giờ, quả địa cầu khi bản đồ 3D đang tải.
Mạch B (backend + FE): Algorithm Engine theo tài liệu đồ án `docs/proposal/` — ALGO-01 tâm nhóm, ALGO-02 hoà phiếu theo
thời gian di chuyển, ALGO-03 sai số thời gian trên lịch, ALGO-04 sắp xếp ưu tiên, kèm "Vì sao?". Tên hiển thị: HookupFPT.
- Tiến độ, cổng G1/G2/G3, việc của người: `docs/phase6/PROGRESS.md`. Lộ trình + model/effort: `docs/phase6/PLAN.md` §6.
- **Đặc tả thuật toán đã chốt (code theo file này, không theo docx): `docs/phase6/ALGORITHMS.md`.**
- Luật giao diện gđ6 (ghi đè gđ5 §4/§8/§9): `docs/phase6/DESIGN.md`. File task: `docs/phase6/tasks/T-xx.md`.
- CR-10 → CR-14 đã APPROVED (G1, 2026-11-04); task backend áp theo task ghi trong CR.
- **Bẫy:** `PUT /schedule` thiếu `note` = xoá ghi chú (CR-10) — payload bulk phải đi qua `toBulkPayload()`.
  Không phản hồi nào được chứa toạ độ của thành viên khác (CR-11).

## Giai đoạn 5 "Không gian phòng" (T-65 → T-75) — T-75 XONG, CHỜ CỔNG G2/G3 của người dùng
Thiết kế lại trang phòng: desktop 3 cột (danh sách | bản đồ | kế hoạch), mobile 2 tab, bố cục đổi theo giai đoạn
(tìm quán → bình chọn → chốt → gửi lịch), trang chi tiết quán có ảnh/giới thiệu, ngân sách cả buổi, avatar hoạt hình.
**Chỉ frontend**; việc backend ghi ở `docs/phase5/BACKEND-NOTES.md`, không tự làm.
T-65 → T-75 đều DONE (T-75: 2026-11-01, số đo ở `docs/phase5/DESIGN.md` §13, demo `docs/phase5/DEMO.md`, ảnh `docs/phase5/screens/final/`).
Còn mở: G2 (dùng thử) + G3 (duyệt ảnh/demo), CLS khi giai đoạn đổi do máy khác chưa đạt, danh sách "Chưa làm/chưa kiểm" ở PROGRESS dòng T-75.
- Tiến độ, cổng G1–G3, việc của người: `docs/phase5/PROGRESS.md`. Lộ trình + model/effort + ước lượng token: `docs/phase5/PLAN.md` §6.
- Luật giao diện gđ5 (ghi đè bố cục của gđ3): `docs/phase5/DESIGN.md`. Mock: `docs/phase5/mock/*.dc.html` (chỉ bố cục).
- File task: `docs/phase5/tasks/T-xx.md`. Bàn giao vào `docs/phase5/PROGRESS.md` (tối đa 6 gạch đầu dòng).

## Giai đoạn 4 "Sân khấu" (T-58 → T-64) — ĐÃ HOÀN THÀNH (DONE, cổng G3 qua 2026-10-28)
Trang chủ điện ảnh (bản đồ 3D TP.HCM) + khoảnh khắc trong phòng (quẹt thẻ, reveal chốt quán, chuyển tab, hiện diện).
Tiến độ: `docs/phase4/PROGRESS.md`; luật Stage: `docs/phase4/DESIGN.md` (số đo cuối ở §6);
kịch bản demo: `docs/phase4/DEMO.md`. Nhánh `stage/redesign` đã gộp vào `main` (cùng commit 8653477, 2026-11-01).
Việc nâng cấp để sau: mục "Nâng cấp để sau" cuối `docs/phase4/PROGRESS.md` (avatar người quẹt SWIPE, cần CR-09).

## Giai đoạn 3 (T-38 → T-55) — ĐÃ HOÀN THÀNH (DONE)
Toàn bộ các task từ T-01 đến T-55 (Giai đoạn 1, 2 và 3) đã hoàn thành, kiểm thử tự động xanh 100%.
- Lịch sử tiến độ & review Giai đoạn 3: xem `docs/phase3/PROGRESS.md` và `docs/phase3/AUDIT.md`.
- Lịch sử Giai đoạn 1–2: xem `docs/PROGRESS.md` và `docs/TASKS.md`.
- Dự án sẵn sàng cho Production Deployment hoặc các giai đoạn mở rộng tiếp theo theo yêu cầu của người dùng.
- Sau giai đoạn 3 (2026-10-18): CR-05 đã áp vào CONTRACTS §3.3 (mục 28–32); kiểm tra trực quan
  `docs/phase3/reviews/VISUAL-QA-2026-10-18.md`, T-56 đã sửa V1/V3/V4/V5/V7.
- **Việc mở**: không còn lỗi VISUAL-QA mở (CR-07 sửa V2, T-57 sửa V6/V8). Xem mục "Việc mở sau T-56"
  trong `docs/phase3/PROGRESS.md`.

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
2. Cập nhật dòng của task trong file tiến độ của giai đoạn (giai đoạn 5: `docs/phase5/PROGRESS.md`, tối đa
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
