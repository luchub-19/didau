"""Hằng số của Algorithm Engine (giai đoạn 6, OMP giai đoạn 7) — MỘT nơi cấu hình duy nhất.

Nguồn: `docs/phase6/ALGORITHMS.md` (bản đã chốt 2026-11-04, G1 qua). Đổi giá trị ở đây thì phải ghi vào
`docs/phase6/PROGRESS.md` và cập nhật bảng tương ứng trong ALGORITHMS.md. Frontend có bản TS của phần ước
lượng (`room/travel.ts`) và cùng chạy `docs/phase6/algo-fixtures.json` nên đổi số phải đổi cả fixture.
"""

# ── §2 Thời gian di chuyển ────────────────────────────────────────────────────────────────────────
DETOUR_FACTOR = 1.3
"""Đường thực / chim bay (§2)."""

MOTORBIKE_KMH = 25.0
"""Vận tốc xe máy nội thành TP.HCM (§2). Chưa chỉnh theo Google Maps nếu Nhật ký T-84 ghi "chưa chỉnh"."""

BUFFER_MIN = 5
"""Gửi xe, đi bộ, ổn định (T_buffer, §2). KHÔNG cộng vào `Leg.minutes`; ALGO-03/04 cộng riêng."""

TRAVEL_MODE = "TWO_WHEELER"
"""Phương tiện cho mọi thành viên (§0 câu 7)."""

# Google Routes API `computeRouteMatrix` (§2, chỉ khi PLACES_PROVIDER=google + có key)
GOOGLE_ROUTES_TIMEOUT_S = 4.0
"""Quá hạn → toàn bộ yêu cầu lùi về ước lượng."""

GOOGLE_CACHE_TTL_S = 15 * 60
"""Cache trong RAM theo (toạ độ làm tròn, đích, khung giờ)."""

GOOGLE_CACHE_BUCKET_MIN = 15
"""Độ rộng khung giờ khởi hành trong khoá cache (phút)."""

GOOGLE_COORD_DECIMALS = 3
"""Làm tròn toạ độ khi làm khoá cache (~100 m)."""

GOOGLE_MAX_ELEMENTS = 625
"""Trần phần tử (origins × destinations) mỗi yêu cầu `computeRouteMatrix` không phải TRANSIT."""

GOOGLE_DAILY_ELEMENT_LIMIT = 1000
"""Trần số phần tử gọi Google mỗi ngày (phòng lạm dụng/billing; quá trần → ước lượng). Không có trong tài liệu
đồ án — thêm theo luật dự án "không gọi dịch vụ trả phí" (CLAUDE.md), đổi được qua `Settings.GOOGLE_ROUTES_DAILY_LIMIT`."""

# Valhalla tự host + cache km trong DB (docs/phase7/ALGORITHMS.md §5, chỉ khi ROUTING_PROVIDER=valhalla)
VALHALLA_COSTING = "motor_scooter"
"""Chế độ xe máy của Valhalla (tránh đường cấp cao, trần 45 km/h)."""

VALHALLA_TIMEOUT_S = 4.0
"""Quá hạn một yêu cầu Valhalla → ô đó lùi về ước lượng (đổi được qua `Settings.VALHALLA_TIMEOUT_S`)."""

VALHALLA_MAX_PAIRS = 2500
"""Trần cặp (sources × targets) mỗi yêu cầu `/sources_to_targets` (mặc định `max_matrix_location_pairs`)."""

VALHALLA_COOLDOWN_S = 60.0
"""Sau một lỗi mạng/HTTP: không gọi Valhalla trong ngần ấy giây (PC tắt thì request không phải chờ timeout mãi)."""

ROUTE_COORD_DECIMALS = 4
"""Làm tròn toạ độ khi làm khoá cache `travel_legs` (~11 m)."""

ROUTE_WARM_SHAPE_LIMIT = 60
"""Số đường (`/route`) tối đa lấy hình dạng trong một lần làm ấm; phần còn lại lấy khi có người xem."""

ROUTE_SHAPE_CONCURRENCY = 4
"""Số yêu cầu `/route` chạy song song."""

ROUTE_MEMORY_LIMIT = 20_000
"""Trần số chặng giữ trong RAM (bản sao cache DB cho phần đồng bộ); quá trần thì xoá sạch, đọc lại từ DB."""

# ── §3 ALGO-01 Tâm nhóm ───────────────────────────────────────────────────────────────────────────
CENTER_RADIUS_KM = 2.0
"""Bán kính tìm quán quanh tâm nhóm."""

CENTER_MAX_PLACES = 10
"""Số quán gần tâm tối đa trả về."""

CENTER_COORD_DECIMALS = 3
"""Toạ độ tâm trả ra được làm tròn 3 chữ số (~100 m) — riêng tư (CR-11)."""

DISTRICT_TIE_KM = 1.5
"""Quận thứ hai chênh ≤ ngưỡng này so với quận thứ nhất thì nhãn gộp "Q3 – Phú Nhuận"."""

# ── ALGO-02 Hoà phiếu = Ordered Median của Sơn (docs/phase7/ALGORITHMS.md §2, thay gđ6 §4) ────────────
OMP_LAMBDA = 0.5
"""λ — hệ số công bằng: `w_r = 1 + λ·(r − 1)/(N − 1)` cho người xếp thứ r theo chi phí tăng dần (mặc định Sơn)."""

OMP_K = 1.0
"""k — luỹ thừa phạt cá nhân `cᵢ = dᵢ^k` (chặn dưới 1; mặc định Sơn, tuyến tính)."""

OMP_PSI_EPS = 1e-9
"""Sai số khi so Ψ / km để phá hoà (ALGORITHMS gđ7 §3)."""

OMP_BRUTE_LIMIT = 60_000
"""Trần số tổ hợp cho bộ giải thử hết (chỉ dùng đối chiếu trong test)."""

# ── §5 ALGO-03 Sai số thời gian trên lịch ─────────────────────────────────────────────────────────
PEAK_START_MIN = 16 * 60 + 30
"""Đầu giờ cao điểm (16:30), tính theo phút trong ngày."""

PEAK_END_MIN = 19 * 60 + 30
"""Cuối giờ cao điểm (19:30)."""

PEAK_MARGIN_RATIO = 0.5
"""Biên dự phòng = ceil(eta × tỉ lệ) khi `end_curr` trong giờ cao điểm VÀ ngày Hai–Sáu."""

OFFPEAK_MARGIN_RATIO = 0.25
"""Biên dự phòng ngoài giờ cao điểm / cuối tuần."""

MARGIN_MIN = 5
"""Biên dự phòng tối thiểu (phút)."""

# ── §1 / §6 Mặc định & ALGO-04 ────────────────────────────────────────────────────────────────────
DEFAULT_ACTIVITY_MIN = 60
"""Thời lượng mặc định một hoạt động (khớp mặc định thả vào lịch)."""

HIGH_RISK_SLACK_MIN = -30
"""ALGO-04: `slack` < ngưỡng này (hoặc không còn giờ mở cửa) → HIGH_RISK."""

SCHEDULE_SAFE_SLACK_MIN = 30
"""ALGO-04: nhãn SCHEDULE_SAFE cần SAFE và slack ≥ ngưỡng."""
