# DANH SÁCH TÁC VỤ PHÂN CHIA (TASKS BREAKDOWN)

Tài liệu này chia nhỏ toàn bộ dự án "Đi Đâu" thành 22 tác vụ độc lập (T-01 đến T-22). Mỗi tác vụ được thiết kế tối ưu vừa sức cho một session AI (dưới 15 files và dưới 1500 dòng code), có ranh giới file rõ ràng và tiêu chí kiểm thử tự động / thủ công cụ thể.

---

## 1. ĐỒ THỊ PHỤ THUỘC VÀ CÁC LÀN CHẠY SONG SONG (DEPENDENCY GRAPH)

```mermaid
flowchart TD
    classDef foundation fill:#e1f5fe,stroke:#0288d1,stroke-width:2px;
    classDef pureLogic fill:#e8f5e9,stroke:#388e3c,stroke-width:2px;
    classDef backend fill:#fff3e0,stroke:#f57c00,stroke-width:2px;
    classDef frontend fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px;
    classDef integration fill:#ffebee,stroke:#d32f2f,stroke-width:2px;

    T01["T-01: Scaffolding Khung Dự Án<br/>FastAPI + Vite + Docker + CI"]:::foundation

    %% LÀN 1: PURE LOGIC (Không phụ thuộc DB)
    T03["T-03: Pure Logic: CategoryDetector"]:::pureLogic
    T04["T-04: Pure Logic: TieBreakStrategy"]:::pureLogic
    T05["T-05: Pure Logic: ConflictRules"]:::pureLogic
    T06["T-06: EventBus & Domain Events"]:::pureLogic

    %% LÀN 2: BACKEND PERSISTENCE & SERVICES
    T02["T-02: DB Models & Alembic Schema"]:::backend
    T07["T-07: SQLAlchemy Repositories"]:::backend
    T08["T-08: Room & Member API"]:::backend
    T09["T-09: Place Suggestion API"]:::backend
    T10["T-10: Voting & TieBreak API"]:::backend
    T11["T-11: Schedule Planner API"]:::backend
    T12["T-12: Conflict Service API"]:::backend
    T13["T-13: WebSocket & Broadcaster"]:::backend
    T14["T-14: Phase 2 Interfaces & Stubs"]:::backend

    %% LÀN 3: FRONTEND (Chạy song song bằng Mock Service Worker)
    T15["T-15: MSW Mocks & Handlers"]:::frontend
    T16["T-16: API Client & Zustand Store"]:::frontend
    T17["T-17: WebSocket Hook Engine"]:::frontend
    T18["T-18: UI Room & Member View"]:::frontend
    T19["T-19: UI Place Suggestion"]:::frontend
    T20["T-20: UI Realtime Voting"]:::frontend
    T21["T-21: UI Schedule & Conflicts"]:::frontend

    %% LÀN 4: TÍCH HỢP HỆ THỐNG
    T22["T-22: Tích Hợp Toàn Diện & E2E"]:::integration

    %% Phụ thuộc
    T01 --> T02
    T01 --> T03
    T01 --> T04
    T01 --> T05
    T01 --> T06
    T01 --> T15

    %% Backend flow
    T02 --> T07
    T06 --> T07
    T07 --> T08
    T03 --> T09
    T07 --> T09
    T08 --> T09
    T04 --> T10
    T09 --> T10
    T07 --> T11
    T09 --> T11
    T05 --> T12
    T11 --> T12
    T08 --> T13
    T09 --> T13
    T10 --> T13
    T01 --> T14

    %% Frontend flow
    T15 --> T16
    T16 --> T17
    T16 --> T18
    T16 --> T19
    T17 --> T20
    T19 --> T20
    T17 --> T21
    T19 --> T21

    %% Integration
    T08 --> T22
    T09 --> T22
    T10 --> T22
    T11 --> T22
    T12 --> T22
    T13 --> T22
    T14 --> T22
    T18 --> T22
    T19 --> T22
    T20 --> T22
    T21 --> T22
```

---

## 2. CHI TIẾT TỪNG TÁC VỤ

### T-01: Scaffolding Khung Dự Án (FastAPI, Vite, Docker Compose, CI)
- **Phụ thuộc**: Không
- **Có thể chạy song song với**: Không
- **Được phép tạo/sửa**:
  - `docker-compose.yml`, `Makefile`, `.gitignore`
  - `backend/Dockerfile`, `backend/pyproject.toml`, `backend/app/main.py`, `backend/app/config.py`
  - `frontend/Dockerfile`, `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/tailwind.config.js`, `frontend/postcss.config.js`, `frontend/index.html`, `frontend/src/App.tsx`, `frontend/src/main.tsx`
  - `.github/workflows/ci.yml` (nếu có)
- **KHÔNG được sửa**: Thư mục `docs/`
- **Mô tả**: Khởi tạo cấu trúc dự án chuẩn, thiết lập môi trường Python Poetry/Pip cho backend và Vite + React + Tailwind + TypeScript cho frontend. Thiết lập `docker-compose.yml` chạy đồng thời backend (cổng 8000), frontend (cổng 5173), và database (PostgreSQL 15 cổng 5432). Viết cấu hình linter (flake8/black/ruff hoặc ruff + pyright, eslint + prettier).
- **Tiêu chí hoàn thành**:
  - Lệnh `docker-compose up --build` khởi động cả 3 container không có lỗi.
  - Endpoint `GET http://localhost:8000/health` trả về `{"status": "ok"}`.
  - Trang web `http://localhost:5173` hiển thị tiêu đề "Đi Đâu".
  - Chạy `pytest` ở backend pass test rỗng ban đầu; `npm run build` ở frontend pass không lỗi type.
- **Cách kiểm tra thủ công**: Chạy `curl http://localhost:8000/health` và mở trình duyệt truy cập `http://localhost:5173`.

---

### T-02: Backend Core Models, Database Connection & Alembic Migrations
- **Phụ thuộc**: T-01
- **Có thể chạy song song với**: T-03, T-04, T-05, T-06, T-15
- **Được phép tạo/sửa**:
  - `backend/app/core/database.py`, `backend/app/core/exceptions.py`, `backend/app/core/time_utils.py`, `backend/app/core/id_generator.py`
  - `backend/app/domain/enums.py`
  - `backend/app/domain/models/room.py`, `backend/app/domain/models/member.py`, `backend/app/domain/models/place.py`, `backend/app/domain/models/vote.py`, `backend/app/domain/models/schedule.py`, `backend/app/domain/models/conflict.py`
  - `backend/alembic.ini`, `backend/alembic/*`
  - `backend/tests/unit/test_time_utils.py`
- **KHÔNG được sửa**: Frontend, logic patterns (`backend/app/domain/patterns/*`), API Routers.
- **Mô tả**: Định nghĩa đầy đủ các SQLAlchemy 2.0 Async declarative models và Alembic migration tương ứng chính xác với Schema DB trong `CONTRACTS.md`. Viết tiện ích chuyển đổi giờ phút `time_utils.py` (chuyển đổi giữa định dạng `HH:MM` và phút từ 0:00, timezone `Asia/Ho_Chi_Minh`).
- **Tiêu chí hoàn thành**:
  - Chạy `alembic upgrade head` tạo thành công tất cả 6 bảng trong PostgreSQL/SQLite.
  - `pytest tests/unit/test_time_utils.py` pass 100% test cases (chuyển đổi giờ `00:00` -> 0, `09:30` -> 570, `23:59` -> 1439 và ngược lại).
- **Cách kiểm tra thủ công**: Kết nối database kiểm tra bảng và cột bằng `\dt` hoặc SQLite inspector.

---

### T-03: Pure Logic - PlaceCategoryDetector Pattern & Unit Tests
- **Phụ thuộc**: T-01
- **Có thể chạy song song với**: T-02, T-04, T-05, T-06, T-15
- **Được phép tạo/sửa**:
  - `backend/app/domain/patterns/category_detector/*`
  - `backend/tests/unit/test_category_detector.py`
- **KHÔNG được sửa**: Database models, Repositories, Routers.
- **Mô tả**: Hiện thực hóa interface `IPlaceCategoryDetector` và các lớp cụ thể:
  1. `KeywordCategoryDetector`: Nhận diện danh mục bằng bộ từ khóa tiếng Việt (phở, bún, bánh canh -> FOOD; cafe, trà sữa, pub -> DRINK; cgv, rạp chiếu, bida -> ENTERTAINMENT;...).
  2. `UrlPatternCategoryDetector`: Nhận diện qua domain (shopeefood.vn, grab.com/food -> FOOD; agoda.com, booking.com -> ACCOMMODATION).
  3. `CompositeCategoryDetector`: Kết hợp các detector với thứ tự ưu tiên và fallback về `PlaceCategory.OTHER`.
- **Tiêu chí hoàn thành**:
  - `pytest tests/unit/test_category_detector.py` pass với ít nhất 20 test cases kiểm thử các tên quán phổ biến tại Việt Nam. Không phụ thuộc DB.
- **Cách kiểm tra thủ công**: Chạy `python -m pytest tests/unit/test_category_detector.py -v`.

---

### T-04: Pure Logic - TieBreakStrategy Pattern & Voting Resolution
- **Phụ thuộc**: T-01
- **Có thể chạy song song với**: T-02, T-03, T-05, T-06, T-15
- **Được phép tạo/sửa**:
  - `backend/app/domain/patterns/tie_break/*`
  - `backend/tests/unit/test_tie_break.py`
- **KHÔNG được sửa**: Database models, Routers, Repositories.
- **Mô tả**: Hiện thực hóa interface `ITieBreakStrategy` và 5 chiến lược phân định hòa phiếu:
  1. `EarliestSubmissionTieBreakStrategy`: Ưu tiên địa điểm có `created_at` sớm nhất.
  2. `MostUpvotesTieBreakStrategy`: Ưu tiên địa điểm có số lượt Upvote tuyệt đối nhiều hơn.
  3. `CreatorPriorityTieBreakStrategy`: Ưu tiên địa điểm do Host đề xuất.
  4. `RandomTieBreakStrategy`: Phân định ngẫu nhiên có kiểm soát (deterministic pseudo-random qua seed).
  5. `CategoryDiversityTieBreakStrategy`: Ưu tiên địa điểm có Category chưa xuất hiện trong các địa điểm đã chấp nhận.
  - Viết `TieBreakStrategyFactory` nạp chiến lược theo tên.
- **Tiêu chí hoàn thành**:
  - `pytest tests/unit/test_tie_break.py` pass 100% các kịch bản hòa phiếu mô phỏng.
- **Cách kiểm tra thủ công**: Chạy `python -m pytest tests/unit/test_tie_break.py -v`.

---

### T-05: Pure Logic - ConflictRule Pattern & ConflictDetectionEngine
- **Phụ thuộc**: T-01
- **Có thể chạy song song với**: T-02, T-03, T-04, T-06, T-15
- **Được phép tạo/sửa**:
  - `backend/app/domain/patterns/conflict_rule/*`
  - `backend/tests/unit/test_conflict_rules.py`
- **KHÔNG được sửa**: Database models, Routers, Repositories.
- **Mô tả**: Hiện thực hóa interface `IConflictRule` và `ConflictDetectionEngine`:
  1. `TimeOverlapConflictRule`: Báo `CRITICAL` nếu 2 mục lịch trình cùng ngày có khung giờ `[start_minute, end_minute]` giao nhau.
  2. `TravelTimeConflictRule`: Báo `WARNING` nếu khoảng thời gian giữa 2 địa điểm liên tiếp bé hơn thời gian di chuyển ước tính dựa trên khoảng cách tọa độ Haversine.
  3. `OpeningHoursConflictRule`: Báo `ERROR` nếu xếp lịch ngoài khung giờ mở cửa `[open_minute, close_minute]`.
  4. `DuplicatePlaceConflictRule`: Báo `WARNING` nếu 2 địa điểm có tên giống nhau (>90% tương đồng) hoặc khoảng cách tọa độ < 50 mét.
  5. `BudgetThresholdConflictRule`: Báo `WARNING` nếu tổng chi phí vượt ngân sách `budget_limit`.
- **Tiêu chí hoàn thành**:
  - `pytest tests/unit/test_conflict_rules.py` pass tất cả kịch bản kiểm tra xung đột logic thuần không cần kết nối DB.
- **Cách kiểm tra thủ công**: Chạy `python -m pytest tests/unit/test_conflict_rules.py -v`.

---

### T-06: EventBus & Domain Event System
- **Phụ thuộc**: T-01
- **Có thể chạy song song với**: T-02, T-03, T-04, T-05, T-15
- **Được phép tạo/sửa**:
  - `backend/app/domain/patterns/event_bus/*`
  - `backend/tests/unit/test_event_bus.py`
- **KHÔNG được sửa**: Database models, Routers.
- **Mô tả**: Xây dựng hệ thống Domain Event và `InMemoryEventBus` cho phép đăng ký subscriber và xuất bản sự kiện bất đồng bộ (`async def publish(event)`). Định nghĩa các sự kiện: `MemberJoinedEvent`, `PlaceAddedEvent`, `VoteCastEvent`, `PlaceStatusChangedEvent`, `ScheduleUpdatedEvent`, `ConflictDetectedEvent`.
- **Tiêu chí hoàn thành**:
  - `pytest tests/unit/test_event_bus.py` pass: khi publish sự kiện, tất cả các handler đã đăng ký đều được kích hoạt với payload chính xác.
- **Cách kiểm tra thủ công**: Chạy `python -m pytest tests/unit/test_event_bus.py -v`.

---

### T-07: Backend Database Repositories Layer (SQLAlchemy Async)
- **Phụ thuộc**: T-02, T-06
- **Có thể chạy song song với**: T-03, T-04, T-05, T-15
- **Được phép tạo/sửa**:
  - `backend/app/repositories/*`
  - `backend/tests/integration/test_repositories.py`
- **KHÔNG được sửa**: Domain patterns, API Routers, Frontend.
- **Mô tả**: Hiện thực hóa các interface repository đã định nghĩa trong `CONTRACTS.md` bằng SQLAlchemy 2.0 Async Session:
  - `RoomRepository`, `MemberRepository`, `PlaceRepository`, `VoteRepository`, `ScheduleRepository`, `ConflictRepository`.
  - Hỗ trợ đầy đủ các truy vấn: tìm theo ID, mã phòng `code`, token thành viên `token`, upsert phiếu vote, tính toán tổng điểm vote bằng SQL aggregation.
- **Tiêu chí hoàn thành**:
  - `pytest tests/integration/test_repositories.py` pass với database SQLite Async / Test PostgreSQL: CRUD hoạt động trơn tru, quan hệ khóa ngoại và xóa cascade đúng quy cách.
- **Cách kiểm tra thủ công**: Chạy test integration của repositories.

---

### T-08: Backend Room & Member Service & REST API Routers
- **Phụ thuộc**: T-07
- **Có thể chạy song song với**: T-09, T-10, T-11, T-12, T-15
- **Được phép tạo/sửa**:
  - `backend/app/schemas/common.py`, `backend/app/schemas/room.py`, `backend/app/schemas/member.py`
  - `backend/app/services/room_service.py`, `backend/app/services/member_service.py`
  - `backend/app/api/deps.py`, `backend/app/api/v1/rooms.py`, `backend/app/api/v1/members.py`, `backend/app/api/v1/router.py`
  - `backend/tests/integration/test_rooms_api.py`
- **KHÔNG được sửa**: Place logic, Schedule logic, Frontend.
- **Mô tả**:
  - Xây dựng dependency xác thực `get_current_member` trong `deps.py` kiểm tra `X-Member-Token`.
  - Endpoint `POST /api/v1/rooms`: Tạo phòng mới, sinh mã phòng 6 ký tự ngẫu nhiên, tạo host member và trả về `member_token`.
  - Endpoint `POST /api/v1/rooms/join`: Tham gia phòng bằng mã phòng và nickname, trả về `member_token`.
  - Endpoint `GET /api/v1/rooms/{room_id}`: Lấy thông tin phòng và danh sách thành viên.
  - Phát sự kiện `MemberJoinedEvent` qua `EventBus` khi có người tham gia.
- **Tiêu chí hoàn thành**:
  - `pytest tests/integration/test_rooms_api.py` pass: Tạo phòng, join phòng, kiểm tra mã phòng trùng lặp, nickname trùng lặp, token auth thất bại trả về lỗi chuẩn `ApiErrorEnvelope`.
- **Cách kiểm tra thủ công**: Dùng cURL gọi tạo phòng và join phòng.

---

### T-09: Backend Place Application Service & REST API Endpoints
- **Phụ thuộc**: T-03, T-07, T-08
- **Có thể chạy song song với**: T-10, T-11, T-12, T-15
- **Được phép tạo/sửa**:
  - `backend/app/schemas/place.py`
  - `backend/app/services/place_service.py`
  - `backend/app/api/v1/places.py`
  - `backend/tests/integration/test_places_api.py`
- **KHÔNG được sửa**: Voting logic, Schedule logic.
- **Mô tả**:
  - Tích hợp `PlaceCategoryDetector` vào `PlaceService`: tự động gán nhãn danh mục khi người dùng thêm địa điểm mới.
  - Endpoint `POST /api/v1/rooms/{room_id}/places`: Thêm địa điểm mới đề xuất, phát sự kiện `PlaceAddedEvent`.
  - Endpoint `GET /api/v1/rooms/{room_id}/places`: Lấy danh sách địa điểm của phòng kèm tóm tắt điểm vote và vote của thành viên hiện tại.
  - Endpoint `PATCH /api/v1/rooms/{room_id}/places/{place_id}` và `DELETE /api/v1/rooms/{room_id}/places/{place_id}` (kiểm tra quyền submitter hoặc host).
- **Tiêu chí hoàn thành**:
  - `pytest tests/integration/test_places_api.py` pass: Thêm địa điểm tự động nhận diện danh mục đúng; lấy danh sách thành công.
- **Cách kiểm tra thủ công**: Gửi cURL thêm quán "Cà Phê Trứng 3T" và kiểm tra xem danh mục có tự chuyển thành `DRINK` hay không.

---

### T-10: Backend Voting Application Service & TieBreak REST API Endpoints
- **Phụ thuộc**: T-04, T-09
- **Có thể chạy song song với**: T-11, T-12, T-15
- **Được phép tạo/sửa**:
  - `backend/app/schemas/vote.py`
  - `backend/app/services/voting_service.py`
  - `backend/app/api/v1/votes.py`
  - `backend/tests/integration/test_votes_api.py`
- **KHÔNG được sửa**: Schedule logic, Conflict logic.
- **Mô tả**:
  - Endpoint `POST /api/v1/rooms/{room_id}/places/{place_id}/votes`: Bỏ phiếu `+1`, `-1`, hoặc `0`. Cập nhật điểm và phát sự kiện `VoteCastEvent`.
  - Endpoint `DELETE /api/v1/rooms/{room_id}/places/{place_id}/votes`: Rút phiếu vote.
  - Endpoint `POST /api/v1/rooms/{room_id}/voting/resolve`: Dành riêng cho `HOST`. Áp dụng `TieBreakStrategy` để chốt top $N$ địa điểm thành `ACCEPTED`, số còn lại thành `REJECTED`, phát sự kiện `PlaceStatusChangedEvent`.
- **Tiêu chí hoàn thành**:
  - `pytest tests/integration/test_votes_api.py` pass: Vote hợp lệ, đổi vote, tính toán điểm số chính xác, chốt kết quả bằng TieBreak chính xác.
- **Cách kiểm tra thủ công**: Tạo 2 user vote hòa điểm cho 2 quán, gọi API resolve với `MOST_UPVOTES` và kiểm tra quán thắng cuộc.

---

### T-11: Backend Schedule Application Service & REST API Endpoints
- **Phụ thuộc**: T-07, T-09
- **Có thể chạy song song với**: T-10, T-12, T-15
- **Được phép tạo/sửa**:
  - `backend/app/schemas/schedule.py`
  - `backend/app/services/schedule_service.py`
  - `backend/app/api/v1/schedule.py`
  - `backend/tests/integration/test_schedule_api.py`
- **KHÔNG được sửa**: Voting logic, WebSocket manager.
- **Mô tả**:
  - Endpoint `GET /api/v1/rooms/{room_id}/schedule`: Lấy danh sách lịch trình theo thứ tự thời gian.
  - Endpoint `POST /api/v1/rooms/{room_id}/schedule`: Thêm một địa điểm vào khung giờ cụ thể (`day_offset`, `start_minute`, `end_minute`).
  - Endpoint `PUT /api/v1/rooms/{room_id}/schedule`: Bulk update (sắp xếp lại thứ tự / đổi giờ kéo thả). Phát sự kiện `ScheduleUpdatedEvent`.
  - Endpoint `DELETE /api/v1/rooms/{room_id}/schedule/{item_id}`: Xóa mục lịch trình.
- **Tiêu chí hoàn thành**:
  - `pytest tests/integration/test_schedule_api.py` pass: Thêm, sửa, sắp xếp lịch trình thành công; kiểm tra ràng buộc `start_minute < end_minute`.
- **Cách kiểm tra thủ công**: Gửi request tạo 2 mục lịch trình và gọi bulk update thay đổi thứ tự.

---

### T-12: Backend Conflict Service & Evaluation REST API Endpoints
- **Phụ thuộc**: T-05, T-11
- **Có thể chạy song song với**: T-10, T-13, T-14, T-15
- **Được phép tạo/sửa**:
  - `backend/app/schemas/conflict.py`
  - `backend/app/services/conflict_service.py`
  - `backend/app/api/v1/conflicts.py`
  - `backend/tests/integration/test_conflicts_api.py`
- **KHÔNG được sửa**: WebSocket manager, Frontend.
- **Mô tả**:
  - Nối `ConflictDetectionEngine` với cơ sở dữ liệu qua `ConflictService`.
  - Tự động đăng ký `ConflictEvaluationHandler` lắng nghe `ScheduleUpdatedEvent` và `PlaceAddedEvent` trên `EventBus` để đánh giá lại xung đột ngầm.
  - Endpoint `GET /api/v1/rooms/{room_id}/conflicts`: Lấy danh sách cảnh báo xung đột hiện tại của phòng.
  - Endpoint `POST /api/v1/rooms/{room_id}/conflicts/evaluate`: Kích hoạt đánh giá thủ công và trả về danh sách xung đột mới nhất.
- **Tiêu chí hoàn thành**:
  - `pytest tests/integration/test_conflicts_api.py` pass: Khi xếp lịch 2 quán đè giờ nhau (09:00-10:00 và 09:30-10:30), API trả về xung đột `TIME_OVERLAP` mức `CRITICAL`.
- **Cách kiểm tra thủ công**: Thử tạo lịch trùng giờ và gọi API evaluate xem kết quả JSON.

---

### T-13: Backend WebSocket Connection Manager & Realtime Broadcaster
- **Phụ thuộc**: T-08, T-09, T-10, T-11
- **Có thể chạy song song với**: T-12, T-14, T-15
- **Được phép tạo/sửa**:
  - `backend/app/schemas/websocket.py`
  - `backend/app/services/websocket_manager.py`
  - `backend/app/domain/patterns/event_bus/handlers.py`
  - `backend/app/api/v1/websocket.py`
  - `backend/tests/integration/test_websocket.py`
- **KHÔNG được sửa**: Repositories, Domain patterns thuần.
- **Mô tả**:
  - Hiện thực `WebSocketConnectionManager` quản lý kết nối socket theo từng `room_id`.
  - Endpoint `WebSocket /ws/rooms/{room_id}?token={member_token}`: Xác thực token thành viên khi kết nối.
  - Đăng ký `WebSocketBroadcastHandler` vào `EventBus`: Bất cứ khi nào có Domain Event (`MemberJoinedEvent`, `PlaceAddedEvent`, `VoteCastEvent`, `ScheduleUpdatedEvent`,...), handler tự đóng gói phong bì `{type, payload, ts}` và broadcast tới các client đang kết nối trong phòng.
  - Hỗ trợ sự kiện heartbeat `PING` / `PONG`.
- **Tiêu chí hoàn thành**:
  - `pytest tests/integration/test_websocket.py` pass: Kết nối websocket thành công; khi gọi REST API thêm địa điểm thì kết nối websocket nhận được message `PLACE_ADDED`.
- **Cách kiểm tra thủ công**: Mở kết nối qua `wscat` hoặc Python test script để lắng nghe sự kiện khi gọi REST API.

---

### T-14: Backend Phase 2 Abstract Interfaces & Stub Implementations
- **Phụ thuộc**: T-01
- **Có thể chạy song song với**: Tất cả các task khác
- **Được phép tạo/sửa**:
  - `backend/app/domain/phase2_interfaces/*`
  - `backend/tests/mocks/phase2_stubs.py`
  - `backend/tests/unit/test_phase2_stubs.py`
- **KHÔNG được sửa**: Core Phase 1 APIs.
- **Mô tả**: Định nghĩa chuẩn xác các Abstract Base Class (`ABC`) cho Phase 2 theo `CONTRACTS.md`:
  - `IRouteOptimizationService`: Tối ưu hóa lộ trình di chuyển.
  - `IExternalPlacesProvider`: Tích hợp tìm kiếm địa điểm từ bản đồ bên ngoài.
  - `IExpenseSplittingService`: Tính toán chia hóa đơn theo nhóm.
  - Cung cấp các lớp Mock / Stub đơn giản trả về dữ liệu mẫu để đảm bảo tuân thủ nguyên tắc Dependency Inversion.
- **Tiêu chí hoàn thành**:
  - `pytest tests/unit/test_phase2_stubs.py` pass: Kiểm tra kiểu dữ liệu và chữ ký phương thức khớp 100% với đặc tả hợp đồng.
- **Cách kiểm tra thủ công**: Chạy test kiểm thử stub interfaces.

---

### T-15: Frontend Mock Service Worker (MSW) & Contract Mock Handlers
- **Phụ thuộc**: T-01
- **Có thể chạy song song với**: T-02, T-03, T-04, T-05, T-06, T-07, T-08
- **Được phép tạo/sửa**:
  - `frontend/src/types/*`
  - `frontend/src/mocks/browser.ts`, `frontend/src/mocks/handlers.ts`, `frontend/src/mocks/mockData.ts`
  - `frontend/src/main.tsx` (bật cờ `ENABLE_MSW`)
- **KHÔNG được sửa**: Backend code.
- **Mô tả**:
  - Định nghĩa toàn bộ TypeScript types trong `frontend/src/types/` khớp 1-1 với schema trong `CONTRACTS.md`.
  - Cài đặt và cấu hình Mock Service Worker (MSW) chặn toàn bộ request `/api/v1/*` và trả về mock data chân thực theo đúng hợp đồng `CONTRACTS.md`.
  - Cho phép đội ngũ Frontend phát triển và kiểm thử giao diện hoàn chỉnh độc lập mà không cần backend đang chạy.
- **Tiêu chí hoàn thành**:
  - Khởi động Vite với `VITE_ENABLE_MOCK=true`, mở Console trình duyệt thấy `[MSW] Mocking enabled`.
  - Gọi `fetch('/api/v1/rooms/c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21')` trả về JSON phòng mẫu.
- **Cách kiểm tra thủ công**: Chạy `npm run dev` trên frontend và xem log network trong DevTools.

---

### T-16: Frontend API Client, Token Storage & Global Zustand Stores
- **Phụ thuộc**: T-15
- **Có thể chạy song song với**: T-17, T-18
- **Được phép tạo/sửa**:
  - `frontend/src/services/storage/tokenStorage.ts`
  - `frontend/src/services/api/*`
  - `frontend/src/store/*`
- **KHÔNG được sửa**: Backend code, Mock handlers.
- **Mô tả**:
  - Xây dựng module `tokenStorage.ts` lưu/đọc/xóa `member_token` trong `localStorage`.
  - Xây dựng HTTP Client (`client.ts` dùng Axios hoặc Fetch) tự động gắn header `X-Member-Token: <token>`.
  - Viết các API services: `roomApi.ts`, `placeApi.ts`, `voteApi.ts`, `scheduleApi.ts`, `conflictApi.ts`.
  - Xây dựng các Zustand stores: `useRoomStore`, `usePlaceStore`, `useScheduleStore`, `useConflictStore`.
- **Tiêu chí hoàn thành**:
  - Các store gọi API qua MSW và cập nhật state chuẩn xác.
- **Cách kiểm tra thủ công**: Viết unit test nhanh với Vitest hoặc kiểm tra store trên React DevTools.

---

### T-17: Frontend WebSocket Client & Realtime Hook Engine
- **Phụ thuộc**: T-16
- **Có thể chạy song song với**: T-18, T-19
- **Được phép tạo/sửa**:
  - `frontend/src/services/websocket/wsClient.ts`, `frontend/src/services/websocket/wsTypes.ts`
  - `frontend/src/hooks/useWebSocket.ts`, `frontend/src/hooks/useRoom.ts`
- **KHÔNG được sửa**: Backend code.
- **Mô tả**:
  - Xây dựng client WebSocket tự động kết nối lại (auto-reconnect với exponential backoff), gửi nhịp tim `PING` mỗi 30 giây, đóng gói/giải mã envelope `{type, payload, ts}`.
  - Xây dựng custom hook `useWebSocket(roomId)` tự động phân phối các sự kiện (`PLACE_ADDED`, `VOTE_UPDATED`, `SCHEDULE_UPDATED`, `CONFLICTS_UPDATED`) cập nhật thẳng vào các Zustand store tương ứng.
- **Tiêu chí hoàn thành**:
  - Hook quản lý vòng đời kết nối an toàn, không bị duplicate event listener khi re-render.
- **Cách kiểm tra thủ công**: Thử dispatch message giả lập vào client và kiểm tra Zustand store tự cập nhật.

---

### T-18: Frontend UI - Room Creation, Joining & Member List View
- **Phụ thuộc**: T-16
- **Có thể chạy song song với**: T-17, T-19
- **Được phép tạo/sửa**:
  - `frontend/src/components/common/*`
  - `frontend/src/components/room/*`
  - `frontend/src/pages/HomePage.tsx`, `frontend/src/pages/RoomPage.tsx`
- **KHÔNG được sửa**: Places UI, Schedule UI.
- **Mô tả**:
  - Thiết kế trang chủ (`HomePage`): Form tạo phòng (nhập tiêu đề, ngày hẹn, nickname người tạo, ngân sách) và form tham gia phòng (nhập mã phòng 6 ký tự + nickname).
  - Thiết kế Header của phòng (`RoomHeader`): Hiển thị tiêu đề, ngày đi, mã phòng kèm nút Copy Link chia sẻ, avatar và badge `HOST` / `MEMBER`.
  - Danh sách thành viên trong phòng (`MemberList`): Hiển thị danh sách avatar, nickname, trạng thái online.
- **Tiêu chí hoàn thành**:
  - Người dùng có thể tạo phòng mới -> chuyển hướng sang `/rooms/:id`, token được lưu vào localStorage và thông tin phòng hiển thị đầy đủ.
- **Cách kiểm tra thủ công**: Thao tác tạo phòng trên UI và kiểm tra hiển thị.

---

### T-19: Frontend UI - Place Suggestion, Auto-category Badge & Place Cards
- **Phụ thuộc**: T-16
- **Có thể chạy song song với**: T-17, T-18, T-20
- **Được phép tạo/sửa**:
  - `frontend/src/components/places/*`
  - `frontend/src/components/common/CategoryIcon.tsx`, `frontend/src/components/common/Badge.tsx`
- **KHÔNG được sửa**: Voting logic UI, Schedule UI.
- **Mô tả**:
  - `PlaceForm`: Modal/Form thêm địa điểm đề xuất (tên quán, địa chỉ, đường link ShopeeFood/Google Maps, chi phí ước lượng, khung giờ mở cửa).
  - `PlaceCard`: Thẻ hiển thị địa điểm với hình ảnh icon phân loại danh mục (`CategoryIcon`), địa chỉ, giá cả, người đề xuất, trạng thái (`PROPOSED`, `ACCEPTED`,...).
  - `CategoryFilter`: Thanh lọc địa điểm theo danh mục (`Tất cả`, `Ăn uống`, `Cà phê`, `Vui chơi`,...).
- **Tiêu chí hoàn thành**:
  - Nhập quán ăn mới, thẻ địa điểm xuất hiện trên danh sách với badge danh mục chính xác; chức năng lọc theo category hoạt động mượt mà.
- **Cách kiểm tra thủ công**: Mở form thêm địa điểm trên trình duyệt và thử các bộ lọc danh mục.

---

### T-20: Frontend UI - Realtime Voting & Host TieBreak Modal
- **Phụ thuộc**: T-17, T-19
- **Có thể chạy song song với**: T-21
- **Được phép tạo/sửa**:
  - `frontend/src/components/voting/*`
  - `frontend/src/pages/RoomPage.tsx`
- **KHÔNG được sửa**: Schedule UI, Backend code.
- **Mô tả**:
  - `VoteButtons`: Nút bấm Upvote (+1) và Downvote (-1) với hiệu ứng đổi màu khi người dùng hiện tại đã bỏ phiếu; hiển thị tổng điểm vote theo thời gian thực.
  - `TieBreakSelectorModal`: Modal dành riêng cho `HOST`. Khi các địa điểm hòa phiếu, hiển thị danh sách các chiến lược phân định (`Earliest Submission`, `Most Upvotes`, `Creator Priority`, `Category Diversity`) và nút xác nhận chốt địa điểm vào chuyến đi.
- **Tiêu chí hoàn thành**:
  - Bấm vote -> điểm số cập nhật tức thì (optimistic update); Host bấm chốt vote -> địa điểm đổi sang trạng thái `ACCEPTED`.
- **Cách kiểm tra thủ công**: Click nút vote trên PlaceCard và mở modal TieBreak bằng role Host.

---

### T-21: Frontend UI - Drag-and-Drop Schedule Builder & Conflict Alert Banner
- **Phụ thuộc**: T-17, T-19
- **Có thể chạy song song với**: T-20
- **Được phép tạo/sửa**:
  - `frontend/src/components/schedule/*`
  - `frontend/src/components/conflicts/*`
  - `frontend/src/hooks/useMinuteFormat.ts`
- **KHÔNG được sửa**: Place card UI, Backend code.
- **Mô tả**:
  - `ScheduleTimeline`: Trục thời gian hiển thị các địa điểm đã chọn theo thứ tự giờ trong ngày (`09:00 - 10:30`,...). Cho phép kéo thả sắp xếp lại thứ tự hoặc đổi giờ.
  - `TimeSlotPicker`: Component chọn giờ phút chuyển đổi trực tiếp sang số phút từ 0:00.
  - `ConflictAlertBanner`: Thanh cảnh báo ghim đầu trang hiển thị danh sách xung đột theo cấp độ màu sắc (`CRITICAL` màu đỏ, `WARNING` màu vàng). Bấm vào xem chi tiết các mục bị đè giờ hoặc vi phạm quy tắc.
- **Tiêu chí hoàn thành**:
  - Kéo thả địa điểm vào timeline cập nhật lịch trình; khi có 2 khung giờ đè nhau, banner đỏ lập tức hiển thị cảnh báo trùng giờ.
- **Cách kiểm tra thủ công**: Tạo 2 lịch trình trùng giờ và quan sát cảnh báo hiển thị trên giao diện.

---

### T-22: Full-Stack Integration, E2E Verification, Seed Data & Final README
- **Phụ thuộc**: T-08, T-09, T-10, T-11, T-12, T-13, T-14, T-18, T-19, T-20, T-21
- **Có thể chạy song song với**: Không
- **Được phép tạo/sửa**:
  - `backend/app/core/seed.py` (hoặc lệnh seed data mẫu)
  - `README.md`
  - `docker-compose.yml` (tinh chỉnh biến môi trường kết nối thực tế)
  - `frontend/src/main.tsx` (tắt MSW mặc định khi chạy tích hợp backend)
- **KHÔNG được sửa**: Core interfaces trong `CONTRACTS.md`.
- **Mô tả**:
  - Tắt Mock Service Worker ở frontend, kết nối trực tiếp frontend với API backend và WebSocket server thực tế.
  - Viết script seed data mẫu (`seed.py`) tạo sẵn 1 phòng hoàn chỉnh: 3 thành viên, 5 địa điểm các loại, điểm vote hòa nhau, 1 lịch trình có sẵn để demo.
  - Kiểm thử End-to-End luồng hoàn chỉnh: Tạo phòng -> Mời người vào -> Đề xuất địa điểm -> Tự động nhận diện category -> Vote realtime -> TieBreak chốt kết quả -> Xếp lịch trình -> Báo xung đột -> Giải quyết xung đột.
  - Viết tài liệu `README.md` hướng dẫn chạy dự án bằng 1 lệnh duy nhất (`docker-compose up`).
- **Tiêu chí hoàn thành**:
  - Chạy `docker-compose up` mở 2 tab trình duyệt ẩn danh: Tab 1 tạo phòng, Tab 2 tham gia; Tab 1 vote thì Tab 2 nhảy số điểm ngay lập tức qua WebSocket; xếp lịch và nhận cảnh báo xung đột thời gian thực không có lỗi console.
- **Cách kiểm tra thủ công**: Thực hiện trọn vẹn kịch bản người dùng trên 2 cửa sổ trình duyệt độc lập.

---

## 3. GIAI ĐOẠN 2: BẢN ĐỒ, "CHỌN HỘ" & TỰ LÊN LỊCH (T-23 → T-37)

Thiết kế, research chi phí và lý do lựa chọn: [PLAN_MAP_DECIDE_AUTOPLAN.md](PLAN_MAP_DECIDE_AUTOPLAN.md). Thay đổi hợp đồng: **CR-02** trong [CHANGE_REQUESTS.md](CHANGE_REQUESTS.md). Quy tắc chung giữ nguyên như giai đoạn 1: mỗi task dưới 15 file, dưới 1500 dòng, có test tự động.

**Ràng buộc chung cho mọi task giai đoạn 2:**
- Không thêm dịch vụ trả phí. Mọi gọi Google phải sau cờ `PLACES_PROVIDER=google` và có đường lùi về `osm`.
- Backend **không đọc và không lưu** rating/review/ảnh của Google. Chỉ được lưu `google_place_id`.
- Mọi kết quả ngẫu nhiên (vòng quay, thang) đều do server sinh từ `seed` lưu DB, client chỉ phát hoạt ảnh.
- Planner và `TravelTimeConflictRule` dùng chung một `ITravelTimeEstimator`.

```mermaid
flowchart TD
    classDef backend fill:#fff3e0,stroke:#f57c00,stroke-width:2px;
    classDef frontend fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px;
    classDef pureLogic fill:#e8f5e9,stroke:#388e3c,stroke-width:2px;
    classDef integration fill:#ffebee,stroke:#d32f2f,stroke-width:2px;

    T23["T-23: CR-02 Contracts + Migration 002"]:::backend
    T24["T-24: FE Types + MSW cho CR-02"]:::frontend
    T25["T-25: OSM POI Snapshot + /pois API"]:::backend
    T26["T-26: Google match place_id + quota guard"]:::backend
    T27["T-27: FE MapView (MapLibre)"]:::frontend
    T28["T-28: FE PlaceSheet + Thêm vào lựa chọn + Google card"]:::frontend
    T29["T-29: Review nội bộ (BE + FE)"]:::backend
    T30["T-30: Pure Logic: DeciderTrigger + SmartPick + Wheel/Ladder"]:::pureLogic
    T31["T-31: Decision Session API + WS"]:::backend
    T32["T-32: FE Chọn hộ: Gợi ý 1 chạm + Vòng quay"]:::frontend
    T33["T-33: FE Swipe + Thang may mắn"]:::frontend
    T34["T-34: Pure Logic: ItineraryPlanner + TravelTimeEstimator"]:::pureLogic
    T35["T-35: Auto-plan API"]:::backend
    T36["T-36: FE Lên lịch giúp tôi"]:::frontend
    T37["T-37: Tích hợp GĐ2, seed, E2E, README"]:::integration

    T23 --> T24
    T23 --> T25
    T25 --> T26
    T24 --> T27
    T25 --> T27
    T27 --> T28
    T26 --> T28
    T23 --> T29
    T28 --> T29
    T23 --> T31
    T30 --> T31
    T24 --> T32
    T31 --> T32
    T32 --> T33
    T23 --> T35
    T34 --> T35
    T24 --> T36
    T35 --> T36
    T27 --> T36
    T29 --> T37
    T33 --> T37
    T36 --> T37
```

**Làn chạy song song:** T-30 và T-34 (pure logic) chạy được ngay, không cần chờ ai. Sau T-23 thì T-25, T-29 (phần BE), T-31 và T-35 chạy song song. Frontend dùng MSW (T-24) để không phải chờ backend.

---

### T-23: CR-02 — Cập nhật Contracts, Enums, Models & Alembic Migration 002
- **Phụ thuộc**: Không (chỉ cần CR-02 được duyệt)
- **Có thể chạy song song với**: T-30, T-34
- **Được phép tạo/sửa**:
  - `docs/CONTRACTS.md` (áp CR-02), `docs/CHANGE_REQUESTS.md` (đổi trạng thái CR-02)
  - `backend/app/domain/enums.py`
  - `backend/app/domain/models/place.py`, `backend/app/domain/models/room.py`, `backend/app/domain/models/review.py` (mới), `backend/app/domain/models/decision.py` (mới), `backend/app/domain/models/external_link.py` (mới), `backend/app/domain/models/__init__.py`
  - `backend/alembic/versions/002_map_decide_autoplan.py`
  - `backend/app/schemas/place.py`, `backend/app/schemas/room.py`
  - `backend/tests/unit/test_database.py`
- **KHÔNG được sửa**: Logic patterns, services, routers, frontend.
- **Mô tả**: Hiện thực đúng schema trong CR-02: thêm cột vào `places` (`source`, `external_id`, `google_place_id`, `cuisine`, `opening_hours_raw`, `coords_source`, `coords_fetched_at`) và `rooms` (`city`, `origin_lat`, `origin_lng`, `start_minute`, `end_minute`). Tạo bảng `place_reviews`, `decision_sessions`, `decision_swipes`, `external_place_links`. Thêm các enum `PlaceSource`, `CityCode`, `DecisionMode`, `DecisionStatus`, `TieBreakStrategyName.GROUP_DECISION`. Mọi cột mới đều nullable hoặc có default, để tương thích ngược với 313 test hiện có.
- **Tiêu chí hoàn thành**:
  - `alembic upgrade head` rồi `alembic downgrade -1` rồi `upgrade head` chạy sạch trên PostgreSQL và SQLite.
  - Toàn bộ test backend cũ vẫn pass. `ruff check` sạch.
- **Cách kiểm tra thủ công**: `\d places`, `\d decision_sessions` trong psql.

---

### T-24: Frontend Types & MSW Handlers cho CR-02
- **Phụ thuộc**: T-23 (chỉ cần CONTRACTS.md đã cập nhật)
- **Có thể chạy song song với**: T-25, T-29, T-31, T-35
- **Được phép tạo/sửa**:
  - `frontend/src/types/enums.ts`, `frontend/src/types/models.ts`, `frontend/src/types/api.ts`, `frontend/src/types/websocket.ts`
  - `frontend/src/mocks/handlers.ts`, `frontend/src/mocks/mockData.ts` (thêm ~30 POI mẫu quanh Q.1)
  - `frontend/src/services/api/poiApi.ts`, `reviewApi.ts`, `decisionApi.ts` (mới), `frontend/src/services/api/scheduleApi.ts`, `frontend/src/services/api/index.ts`
  - `frontend/src/__tests__/msw_phase2.test.ts` (mới)
- **KHÔNG được sửa**: Components, stores hiện có.
- **Mô tả**: Type TS khớp 1-1 với CR-02. Thêm API client và mock cho `/pois`, `/pois/search`, `/pois/google-match`, `/reviews`, `/rooms/{id}/decisions*`, `/rooms/{id}/schedule/auto-plan*`. Mock trả dữ liệu deterministic (cùng seed thì cùng kết quả).
- **Tiêu chí hoàn thành**: `npm test` pass (test mới gọi đủ endpoint qua MSW), `tsc -b` sạch.

---

### T-25: Backend OSM POI Snapshot & `/pois` API
- **Phụ thuộc**: T-23
- **Có thể chạy song song với**: T-24, T-29, T-31, T-35
- **Được phép tạo/sửa**:
  - `scripts/build_osm_pois.py` (mới; chạy tay, gọi Overpass, ghi file nén)
  - `backend/app/data/pois_hcm.json.gz`, `backend/app/data/pois_hn.json.gz` (sinh bởi script)
  - `backend/app/services/poi_service.py` (mới), `backend/app/domain/patterns/category_detector/osm_mapping.py` (mới)
  - `backend/app/api/v1/pois.py` (mới), `backend/app/api/v1/router.py`, `backend/app/schemas/poi.py` (mới)
  - `backend/app/config.py` (thêm `PLACES_PROVIDER`, `POI_DATA_DIR`)
  - `backend/tests/unit/test_poi_service.py`, `backend/tests/integration/test_pois_api.py` (mới)
- **KHÔNG được sửa**: `nominatim_service.py` (giữ cho geocode địa chỉ), models.
- **Mô tả**:
  - Script lấy `amenity ∈ {restaurant, cafe, fast_food, food_court, bar, pub, ice_cream}` cho HCM + HN. Giữ tag rút gọn. Gắn `external_id = "osm:{type}/{id}"`. Ghi `© OpenStreetMap contributors (ODbL)` vào metadata.
  - `PoiService` nạp snapshot lúc khởi động, dựng grid index 0,01°. API:
    - `GET /api/v1/pois?bbox=minLng,minLat,maxLng,maxLat&category=&limit=500`
    - `GET /api/v1/pois/search?q=&lat=&lng=&limit=10`: so khớp không dấu, xếp theo độ khớp và khoảng cách.
    - `GET /api/v1/pois/{external_id}`
  - Map tag OSM sang `PlaceCategory`. Parse `opening_hours` mẫu phổ biến thành `open_minute`/`close_minute` cho một thứ trong tuần.
- **Tiêu chí hoàn thành**: Test bbox Q.1 trả >500 điểm. Search "pho" khớp "Phở". Search không dấu khớp có dấu. Bbox quá lớn trả 422. p95 < 30 ms trên snapshot đầy đủ.
- **Cách kiểm tra thủ công**: `curl "localhost:8000/api/v1/pois/search?q=bun%20bo&lat=10.776&lng=106.70"`.

---

### T-26: Backend Google `place_id` Match & Quota Guard (cờ `PLACES_PROVIDER=google`)
- **Phụ thuộc**: T-25
- **Có thể chạy song song với**: T-27, T-29, T-31
- **Được phép tạo/sửa**:
  - `backend/app/services/google_places_service.py` (mới), `backend/app/repositories/external_link_repo.py` (mới), `backend/app/repositories/__init__.py`
  - `backend/app/api/v1/pois.py` (thêm `POST /pois/google-match`), `backend/app/schemas/poi.py`
  - `backend/app/config.py` (`GOOGLE_MAPS_SERVER_KEY`, `GOOGLE_MATCH_DAILY_LIMIT=1000`)
  - `backend/.env.example`, `render.yaml`
  - `backend/tests/unit/test_google_places_service.py` (mới, mock httpx)
- **KHÔNG được sửa**: Models.
- **Mô tả**: Gọi `POST https://places.googleapis.com/v1/places:searchText` với `X-Goog-FieldMask: places.id` (**chỉ** field này, để rơi vào SKU *Text Search Essentials IDs Only*: miễn phí, không giới hạn; thêm `displayName` là nhảy sang SKU Pro). `textQuery` = tên OSM, `locationRestriction` hình chữ nhật ±80 m quanh toạ độ OSM, `pageSize=1`. Kết quả đầu tiên chính là quán khớp. Việc kiểm tra "đúng quán" để người dùng làm bằng nút "Không đúng quán?" trên thẻ (xoá liên kết). Kết quả lưu vào `external_place_links`. Có bộ đếm/ngày, vượt ngưỡng hoặc thiếu key thì trả `{google_place_id: null, reason}`. Không bao giờ ném lỗi 5xx ra client.
- **Tiêu chí hoàn thành**: Test có các ca: hit cache, miss rồi gọi API, vượt quota, thiếu key, Google trả lỗi. Không test nào gọi mạng thật.

---

### T-27: Frontend MapView (MapLibre GL + OpenFreeMap)
- **Phụ thuộc**: T-24, T-25 (hoặc MSW)
- **Có thể chạy song song với**: T-26, T-29, T-31
- **Được phép tạo/sửa**:
  - `frontend/package.json` (thêm `maplibre-gl`)
  - `frontend/src/components/map/MapView.tsx`, `PoiLayer.ts`, `RoomPlacesLayer.ts`, `OriginPin.tsx`, `MapSearchBox.tsx`, `index.ts` (mới)
  - `frontend/src/store/useMapStore.ts` (mới), `frontend/src/store/index.ts`
  - `frontend/src/config.ts` (`VITE_MAP_STYLE_URL`, mặc định OpenFreeMap Liberty)
  - `frontend/src/pages/RoomPage.tsx` (thêm tab "🗺️ Bản đồ")
  - `frontend/src/__tests__/map_store.test.ts` (mới)
- **KHÔNG được sửa**: Components places/voting hiện có.
- **Mô tả**: Map đặt tâm theo `room.city`/`origin`. POI layer tải theo bbox (debounce 300 ms, cache theo ô lưới), gom cụm (clustering) khi zoom < 15, màu theo category. Lớp quán của phòng có viền đậm và badge điểm vote, cập nhật realtime từ store. Host kéo ghim điểm hẹn để `PATCH room`. Ô tìm kiếm gọi `/pois/search` (osm mode). Hiển thị attribution OSM/OpenFreeMap. Mobile-first: map full màn hình, controls ở dưới.
- **Tiêu chí hoàn thành**: Test store (bbox → cache key, merge POI, chọn POI). `npm run build` thành công. Thêm maplibre không làm bundle chính tăng quá 250 KB gzip (lazy-load chunk map).
- **Cách kiểm tra thủ công**: Mở phòng, vào tab Bản đồ, lướt ở Q.1 thấy chấm quán, zoom out thấy gom cụm.

---

### T-28: Frontend PlaceSheet, "Thêm vào lựa chọn" & GooglePlaceCard
- **Phụ thuộc**: T-27, T-26 (hoặc MSW)
- **Có thể chạy song song với**: T-29, T-32
- **Được phép tạo/sửa**:
  - `frontend/src/components/map/PlaceSheet.tsx`, `GooglePlaceCard.tsx`, `NearbySuggestions.tsx` (mới)
  - `frontend/src/services/google/loadPlacesUiKit.ts` (mới; nạp `importLibrary('places')` lười, chỉ khi có `VITE_GOOGLE_MAPS_BROWSER_KEY`)
  - `frontend/src/store/usePlaceStore.ts` (thêm `addPlaceFromPoi`)
  - `frontend/src/components/places/PlaceCard.tsx` (badge nguồn OSM/Google, nút "Xem trên bản đồ")
  - `frontend/src/__tests__/place_sheet.test.tsx` (mới)
- **KHÔNG được sửa**: Backend.
- **Mô tả**:
  - PlaceSheet: bottom sheet trên mobile, panel phải trên desktop. Gồm tên, category, khoảng cách tới điểm hẹn, giờ mở OSM, địa chỉ, khu review nội bộ (placeholder cho T-29), nút **+ Thêm vào lựa chọn**. Nếu quán đã có trong phòng thì nút đổi thành `VoteButtons` ngay trong sheet.
  - GooglePlaceCard: gọi `/pois/google-match`. Có `place_id` thì render `<gmp-place-details>` với `gmp-place-details-place-request`. Chỉ tạo element khi sheet mở và gỡ khi đóng. Timeout 4 s hoặc lỗi thì ẩn thẻ, không hiện lỗi đỏ.
  - "Gợi ý quanh đây" khi phòng trống: 5 POI gần điểm hẹn nhất, thuộc category còn thiếu.
- **Tiêu chí hoàn thành**: Test các ca: thêm POI tạo đúng payload (external_id, toạ độ, category, giờ); POI đã có thì hiện vote; không có key thì không nạp script Google; timeout thì card ẩn.
- **Cách kiểm tra thủ công**: 2 tab. Tab 1 chạm quán rồi Thêm, tab 2 thấy quán xuất hiện realtime cả trên map lẫn danh sách.

---

### T-29: Review nội bộ (Backend + Frontend)
- **Phụ thuộc**: T-23; phần FE phụ thuộc T-28
- **Có thể chạy song song với**: T-30, T-31, T-34
- **Được phép tạo/sửa**:
  - `backend/app/repositories/review_repo.py`, `backend/app/services/review_service.py`, `backend/app/api/v1/reviews.py`, `backend/app/schemas/review.py` (mới), `backend/app/api/v1/router.py`, `backend/app/repositories/__init__.py`
  - `backend/tests/integration/test_reviews_api.py` (mới)
  - `frontend/src/components/reviews/InternalReviews.tsx`, `ReviewForm.tsx`, `index.ts` (mới), `frontend/src/components/map/PlaceSheet.tsx`
  - `frontend/src/__tests__/reviews.test.tsx` (mới)
- **KHÔNG được sửa**: Models (đã có từ T-23).
- **Mô tả**: `GET /api/v1/reviews?external_key=` trả `{avg, count, tags_top3, items[≤20]}`. `PUT /api/v1/reviews` upsert theo (member, external_key): sao 1–5, comment ≤280 ký tự, tag thuộc danh sách cố định. Khi phòng sang COMPLETED thì frontend hiện nhắc "Đánh giá các quán hôm nay?".
- **Tiêu chí hoàn thành**: Test upsert không tạo trùng, validate sao, tag lạ bị loại, aggregate đúng.

---

### T-30: Pure Logic — DeciderTrigger, SmartPickScorer, WheelPicker, LadderGenerator
- **Phụ thuộc**: Không
- **Có thể chạy song song với**: Mọi task
- **Được phép tạo/sửa**:
  - `backend/app/domain/patterns/decision/__init__.py`, `trigger.py`, `smart_pick.py`, `randomizers.py` (mới)
  - `backend/tests/unit/test_decision_trigger.py`, `test_smart_pick.py`, `test_randomizers.py` (mới)
- **KHÔNG được sửa**: Mọi thứ khác.
- **Mô tả**: Theo mục 4.1 và 4.3 của plan.
  - `DeciderTrigger.evaluate()` trả các hint `TIE_AT_TOP | NEAR_TIE | TOO_MANY | STALLED | EMPTY`, kèm category và danh sách ứng viên.
  - `SmartPickScorer.rank()` dùng trọng số cấu hình được và sinh `reasons` tiếng Việt ngắn gọn.
  - `WheelPicker.pick(candidates, weights, seed)` và `LadderGenerator.generate(n_columns, seed)` trả cấu trúc thang (các bậc ngang) và cột thắng. Cùng seed thì cùng kết quả.
- **Tiêu chí hoàn thành**: ≥40 test. Có test phân phối: 10.000 seed thì WheelPicker không trọng số lệch <3% mỗi ô. Kết quả thang khớp với việc đi đường thủ công. Mọi lý do đều có số liệu cụ thể (km, giờ).

---

### T-31: Backend Decision Session API & WebSocket Events
- **Phụ thuộc**: T-23, T-30
- **Có thể chạy song song với**: T-25, T-29, T-35
- **Được phép tạo/sửa**:
  - `backend/app/repositories/decision_repo.py`, `backend/app/services/decision_service.py`, `backend/app/api/v1/decisions.py`, `backend/app/schemas/decision.py` (mới)
  - `backend/app/api/v1/router.py`, `backend/app/repositories/__init__.py`
  - `backend/app/domain/patterns/event_bus/events.py`, `backend/app/domain/patterns/event_bus/handlers.py`
  - `backend/app/services/voting_service.py` (gọi resolve với `GROUP_DECISION`)
  - `backend/tests/integration/test_decisions_api.py` (mới)
- **KHÔNG được sửa**: Pure logic T-30 (chỉ gọi).
- **Mô tả**: Endpoint theo CR-02:
  - `GET /rooms/{id}/decisions/hints` (trigger + smart pick top 3).
  - `POST /rooms/{id}/decisions` (Host; mode `SMART|WHEEL|SWIPE|LADDER`; server sinh seed và với WHEEL/LADDER tính luôn kết quả).
  - `POST .../{sid}/swipes`.
  - `POST .../{sid}/accept` (Host, áp kết quả qua đường resolve hiện có).
  - `POST .../{sid}/cancel`.
  - WS: `DECISION_STARTED`, `DECISION_PROGRESS`, `DECISION_RESOLVED`.
  - Swipe đóng khi đủ người hoặc hết `closes_at`. Hoà thì tự sinh WHEEL con giữa các quán hoà. Mỗi phòng chỉ 1 phiên OPEN, trả 409 nếu đã có.
- **Tiêu chí hoàn thành**: Test đủ các ca: Member không mở được phiên (403); 2 phiên OPEN bị 409; swipe trùng thì ghi đè; hết hạn thì tự đóng; accept xong thì quán ACCEPTED và có `VOTING_RESOLVED`; seed được lưu và trả về.

---

### T-32: Frontend "🎲 Chọn hộ": Banner, Gợi ý 1 chạm & Vòng quay
- **Phụ thuộc**: T-24, T-31 (hoặc MSW)
- **Có thể chạy song song với**: T-28, T-36
- **Được phép tạo/sửa**:
  - `frontend/src/components/decide/DeciderBanner.tsx`, `SmartPickCard.tsx`, `SpinWheel.tsx`, `DecideModal.tsx`, `index.ts` (mới)
  - `frontend/src/store/useDecisionStore.ts` (mới), `frontend/src/store/index.ts`
  - `frontend/src/hooks/useRoom.ts` (dispatch event `DECISION_*`)
  - `frontend/src/pages/RoomPage.tsx` (gắn banner)
  - `frontend/src/__tests__/decide_wheel.test.tsx` (mới)
- **KHÔNG được sửa**: `TieBreakSelectorModal` (giữ cho Host muốn chọn chiến lược thủ công).
- **Mô tả**: Banner hiện theo `/decisions/hints`, refetch khi có `VOTE_UPDATED`/`PLACE_*`. SmartPickCard có lý do dạng chip và 3 nút (Chốt luôn / Đổi quán khác / Chơi trò). SpinWheel vẽ bằng SVG + CSS transform, ease-out 4 s, dừng đúng ô `result` từ server, có `prefers-reduced-motion` thì bỏ hoạt ảnh. Có nút "Xem cách tính" hiện seed.
- **Tiêu chí hoàn thành**: Test: hint TIE thì banner hiện; nhận `DECISION_STARTED` thì 2 client tính ra cùng góc dừng; Member chỉ thấy, không có nút bắt đầu.

---

### T-33: Frontend Swipe & Thang may mắn
- **Phụ thuộc**: T-32
- **Có thể chạy song song với**: T-36
- **Được phép tạo/sửa**:
  - `frontend/src/components/decide/SwipeDeck.tsx`, `LuckyLadder.tsx`, `DecideModal.tsx`, `index.ts`
  - `frontend/src/store/useDecisionStore.ts`
  - `frontend/src/__tests__/decide_swipe_ladder.test.tsx` (mới)
- **KHÔNG được sửa**: Backend.
- **Mô tả**: SwipeDeck dùng pointer events (không thêm thư viện), có nút ✓/✗ cho desktop và bàn phím ←/→, thanh tiến độ "x/y người xong" từ `DECISION_PROGRESS`, đồng hồ đếm ngược. LuckyLadder dùng SVG vẽ thang từ cấu trúc server trả, hoạt ảnh đi đường 3 s. Có biến thể "chọn người quyết định".
- **Tiêu chí hoàn thành**: Test: swipe gửi đúng payload; hết giờ thì khoá; đường đi của thang khớp cột thắng từ server.

---

### T-34: Pure Logic — HeuristicItineraryPlanner & ITravelTimeEstimator
- **Phụ thuộc**: Không
- **Có thể chạy song song với**: Mọi task
- **Được phép tạo/sửa**:
  - `backend/app/domain/patterns/itinerary/__init__.py`, `travel.py`, `opening_hours.py`, `planner.py` (mới)
  - `backend/app/domain/phase2_interfaces/route_optimization.py` (mở rộng `plan_day`, giữ `optimize_route`)
  - `backend/app/domain/patterns/conflict_rule/implementations.py` (`TravelTimeConflictRule` nhận `ITravelTimeEstimator`; mặc định giữ hành vi cũ)
  - `backend/tests/mocks/phase2_stubs.py`
  - `backend/tests/unit/test_itinerary_planner.py`, `test_travel_estimator.py`, `test_opening_hours_parser.py` (mới)
- **KHÔNG được sửa**: Services, API.
- **Mô tả**: Theo mục 5.2 của plan: brute-force với n≤7, greedy + 2-opt với n>7, neo bữa ăn, chờ quán mở, loại quán không kịp giờ (kèm lý do), tràn ngày. Kết quả deterministic.
- **Tiêu chí hoàn thành**:
  - ≥35 test, gồm các ca: khung mặc định 17:00–23:00 với 3 quán (ăn tối, cafe, rạp) thì FOOD rơi vào 17:30–20:30; quán đóng 21:00 không bị xếp sau 21:00; 6 quán trong khung 17:00–23:00 thì có quán vào `dropped`; 7 quán chạy < 200 ms; n=10 ra kết quả hợp lệ.
  - **Test hợp đồng**: chạy `ConflictDetectionEngine` trên lịch planner sinh ra thì không có `TIME_OVERLAP`, `TRAVEL_TIME`, `OPENING_HOURS`.
  - Test conflict rule cũ vẫn pass.

---

### T-35: Backend Auto-plan API
- **Phụ thuộc**: T-23, T-34
- **Có thể chạy song song với**: T-25, T-29, T-31
- **Được phép tạo/sửa**:
  - `backend/app/services/autoplan_service.py` (mới), `backend/app/api/v1/schedule.py`, `backend/app/schemas/schedule.py`
  - `backend/app/services/schedule_service.py` (thêm `replace_all`)
  - `backend/tests/integration/test_autoplan_api.py` (mới)
- **KHÔNG được sửa**: Pure logic T-34 (chỉ gọi).
- **Mô tả**: `POST /rooms/{id}/schedule/auto-plan` (mọi member) nhận override thời lượng tuỳ chọn và trả `{slots, dropped, total_travel_min, total_cost}`, không ghi DB. `POST .../auto-plan/apply` (Host) nhận lại đúng `slots` đã xem (kèm `plan_hash` để phát hiện dữ liệu đã đổi, đổi thì 409), thay lịch trong 1 transaction, đánh giá conflict, rồi phát `SCHEDULE_UPDATED` + `CONFLICTS_UPDATED`. Phòng không có quán ACCEPTED thì lấy top-score mỗi category, kèm cờ `used_fallback=true`.
- **Tiêu chí hoàn thành**: Test: preview không ghi DB; Member gọi apply bị 403; `plan_hash` lệch bị 409; apply xong thì conflict rỗng với dữ liệu seed.

---

### T-36: Frontend "✨ Lên lịch giúp tôi"
- **Phụ thuộc**: T-24, T-35 (hoặc MSW), T-27 (vẽ tuyến)
- **Có thể chạy song song với**: T-32, T-33
- **Được phép tạo/sửa**:
  - `frontend/src/components/schedule/AutoPlanButton.tsx`, `AutoPlanPreview.tsx` (mới), `frontend/src/components/schedule/index.ts`, `frontend/src/components/schedule/ScheduleTimeline.tsx` (gắn nút + "Sắp lại tối ưu")
  - `frontend/src/components/map/RouteLayer.ts` (mới; polyline thẳng nối các điểm theo thứ tự)
  - `frontend/src/store/useScheduleStore.ts`
  - `frontend/src/__tests__/autoplan.test.tsx` (mới)
- **KHÔNG được sửa**: Backend.
- **Mô tả**: Nút hiện theo điều kiện ở mục 5.1. Nếu đang có hint TIE thì nút mở DecideModal trước. Preview gồm timeline nháp, chip lý do, danh sách quán "không xếp được" kèm lý do, và nút đổi thời lượng từng slot rồi xem lại. Host thấy nút Áp dụng, Member thấy dòng "Chờ Host chốt".
- **Tiêu chí hoàn thành**: Test: điều kiện hiện nút; Member không có nút Áp dụng; apply nhận 409 thì tự xem trước lại và báo "dữ liệu vừa thay đổi".

---

### T-37: Tích hợp Giai đoạn 2, Seed, E2E & Tài liệu
- **Phụ thuộc**: T-29, T-33, T-36 (và gián tiếp mọi task GĐ2)
- **Có thể chạy song song với**: Không
- **Được phép tạo/sửa**:
  - `backend/app/core/seed.py` (phòng DIDAU8 thêm origin Q.1, quán có `external_id`, 2 quán hoà để demo Chọn hộ)
  - `scripts/smoke_test.py`, `README.md`, `docs/DEPLOY.md` (thêm biến môi trường, hướng dẫn đặt quota Google Cloud)
  - `docker-compose.yml`, `frontend/.env.example`, `backend/.env.example`
- **KHÔNG được sửa**: Contracts.
- **Mô tả**: Chạy luồng E2E đầy đủ trên 2 trình duyệt, **cả 2 chế độ** `osm` và `google`: mở map, thêm 4 quán, vote ra hoà, Chọn hộ bằng vòng quay (cả 2 tab dừng cùng ô), Lên lịch giúp tôi, Áp dụng, không có xung đột, kéo thả sửa lịch, viết review nội bộ. Ghi checklist đặt quota/budget alert vào DEPLOY.md.
- **Tiêu chí hoàn thành**: Smoke test pass. Toàn bộ test BE/FE pass. Không có lỗi console. Chạy không có key Google thì không phát sinh request nào tới `googleapis.com` (kiểm tra bằng tab Network).
