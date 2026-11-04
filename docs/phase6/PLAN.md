# KẾ HOẠCH GIAI ĐOẠN 6: "LỊCH CHUNG & ALGORITHM ENGINE"

Giai đoạn 6 có hai mạch, chung một cổng duyệt:
- **A. Lịch chung (frontend):** cột Kế hoạch thành lịch kéo thả kiểu Google Calendar, popup xem/sửa, xuất kế hoạch (thẻ
  PNG, văn bản emoji, `.ics`, link), form tạo phòng gọn, chip khung giờ, quả địa cầu khi bản đồ 3D đang tải.
- **B. Algorithm Engine (backend + frontend):** 4 thuật toán trong tài liệu đồ án (môn Computational Thinking) — tâm nhóm,
  hoà phiếu theo thời gian di chuyển, sai số thời gian trên lịch, sắp xếp ưu tiên — kèm "Vì sao?" giải thích từng kết quả.
- **C.** Đổi tên hiển thị sang **HookupFPT**, đánh bóng, đo, demo.

Đặc tả thuật toán đã chốt: **`docs/phase6/ALGORITHMS.md`** (bám tài liệu gốc `docs/proposal/*.docx`, ghi rõ chỗ lệch).
Luật giao diện: `docs/phase6/DESIGN.md`. Hạn nộp > 1 tháng (người dùng, 2026-11-04) → làm đủ, không cắt phạm vi.

## 1. Quyết định đã chốt với người dùng (2026-11-04, 2 lượt hỏi, 24 câu)
**Lượt 1 (yêu cầu giao diện):**
1. Form tạo phòng: bỏ ngân sách (**chỉ ẩn ở form**, code giữ; phòng mới không có hạn mức → trong phòng chỉ hiện tổng ước
   tính) và bỏ "Nhóm hẹn nhau ở đâu?" (**chỉ ở form**: thay chip thành phố; host vẫn đặt điểm hẹn trong phòng).
2. Chip khung giờ rảnh trên thanh đỉnh: "18:00 – 22:00" / "6 – 10 PM".
3. Lịch kiểu Google Calendar ở cột phải, trục dọc từ giờ bắt đầu → kết thúc, kéo **quán đã chốt** (chính/đi kèm/dự bị) từ
   cột trái, mặc định 60', kéo dãn, bước 15'. Lịch mở ở bước ③④.
4. **Mọi thành viên** sửa được lịch, realtime, người lưu sau thắng.
5. Ô quán hiện tên + giờ; bấm → popup cạnh ô (giới thiệu, người đề xuất, thông tin, ✎) → popup sửa thay thế (tự nhập giờ,
   ghi chú, Lưu).
6. Xuất thẻ chuyến đi; trang chủ có quả địa cầu xoay khi bản đồ 3D chưa tải xong.

**Lượt 2 (sau khi đọc `docs/proposal/`):** bảng §0 trong `ALGORITHMS.md` (18 quyết định). Tóm tắt: cài hết vào repo; không
làm lịch rảnh/heatmap; vị trí = thành viên tự chia sẻ + lùi về điểm hẹn host; ETA ước lượng + Google sau cờ; hoà phiếu =
gợi ý ALGO-02, host xác nhận, cách cũ thành "Cách khác"; xe máy cho tất cả; hoà = bằng số "Muốn đi"; ALGO-03 = dải di
chuyển + cảnh báo pastel; ALGO-04 = sắp danh sách bình chọn + nhãn; ALGO-01 = widget góc bản đồ + dải "Gần cả nhóm";
giới hạn đề xuất do host đặt (mặc định 2); xuất PNG + emoji + `.ics` + link; tên **HookupFPT**; biên dự phòng theo giờ cao
điểm; có "Vì sao?"; giữ WS + `state_version`. Phân tích giao diện Wanderlog: **chỉ để báo cáo**, không đổi bố cục.

## 2. Hiện trạng (đọc code 2026-11-04)
- Cột Kế hoạch: `ScheduleTimeline.tsx` (574 dòng, danh sách dọc, HTML5 DnD không chạy trên cảm ứng, "Sửa" mở Sheet).
  Cột trái ③④: `LockedPlaces` (chính · đi kèm · liên kết dự bị); `splitLockedPlaces()` ở `room/budget.ts`.
- API lịch: `POST/PUT/DELETE /schedule`, WS `SCHEDULE_UPDATED`, auto-plan. Giờ là phút 0–1439, `start < end` (không qua
  nửa đêm — giữ).
- **Lỗi sẵn có (mất ghi chú):** backend `ScheduleItemReorderItem.note` mặc định `None`, `model_dump()` luôn có khoá → `PUT`
  ghi `note = NULL` cho mục gửi lên không kèm `note`; kiểu TS `BulkUpdateScheduleItem` không có `note` → mỗi lần "Sửa"/kéo
  thứ tự hiện tại đều xoá ghi chú. T-78 sửa + CR-10.
- Thời gian di chuyển: `ITravelTimeEstimator` + `HaversineTravelEstimator` (30 km/h, đường vòng 1,3, gửi xe 10') ở
  `domain/patterns/itinerary/travel.py`; `TravelTimeConflictRule` (30 km/h, WARNING khi khe < thời gian đi). Hai chỗ tham
  số lệch nhau.
- Hoà phiếu: Strategy pattern `domain/patterns/tie_break/` (6 chiến lược), `POST /voting/resolve`, FE `TieBlock` →
  `DecideModal` (SMART/WHEEL/SWIPE/LADDER).
- Vị trí: chỉ có `rooms.origin_lat/lng` (điểm hẹn host). Thành viên chưa có vị trí (BACKEND-NOTES gđ5 #5).
- Không có số phiên bản trạng thái trong WS; không giới hạn số quán mỗi người đề xuất.
- Trang chủ: `HeroScroll` hiện `HeroPoster` dưới bản đồ, `mapState` `loading → ready|failed`, không có chỉ báo tải.
- Tên hiển thị "Đi Đâu" ở i18n `app.name`, `index.html`, `.ics` PRODID, văn bản chia sẻ.

## 3. Nguyên tắc
- Giữ nguyên tắc gđ5 (một nút chính mỗi giai đoạn, không màn trống trông hỏng).
- **Thuật toán ở backend, thuần và có test**; FE chỉ hiển thị (ngoại lệ: bản TS ước lượng ETA để vẽ dải di chuyển khi
  kéo, dùng chung fixture với backend).
- **Hỗ trợ, không áp đặt** (tài liệu §1.3): mọi đề xuất có "Vì sao?", host xác nhận, cảnh báo không chặn thao tác.
- **Riêng tư:** không phản hồi nào chứa toạ độ của thành viên khác.
- Không gọi dịch vụ trả phí mặc định; Google sau cờ `PLACES_PROVIDER=google`, lùi về ước lượng; test không gọi mạng.
- Đổi hợp đồng chỉ qua CR đã duyệt: **CR-10 → CR-14** (PROPOSED, duyệt ở G1).
- Lịch, popup, danh sách thuộc **Operate**; thẻ chuyến đi và quả địa cầu thuộc **Stage** (`stage/`, cập nhật bảng file
  Stage ở `docs/phase4/DESIGN.md` §1).

## 4. Kiến trúc mới (tên dự kiến)
```
backend/app/
  core/algo_config.py                     # T-84 mọi tham số §2–§6 ALGORITHMS
  data/districts_{hcm,hn}.json            # T-86 tâm quận cho nhãn khu vực
  domain/patterns/itinerary/travel.py     # T-84 Leg, ước lượng thống nhất, GoogleRouteMatrixEstimator (sau cờ)
  domain/algorithms/                      # T-86/T-87 hàm thuần
    group_center.py  tie_travel.py  feasibility.py  priority.py
  domain/patterns/tie_break/implementations.py   # T-86 TravelTimeTieBreakStrategy
  services/algorithm_service.py           # T-86/T-87 ghép dữ liệu phòng → thuật toán
frontend/src/
  room/calendar.ts  room/useCalendarDrag.ts      # T-78/T-79
  room/travel.ts                                 # T-90 bản TS ước lượng (fixture chung)
  components/schedule/{CalendarColumn,CalendarEvent,CalendarItemPopover,UnscheduledTray,TravelStrip}.tsx
  components/algo/{WhyPanel,TieSuggestion,GroupCenterWidget,OriginSetting}.tsx   # T-88/T-89
  components/shell/TimeWindowChip.tsx            # T-77
  stage/card/                                    # T-82 thẻ PNG + văn bản emoji
  stage/hero/HeroGlobe.tsx                       # T-83
docs/phase6/algo-fixtures.json                   # T-84 ví dụ Bảo/Nam/Linh + ca biên, pytest và vitest cùng đọc
```

## 5. Ngân sách hiệu năng (đo cuối mỗi task, tổng kết ở T-92)
- Entry `index.js` ≤216 kB gzip (đang 201,99). Mạch A ≤+8 kB, mạch B ≤+6 kB, địa cầu ≤+3 kB. Nếu chạm trần: tải lười
  `WhyPanel`, `TieSuggestion`, popup lịch.
- `html-to-image` chỉ trong chunk thẻ (≤15 kB gzip), entry +0.
- Kéo thả 60 fps (chỉ `transform` khi kéo, ghi store khi thả). Địa cầu chỉ animation `transform`, không WebGL.
- Backend: gợi ý hoà/ưu tiên ≤150 ms với 10 thành viên × 30 quán bằng ước lượng; Google có cache, timeout 4 s.

## 6. Lộ trình
Ước lượng như gđ5 PLAN §6; nhắm ≤150k, tuyệt đối ≤250k; gần 180k chưa xong → dừng xanh, giữ `DOING`, tách T-xxb.
Task backend phải chạy `poetry run ruff check . && poetry run pytest` với Postgres docker (không chạy được thì ghi rõ).

| # | Task | Tên | Phụ thuộc | Cổng | Token | Model · effort |
| :-: | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | T-76 | Tài liệu gđ6 + đặc tả thuật toán + CR-10→14 | – | **G1** | ~150k | Opus 5.5 · high |
| **A** | | | | | | |
| 2 | T-77 | Form tạo phòng gọn + chip khung giờ | G1 | | ~80k | Sonnet 5.5 · medium |
| 3 | T-78 | `room/calendar.ts` + sửa mất ghi chú (CR-10) | G1 | | ~85k | Sonnet 5.5 · high |
| 4 | T-79 | `CalendarColumn`: lưới, ô, di + kéo dãn, bàn phím | T-78 | | ~150k | **Opus 5.5 · high** |
| 5 | T-80 | Kéo quán đã chốt từ cột trái sang lịch | T-79 | | ~140k | **Opus 5.5 · high** |
| 6 | T-81 | Popup thông tin ↔ popup sửa giờ + ghi chú | T-80 | | ~120k | Sonnet 5.5 · high |
| 7 | T-82 | Xuất: thẻ PNG + văn bản emoji + `.ics` + link | T-79 | | ~130k | Sonnet 5.5 · high |
| 8 | T-83 | Quả địa cầu khi bản đồ 3D đang tải | G1 | | ~75k | Sonnet 5.5 · medium |
| **B** | | | | | | |
| 9 | T-84 | Nền backend: ETA thống nhất + Google sau cờ + fixture + `algo_config` | G1 | | ~120k | **Opus 5.5 · high** |
| 10 | T-85 | Vị trí xuất phát thành viên (CR-11) + `state_version` (CR-13) + giới hạn đề xuất (CR-14) — backend | T-84 | | ~140k | Sonnet 5.5 · high |
| 11 | T-86 | ALGO-01 tâm nhóm + ALGO-02 hoà phiếu (CR-12 phần 1) — backend | T-85 | | ~130k | **Opus 5.5 · high** |
| 12 | T-87 | ALGO-03 khả thi lịch + ALGO-04 ưu tiên (CR-12 phần 2) — backend | T-86 | | ~130k | **Opus 5.5 · high** |
| 13 | T-88 | FE: "Xuất phát từ đâu?", widget tâm nhóm, dải "Gần cả nhóm", giới hạn đề xuất, `state_version` | T-85, T-86 | | ~130k | Sonnet 5.5 · high |
| 14 | T-89 | FE: thẻ hoà phiếu ALGO-02 + "Vì sao?" + "Cách khác" | T-86, T-88 | | ~125k | Sonnet 5.5 · high |
| 15 | T-90 | FE: ALGO-04 sắp danh sách + nhãn; ALGO-03 dải di chuyển + cảnh báo pastel trên lịch | T-87, T-81 | | ~140k | **Opus 5.5 · high** |
| **C** | | | | | | |
| 16 | T-91 | Đổi tên hiển thị sang HookupFPT | G1 | | ~60k | Sonnet 5.5 · medium |
| 17 | T-92 | Đánh bóng, đo, chụp, DEMO, tài liệu báo cáo thuật toán | tất cả | **G2** trước, **G3** sau | ~140k | Sonnet 5.5 · medium |

```
T-76 ─▶ G1 ─┬─▶ T-77 ──────────────────────────────────────────────┐
            ├─▶ T-78 ─▶ T-79 ─┬─▶ T-80 ─▶ T-81 ─┐                   │
            │                 └─▶ T-82          ├─▶ T-90 ───────────┤
            ├─▶ T-83                            │                   ├─▶ G2 ─▶ T-92 ─▶ G3
            ├─▶ T-84 ─▶ T-85 ─▶ T-86 ─▶ T-87 ───┘                   │
            │            └────────┴─▶ T-88 ─▶ T-89 ─────────────────┤
            └─▶ T-91 ──────────────────────────────────────────────┘
```
Song song an toàn (worktree riêng): mạch A và mạch B không đụng file của nhau cho tới T-90 (T-90 cần cả lịch T-81 và
backend T-87). T-77, T-83, T-91 độc lập. T-91 đụng i18n nhiều nơi → làm sớm hoặc sát cuối, tránh xung đột merge khoá i18n.

**Vì sao chọn model:** Opus cho kéo thả tự viết (T-79/T-80), nền ETA + adapter Google (T-84: chỗ mọi thuật toán dựa vào),
thuật toán có ngưỡng/không bắc cầu và riêng tư (T-86/T-87), và T-90 (ghép cảnh báo backend với dải tính tức thì ở FE khi
kéo). Sonnet high cho API/CRUD rõ ràng và component nhiều trạng thái. Sonnet medium cho form, đổi tên, địa cầu, đánh bóng.

## 7. Rủi ro và cách chặn
| Rủi ro | Chặn |
| :--- | :--- |
| `PUT /schedule` xoá ghi chú | T-78 `toBulkPayload()` luôn kèm `note`; MSW mô phỏng đúng backend; CR-10 |
| Hai người cùng kéo một ô | Bản nháp cục bộ khi kéo, hoãn `SCHEDULE_UPDATED` cho ô đó; `state_version` bỏ gói trễ (T-88) |
| Pointer bị bản đồ nuốt khi kéo xuyên cột | `setPointerCapture` + nghe `window`; bóng kéo portal ra `body` |
| Cảm ứng: kéo đè cuộn/sheet | Nhấn giữ 350 ms; `touch-action: none` chỉ trên ô đã nhấc |
| Lộ vị trí thành viên | Toạ độ chỉ trả cho chính chủ; tâm làm tròn 3 số; test riêng tư ở T-85/T-86 |
| Ước lượng ETA sai nhiều so với thực tế | Chỉnh `MOTORBIKE_KMH` bằng 5 tuyến mẫu (T-84); luôn ghi "ước lượng"; Google sau cờ |
| Google tốn tiền/quota | Cờ + cache 15' + ≤625 phần tử + timeout; chỉ gọi khi có hoà hoặc khi mở "Vì sao?"; không gọi lúc kéo |
| Ngưỡng 2' không bắc cầu → kết quả phụ thuộc thứ tự | Thuật toán chọn theo tập (ALGORITHMS §4), test hoán vị đầu vào |
| Danh sách nhảy liên tục khi sắp ưu tiên | Sắp ổn định ở server; FE không tự sắp; chỉ đổi chỗ khi khoá đổi |
| `html-to-image` thiếu font/ảnh | Chờ `fonts.ready` + `decode()`, render 2 lần trên WebKit |
| Bundle | Đo mỗi task; tải lười panel thuật toán và popup nếu cần |
| Không có jsdom | Logic thuần có test; tương tác kiểm bằng Chrome headless + CDP + MSW, ghi rõ cái chưa kiểm |

## 8. Ngoài phạm vi
- Lịch rảnh từng người, heatmap, "khung giờ vàng" (đã chốt không làm; tài liệu INPUT/OUTPUT để báo cáo).
- Socket.io và tên sự kiện `room:*` của OUTPUT (giữ WS hiện tại).
- Lịch qua nửa đêm, nhiều ngày (UI chỉ vẽ ngày 0, dòng "Ngày khác: N mục").
- Tự tìm đường (Dijkstra) trên đồ thị giao thông; P90 từ dữ liệu lịch sử thật.
- Đổi bố cục theo Wanderlog. Đổi tên repo/package/domain (chỉ đổi tên hiển thị).
- Mục backend cũ trong `docs/phase5/BACKEND-NOTES.md` (trừ #5 điểm hẹn giữa nhóm — làm ở T-85/T-86).
