# Prompt cho từng session giai đoạn 6

Mỗi task = **một session mới** (mở `claude` mới hoặc `/clear`), chọn model/effort **trước** khi dán prompt
(`/model` → chọn model → chọn effort). Session tự đọc `CLAUDE.md` nên prompt chỉ cần nói task nào + bẫy riêng.
Chạy song song: mỗi session một worktree (`claude --worktree` hoặc `git worktree add`), gộp về `main` theo thứ tự xong.

## Đoạn chung (dán cuối mọi prompt task)
```
Quy trình: theo CLAUDE.md mục "Bắt đầu session" và "Kết thúc session". Chỉ đọc những gì file task ghi, đọc theo mục.
Chỉ sửa file trong "Được phép tạo/sửa"; cần sửa ngoài phạm vi thì làm tối thiểu và ghi lý do vào PROGRESS.
Trước khi DONE: chạy đủ lệnh kiểm tra trong CLAUDE.md (backend cần `docker compose up -d db`; không bật được thì ghi rõ
"test tích hợp chưa chạy"). Tiêu chí nào chưa đạt/chưa kiểm thì ghi rõ, không báo pass. Ghi PROGRESS ≤6 gạch đầu dòng,
chi tiết vào Nhật ký cuối file task. Commit 1 lần `feat(T-xx): ...`, không push.
```

## G1 — ghi nhận duyệt (Sonnet 5.5 · low, ~15k)
Làm sau khi bạn đọc xong tài liệu. Sửa chữ trong ngoặc theo ý bạn.
```
Tôi đã duyệt cổng G1 giai đoạn 6. Ghi nhận:
- CR-10, CR-11, CR-12, CR-13, CR-14: APPROVED (2026-11-xx) — đổi trạng thái trong docs/CHANGE_REQUESTS.md, chưa áp vào CONTRACTS (task áp sẽ làm).
- Câu hỏi mở G1: #1 (a), #2 (a), #3 (a).   ← sửa nếu chọn khác
- (Ghi thêm góp ý của tôi nếu có: ...)
Cập nhật docs/phase6/PROGRESS.md (cổng G1 = QUA + ngày, câu trả lời), sửa DESIGN/PLAN nếu góp ý làm đổi luật.
Không đổi code. Commit `docs(phase6): qua cong G1`, không push.
```

---

## Mạch A — Lịch chung

### T-77 · Sonnet 5.5 · medium
```
Làm T-77 (docs/phase6/tasks/T-77.md): form tạo phòng gọn + chip khung giờ trên thanh đỉnh.
Lưu ý:
- Ngân sách chỉ ẨN bằng hằng SHOW_BUDGET_IN_CREATE = false; giữ BudgetChips/budgetLimitFor. OriginPicker/locateOnce xoá
  nếu grep không còn nơi gọi — ghi vào PROGRESS là T-88 sẽ cần lại hàm định vị.
- formatTimeWindow theo DESIGN §2 (EN "6 – 10 PM"); đừng dùng useMinuteFormat (luôn 'vi').
- Kiểm phòng không budget_limit/không origin trong phòng vẫn đúng (chỉ xác nhận, lệch thì ghi PROGRESS).
<đoạn chung>
```

### T-78 · Sonnet 5.5 · high
```
Làm T-78 (docs/phase6/tasks/T-78.md): room/calendar.ts + sửa lỗi PUT /schedule xoá ghi chú + áp CR-10.
Lưu ý:
- Đọc PLAN gđ6 §2 về lỗi mất note trước. Mọi payload bulk phải qua toBulkPayload() và luôn kèm note; sửa cả chỗ gọi
  trong ScheduleTimeline để lỗi hết ngay.
- MSW PUT phải mô phỏng đúng backend (thiếu note → null) để test bắt được lỗi.
- layoutColumns kiểu Google Calendar: test kỹ chuỗi A∩B, B∩C mà A∩C rỗng.
- Chỉ áp CR-10 vào CONTRACTS nếu PROGRESS ghi G1 đã duyệt CR-10.
<đoạn chung>
```

### T-79 · Opus 5.5 · high
```
Làm T-79 (docs/phase6/tasks/T-79.md): CalendarColumn — lưới, ô quán, di + kéo dãn, bàn phím.
Lưu ý:
- Kéo thả tự viết bằng Pointer Events (setPointerCapture, nghe window), trong lúc kéo chỉ đổi transform qua rAF, thả mới
  gọi moveItems. Snap theo vị trí con trỏ trừ độ lệch chỗ cầm, có tính scrollTop của cột.
- Remote SCHEDULE_UPDATED tới ô đang kéo thì hoãn tới khi thả.
- Để sẵn prop onOpenItem(itemId, anchorRect) và onExternalDrop cho T-80/T-81, ghi chữ ký vào PROGRESS.
- Kiểm bằng Chrome headless + CDP + MSW ở 1440/1100/390 như các task gđ5, ghi cái gì chưa kiểm được.
<đoạn chung>
```

### T-80 · Opus 5.5 · high
```
Làm T-80 (docs/phase6/tasks/T-80.md): kéo quán đã chốt từ cột trái sang lịch (+ ngăn kéo 1024–1279, khay mobile).
Lưu ý:
- Cột trái có `contain: layout` (T-67) → bóng kéo phải portal ra body.
- Một quán một mục: kéo quán đã xếp = dời mục cũ, không nhân bản.
- Thả gần cuối khung lùi giờ bắt đầu; khung < 60' thì lấp khung.
- Mobile: nhấn giữ 350 ms, touch-action: none chỉ trên phần tử đã nhấc; luôn có đường không kéo ("Thêm vào lịch").
<đoạn chung>
```

### T-81 · Sonnet 5.5 · high
```
Làm T-81 (docs/phase6/tasks/T-81.md): popup thông tin ô quán ↔ popup sửa giờ + ghi chú.
Lưu ý:
- Popup neo BÊN TRÁI ô (cột lịch ở mép phải), tự lật/dịch trong viewport; <1024 là Sheet. Chỉ một popup một lúc.
- Ô giờ tự nhập không ép 15'. Lưu qua moveItems kèm note. Ngoài khung/chồng giờ: cho lưu, chỉ nhắc.
- Esc/đóng trả focus về ô; bỏ khỏi lịch có Hoàn tác 5 s.
<đoạn chung>
```

### T-82 · Sonnet 5.5 · high
```
Làm T-82 (docs/phase6/tasks/T-82.md): xuất kế hoạch — thẻ PNG, văn bản emoji, .ics, link.
Lưu ý:
- Thẻ thuộc vùng Stage: dùng skill didau-stage, cập nhật bảng file Stage ở docs/phase4/DESIGN.md §1.
- html-to-image pin bản chính xác, chỉ import động; soát output build: entry không chứa nó.
- Chờ document.fonts.ready + decode() ảnh; mở PNG xuất ra để kiểm dấu tiếng Việt thật sự đúng.
- planText là hàm thuần; dòng 🛵/💡 chỉ có khi được truyền legs/feasibility (T-90 nối sau).
<đoạn chung>
```

### T-83 · Sonnet 5.5 · medium
```
Làm T-83 (docs/phase6/tasks/T-83.md): quả địa cầu xoay khi bản đồ 3D trang chủ đang tải.
Lưu ý:
- Vùng Stage: dùng skill didau-stage. Chỉ CSS/SVG + animation transform, không WebGL/thư viện mới.
- Hiện sau 300 ms (tải nhanh không nháy), ẩn khi ready/failed, không có ở mức static.
- Dữ liệu lục địa: Natural Earth 110m đơn giản hoá ≤3 kB gzip, tải một lần lúc làm task; không được thì vẽ cách điệu.
- Tìm nguyên nhân poster trông "mờ mờ" và ghi kết luận.
<đoạn chung>
```

---

## Mạch B — Algorithm Engine
Mọi task mạch B: **code theo `docs/phase6/ALGORITHMS.md`, không theo docx** (docx chỉ có ở máy người dùng, đã gitignore).

### T-84 · Sonnet 5.5 · high
```
Làm T-84 (docs/phase6/tasks/T-84.md): nền thời gian di chuyển thống nhất + Google computeRouteMatrix sau cờ + algo_config + fixture chung.
Lưu ý:
- Đọc ALGORITHMS §0, §2. Thống nhất HaversineTravelEstimator (30 km/h, +10' gửi xe) và TravelTimeConflictRule
  (30 km/h) về một cấu hình; test cũ đổi số thì ghi lý do. CHƯA đổi luật cảnh báo (đó là T-87).
- Google: không cờ thì không import/gọi; test mock httpx, không gọi mạng; phần tử lỗi lùi về ước lượng.
- Nếu không chắc endpoint/field mask của Routes API thì tra tài liệu chính thức (WebFetch developers.google.com), đừng đoán.
- algo-fixtures.json phải chứa ví dụ Bảo/Nam/Linh và kết quả mong đợi 57'/25'.
<đoạn chung>
```

### T-85 · Sonnet 5.5 · high
```
Làm T-85 (docs/phase6/tasks/T-85.md): backend vị trí xuất phát thành viên (CR-11), state_version (CR-13), giới hạn đề xuất (CR-14).
Lưu ý:
- Chỉ làm nếu PROGRESS ghi G1 đã duyệt CR-11/13/14; áp CR vào CONTRACTS trong task này.
- Riêng tư là tiêu chí số 1: viết test quét mọi JSON REST + WS mà thành viên B nhận, không được có origin_lat/lng của A.
- state_version tăng qua MỘT helper chung, cùng transaction với thay đổi; liệt kê mọi chỗ phát WS trước khi sửa.
- Migration có cả downgrade, chạy lên/xuống trên Postgres docker.
<đoạn chung>
```

### T-86 · Sonnet 5.5 · high (Opus nếu lần đầu ra kết quả sai fixture)
```
Làm T-86 (docs/phase6/tasks/T-86.md): ALGO-01 tâm nhóm + ALGO-02 hoà phiếu theo thời gian di chuyển (CR-12 phần 1).
Lưu ý:
- ALGORITHMS §3, §4 là đặc tả. Chọn theo TẬP với ngưỡng 2' (không sort bằng hàm so sánh có ngưỡng); test hoán vị đầu vào.
- Test đặt tên TC-01..TC-04; TC-04 phải ra Vạn Hạnh Mall, chênh 3'.
- POST /voting/resolve TRAVEL_TIME tính lại ở server, không tin số client. Phản hồi không chứa toạ độ thành viên.
- Dữ liệu tâm quận lấy một lần từ OSM, ghi nguồn + giấy phép ODbL.
<đoạn chung>
```

### T-87 · Opus 5.5 · high
```
Làm T-87 (docs/phase6/tasks/T-87.md): ALGO-03 khả thi lịch + ALGO-04 sắp xếp ưu tiên (CR-12 phần 2).
Lưu ý:
- ALGORITHMS §5, §6. Giữ hành vi CR-07 (cặp chồng giờ chỉ TIME_OVERLAP); test cũ CR-07 phải còn xanh.
- Biên giờ cao điểm theo ngày phòng (thứ Hai–Sáu); cảnh báo level WARNING, không ERROR/CRITICAL.
- GET /places mặc định giữ thứ tự cũ; chỉ ?sort=priority mới theo rank. Chọn cách phát cập nhật ưu tiên, ghi vào CR-12
  trước khi áp CONTRACTS.
- Test TC-05..TC-08 + đo ≤150 ms cho 10 thành viên × 30 quán. Nếu đổi params làm chữ FE (serverText) sai thì sửa luôn.
<đoạn chung>
```

### T-88 · Sonnet 5.5 · high
```
Làm T-88 (docs/phase6/tasks/T-88.md): FE "Xuất phát từ đâu?", widget tâm nhóm, dải "Gần cả nhóm", giới hạn đề xuất, state_version.
Lưu ý:
- DESIGN gđ6 §8: không popup tự mở, widget thu gọn mặc định, không vẽ vị trí từng người.
- WhyPanel là khung dùng chung cho T-89/T-90 — giữ API gọn (title, source, children).
- state_version: logic thuần tách riêng để test (bỏ tin cũ, nhảy cóc → đồng bộ lại).
- Hàm định vị: nếu T-77 đã xoá locateOnce thì viết lại gọn, đừng khôi phục OriginPicker.
<đoạn chung>
```

### T-89 · Sonnet 5.5 · high
```
Làm T-89 (docs/phase6/tasks/T-89.md): thẻ hoà phiếu ALGO-02 + "Vì sao?" + "Cách khác".
Lưu ý:
- Host chốt bằng một nút → POST /voting/resolve TRAVEL_TIME → giữ nguyên luồng reveal gđ4 (không sửa bên trong stage/reveal).
- "Cách khác" mở DecideModal ở bước chọn kiểu (Vòng quay/Swipe/Thang/SMART), không bỏ tính năng cũ.
- Bảng "Vì sao?" khớp fixture 57'/25'; mobile bảng cuộn ngang trong Sheet, cột tên dính.
- Ẩn chọn 6 chiến lược cũ ở form/menu; phòng mới mặc định TRAVEL_TIME.
<đoạn chung>
```

### T-90 · Opus 5.5 · high
```
Làm T-90 (docs/phase6/tasks/T-90.md): ALGO-04 sắp danh sách + nhãn; ALGO-03 dải di chuyển + cảnh báo pastel trên lịch.
Lưu ý:
- room/travel.ts phải ra đúng từng số với docs/phase6/algo-fixtures.json (cùng fixture với pytest).
- Khi kéo dùng số FE tức thì, sau PUT thay bằng feasibility của backend; không gọi API trong lúc kéo.
- Cảnh báo pastel, có chữ + icon, "Bỏ qua" theo người xem và hiện lại khi số liệu đổi; không màu đỏ.
- FE không tự sắp lại danh sách — dùng rank của server; danh sách không được nhảy khi khoá không đổi.
- Nối legs/feasibility vào planText/TripCard của T-82.
<đoạn chung>
```

---

## Chung

### T-91 · Sonnet 5.5 · medium
```
Làm T-91 (docs/phase6/tasks/T-91.md): đổi tên hiển thị sang HookupFPT.
Lưu ý:
- Grep rồi lập bảng phân loại: chữ hiển thị/xuất ra (đổi) vs định danh nội bộ (giữ — khoá localStorage, package, skill,
  tên repo). Đổi khoá localStorage = người dùng mất phiên, cấm.
- Câu i18n có tên cũ thì viết lại cho tự nhiên cả VI và EN. Không đổi tiêu đề CLAUDE.md/tài liệu nội bộ.
<đoạn chung>
```

### G2 — dùng thử (bạn tự làm)
Ghi góp ý thành danh sách đánh số rồi dán vào prompt T-92.

### T-92 · Sonnet 5.5 · medium (tách T-92b nếu góp ý G2 nhiều)
```
Làm T-92 (docs/phase6/tasks/T-92.md): đánh bóng, đo, chụp, DEMO, ALGORITHMS §11 cho báo cáo.
Góp ý G2 của tôi:
1. ...
2. ...
Lưu ý:
- Sửa góp ý trước, mỗi mục một dòng trạng thái trong PROGRESS. Góp ý lớn (đổi thiết kế) thì ghi lại, hỏi tôi, đừng tự làm.
- ALGORITHMS §11: độ phức tạp ghi đúng theo code thật, bảng TC → tên test → kết quả, tham số cuối cùng.
- Gần 180k context mà chưa xong thì dừng ở trạng thái xanh, tách T-92b.
<đoạn chung>
```
