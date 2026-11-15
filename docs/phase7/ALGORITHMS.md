# ĐẶC TẢ OMP (giai đoạn 7) — thay ALGORITHMS gđ6 §4

Nguồn: `SPEC.md` v1.2.0 + `tiebreak_engine/` của Sơn (nhánh orphan `origin/feat/tie-breaker`), báo cáo so sánh của Bảo
("Báo cáo so sánh các thuật toán xử lý xung đột đầu – giữa – cuối", Drive, 2026-11-14), quyết định người dùng
(`PLAN.md` §1). Code theo file này. ALGO-01/03/04 giữ nguyên theo `docs/phase6/ALGORITHMS.md`, chỉ đổi nguồn km (§5).
Tham số `UPPER_CASE` ở `backend/app/core/algo_config.py`.

## 1. Dữ liệu vào
- Thành viên tham gia tính = thành viên có `origin_source = MEMBER` (tự chia sẻ). Người không có vị trí bị loại, đếm vào
  `excluded_member_count`. **Không** dùng điểm hẹn host thay (khác gđ6 §1). Không còn ai → `available: false,
  reason: NO_ORIGINS`.
- Chặng `t = 1..K`, mỗi chặng có tập ứng viên `S[t]` (Mₜ ≥ 1 quán có toạ độ). Chặng 1 ứng viên = chặng cố định.
- **Thứ tự chặng = thứ tự giờ trên lịch người dùng đã xếp; máy không đoán** (PLAN §1 #14). Chặng cố định = quán đã chốt
  và đã có trên lịch (ngày đầu, như ALGO-03); chặng chưa có trên lịch bị bỏ qua. Chặng đang hoà nằm ở vị trí giờ của ứng
  viên đã có trên lịch; không ứng viên nào trên lịch → K = 1 (`Nhà → quán → Nhà`). MVP luôn K = 1.
- Quãng đường một chiều `d(a, b)` theo km (§5), **không đối xứng** (đường một chiều): luôn hỏi đúng chiều.

## 2. Mô hình (đúng như Sơn)
- Lộ trình người i với tổ hợp `(s₁, …, s_K)`: `dᵢ = d(Aᵢ, s₁) + Σₜ d(sₜ, sₜ₊₁) + d(s_K, Aᵢ)` (km, làm tròn 3 số).
  K = 1: `dᵢ = d(Aᵢ, s) + d(s, Aᵢ)`.
- Tầng 1: `cᵢ = dᵢ ^ k`, `k = OMP_K = 1.0` (chặn dưới 1; `d ≤ 0 → 0`).
- Tầng 2: xếp `c` tăng dần `c₍₁₎ ≤ … ≤ c₍N₎`; `w_r = 1 + λ·(r − 1)/(N − 1)`, `λ = OMP_LAMBDA = 0.5`; N = 1 → `w = [1]`.
  `Ψ = Σ_r w_r · c₍r₎`. Chọn tổ hợp có Ψ nhỏ nhất.
- Ghi chú (báo cáo Bảo §5.3): với λ ≤ 2, k = 1 kết quả gần như MinSum; câu "λ = 2 tiệm cận MinMax" trong SPEC **sai**
  (w chỉ chạy 1 → 3). Giữ mặc định của Sơn theo quyết định người dùng; báo cáo ghi rõ điều này.
- Đo 2026-11-15 (T-93, quét λ ∈ {0…10} × k ∈ {1…3}): 20 case nhiều chặng → mặc định khác MinSum 1/20; tách 116 bài K = 1
  → khác 5/116, khi khác thì người xa nhất bớt TB 4,3 km, tổng nhóm +1,6 km. k là núm công bằng mạnh hơn λ (λ1 k2: 29/116,
  −7,1 / +11,1 km). Script mẫu cho `scripts/bench_omp.py` (T-97): DP so thử hết 56/56 khớp, case 20 giải 0,002 s.

## 3. Phá hoà (thêm, SPEC chưa có)
So `Ψ` với sai số `1e-9`; bằng nhau → `max dᵢ` nhỏ hơn → `Σ dᵢ` nhỏ hơn → bộ `created_at` của các quán theo thứ tự chặng
nhỏ hơn (thêm sớm hơn) → bộ `place_id` (chuỗi). Kết quả không phụ thuộc thứ tự đầu vào (test hoán vị).

## 4. Bộ giải
- **DP theo lớp** (Bảo, phụ lục B): với mỗi `s₁ ∈ S[1]`, `chain[1][s₁] = 0`, `chain[t][v] = min_{u ∈ S[t−1]}
  (chain[t−1][u] + d(u, v))` có truy vết; với mỗi `s_K` tính `cᵢ` và Ψ. Đúng vì đoạn giữa cộng **cùng** số km cho mọi
  người và Ψ không giảm theo từng cᵢ (wᵢ ≥ 0, k ≥ 1) ⇒ với cặp (s₁, s_K) cố định, đoạn giữa ngắn nhất luôn tối ưu.
  Hoà Ψ giữa các chuỗi giữa cùng độ dài: truy vết chọn theo §3 (created_at, place_id) để xác định.
  Độ phức tạp `O(M₁·Σₜ Mₜ·Mₜ₊₁ + M₁·M_K·N log N)`. K = 1: `O(M·N log N)`.
- **Thử hết** (`itertools.product`, như Sơn) chỉ giữ trong test để đối chiếu, giới hạn ≤ 60 000 tổ hợp.
- Hàm thuần nhận **ma trận/hàm khoảng cách**, không nhận lat/lng (dataset 20 case dùng toạ độ km trên mặt phẳng).

## 5. Nguồn km (dùng chung cho OMP và ALGO-03/04)
- Thứ tự: **cache DB** → **Valhalla** (`ROUTING_PROVIDER=valhalla` + `VALHALLA_URL` + `VALHALLA_KEY`) → **ước lượng**
  (`haversine × DETOUR_FACTOR`). Google giữ sau cờ cũ.
- Valhalla: `POST /sources_to_targets`, `costing=motor_scooter`, `units=kilometers`, header `X-Route-Key`; timeout
  `VALHALLA_TIMEOUT_S = 4`; lỗi/ô rỗng → ước lượng cho ô đó, **không** ghi cache (để lần sau thử lại).
- Đường vẽ: `POST /route` cùng costing, lấy `shape` (polyline độ chính xác 6), lưu cache cùng cặp.
- `Leg.minutes = ceil(km ÷ MOTORBIKE_KMH × 60)` cho mọi nguồn trừ Google (Google giữ phút có kẹt xe như gđ6).
  `Leg.source ∈ {ESTIMATE, VALHALLA, GOOGLE}`; giao diện ghi "ước lượng" khi `ESTIMATE`.
- Cache: bảng `travel_legs (from_key, to_key, profile, distance_km, minutes, shape, source, fetched_at)`; khoá = toạ độ
  làm tròn `ROUTE_COORD_DECIMALS = 4` (~11 m), không TTL (đường không đổi trong đồ án). Chỉ server đọc; không API nào
  trả `from_key`/`to_key`.
- Làm ấm (không chặn request): sau khi commit thêm/sửa toạ độ quán, đổi vị trí thành viên → lấy các cặp còn thiếu
  (thành viên ↔ quán hai chiều, quán ↔ quán) bằng **một** yêu cầu ma trận; tách session riêng **sau commit** (bẫy gđ6
  T-87: handler session riêng đọc dữ liệu chưa commit / khoá hàng).
- Lúc tính hoà: chỉ đọc cache; ô thiếu → ước lượng + `estimated: true` (không chờ mạng).

## 6. Kích hoạt & đầu ra (MVP, K = 1)
- Hoà theo **từng loại quán**: trong loại, quán chưa REJECTED/VISITED, ≥ 2 quán cùng **điểm** (upvotes − downvotes) lớn
  nhất, có hoạt động bỏ phiếu trong loại, và loại đó chưa có quán ACCEPTED. Không dùng `NEAR_TIE`.
  (Thống nhất với `TIE_AT_TOP` ở `domain/patterns/decision/trigger.py`; ALGO-02 cũ dùng số "Muốn đi" + cả phòng — bỏ.)
- Mỗi loại hoà là một bài K = 1 riêng. `POST /voting/resolve {strategy: "TRAVEL_TIME"}` (giữ tên chiến lược cho tương
  thích CR-12) server **tính lại** Ψ, không tin số từ client.
- Đầu ra theo CR-15: mỗi loại `{category, candidates, recommended_place_id, ranking[{place_id, rank, psi, max_km,
  total_km, max_min}], members[{member_id, nickname, km, minutes, rank, weight}] cho quán đề xuất, runner_up_psi,
  excluded_member_count, estimated, source, params {lambda, k}}`. Không toạ độ, không hình học.

## 7. Đường vẽ (quyết định 13, CR-11)
- `GET /rooms/{id}/routes/me?place_id=` → đường **của người gọi**: nhà mình → quán và quán → nhà mình (`shape`, km, phút).
  Người gọi không có vị trí → 404 `NO_ORIGIN`.
- `GET /rooms/{id}/schedule/routes` → đường giữa các mục liên tiếp trên lịch (ngày đầu, như ALGO-03).
- Không endpoint nào trả đường/km xuất phát từ nhà người khác (test quét payload như T-88).

## 8. Kiểm thử (đặt tên theo mã để chép vào báo cáo)
- Chuyển 18 test của Sơn (`test_math`, `test_solver`, `test_service`, `test_router` phần không mạng) sang
  `backend/tests/unit/test_omp_*.py`; bỏ phần playground.
- Hồi quy `hangout_20_cases.json` (lấy từ nhánh của Sơn, `backend/tests/fixtures/`): DP == thử hết (Ψ và tổ hợp) mọi case
  ≤ 60 000 tổ hợp, k = 1 và k = 1,5; case 20 (3,3×10¹²) DP < 1 s.
- Phá hoà §3, hoán vị đầu vào, N = 1, thiếu vị trí, không ai có vị trí, quán thiếu toạ độ.
- TC-03/TC-04 gđ6 viết lại theo Ψ (fixture Vạn Hạnh Mall vẫn thắng — kiểm lại bằng km).
- Valhalla: mock `httpx` (thành công, timeout, 403, ô rỗng); cache DB (đọc/ghi, không ghi khi lỗi); riêng tư.
