# Đi Đâu (Di Dau) - Ứng Dụng Lập Kế Hoạch Đi Chơi Nhóm Realtime

> **"Cuối tuần này đi đâu?"** — Ứng dụng giải quyết bài toán muôn thuở của các nhóm bạn khi lên kế hoạch đi chơi, ăn uống. Hỗ trợ xác thực không mật khẩu (Anonymous-first), tự động phân loại quán thông minh, bỏ phiếu realtime, phân định hòa phiếu đa chiến lược, sắp xếp lịch trình kéo thả và phát hiện xung đột thời gian thực.

---

## 🌟 Tính Năng Nổi Bật

1. **Anonymous-First Authentication**:
   - Tham gia phòng ngay lập tức chỉ với nickname và mã phòng 6 ký tự (`DIDAU8`).
   - Tự động sinh `member_token` bảo mật lưu trong trình duyệt. Không yêu cầu đăng ký/đăng nhập.
   - Phân quyền rõ ràng: Người tạo là `HOST`, người tham gia là `MEMBER`.

2. **Gợi Ý Quán & Tự Động Phân Loại Danh Mục (PlaceCategoryDetector)**:
   - Tự động nhận diện danh mục (`FOOD`, `DRINK`, `ENTERTAINMENT`, `SHOPPING`, `SIGHTSEEING`, `ACCOMMODATION`, `OTHER`) từ tên quán, địa chỉ hoặc URL ShopeeFood/Google Maps.
   - Nhập thời gian mở cửa, chi phí dự kiến, link địa điểm và ghi chú.

3. **Bình Chọn & Đồng Bộ Realtime (WebSocket + EventBus)**:
   - Upvote (+1) và Downvote (-1) hiển thị điểm số tức thì qua WebSocket cho tất cả thành viên.
   - Trạng thái trực tuyến (Live indicator) và heartbeat giữ kết nối ổn định.

4. **Phân Định Hòa Phiếu Đa Chiến Lược (TieBreakStrategy Pattern)**:
   - Dành riêng cho `HOST` khi các địa điểm hòa điểm:
     - `EARLIEST_SUBMISSION`: Ưu tiên địa điểm được đề xuất sớm nhất.
     - `MOST_UPVOTES`: Ưu tiên địa điểm có nhiều lượt vote thuận (+1) nhất.
     - `CREATOR_PRIORITY`: Ưu tiên đề xuất của Host hoặc thành viên chỉ định.
     - `CATEGORY_DIVERSITY`: Ưu tiên đa dạng hóa thể loại (Ăn uống, Cà phê, Vui chơi).
     - `RANDOM`: Bốc thăm ngẫu nhiên công bằng.
   - Chốt các địa điểm thắng cuộc sang trạng thái `ACCEPTED`.

5. **Trục Lịch Trình Kéo Thả (Drag-and-Drop Schedule Builder)**:
   - Trục thời gian trực quan theo giờ trong ngày (`09:00 - 10:30`,...).
   - Kéo thả sắp xếp lại thứ tự ưu tiên hoặc dùng phím điều hướng nhanh.
   - Hỗ trợ lịch trình nhiều ngày (`day_offset`).

6. **Động Cơ Phát Hiện Xung Đột Thông Minh (ConflictDetectionEngine)**:
   - Phân cấp màu sắc cảnh báo: `CRITICAL` (Đỏ), `ERROR` (Cam), `WARNING` (Vàng).
   - Luật xung đột:
     - `TIME_OVERLAP`: Trùng lặp khung giờ giữa 2 địa điểm trong cùng ngày.
     - `TRAVEL_TIME`: Thời gian nghỉ giữa 2 chặng ít hơn thời gian di chuyển (tính theo khoảng cách Haversine).
     - `OPENING_HOURS`: Lên lịch ngoài khung giờ mở cửa của quán.
     - `DUPLICATE_PLACE`: Địa điểm trùng tên (>90%) hoặc vị trí quá gần (<50m).
     - `BUDGET_THRESHOLD`: Tổng chi phí dự kiến vượt ngân sách nhóm đề ra.

---

## 🏗️ Kiến Trúc Hệ Thống

```text
├── backend/                  # FastAPI 0.115 + SQLAlchemy 2.0 Async + PostgreSQL + Alembic
│   ├── app/
│   │   ├── api/v1/           # REST Routers & WebSocket Endpoint
│   │   ├── core/             # Database connection, exceptions, security, seed.py
│   │   ├── domain/           # Models, Enums, Value Objects & Patterns
│   │   │   ├── patterns/     # CategoryDetector, TieBreak, ConflictRule, EventBus
│   │   │   └── phase2_interfaces/ # ABC Interfaces cho Phase 2 (Route, External, Split)
│   │   ├── repositories/     # Data Access Layer (SQLAlchemy Async Repositories)
│   │   └── services/         # Application Services & WebSocket Broadcaster
│   └── tests/                # 313 Automated Tests (Unit + Integration)
├── frontend/                 # React 18 + TypeScript + Vite + TailwindCSS + Zustand
│   ├── src/
│   │   ├── components/       # UI (Common, Room, Places, Voting, Schedule, Conflicts)
│   │   ├── hooks/            # useRoom, useWebSocket, useMinuteFormat
│   │   ├── services/         # API Client (Axios), WSClient, Storage
│   │   ├── store/            # Zustand Stores (Room, Place, Schedule, Conflict)
│   │   ├── mocks/            # Mock Service Worker (MSW v2) cho isolated dev
│   │   └── pages/            # HomePage, RoomPage
│   └── src/__tests__/        # 47 Automated Tests (Vitest + React DOM Server)
└── docker-compose.yml        # Orchestration đầy đủ (PostgreSQL 15, Backend, Frontend)
```

---

## 🚀 Khởi Chạy Nhanh Bằng 1 Lệnh Duy Nhất

Yêu cầu: Đã cài đặt **Docker** và **Docker Compose**.

```bash
docker compose up --build
```

Sau khi khởi chạy:
- **Frontend App**: [http://localhost:5173](http://localhost:5173)
- **Backend API Docs (Swagger UI)**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **PostgreSQL Database**: `localhost:5432` (`didau` / `postgres` / `postgres`)

---

## 🌱 Nạp Dữ Liệu Mẫu (Seed Data)

Hệ thống cung cấp sẵn script seed dữ liệu mẫu khởi tạo phòng `DIDAU8` (điểm hẹn Q.1, khung giờ 17:00–23:00) với 3 thành viên, 7 địa điểm (5 thêm tay + 2 quán OSM có `external_id` thật), hai quán OSM hòa 3 phiếu ở đầu bảng để demo "🎲 Chọn hộ", và 1 mục lịch trình mẫu:

```bash
# Chạy trong container backend:
docker exec didau_backend python -m app.core.seed

# Hoặc nếu chạy backend cục bộ (Poetry):
cd backend && poetry run python -m app.core.seed
```

### Thông tin phòng mẫu sau khi Seed:
- **Mã phòng tham gia**: `DIDAU8`
- **Host (HoangNam)**: Token `a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d`
- **Thành viên 2 (ThuTrang)**: Token `b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e`
- **Thành viên 3 (MinhKhoa)**: Token `c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f`

---

## 🎬 Kịch Bản Demo Kiểm Thử End-to-End (2 Cửa Sổ Trình Duyệt)

1. **Bước 1 (Mở 2 Tab)**:
   - **Tab 1 (Cửa sổ thường)**: Mở [http://localhost:5173](http://localhost:5173) -> Nhập mã phòng `DIDAU8` và nickname `HoangNam` (hoặc tạo phòng mới).
   - **Tab 2 (Cửa sổ ẩn danh)**: Mở [http://localhost:5173](http://localhost:5173) -> Chọn **"Tham gia phòng"** -> Nhập mã phòng `DIDAU8` và nickname `ThuTrang`.
2. **Bước 2 (Gợi ý quán & Tự nhận diện category)**:
   - Trên Tab 1, bấm **"Gợi ý quán"** -> Nhập tên quán: `Trà Sữa Koi Thé`.
   - Hệ thống tự động phát hiện danh mục `DRINK` (Đồ uống) và thẻ địa điểm xuất hiện trên cả 2 màn hình tức thì.
3. **Bước 3 (Bỏ phiếu realtime)**:
   - Tab 1 bấm nút Upvote (+1) tại một địa điểm bất kỳ.
   - Tab 2 ngay lập tức nhảy điểm số theo thời gian thực qua WebSocket mà không cần reload trang.
4. **Bước 4 (Host chốt TieBreak)**:
   - Tab 1 (Host) bấm nút **"Chốt vote"** -> Chọn chiến lược phân định (ví dụ: `Most Upvotes` hoặc `Earliest Submission`) -> Bấm xác nhận.
   - Các địa điểm thắng cuộc được chuyển sang trạng thái `ACCEPTED` (Đã chốt ⭐).
5. **Bước 5 (Xếp lịch trình & Báo xung đột)**:
   - Chuyển sang tab **"Lịch trình chuyến đi"** -> Bấm **"Xếp lịch mới"**.
   - Chọn quán và đặt giờ trùng với một địa điểm đang có (ví dụ: `09:30 - 10:30`).
   - Thanh **ConflictAlertBanner màu đỏ** (`CRITICAL`) xuất hiện ghim đầu trang cảnh báo trùng giờ.
   - Bấm **"Chi tiết"** để xem phân tích xung đột và điều chỉnh lại giờ để banner tự động giải tỏa.

---

## 🗺️ Giai đoạn 2: Bản đồ, Chọn hộ & Tự lên lịch

Với phòng `DIDAU8` sau khi seed:
1. Tab **🗺️ Bản đồ**: chọn một quán trên bản đồ (dữ liệu OSM, không cần key) → **+ Thêm vào lựa chọn**.
2. Hai quán dẫn đầu đang hòa → banner **🎲 Chọn hộ** hiện ra → Host quay **Vòng quay**; mọi tab dừng cùng một ô (kết quả do server tính theo `seed`).
3. Bấm **✨ Lên lịch giúp tôi** → xem lộ trình nháp → Host **Áp dụng lịch trình**; không còn xung đột.
4. Mở một quán → viết **review nội bộ** (sao, tag, bình luận ≤ 280 ký tự).

Chế độ `google` (tuỳ chọn) bật bằng biến môi trường `PLACES_PROVIDER=google` + key; xem [docs/DEPLOY.md](docs/DEPLOY.md) mục 6. Không đặt key thì ứng dụng không gửi request nào tới `googleapis.com`.

```bash
# Ví dụ: chạy chế độ google với docker compose (cần key thật)
PLACES_PROVIDER=google GOOGLE_MAPS_SERVER_KEY=... VITE_GOOGLE_MAPS_BROWSER_KEY=... docker compose up --build
```

---

## 🧪 Kiểm Thử Tự Động (Automated Testing)

Toàn bộ hệ thống đạt độ phủ kiểm thử 100% các tiêu chí hợp đồng:

### 1. Backend Tests (513 Tests Pass)
```bash
# Chạy trong container Docker:
docker exec didau_backend poetry run pytest -v

# Hoặc chạy trên máy host:
cd backend
poetry run pytest -v
```

### 2. Frontend Tests (150 Tests Pass)
```bash
cd frontend
npm test
npm run lint
npm run build
```

### 3. Smoke Test End-to-End (cần backend đang chạy)
Tạo phòng, thêm quán OSM, hòa phiếu, Chọn hộ bằng vòng quay (2 client WebSocket phải nhận cùng góc dừng), tự lên lịch + áp dụng, kiểm tra không có xung đột nặng, review nội bộ:
```bash
cd backend
poetry run python ../scripts/smoke_test.py http://localhost:8000 http://localhost:5173 osm
# Chế độ google: chạy backend với PLACES_PROVIDER=google rồi đổi tham số cuối thành google
```

---

## 📄 Bản Quyền & Giấy Phép

Dự án phát triển mã nguồn mở theo chuẩn kiến trúc Clean / Onion Architecture.
Toàn bộ đặc tả API, Schema và sự kiện WebSocket tuân thủ chặt chẽ tài liệu [docs/CONTRACTS.md](docs/CONTRACTS.md).
