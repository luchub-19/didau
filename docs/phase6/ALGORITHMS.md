# ĐẶC TẢ ALGORITHM ENGINE (giai đoạn 6)

Nguồn: `docs/proposal/HangoutplannerFPT_Algorithm_Engine_Proposal.docx` (ALGO-01 → ALGO-04),
`docs/proposal/Tài liệu liên quan đến đồ án/{INPUT,OUTPUT}.docx`. File này là **bản đã chốt để code**: chỗ nào khác tài
liệu gốc là quyết định của người dùng (2026-11-04) hoặc do giới hạn dự án, có ghi lý do. Code theo file này, không theo
docx. Tham số có tên `UPPER_CASE` nằm trong một file cấu hình backend (`app/core/algo_config.py`), đổi thì ghi PROGRESS.

## 0. Quyết định đã chốt (2026-11-04)
| # | Câu hỏi | Chốt |
| :-: | :--- | :--- |
| 1 | Ai cài Algorithm Engine | Cài hết vào repo này (backend Python + FE) |
| 2 | Lịch rảnh từng người / heatmap | **Không làm.** Host nhập một khung giờ khi tạo phòng (như hiện tại) |
| 3 | Vị trí xuất phát | **Cả hai:** thành viên tự chia sẻ (tuỳ chọn); ai không chia sẻ thì lấy điểm hẹn của host |
| 4 | Nguồn thời gian di chuyển | Ước lượng Haversine (mặc định, miễn phí) + Google `computeRouteMatrix` sau cờ, lùi về ước lượng |
| 5 | Kết quả hoà phiếu | **Gợi ý, host xác nhận** |
| 6 | Cách chọn hộ cũ | ALGO-02 mặc định; Vòng quay/Swipe/Thang/SMART còn ở "Cách khác"; 6 chiến lược cũ ẩn khỏi form |
| 7 | Phương tiện | Xe máy (`TWO_WHEELER`) cho tất cả |
| 8 | Định nghĩa hoà | Bằng số **"Muốn đi"** (upvote) ở hạng đầu; >3 quán hoà thì xét tất cả |
| 9 | Chia sẻ vị trí | Trong phòng (menu avatar "Xuất phát từ đâu?") + nhắc nhẹ một lần khi có hoà |
| 10 | ALGO-03 trên lịch | Dải di chuyển giữa 2 ô + cảnh báo pastel + "Bỏ qua"; không chặn, không tự đẩy giờ |
| 11 | ALGO-04 áp vào | Danh sách bình chọn (bước ②) + nhãn; menu ⋯ vẫn đổi được sang "Theo phiếu" |
| 12 | ALGO-01 hiển thị | Widget góc bản đồ (thu gọn) + dải "Gần cả nhóm" khi ≥2 vị trí |
| 13 | Giới hạn đề xuất quán | Host đặt, mặc định 2 quán/người |
| 14 | Xuất | Thẻ PNG + văn bản emoji + `.ics` + link phòng |
| 15 | Tên hiển thị | **HookupFPT** (giao diện, thẻ, văn bản chia sẻ, `.ics`) |
| 16 | Biên dự phòng ALGO-03 | Theo giờ cao điểm (§5) |
| 17 | Phục vụ báo cáo | Phần **"Vì sao?"** trong app cho từng kết quả thuật toán |
| 18 | Realtime | Giữ WebSocket hiện tại, thêm `state_version` chống gói trễ |

Lệch khỏi tài liệu gốc có chủ ý: không có heatmap/khung giờ vàng (câu 2); không có T90 thật mà dùng biên ước lượng có
nhãn (tài liệu cho phép, §1.2 ALGO-03); Google sau cờ vì luật dự án cấm gọi dịch vụ trả phí mặc định.

## 1. Dữ liệu vào
- **Vị trí xuất phát thành viên** (CR-11): `members.origin_lat/origin_lng` (nullable). Chỉ chính người đó đọc được toạ
  độ của mình; người khác chỉ thấy `has_origin: bool`. Xoá = gửi `null`.
- `origin(member) = member.origin ?? room.origin (điểm hẹn host) ?? None`, kèm `origin_source: MEMBER | MEETING_POINT`.
  Thành viên `None` bị loại khỏi phép tính và đếm vào `excluded_member_count`.
- Khung giờ phòng: `room.start_minute/end_minute`, ngày `room.event_date` (để biết ngày thường/cuối tuần).
- Thời lượng mặc định một hoạt động: `DEFAULT_ACTIVITY_MIN = 60` (khớp mặc định thả vào lịch).

## 2. Thời gian di chuyển (dùng chung cho ALGO-02/03/04)
Mở rộng `ITravelTimeEstimator` (`domain/patterns/itinerary/travel.py`) thành `leg(a, b, depart_at) -> Leg {minutes,
distance_km, source: ESTIMATE | GOOGLE}`. Một chỗ cấu hình duy nhất; `TravelTimeConflictRule` (30 km/h) và
`HaversineTravelEstimator` (30 km/h, đường vòng 1,3, gửi xe 10') hiện lệch nhau → thống nhất về bảng dưới.

| Tham số | Mặc định | Ghi chú |
| :--- | :--- | :--- |
| `DETOUR_FACTOR` | 1,3 | đường thực / chim bay |
| `MOTORBIKE_KMH` | 25 | xe máy nội thành TP.HCM; chỉnh sau khi so 5 tuyến mẫu với Google Maps (ghi kết quả) |
| `BUFFER_MIN` | 5 | gửi xe, đi bộ, ổn định (T_buffer) — **không** cộng vào `minutes` |

- Ước lượng: `minutes = ceil(haversine_km × DETOUR_FACTOR / MOTORBIKE_KMH × 60)`, `distance_km = haversine × DETOUR`.
- Google (khi `PLACES_PROVIDER=google` + `GOOGLE_MAPS_SERVER_KEY` có Routes API): `computeRouteMatrix`,
  `travelMode=TWO_WHEELER`, `routingPreference=TRAFFIC_AWARE`, `departureTime` = ngày phòng + giờ. Cache theo (toạ độ làm
  tròn 3 số, đích, khung 15') 15 phút trong RAM; timeout 4 s hoặc lỗi từng phần tử → ước lượng cho phần tử đó; ≤625
  phần tử/yêu cầu. Test mock `httpx`, không gọi mạng.
- Mọi kết quả mang `source`; giao diện ghi "ước lượng" khi `ESTIMATE` (tài liệu §4.3 Giới hạn 3).
- Frontend có bản TS **chỉ phần ước lượng** (`room/travel.ts`) để vẽ dải di chuyển tức thì khi kéo; backend là nguồn
  thật cho cảnh báo. Hai bên chạy chung `docs/phase6/algo-fixtures.json` (cùng kết quả từng số).

## 3. ALGO-01 — Tâm nhóm
- Đầu vào: thành viên có `origin_source = MEMBER` (không tính điểm hẹn host — tâm là của những người thật sự chia sẻ).
  <2 người → không có tâm (widget ẩn).
- Công thức (tài liệu §1.2, radian, `w_i = 1`): `x=cosφ cosλ, y=cosφ sinλ, z=sinφ`; cộng vector;
  `λc = atan2(Y,X)`, `φc = atan2(Z, √(X²+Y²))`.
- Nhãn khu vực: bảng tâm quận/huyện đóng gói trong repo (`backend/app/data/districts_{hcm,hn}.json`, lấy một lần từ OSM,
  không gọi mạng lúc chạy). Nhãn = quận gần nhất; nếu quận thứ hai cách tâm chênh ≤1,5 km so với quận thứ nhất →
  "Q3 – Phú Nhuận".
- Quán gần tâm: POI trong bán kính `CENTER_RADIUS_KM = 2`, sắp theo Haversine (dùng `poi_service` sẵn có), tối đa 10.
- Riêng tư: phản hồi chỉ có tâm **làm tròn 3 chữ số** (~100 m), nhãn, `member_count`; không bao giờ có toạ độ thành viên.
- Phát lại khi có người đổi vị trí: WS `GROUP_CENTER_UPDATED` (CR-11).
- Độ phức tạp: O(n) tâm + O(m log m) sắp POI.

## 4. ALGO-02 — Hoà phiếu theo thời gian di chuyển
- **Kích hoạt:** ≥2 quán chưa bị loại có cùng `upvotes` lớn nhất (>0) và chưa có quán ACCEPTED (giai đoạn `tie` gđ5).
  Ứng viên = mọi quán bằng `upvotes` lớn nhất (k có thể >3).
- Ma trận `T_ij = leg(origin(i), place_j).minutes`, xuất phát lúc `room.start_minute`.
- `S_j = Σ T_ij`, `M_j = max_i T_ij`, `D_j = Σ distance_km`.
- **Chọn (thứ tự từ điển có ngưỡng, xác định):** `TIE_THRESHOLD_MIN = 2`.
  1. `C = { j : S_j ≤ min S + 2 }` (gần như bằng tổng thì xét công bằng);
  2. trong `C` chọn `M_j` nhỏ nhất; bằng nhau → `D_j` nhỏ nhất; bằng nhau → quán được thêm sớm hơn (`created_at`).
  3. Xếp hạng phần còn lại bằng cách lặp lại 1–2 trên tập còn lại.
  (Không dùng `sort` với so sánh có ngưỡng vì không bắc cầu.)
- **Đầu ra** `TieSuggestion`: `candidates[]`, `members[] {member_id, nickname, origin_source}`, `matrix[][] {minutes,
  distance_km, source}`, `ranking[] {place_id, S, M, D}`, `recommended_place_id`, `margin_vs_second_min`,
  `threshold_min`, `travel_mode`, `excluded_member_count`, `estimated: bool`. Không có toạ độ.
- Không ai có origin và không có điểm hẹn → `available: false, reason: NO_ORIGINS` (FE nhắc chia sẻ + mở "Cách khác").
- **Host xác nhận:** `POST /voting/resolve {strategy: "TRAVEL_TIME"}` — backend **tính lại** (không tin số từ client) rồi
  chốt quán đứng đầu. `TRAVEL_TIME` là `tie_break_strategy` mặc định của phòng mới (CR-12). Chiến lược cũ vẫn hợp lệ.
- Ví dụ kiểm (tài liệu §3, dùng làm fixture): Dinh Độc Lập 14/19/32 → S 65 M 32; Saigon Centre 18/14/28 → S 60 M 28;
  Vạn Hạnh Mall 12/25/20 → S 57 M 25 ⇒ đề xuất Vạn Hạnh Mall, hơn hạng 2 là 3 phút.
- Độ phức tạp: O(nk) ma trận + O(k²) chọn có ngưỡng (k nhỏ) — ghi đúng theo code, không ghi Dijkstra (ta không tự tìm đường).

## 5. ALGO-03 — Sai số thời gian di chuyển trên lịch
- Xét từng cặp mục liên tiếp cùng ngày (sắp theo giờ), `gap = start_next − end_curr`. `gap < 0` → để `TIME_OVERLAP`
  báo (CR-07 giữ nguyên). **Không** có chặng từ nhà tới điểm đầu (OUTPUT: "không tạo bước tập trung ảo").
- `eta = leg(place_curr, place_next, depart = end_curr)`.
- Biên dự phòng (thay T90 − T50, có nhãn "ước lượng"): nếu `end_curr` trong `PEAK = 16:30–19:30` **và** `event_date` là
  thứ Hai–Sáu → `margin = ceil(eta × 0,5)`; ngược lại `ceil(eta × 0,25)`; tối thiểu `MARGIN_MIN = 5`. Nguồn Google cũng
  cộng biên (một ETA đơn lẻ không phải P90 — tài liệu §1.2).
- `required = eta + margin + BUFFER_MIN`, `slack = gap − required`.
- Mức: `SAFE` (slack ≥ 0) · `SOFT_CONFLICT` (slack < 0 nhưng gap ≥ eta) · `HIGH_RISK` (gap < eta: thiếu cả thời gian đi
  thường). Thay `TRAVEL_TIME` cũ: `rule_code = TRAVEL_TIME`, `level = WARNING` cho cả hai mức có cảnh báo (giao diện
  pastel, không đỏ), `params = {eta_min, margin_min, buffer_min, gap_min, slack_min, distance_km, risk, peak, source,
  estimated}` (CR-12 sửa CONTRACTS §1.13 A).
- **Tổng kế hoạch** (OUTPUT `feasibility`): `window = end − start` của phòng; `required_total = Σ thời lượng + Σ (eta +
  margin + buffer)`; `buffer_total = window − required_total`; `is_feasible = buffer_total ≥ 0 và không có HIGH_RISK`.
  Trả trong `GET /schedule/feasibility` hoặc kèm `CONFLICTS_UPDATED` (task chọn, ghi CR-12).
- "Bỏ qua" cảnh báo: lưu **theo người xem** (localStorage, khoá `room:item_pair:slack`), cảnh báo tự hiện lại khi số
  liệu đổi. Không cần backend.
- Độ phức tạp O(q) với q cặp (không tính thời gian gọi dịch vụ bản đồ).

## 6. ALGO-04 — Sắp xếp ưu tiên danh sách bình chọn
Cho mỗi quán chưa bị loại (tính ở backend vì cần vị trí thành viên):
- `available` = phần giao giữa giờ mở cửa và khung phòng (phút); không rõ giờ mở cửa → cả khung (cờ `hours_unknown`).
- `max_eta = max_i leg(origin(i), place).minutes` (không ai có origin → 0, cờ `eta_unknown`).
- `required = DEFAULT_ACTIVITY_MIN + max_eta + margin(max_eta, start_minute) + BUFFER_MIN`; `slack = available − required`.
- `risk`: `HIGH_RISK` nếu `available = 0` hoặc `slack < −30`; `SOFT_CONFLICT` nếu `slack < 0`; còn lại `SAFE`.
- **Khoá:** `(risk_rank, −upvotes, −slack, max_eta, created_at)` tăng dần, `SAFE=0, SOFT=1, HIGH=2`. Python `sorted` (ổn
  định, TimSort) — đúng với tài liệu §1.1; FE chỉ hiển thị thứ tự server trả, không tự sắp lại.
- **Nhãn** (tối đa 1 nhãn chính/thẻ, ưu tiên theo thứ tự): `RECOMMENDED` (hạng 1 và SAFE) · `MOST_VOTED_RISKY`
  (upvotes lớn nhất nhưng không SAFE: "Nhiều phiếu nhưng khó kịp") · `MOST_VOTED` · `SCHEDULE_SAFE` (SAFE và slack ≥ 30).
- Trả thêm trên place summary: `priority {rank, risk, slack_min, max_eta_min, labels[], estimated, hours_unknown,
  eta_unknown}` (CR-12). Thứ tự mặc định của danh sách = `rank`; menu ⋯ có "Theo phiếu".
- Danh sách không nhảy khi dữ liệu không đổi (ổn định); khi đổi, dùng hiệu ứng đổi chỗ đã có (T-69).

## 7. "Vì sao?" (Explainable — tài liệu §1.3 nguyên tắc 3)
Mỗi kết quả có một liên kết "Vì sao?" mở panel nhỏ (popover desktop / Sheet mobile), chữ thường, số thật:
- **Hoà phiếu:** bảng thành viên × quán (phút), dòng Tổng (S) và Lâu nhất (M), quán đề xuất tô nhấn; câu "Tổng thấp
  nhất trong ngưỡng 2 phút, rồi chọn nơi người đi xa nhất đi ít nhất"; ghi "xe máy · ước lượng" hoặc "Google Maps".
  Thành viên lấy điểm hẹn thay vị trí riêng có dấu "(điểm hẹn)".
- **Cảnh báo di chuyển:** "Đi ~12' + dự phòng 6' (giờ cao điểm, 50%) + gửi xe 5' = 23'. Khe giữa hai điểm 15' → thiếu
  8'." + gợi ý (dời giờ / chọn quán gần hơn / rút ngắn hoạt động).
- **Nhãn ưu tiên:** khoá đã dùng: mức rủi ro, phiếu, dư/thiếu giờ, người đi xa nhất.
- **Tâm nhóm:** "Tính từ 3 vị trí đã chia sẻ (trung bình trên mặt cầu). Đây là vùng gợi ý, không đảm bảo ai cũng đi bằng nhau."
Chuỗi qua i18n VI/EN; số theo `i18n/format.ts`.

## 8. `state_version` (CR-13)
`rooms.state_version BIGINT` tăng 1 trong cùng giao dịch với mọi thay đổi có phát WS; mọi tin WS server→client và
`ROOM_STATE_SYNC` mang `state_version`. Client giữ số lớn nhất đã áp; tin có số nhỏ hơn → bỏ; nhảy cóc (>+1) → gọi đồng
bộ lại. REST trả header `X-State-Version`.

## 9. Giới hạn đề xuất quán (CR-14)
`rooms.max_places_per_member INT NULL` (mặc định 2 cho phòng mới, `NULL` = không giới hạn), host đổi qua `PATCH`.
`POST /places` vượt → 409 `PLACE_LIMIT_REACHED {limit, used}`. Quán bị xoá không tính. FE: nút Thêm quán hiện "1/2",
đủ thì khoá + câu giải thích; host thấy ô đổi trong "Tuỳ chỉnh thêm" và menu phòng.

## 10. Kiểm thử (đặt tên theo mã tài liệu để chép vào báo cáo)
TC-01 3 vị trí → có tâm · TC-02 thêm thành viên → tâm tính lại · TC-03 2 quán hoà → so thời gian · TC-04 3 quán hoà →
chọn theo tổng (fixture §4) · TC-05 khe 30' cần 60' → SOFT/HIGH · TC-06 khe 70' cần 60' → SAFE dư 10' · TC-07 cùng phiếu
cùng slack → giữ thứ tự · TC-08 nhiều phiếu nhưng xung đột nặng → không lên trước quán an toàn. Thêm: ngưỡng 2 phút
không bắc cầu, thiếu origin, Google lỗi một phần tử → lùi ước lượng, riêng tư (phản hồi không chứa toạ độ thành viên).
