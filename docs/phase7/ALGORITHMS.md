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
- Tầng 1: `cᵢ = dᵢ ^ k`, `k = OMP_K = 2.0` (chặn dưới 1; `d ≤ 0 → 0`). **T-99 / CR-16 (2026-11-15):** mặc định đổi từ
  (λ = 0,5; k = 1) của Sơn sang (λ = 1; k = 2) theo báo cáo so sánh của Bảo; lý do và số đo ở §9.5.
- Tầng 2: xếp `c` tăng dần `c₍₁₎ ≤ … ≤ c₍N₎`; `w_r = 1 + λ·(r − 1)/(N − 1)`, `λ = OMP_LAMBDA = 1.0`; N = 1 → `w = [1]`.
  `Ψ = Σ_r w_r · c₍r₎`. Chọn tổ hợp có Ψ nhỏ nhất.
- Ghi chú (báo cáo Bảo §5.3): với k = 1 kết quả gần như MinSum dù λ lớn đến đâu; câu "λ = 2 tiệm cận MinMax" trong SPEC
  **sai** — trọng số người xa nhất so với trọng số trung bình là `(1 + λ) / (1 + λ/2) < 2` với mọi λ. Muốn bảo vệ người xa
  phải tăng k (§9.5).
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

## 9. Số liệu cho báo cáo (T-97, đo lại ở T-99 sau khi đổi tham số, 2026-11-15)
Mọi số dưới đây tái lập được: `cd backend && poetry run python ../scripts/bench_omp.py` (mục 9.1, 9.2; thêm `--lam 0.5 --k 1`
để ra bảng của tham số Sơn), `pytest` (9.3). Máy: laptop dev, Python 3.14. Thời gian = nhanh nhất 5 lượt.
**Dataset 20 case là dữ liệu MÔ PHỎNG** (`cases.py` của Sơn, seed 2026): toạ độ = tâm 12 khu TP.HCM + nhiễu Gauss σ = 0,75 km;
km = chim bay × hệ số uốn lượn ngẫu nhiên 1,22–1,42, mỗi chiều × 0,97–1,05 (đường một chiều). Không gọi là "case thật".

### 9.1 Hai bộ giải trên 20 case của Sơn (`backend/tests/fixtures/hangout_20_cases.json`)
λ = 1; k = 2 (mặc định T-99). "Thử hết" chỉ chạy khi ≤ 60 000 tổ hợp (`OMP_BRUTE_LIMIT`). DP khớp thử hết **14/14** case chạy được
(cả Ψ và tổ hợp, ở k = 1, 1,5 và 2 — `test_omp_r01`); case 20 (3,31 × 10¹² tổ hợp) DP giải trong **3,6 ms**. Thử hết tốn
**≈ 6,1–6,7 µs mỗi tổ hợp** (case 12: 51 840 tổ hợp / 317 ms) nên case 20 cần ≈ 2 × 10⁷ s **≈ 240 ngày** (Bảo đo 4,1–4,6 µs →
156–177 ngày, cùng bậc). *(Bản T-97 ghi "0,1 ms mỗi tổ hợp, ≈ 9 × 10⁴ giờ" là sai, đã sửa.)* Thời gian không phụ thuộc (λ; k).
Ψ có đơn vị km² khi k = 2 — chỉ dùng để so, giao diện không hiện Ψ.

| Case | N | K | Tổ hợp | Ψ | DP (ms) | Thử hết (ms) | DP vs thử hết |
| :-: | :-: | :-: | --: | --: | --: | --: | :-: |
| 1 | 3 | 2 | 4 | 3282.537 | 0.02 | 0.0 | khớp |
| 2 | 4 | 3 | 18 | 8738.780 | 0.05 | 0.1 | khớp |
| 3 | 2 | 4 | 24 | 1705.479 | 0.02 | 0.1 | khớp |
| 4 | 5 | 2 | 12 | 1398.879 | 0.06 | 0.1 | khớp |
| 5 | 6 | 3 | 36 | 3306.768 | 0.06 | 0.2 | khớp |
| 6 | 4 | 5 | 144 | 2664.363 | 0.04 | 0.6 | khớp |
| 7 | 7 | 4 | 180 | 10712.562 | 0.10 | 0.9 | khớp |
| 8 | 5 | 6 | 432 | 26420.400 | 0.07 | 2.2 | khớp |
| 9 | 8 | 3 | 120 | 5605.738 | 0.14 | 0.6 | khớp |
| 10 | 6 | 7 | 2 880 | 6091.946 | 0.07 | 16.3 | khớp |
| 11 | 9 | 5 | 2 400 | 7144.649 | 0.19 | 14.8 | khớp |
| 12 | 7 | 8 | 51 840 | 6382.921 | 0.16 | 316.5 | khớp |
| 13 | 10 | 6 | 50 400 | 7717.390 | 0.40 | 337.8 | khớp |
| 14 | 8 | 9 | 2.02e+06 | 22061.548 | 0.29 | — | — |
| 15 | 11 | 7 | 1.02e+06 | 5863.297 | 0.73 | — | — |
| 16 | 9 | 10 | 8.47e+07 | 23753.545 | 0.56 | — | — |
| 17 | 12 | 8 | 2.03e+07 | 8480.484 | 1.20 | — | — |
| 18 | 10 | 11 | 3.84e+09 | 4093.146 | 0.99 | — | — |
| 19 | 12 | 1 | 12 | 2331.432 | 0.09 | 0.1 | khớp |
| 20 | 12 | 12 | 3.31e+12 | 19551.900 | 3.63 | — | — |

Ψ ở tham số của Sơn (λ = 0,5; k = 1) vẫn được khoá ở `test_omp_r03` (bảng T-94 trong `PROGRESS.md`).

### 9.2 Ψ (OMP) so với MinSum và MinMax
"Tổng / xa nhất" = tổng km của nhóm / km khứ hồi của người đi xa nhất, ở tổ hợp mà tiêu chí đó chọn. MinSum = λ = 0, k = 1
(cộng đều); MinMax = tối thiểu hoá người xa nhất.

| Case | OMP (1; 2): tổng / xa nhất (km) | MinSum: tổng / xa nhất | MinMax: tổng / xa nhất | OMP = MinSum? | Xa nhất bớt so MinSum | Tổng thêm so MinSum |
| :-: | :-: | :-: | :-: | :-: | --: | --: |
| 1 | 60.7 / 38.4 | 60.7 / 38.4 | 60.7 / 38.4 | có | +0.00 | +0.00 |
| 2 | 131.2 / 43.0 | 131.2 / 43.0 | 155.1 / 39.3 | có | +0.00 | +0.00 |
| 3 | 44.6 / 26.1 | 44.6 / 26.1 | 44.6 / 26.1 | có | +0.00 | +0.00 |
| 4 | 55.9 / 16.6 | 55.9 / 16.6 | 55.9 / 16.6 | có | +0.00 | +0.00 |
| 5 | 101.4 / 27.7 | 101.4 / 27.7 | 123.5 / 26.6 | có | +0.00 | +0.00 |
| 6 | 73.0 / 29.1 | 73.0 / 29.1 | 73.0 / 29.1 | có | +0.00 | +0.00 |
| 7 | 194.5 / 44.9 | 184.5 / 49.9 | 283.0 / 41.9 | KHÁC | +4.96 | +10.00 |
| 8 | 284.5 / 72.8 | 284.5 / 72.8 | 284.5 / 72.8 | có | +0.00 | +0.00 |
| 9 | 127.9 / 36.5 | 127.9 / 36.5 | 127.9 / 36.5 | có | +0.00 | +0.00 |
| 10 | 125.1 / 44.8 | 125.1 / 44.8 | 125.1 / 44.8 | có | +0.00 | +0.00 |
| 11 | 193.2 / 27.2 | 179.6 / 33.0 | 193.2 / 27.2 | KHÁC | +5.81 | +13.52 |
| 12 | 169.9 / 26.2 | 169.9 / 26.2 | 169.9 / 26.2 | có | +0.00 | +0.00 |
| 13 | 204.1 / 29.5 | 204.1 / 29.5 | 208.0 / 29.5 | có | +0.00 | +0.00 |
| 14 | 332.6 / 47.0 | 332.6 / 47.0 | 335.9 / 46.6 | có | +0.00 | +0.00 |
| 15 | 186.2 / 25.8 | 186.1 / 26.0 | 188.9 / 24.8 | KHÁC | +0.26 | +0.12 |
| 16 | 350.2 / 49.9 | 350.2 / 49.9 | 350.2 / 49.9 | có | +0.00 | +0.00 |
| 17 | 232.9 / 29.3 | 232.9 / 29.3 | 232.9 / 29.3 | có | +0.00 | +0.00 |
| 18 | 149.4 / 27.4 | 149.4 / 27.4 | 227.9 / 25.3 | có | +0.00 | +0.00 |
| 19 | 113.3 / 18.4 | 103.4 / 25.0 | 113.3 / 18.4 | KHÁC | +6.58 | +9.92 |
| 20 | 318.7 / 48.1 | 318.7 / 48.1 | 472.4 / 45.7 | có | +0.00 | +0.00 |

DP lệch thử hết: 0/14 case. OMP (1; 2) khác MinSum: **4/20** case (7, 11, 15, 19); khi khác: người xa nhất bớt TB 4,40 km,
tổng nhóm thêm TB 8,39 km. (Tham số Sơn (0,5; 1): khác MinSum 1/20 — chỉ case 15, bớt 0,26 km / thêm 0,12 km.)

Đọc kết quả: 10/20 case MinSum trùng MinMax (không có xung đột) nên tham số nào cũng ra cùng kết quả. Ở 10 case có xung đột,
(1; 2) **chọn đúng MinMax** ở case 11 và 19, chọn **điểm giữa** ở case 7 (người xa nhất bớt 5 km, cả nhóm thêm 10 km thay vì
+98,5 km của MinMax), và **từ chối** những "giao dịch đắt" như case 18 (+78,5 km để cứu 2,1 km) hay case 20 (+153,7 km để cứu
2,4 km).

### 9.3 Bảng mã kiểm thử → test → kết quả
Toàn bộ `pytest` backend: **831 passed** (Postgres docker, 2026-11-15, T-99, ruff xanh). Frontend: lint + build xanh,
**855 vitest passed** (45 file).

| Mã | Kiểm cái gì | Test | Kết quả |
| :-: | :--- | :--- | :-: |
| OMP-M01…M09 | phạt `d^k`, trọng số `w`, Ψ = tích vô hướng sau sắp | `tests/unit/test_omp_math.py` (12) | pass |
| OMP-S01…S12 | 6 test gốc của Sơn (MinSum, bảo vệ người xa, đầu–cuối, haversine, cache) + DP == thử hết ngẫu nhiên 360 bài có hoà, phá hoà Ψ → max → sum → khoá, đổi thứ tự đầu vào, N = 1, đường một chiều, đầu vào sai | `tests/unit/test_omp_solver.py` (17) | pass |
| OMP-R01 | DP == thử hết (Ψ và tổ hợp), k = 1, 1,5 và 2, 14 case ≤ 60 000 tổ hợp | `test_omp_regression.py` | pass |
| OMP-R02 | case 20 (3,3 × 10¹² tổ hợp) DP < 1 s | `test_omp_regression.py` | pass (3,6 ms) |
| OMP-R03 | Ψ của DP ở tham số Sơn (0,5; 1) khoá theo bảng T-94 cho cả 20 case | `test_omp_regression.py` | pass |
| OMP-R04 | mặc định = (1; 2); Ψ khoá 20 case; so với (0,5; 1) chỉ đổi tổ hợp ở case 7, 11, 19 với đúng số km trong báo cáo của Bảo | `test_omp_regression.py` (86 test cả file) | pass |
| TC-03 | hoà theo **điểm** trong cùng loại; > 2 quán hoà xét hết; hai loại cùng điểm → hai gợi ý | `test_algo_t86.py::test_tc03_*`, `test_phase6_t86.py::test_tc03_*`, `test_same_score_in_two_categories_gives_two_suggestions` | pass |
| TC-04 | Vạn Hạnh Mall vẫn thắng khi tính bằng km khứ hồi, ở cả (0,5; 1) lẫn (1; 2) (Ψ 1003,08 vs 1208,954 vs 1376,004) | `test_algo_t86.py::test_tc04_*`, `test_phase6_t86.py::test_tc03_tc04_three_way_tie_suggests_van_hanh_mall` | pass |
| VAL-01…20 | Valhalla mock httpx: thành công, 2 định dạng ma trận, ô rỗng, 403, timeout + nghỉ, chia yêu cầu, không ghi cache khi lỗi, giới hạn đường vẽ | `tests/unit/test_valhalla_estimator.py` (20) | pass |
| VAL-21…26 | cache DB sống qua restart + Valhalla sập; làm ấm chỉ sau commit; API `routes/me`/`schedule/routes`; tự lành; cờ tắt không đụng mạng | `tests/integration/test_phase7_t95.py` (6) + `test_migration_005.py` (1) | pass |
| PRIV | không phản hồi nào chứa toạ độ/đường xuất phát từ nhà người khác (CR-11) | `_no_secret` quét mọi phản hồi hoà phiếu (`test_phase6_t86.py`), quét `routes/me`/`schedule/routes` (`test_val24`), FE `algo_t96.test.tsx` giải mã `shape` | pass |
| FE-OMP | thẻ mỗi loại, "Vì sao?" bằng lời (không chữ Ψ; k = 2 nói "bình phương"), nhãn nguồn, polyline độ chính xác 6, GeoJSON đường, i18n VI/EN | `frontend/src/__tests__/algo_t96.test.tsx` (39) | pass |

Diễn tập API trên phòng seed (`scripts/seed_demo_omp.py`, backend local + Valhalla local): T-99 (λ = 1; k = 2): hoà 3 quán Ăn →
đề xuất **Quán Bụi** (Ψ 1622,983 · Cơm Tấm Ba Ghiền 2641,319 · Lẩu Dê 404 3463,994); người xa nhất 22,959 km, tổng 51,192 km —
cùng quán và cùng km như T-97 ở (0,5; 1). Phần sau chốt đo ở T-97 (không phụ thuộc λ, k): lịch 3 mục → `schedule/routes` 2 chặng
(0,566 km; 1,334 km) có `shape`; `GET tie-break/suggestion` 13 ms (chỉ đọc cache). Backend thứ hai với `VALHALLA_URL` trỏ cổng
chết: **kết quả y hệt** (cache `travel_legs`); quán mới có toạ độ chưa cache → `source=ESTIMATE`, `shape=null`.

### 9.4 Tham số và giới hạn (MVP)
- Tham số (`backend/app/core/algo_config.py`): `OMP_LAMBDA = 1,0`, `OMP_K = 2,0` (T-99, CR-16), `OMP_PSI_EPS = 1e-9`,
  `OMP_BRUTE_LIMIT = 60 000`; `DETOUR_FACTOR = 1,3`, `MOTORBIKE_KMH = 25`, `VALHALLA_COSTING = motor_scooter`,
  `VALHALLA_TIMEOUT_S = 4`, `ROUTE_COORD_DECIMALS = 4`.
- **K = 1:** mỗi lần chỉ một chặng (loại quán đang hoà); bộ giải đã viết cho K bất kỳ và được test bằng dataset nhiều chặng, app chưa dùng.
- **Chốt theo luồng cũ:** giữ 1 quán cho cả phòng, loại phần còn lại (trái quyết định 15/16, PLAN §2); host vẫn là người bấm.
- **Km không có kẹt xe:** Valhalla `motor_scooter` tính theo bản đồ OSM, phút = `ceil(km ÷ 25 × 60)`; hẻm thiếu trên OSM làm đường dài hơn thật.
  ALGO-03 có biên giờ cao điểm, OMP thì không.
- **Không xét giờ giấc:** OMP chọn thuần km (quyết định 7); chồng/thiếu giờ do ALGO-03 cảnh báo sau. Chưa hỏi Sơn về phạm vi giờ giấc (PLAN §4).
- **Người chưa chia sẻ vị trí bị loại khỏi phép tính** (ghi ở "Vì sao?"); không dùng điểm hẹn của host thay.
- **Cache theo toạ độ (làm tròn 4 số ≈ 11 m), không TTL.**
- **Bảng 10 tuyến Valhalla vs Google Maps (`VALHALLA.md` §6): nhóm chưa điền** — chưa có số kiểm, `MOTORBIKE_KMH` chưa hiệu chỉnh.
  Ghi vào báo cáo là "chưa kiểm", đừng viết độ chính xác của Valhalla.
- **Bản deploy Render (2026-11-15) còn bản cũ**: các commit giai đoạn 7 chưa push; `GET …/routes/me` trên Render trả 404. Xem `PROGRESS.md` dòng T-97.

### 9.5 Vì sao (λ = 1; k = 2) — và các số khác lấy từ đâu (T-99)
Nguồn: báo cáo của Bảo "So sánh các cặp λ và k của Ordered Median: tốc độ và hiệu quả" (`docs/proposal/`, 2026-11-15, không lên
repo). T-99 chạy lại **cả 9 cặp** bằng bộ giải của app: **khớp mọi ô** của Bảo. "Gap tổng km" = % vượt MinSum (giá phải trả),
"gap người xa nhất" = % vượt MinMax (bảo vệ còn thiếu); trung bình / tệ nhất trên 20 case; "điểm cân bằng" = trung bình hai gap TB
(thước đo Bảo tự chọn, nhỏ hơn tốt hơn).

| (λ; k) | Gap tổng km TB / tệ nhất | Gap người xa nhất TB / tệ nhất | Case xa nhất ≤ +1% | Điểm cân bằng |
| :-: | :-: | :-: | :-: | :-: |
| (0; 1) = MinSum | 0,00% / 0,00% | 5,44% / 35,7% | 12/20 | 2,72 |
| (0,5; 1) = Sơn | 0,00% / 0,06% | 5,39% / 35,7% | 12/20 | 2,69 |
| (5; 1) | 1,29% / 18,2% | 3,85% / 35,7% | 14/20 | 2,57 |
| (1; 1,5) | 0,27% / 5,42% | 4,79% / 35,7% | 12/20 | 2,53 |
| **(1; 2) = mặc định** | **1,13% / 9,59%** | **1,94% / 9,37%** | **14/20** | **1,54** |
| (2; 2) | 2,04% / 18,2% | 1,47% / 7,93% | 15/20 | 1,76 |
| (0; 3) | 1,13% / 9,59% | 1,94% / 9,37% | 14/20 | 1,54 |
| (1; 3) | 2,21% / 18,2% | 1,26% / 7,93% | 16/20 | 1,74 |
| (5; 4) | 3,35% / 22,8% | 1,10% / 7,93% | 16/20 | 2,22 |

**Lý do (để trả lời "sao chọn số này"):**
1. *Lý thuyết:* với k = 1, trọng số người xa nhất so với trung bình là `(1 + λ)/(1 + λ/2) < 2` — tăng λ bao nhiêu cũng không kéo về
   MinMax (bảng: (5; 1) vẫn tệ nhất 35,7%). Người xa nhất chỉ chiếm `< 2/N` tổng trọng số, nhóm đông càng loãng. Muốn bảo vệ
   người xa phải làm phạt **lồi** theo km: k = 2 = **bình phương quãng đường** (đi xa gấp đôi tính nặng gấp bốn) — dễ giải thích,
   cùng ý với bình phương tối thiểu.
2. *Thực nghiệm:* (1; 2) giảm trường hợp tệ nhất của người xa nhất **35,7% → 9,4%** so với MinMax, đổi lại tổng km tăng TB
   **1,13%**. Kiểm chéo của Bảo trên 600 bài ngẫu nhiên (296 bài có xung đột): điểm cân bằng 1,32 so với 1,68 của (0,5; 1).
3. *Không phải điểm nhọn:* quét lưới 10 λ × 8 k (T-99) — điểm 1,54 phủ cả một vùng (k = 2 với λ = 1–1,5; k = 2,25–2,5 với λ ≤ 1;
   k = 3 với λ ≤ 0,5). Chọn số tròn (1; 2) trong vùng đó; (0; 3) cho cùng kết quả nhưng "bình phương" dễ nói hơn.
4. *Nhạy với cách chấm:* trọng số gap 70 : 30 (ưu tiên km cả nhóm) → (1; 2) **tốt nhất** (1,37); 50 : 50 → (0; 4) nhỉnh hơn
   (1,51 vs 1,54, Bảo không thử cặp này); 30 : 70 (ưu tiên người xa) → (1; 3) / (3; 2,5) tốt hơn (1,55 vs 1,70). Tức (1; 2) luôn
   thuộc nhóm đầu, nhưng "tốt nhất" phụ thuộc giá trị của nhóm — nói thẳng điều này.

**Hạn chế phải nói:** dataset mô phỏng (đầu §9); chỉ 3 case phân biệt (1; 2) với (0,5; 1) (7, 11, 19); ở k = 2 nếu giảm λ xuống 0,75
điểm cân bằng vọt lên 2,19 — (1; 2) nằm ở mép vùng phẳng; kiểm chéo 600 bài dùng km = chim bay × 1,35 (không lệch chiều); phần tốc
độ trong báo cáo của Bảo đo bộ giải **thử hết** của Sơn, còn app dùng **DP** (§9.1, case 20: 3,6 ms).

**Các số khác lấy từ đâu:**
| Số | Giá trị | Nguồn / lý do |
| :--- | :-: | :--- |
| λ, k của Sơn | 0,5; 1 | Mặc định trong `SPEC.md` của Sơn (k = 1 "OMP sách giáo khoa", λ ∈ [0; 2]) — **giá trị khởi đầu, không được suy ra** |
| `DETOUR_FACTOR` | 1,3 | Đặc tả gđ6 §2 (đường thực / chim bay); trung vị của dataset Sơn là 1,33 |
| `MOTORBIKE_KMH` | 25 | Giả định xe máy nội thành; **chưa hiệu chỉnh** (bảng 10 tuyến `VALHALLA.md` §6 chưa điền) |
| `OMP_BRUTE_LIMIT` | 60 000 | Chỉ cho test đối chiếu: vừa trên case thử hết lớn nhất (51 840) → đối chiếu < 1 s |
| `OMP_PSI_EPS` | 1e-9 | Sai số số thực khi so Ψ để phá hoà (§3) |
| `ROUTE_COORD_DECIMALS` | 4 | Khoá cache ≈ 11 m: cùng một quán/nhà dùng lại km |
