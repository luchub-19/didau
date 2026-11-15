# Tiến độ giai đoạn 7 "Thuật toán OMP của Sơn"

Mỗi ô ghi chú tối đa 6 gạch đầu dòng. Thứ tự, phụ thuộc, model: `PLAN.md` §3. Thuật toán: `ALGORITHMS.md`.
Hạn MVP: buổi thuyết trình **thứ Hai 2026-11-16**.

## Cổng chờ người dùng
| Cổng | Sau task | Nội dung | Trạng thái |
| :--- | :--- | :--- | :--- |
| G1 | T-93 | Duyệt `PLAN.md`, `ALGORITHMS.md`, CR-15; trả lời câu hỏi UI `PLAN.md` §5 (cần trước T-96) | QUA 2026-11-15 (CR-15 APPROVED, §5 đã trả lời) |
| G2 | T-97 | Tổng duyệt `DEMO.md` trên bản deploy trước buổi thuyết trình | CHỜ |

## Việc của người
Xem `PLAN.md` §4 (Valhalla + tunnel, kiểm 10 tuyến, chuẩn bị hôm thuyết trình, hỏi Sơn về phạm vi giờ giấc).

## Bảng task
| Task | Trạng thái | Session | Ghi chú |
| :--- | :---: | :---: | :--- |
| T-93 | DONE | efa7053a | • Làm: `docs/phase7/` PLAN, ALGORITHMS, PROGRESS, VALHALLA, task T-94 → T-97; CR-15 (PROPOSED); mục gđ7 trong `CLAUDE.md`; đóng T-92 (`docs/phase6/PROGRESS.md`). Không đổi code, không chạy test · • Hỏi người dùng nhiều lượt sau khi đọc nhánh `feat/tie-breaker` (orphan, có `__pycache__` — chép tay, không merge) + 3 file Drive (SPEC, báo cáo so sánh của Bảo, tổng hợp 2 thuật toán); 18 quyết định ở PLAN §1 · • Lệch có chủ ý ở MVP: K = 1, chốt theo luồng cũ (PLAN §2) · • Phát hiện: code có 3 định nghĩa "hoà" (giai đoạn `tie` theo điểm + loại; ALGO-02 theo số "Muốn đi" + cả phòng; resolve TRAVEL_TIME theo "Muốn đi") → chốt theo điểm + loại; code Sơn trả hình học đường từ nhà mọi người (vi phạm CR-11) → bỏ; Sơn không xử lý giờ giấc (không có start/end ở code/SPEC/dataset) · • Việc task sau: T-94 + T-95 song song sau G1; T-96 dừng nếu chưa có câu trả lời PLAN §5 |
| T-94 | DONE | c3d93116 | • Làm: lõi `domain/algorithms/ordered_median.py` (`penalty`, `omp_weights`, `psi`, `evaluate`, `rank_candidates` K = 1, `solve_dp`, `solve_brute` ≤ 60k, `compare` = phá hoà §3); `tie_travel` viết lại (`tied_groups` theo điểm + loại, `member_origins` không điểm hẹn, `decide(group, members, to_place, to_home)` Ψ khứ hồi); `TieSuggestion` theo CR-15 (`suggestions[]` mỗi loại); `travel_ranking` nối thứ hạng từng loại; `TravelTimeTieBreakStrategy.group_key = (score, category)`; CR-15 phần A áp vào CONTRACTS (§1, mục 8, 35, kiểu TS); fixture `tie_break` theo Ψ; bỏ `TIE_THRESHOLD_MIN`, thêm `OMP_LAMBDA/OMP_K/OMP_PSI_EPS/OMP_BRUTE_LIMIT` · • Test: ruff xanh, **769 pytest xanh với Postgres docker** (gồm tích hợp + quét riêng tư `_no_secret` mọi phản hồi hoà phiếu); mới: `test_omp_math` 12 (OMP-M), `test_omp_solver` 17 (OMP-S, 6 test Sơn + router không mạng + DP==brute ngẫu nhiên 360 bài có hoà), `test_omp_regression` 51 (OMP-R); viết lại TC-03/TC-04 ở `test_algo_t86` (34) + `test_phase6_t86` (24), `test_algo_fixtures` (31). Số đo 20 case: bảng dưới · • **Vạn Hạnh Mall vẫn thắng** TC-04 khi tính bằng km khứ hồi ước lượng: Ψ 50,278 vs Dinh Độc Lập 51,457 vs Saigon Centre 54,122 (thứ tự hạng 2–3 đổi so với gđ6); người xa nhất 17,1 km thay vì 22,9. Toạ độ 3 quán thêm vào fixture · • Lệch/quyết định: (1) KHÔNG làm tròn w (Sơn 4 số) và dᵢ (Sơn 3 số) trước khi tính Ψ — làm tròn chỉ ở đầu ra, để DP và thử hết phá hoà giống hệt (chênh Ψ < 0,001); (2) `minutes` = phút đi + về, `max_min` = max của nó; (3) `source` = ESTIMATE nếu còn ô ước lượng, nguồn chung, hoặc `MIXED`; (4) loại hoà xếp theo thứ tự `PlaceCategory`; loại có quán thiếu toạ độ hết vẫn có mục (ranking rỗng), `NO_PLACE_COORDS` khi mọi loại như vậy; (5) hoà 0 điểm được tính nếu loại có phiếu (như `TIE_AT_TOP`); (6) Sơn có 14 test ngoài playground (không phải 18) — đã chuyển đủ 14 · • Việc task sau: T-95 thay estimator — service gọi `amatrix` HAI lần (đi `members→places`, về `places→members`), lõi không giả định đối xứng; `Leg.source` thêm VALHALLA thì `_source()` tự ra `VALHALLA`. T-96: FE đang đọc kiểu cũ (`recommended_place_id` ở gốc, `matrix`) → thẻ hoà phiếu sẽ không hiện cho tới khi T-96 đổi sang `suggestions[]` (test FE dùng MSW nên vẫn xanh). Resolve với `max_accepted_places = 1` và 2 loại cùng hoà cùng điểm: loại có tên lớn hơn (FOOD > DRINK) được chốt — luồng chốt cũ (PLAN §2) · • Bẫy: poetry tạo venv rỗng mới (`didau-backend-J44BCoo3-py3.14`) vì đường dẫn dự án đổi; session này chạy test bằng venv cũ `~/.cache/pypoetry/virtualenvs/didau-backend-9ytkEAsm-py3.14/bin/python -m pytest` |
| T-95 | DONE | 8c1c6ba6 | • Làm: `travel.py` thêm `TravelSource.VALHALLA`, `minutes_for_km`, `coord_key`, `Route`, `CachedLeg`, `ILegStore`, `ValhallaEstimator` (`/sources_to_targets` 2 định dạng, `/route` lấy `shape`, header `X-Route-Key`, nghỉ 60 s sau lỗi), `DbCachedEstimator` (RAM → DB → ước lượng; `warm`, `routes`, `load`), `ITravelTimeEstimator.acached_matrix`; `get_travel_estimator` theo `ROUTING_PROVIDER`; bảng `travel_legs` (model + migration 005) + `repositories/travel_leg_repo.py` (`TravelLegRepository`, `SessionLegStore`, `set_session_factory`); `services/route_service.py` (`warm_after_commit`, `RouteWarmer`, `request_warm`, `RouteService`); `api/v1/routes.py`: `GET /rooms/{id}/routes/me?place_id=`, `GET /rooms/{id}/schedule/routes`; CR-15 phần B áp vào CONTRACTS (mục 37, 38 mới, §1.13 A, 35, 36, kiểu TS) · • Test: ruff xanh, **796 pytest xanh với Postgres docker** (+27: `test_valhalla_estimator` 20 VAL-01…20 mock httpx thành công/timeout/403/ô rỗng/nghỉ/chia yêu cầu/cache; `test_migration_005` 1 SQLite lên-xuống-lên; `test_phase7_t95` 6 VAL-21…26 tích hợp: repo, cache sống qua restart + Valhalla sập, làm ấm chỉ sau commit (rollback huỷ), API + quét payload không có nhà người khác/khoá cache, hoà phiếu ra `VALHALLA`, tự lành, cờ tắt không gọi httpx/không ghi DB). `alembic upgrade head` đã chạy trên DB dev (005 lên/xuống/lên). FE không đổi nên chưa chạy lint/test FE · • Quyết định (ghi ở CR-15 phần B): (1) Valhalla CHỈ được gọi khi làm ấm nền và khi `routes` thiếu `shape`; hoà/resolve/ALGO-03/04/luật TRAVEL_TIME chỉ đọc cache; (2) làm ấm = listener `after_commit`/`after_soft_rollback` của SQLAlchemy trên session request, không dùng `BackgroundTasks`; một task/phòng, gom yêu cầu; (3) phút tính lại từ km mỗi lần đọc; `/route` của cặp đã có km chỉ ghi `shape`; (4) `VALHALLA_KEY` không bắt buộc (Valhalla local không qua Caddy), URL trống = chỉ đọc cache; (5) GET thấy ô ước lượng → hẹn làm ấm (tự lành cho phòng cũ / lúc PC tắt) · • Lệch nhỏ: thêm lỗi 404 `NO_PLACE_COORDS` cho `routes/me` (quán thiếu toạ độ) và trường `unknown_leg_count` cho `schedule/routes` (như mục 36); `routes/me` có `place_id` ở gốc; đường từ điểm hẹn host cũng được làm ấm km (ALGO-04 dùng) nhưng không API nào trả · • Việc task sau (T-96): đọc `RouteLeg.shape` bằng bộ giải polyline **độ chính xác 6** (không phải 5 của Google); `shape: null` = ước lượng → không vẽ (hoặc nét đứt thẳng) + chữ "ước lượng"; gọi lại `schedule/routes` khi `SCHEDULE_UPDATED`/`PLACE_UPDATED`; `NO_ORIGIN` → mời chia sẻ vị trí. Bật thật: Render đặt `ROUTING_PROVIDER=valhalla`, `VALHALLA_URL`, `VALHALLA_KEY` (VALHALLA.md §5) và **phải chạy `alembic upgrade head`** · • Bẫy: `session.rollback()` khi chưa chạm DB không phát sự kiện rollback (commit rỗng sau đó vẫn phát `after_commit`) — request thật đã chạy SQL nên không ảnh hưởng; container `didau_backend` đang lặp khởi động lại vì image cũ không biết revision 004 (có từ trước task này) → cần build lại image; test tích hợp chờ task nền bằng `client.portal.call(get_route_warmer().drain)` |
| T-96 | TODO | | |
| T-97 | TODO | | |
| T-98 | TODO | | Đổi tên Hangoutplanner + wordmark C; song song, nên xong trước T-97 |

## Số đo T-94: hồi quy 20 case của Sơn (`backend/tests/fixtures/hangout_20_cases.json`)
λ = 0,5. Thời gian = nhanh nhất 3 lượt, Python 3.14, laptop dev (2026-11-15). "Khớp" = DP == thử hết cả tổ hợp và Ψ ở
k = 1 **và** k = 1,5. Case ≥ 1 triệu tổ hợp không thử hết (trần 60 000). Ψ k = 1 được khoá trong `test_omp_r03`.

| Case | N | K | Tổ hợp | Ψ (k=1) | Ψ (k=1,5) | DP (ms) | Thử hết (ms) | DP vs thử hết |
| :-: | :-: | :-: | --: | --: | --: | --: | --: | :-: |
| 1 | 3 | 2 | 4 | 83.017 | 442.998 | 0.03 | 0.0 | khớp |
| 2 | 4 | 3 | 18 | 173.26 | 1091.194 | 0.06 | 0.1 | khớp |
| 3 | 2 | 4 | 24 | 57.685 | 279.79 | 0.03 | 0.1 | khớp |
| 4 | 5 | 2 | 12 | 74.633 | 282.554 | 0.07 | 0.1 | khớp |
| 5 | 6 | 3 | 36 | 132.525 | 581.148 | 0.06 | 0.2 | khớp |
| 6 | 4 | 5 | 144 | 96.093 | 441.919 | 0.05 | 0.7 | khớp |
| 7 | 7 | 4 | 180 | 244.754 | 1435.209 | 0.10 | 0.9 | khớp |
| 8 | 5 | 6 | 432 | 362.309 | 2781.683 | 0.07 | 2.1 | khớp |
| 9 | 8 | 3 | 120 | 172.253 | 830.393 | 0.14 | 0.6 | khớp |
| 10 | 6 | 7 | 2 880 | 166.059 | 859.259 | 0.07 | 16.5 | khớp |
| 11 | 9 | 5 | 2 400 | 236.931 | 1163.769 | 0.22 | 14.7 | khớp |
| 12 | 7 | 8 | 51 840 | 214.136 | 1060.945 | 0.16 | 321.7 | khớp |
| 13 | 10 | 6 | 50 400 | 265.196 | 1264.886 | 0.41 | 335.4 | khớp |
| 14 | 8 | 9 | 2 016 000 | 421.964 | 2756.345 | 0.30 | — | — |
| 15 | 11 | 7 | 1 016 064 | 242.109 | 1052.699 | 0.74 | — | — |
| 16 | 9 | 10 | 8,47 × 10⁷ | 451.438 | 2921.515 | 0.57 | — | — |
| 17 | 12 | 8 | 2,03 × 10⁷ | 302.905 | 1414.166 | 1.28 | — | — |
| 18 | 10 | 11 | 3,84 × 10⁹ | 192.881 | 783.785 | 1.04 | — | — |
| 19 | 12 | 1 | 12 | 138.37 | 479.766 | 0.09 | 0.1 | khớp |
| 20 | 12 | 12 | 3,31 × 10¹² | 424.789 | 2493.8 | 3.67 | — | — |

## Bản đầy đủ (sau buổi MVP, lên plan lại)
- Chặng = loại quán, thứ tự **chỉ theo lịch người dùng đã xếp** (chưa có trên lịch → bỏ qua), DP nhiều chặng trong app (PLAN §1 #14).
- Chốt không tự loại quán; đề xuất "Loại các quán còn lại?" (#15); nút "Kết thúc bình chọn" (#16); giai đoạn phòng theo loại.
- Hộp xác nhận trước khi tự xếp lịch (#17).
- Dời từ T-92 gđ6: ảnh `screens/final/`, đo kéo thả fps/long task, CLS, LCP trang chủ.
