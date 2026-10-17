# YÊU CẦU THAY ĐỔI HỢP ĐỒNG (CHANGE REQUESTS)

Tài liệu ghi nhận các đề xuất điều chỉnh hoặc bổ sung cho `docs/CONTRACTS.md`.

---

## CR-01: Bổ sung tọa độ địa lý (latitude, longitude) và địa chỉ vào PlaceVoteSummary

- **Người đề xuất**: Session triển khai T-05 (ConflictRule Pattern)
- **Ngày tạo**: 2026-10-17
- **Trạng thái**: ACCEPTED (ĐÃ CHẤP NHẬN)
- **Ngày duyệt**: 2026-10-17
- **Quyết định**: CHẤP NHẬN. Bổ sung `latitude`, `longitude`, `address` là hợp lý và cần thiết để các luật tính khoảng cách Haversine (`TravelTimeConflictRule`) và phát hiện vị trí trùng lặp <50m (`DuplicatePlaceConflictRule`) hoạt động chuẩn xác từ `ConflictContext.places`. Các trường mang giá trị mặc định `None` nên hoàn toàn tương thích ngược. Đã cập nhật mục 5.1 trong `docs/CONTRACTS.md`.
- **Các task đã DONE bị ảnh hưởng**:
  1. **T-04** (TieBreakStrategy Pattern & Voting Logic): Interface `PlaceVoteSummary` trong `backend/app/domain/patterns/tie_break/strategy.py` cần đồng bộ để chứa 3 trường mới.
  2. **T-05** (ConflictRule Pattern & ConflictDetectionEngine): Có thể gỡ bỏ việc kế thừa subclass tạm thời trong `backend/app/domain/patterns/conflict_rule/rule.py`, dùng trực tiếp `PlaceVoteSummary` chuẩn.
  3. **T-11** (Schedule Application Service): Đã truyền `latitude`, `longitude`, `address` khi dựng `PlaceVoteSummary` trong `schedule_service.py`.
  4. **T-12** (Conflict Service & Evaluation REST API): Đã truyền `latitude`, `longitude`, `address` khi dựng `PlaceVoteSummary` trong `conflict_service.py`.

### 1. Vấn đề hiện tại
Trong `docs/CONTRACTS.md` mục 5.1 (Core Domain Value Objects & DTOs), lớp `PlaceVoteSummary` được định nghĩa như sau:
```python
class PlaceVoteSummary(BaseModel):
    place_id: UUID
    name: str
    category: PlaceCategory
    status: PlaceStatus
    submitted_by_id: UUID
    estimated_cost: int
    open_minute: Optional[int]
    close_minute: Optional[int]
    created_at: datetime
    upvotes: int
    downvotes: int
    score: int
```
Tuy nhiên, trong `docs/ARCHITECTURE.md` và `docs/TASKS.md` (T-05), các luật kiểm tra xung đột yêu cầu:
1. `TravelTimeConflictRule`: Tính toán thời gian di chuyển giữa 2 địa điểm liên tiếp dựa trên công thức khoảng cách Haversine.
2. `DuplicatePlaceConflictRule`: Phát hiện địa điểm trùng lặp khi khoảng cách tọa độ giữa 2 địa điểm < 50 mét.

Nếu `PlaceVoteSummary` không mang tọa độ, ConflictContext không thể tính toán khoảng cách địa lý trực tiếp từ các địa điểm trong danh sách `context.places` (trừ khi thông tin được nhúng thủ công vào từng dictionary trong `schedule_items`).

### 2. Đề xuất thay đổi
Bổ sung thêm 3 trường tùy chọn vào `PlaceVoteSummary` trong `docs/CONTRACTS.md`:
```python
class PlaceVoteSummary(BaseModel):
    place_id: UUID
    name: str
    category: PlaceCategory
    status: PlaceStatus
    submitted_by_id: UUID
    estimated_cost: int
    open_minute: Optional[int]
    close_minute: Optional[int]
    created_at: datetime
    upvotes: int
    downvotes: int
    score: int
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    address: Optional[str] = None
```

### 3. Giải pháp tương thích ngược hiện tại
Tại task T-05, trong `backend/app/domain/patterns/conflict_rule/rule.py`, lớp `PlaceVoteSummary` kế thừa và bổ sung `latitude: float | None = None`, `longitude: float | None = None`, `address: str | None = None`. Nếu dữ liệu đầu vào không cung cấp các trường này, giá trị mặc định là `None` và hệ thống sẽ bỏ qua bước đo khoảng cách tọa độ một cách an toàn mà không gây lỗi runtime.

---

## CR-02: Giai đoạn 2 — Bản đồ chọn quán, "Chọn hộ" và Tự lên lịch

- **Người đề xuất**: Session lập kế hoạch giai đoạn 2
- **Ngày tạo**: 2026-10-17
- **Trạng thái**: IMPLEMENTED (ĐÃ ÁP DỤNG TRONG T-23)
- **Ngày duyệt**: 2026-10-17
- **Ngày hoàn thành áp dụng**: 2026-10-17 (T-23: Đã cập nhật CONTRACTS.md, Models, Schemas, Migration 002)
- **Quyết định**: CHẤP NHẬN toàn bộ, kèm 1 điều chỉnh: khung giờ mặc định của phòng là **17:00–23:00** (`start_minute=1020`, `end_minute=1380`), vì nhóm chủ yếu đi chơi buổi tối. T-23 đã áp CR-02 vào `docs/CONTRACTS.md`.
- **Tài liệu thiết kế**: [PLAN_MAP_DECIDE_AUTOPLAN.md](PLAN_MAP_DECIDE_AUTOPLAN.md)
- **Task triển khai**: T-23 (áp vào `CONTRACTS.md` + migration), T-24 → T-37
- **Tương thích ngược**: Mọi cột mới đều nullable hoặc có default. Không đổi hay xoá endpoint/sự kiện cũ. Chỉ **thêm** giá trị enum.


### 1. Enums mới / bổ sung
```python
class PlaceSource(str, Enum):      MANUAL = "MANUAL"; OSM = "OSM"; GOOGLE = "GOOGLE"
class CityCode(str, Enum):         HCM = "HCM"; HN = "HN"
class DecisionMode(str, Enum):     SMART = "SMART"; WHEEL = "WHEEL"; SWIPE = "SWIPE"; LADDER = "LADDER"
class DecisionStatus(str, Enum):   OPEN = "OPEN"; RESOLVED = "RESOLVED"; CANCELLED = "CANCELLED"; EXPIRED = "EXPIRED"
class TriggerHint(str, Enum):      TIE_AT_TOP = "TIE_AT_TOP"; NEAR_TIE = "NEAR_TIE"; TOO_MANY = "TOO_MANY"; STALLED = "STALLED"; EMPTY = "EMPTY"
# Bổ sung vào TieBreakStrategyName:
GROUP_DECISION = "GROUP_DECISION"
```

### 2. Thay đổi schema DB
```sql
ALTER TABLE places
  ADD COLUMN source            VARCHAR(20)  NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN external_id       VARCHAR(100),          -- "osm:node/123" | "google:<place_id>"
  ADD COLUMN google_place_id   VARCHAR(300),          -- được phép lưu vô thời hạn (Google ToS)
  ADD COLUMN cuisine           VARCHAR(100),
  ADD COLUMN opening_hours_raw VARCHAR(255),          -- chuỗi opening_hours của OSM
  ADD COLUMN coords_source     VARCHAR(20),           -- MANUAL | OSM | GOOGLE (GOOGLE: cache ≤30 ngày)
  ADD COLUMN coords_fetched_at TIMESTAMPTZ;
CREATE UNIQUE INDEX uq_places_room_external ON places(room_id, external_id) WHERE external_id IS NOT NULL;

ALTER TABLE rooms
  ADD COLUMN city         VARCHAR(10) NOT NULL DEFAULT 'HCM',
  ADD COLUMN origin_lat   DOUBLE PRECISION,
  ADD COLUMN origin_lng   DOUBLE PRECISION,
  ADD COLUMN start_minute INTEGER NOT NULL DEFAULT 1020 CHECK (start_minute BETWEEN 0 AND 1439),
  ADD COLUMN end_minute   INTEGER NOT NULL DEFAULT 1380 CHECK (end_minute BETWEEN 0 AND 1439);

CREATE TABLE external_place_links (
  osm_external_id  VARCHAR(100) PRIMARY KEY,
  google_place_id  VARCHAR(300),                     -- NULL = đã tra, không khớp
  matched_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  rejected_count   INTEGER NOT NULL DEFAULT 0          -- số lần người dùng bấm "Không đúng quán?"
);

CREATE TABLE place_reviews (
  id            UUID PRIMARY KEY,
  external_key  VARCHAR(320) NOT NULL,                -- osm:… | google:… | room_place:<uuid>
  room_id       UUID REFERENCES rooms(id) ON DELETE SET NULL,
  member_id     UUID REFERENCES members(id) ON DELETE SET NULL,
  nickname      VARCHAR(50) NOT NULL,
  rating        SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       VARCHAR(280),
  tags          JSON NOT NULL DEFAULT '[]',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (member_id, external_key)
);
CREATE INDEX idx_reviews_external_key ON place_reviews(external_key);

CREATE TABLE decision_sessions (
  id                   UUID PRIMARY KEY,
  room_id              UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  mode                 VARCHAR(20) NOT NULL,
  status               VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  category             VARCHAR(50),
  candidate_place_ids  JSON NOT NULL,
  seed                 BIGINT NOT NULL,
  result_place_id      UUID REFERENCES places(id) ON DELETE SET NULL,
  result_payload       JSON,                          -- góc quay / cấu trúc thang / tally swipe
  created_by_id        UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  closes_at            TIMESTAMPTZ
);
CREATE UNIQUE INDEX uq_decision_open_per_room ON decision_sessions(room_id) WHERE status = 'OPEN';

CREATE TABLE decision_swipes (
  session_id  UUID NOT NULL REFERENCES decision_sessions(id) ON DELETE CASCADE,
  member_id   UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  place_id    UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  liked       BOOLEAN NOT NULL,
  PRIMARY KEY (session_id, member_id, place_id)
);
```

### 3. REST API mới
| # | Method & Path | Quyền | Mô tả |
| :-- | :--- | :--- | :--- |
| 13 | `GET /api/v1/pois?bbox=&category=&limit=` | Công khai | POI OSM trong bbox (tối đa 0,2°×0,2°) |
| 14 | `GET /api/v1/pois/search?q=&lat=&lng=&limit=` | Công khai | Tìm không dấu trong snapshot |
| 15 | `GET /api/v1/pois/{external_id}` | Công khai | Chi tiết 1 POI |
| 16 | `POST /api/v1/pois/google-match` `{external_id, name, lat, lng}` | Member | → `{google_place_id: str \| null, reason: "OK"\|"NO_MATCH"\|"QUOTA"\|"DISABLED"}` |
| 17 | `DELETE /api/v1/pois/google-match/{external_id}` | Member | "Không đúng quán?" |
| 18 | `GET /api/v1/reviews?external_key=` | Công khai | `{avg, count, tags_top3, items[]}` |
| 19 | `PUT /api/v1/reviews` `{external_key, rating, comment?, tags[]}` | Member | Upsert |
| 20 | `GET /rooms/{id}/decisions/hints` | Member | `{hints: [{type, category, candidate_place_ids}], smart_picks: [{place_id, score, reasons[]}]}` |
| 21 | `POST /rooms/{id}/decisions` `{mode, category?, candidate_place_ids?, weighted?: bool}` | Host | Tạo phiên. Trả `{session, seed, result_place_id?, result_payload?}` |
| 22 | `POST /rooms/{id}/decisions/{sid}/swipes` `{place_id, liked}` | Member | Chỉ cho mode SWIPE |
| 23 | `POST /rooms/{id}/decisions/{sid}/accept` | Host | Áp kết quả → `ACCEPTED` + `VOTING_RESOLVED(strategy=GROUP_DECISION)` |
| 24 | `POST /rooms/{id}/decisions/{sid}/cancel` | Host | |
| 25 | `POST /rooms/{id}/schedule/auto-plan` `{day_offset?, duration_overrides?: {place_id: minutes}}` | Member | Xem trước, không ghi DB. → `{slots[], dropped[], total_travel_min, total_cost, used_fallback, plan_hash}` |
| 26 | `POST /rooms/{id}/schedule/auto-plan/apply` `{plan_hash, slots[]}` | Host | Thay lịch. 409 nếu `plan_hash` lệch |

`CreatePlaceRequest` nhận thêm các trường tuỳ chọn: `source`, `external_id`, `google_place_id`, `cuisine`, `opening_hours_raw`. `PATCH /rooms/{id}` nhận thêm `origin_lat`, `origin_lng`, `city`, `start_minute`, `end_minute`.

```python
class PlannedSlot(BaseModel):
    place_id: UUID
    day_offset: int
    start_minute: int
    end_minute: int
    travel_from_prev_min: int
    reasons: list[str]            # ví dụ ["Ăn trưa 11:30, quán mở từ 10:00", "Cách điểm trước 1,2 km (~8 phút)"]

class DroppedPlace(BaseModel):
    place_id: UUID
    reason: str                   # ví dụ "Quán đóng cửa lúc 14:00, không kịp sau các điểm trước"
```

### 4. WebSocket (Server → Client) mới
| Type | Payload mẫu |
| :--- | :--- |
| `DECISION_STARTED` | `{ "session_id": "...", "mode": "WHEEL", "candidate_place_ids": [...], "seed": 812734, "result_place_id": "...", "result_payload": {"stop_angle_deg": 1532.5}, "closes_at": null }` |
| `DECISION_PROGRESS` | `{ "session_id": "...", "done_member_ids": ["..."], "total_members": 5 }` |
| `DECISION_RESOLVED` | `{ "session_id": "...", "result_place_id": "...", "status": "RESOLVED" }` |

### 5. Interface Python mới / mở rộng
```python
class ITravelTimeEstimator(ABC):
    def minutes(self, a: tuple[float, float], b: tuple[float, float]) -> int: ...

class IRouteOptimizationService(ABC):          # giữ optimize_route, thêm:
    async def plan_day(self, places: list[PlaceVoteSummary], constraints: "PlanConstraints"
                       ) -> tuple[list[PlannedSlot], list[DroppedPlace]]: ...

class IPoiProvider(ABC):
    def in_bbox(self, bbox: tuple[float, float, float, float], category: PlaceCategory | None, limit: int) -> list["Poi"]: ...
    def search(self, q: str, near: tuple[float, float] | None, limit: int) -> list["Poi"]: ...
```

### 6. Các task đã DONE bị ảnh hưởng
1. **T-05**: `TravelTimeConflictRule` nhận `ITravelTimeEstimator` qua constructor. Mặc định giữ đúng hành vi cũ (Haversine, 30 km/h).
2. **T-10**: `voting_service.resolve` chấp nhận `GROUP_DECISION` cùng danh sách quán thắng chỉ định sẵn.
3. **T-11**: `schedule_service` thêm `replace_all()` (transaction).
4. **T-15/T-16**: types, MSW và API client mở rộng (T-24).

---

## CR-03: Bổ sung `PATCH /rooms/{room_id}` và mã lỗi `PLACE_ALREADY_ADDED`

- **Người đề xuất**: Session review tích hợp (2026-10-17)
- **Ngày tạo**: 2026-10-17
- **Trạng thái**: ACCEPTED (ĐÃ CHẤP NHẬN, đã triển khai ở T-27)
- **Ngày duyệt**: 2026-10-17
- **Quyết định**: CHẤP NHẬN nguyên đề xuất. Đã cập nhật `CONTRACTS.md` (endpoint #27, sự kiện `ROOM_UPDATED`, mã lỗi `PLACE_ALREADY_ADDED`). Code triển khai giao cho T-27 (BE: route + `RoomService.update_room` + 409 trong `add_place`), kèm test.
- **Task đã DONE bị ảnh hưởng**: T-08 (thêm route + `RoomService.update_room`); T-23 (`UpdateRoomRequest` đã có sẵn nhưng chưa có route dùng).
- **Task TODO cần**: T-27 ("Host kéo ghim điểm hẹn để `PATCH room`"), T-28.

### 1. Vấn đề
1. CR-02 §3 viết "`PATCH /rooms/{id}` nhận thêm `origin_lat`, `origin_lng`, `city`, `start_minute`, `end_minute`" như thể endpoint đã tồn tại, nhưng CONTRACTS mục 3.3 chưa bao giờ có nó và T-08 không làm. Hiện `PATCH /api/v1/rooms/{id}` trả 405. Không task nào đang sở hữu việc này, trong khi T-27 và T-35 (đọc `room.start_minute`/`end_minute`/`origin_*`) phụ thuộc vào nó.
2. `POST /rooms/{id}/places` với `external_id` đã có trong phòng chạm `uq_places_room_external` và trả 500 (IntegrityError không được bắt). Bấm đúp "Thêm vào lựa chọn" ở T-28 sẽ gặp lỗi này.

### 2. Đề xuất
- `PATCH /api/v1/rooms/{room_id}` (Host only). Body = `UpdateRoomRequest` (mọi trường tuỳ chọn). Response 200 = `RoomResponse`. Phát WS `ROOM_UPDATED` `{ "room": {...} }` (sự kiện mới, cần thêm vào mục 4.2).
- Mã lỗi `PLACE_ALREADY_ADDED` (409, `details.place_id` = id quán đã có) cho `POST /places` khi trùng `(room_id, external_id)`.
- Tương thích ngược: chỉ thêm route, thêm sự kiện và thêm mã lỗi.


---

## CR-04: Ghi nhận phần mở rộng WebSocket đã có trong code (PING từ server, CHAT_MESSAGE)

- **Người đề xuất**: Session review tích hợp cuối GĐ2 (2026-10-17)
- **Ngày tạo**: 2026-10-17
- **Trạng thái**: ACCEPTED (ĐÃ CHẤP NHẬN)
- **Ngày duyệt**: 2026-10-17
- **Quyết định**: CHẤP NHẬN. Đã cập nhật `CONTRACTS.md` mục 4.1/4.2 (`CHAT_MESSAGE`, `PING` từ server, mã lỗi `MESSAGE_TOO_LONG`/`RATE_LIMIT_EXCEEDED`). Không sửa code; alias `CHAT`/`SEND_CHAT`/`SEND_MESSAGE` vẫn còn trong `websocket.py:275`, nên bỏ ở task dọn dẹp sau.
- **Task đã DONE bị ảnh hưởng**: T-13 (`api/v1/websocket.py`); T-17 (FE `wsClient`) nếu đổi hành vi. Nếu chấp nhận chỉ ghi tài liệu, không task nào phải sửa code.

### 1. Vấn đề
`CONTRACTS.md` mục 4 không liệt kê các thông điệp mà `backend/app/api/v1/websocket.py` đang dùng và smoke test phụ thuộc vào (bước 6):
- Client→Server `CHAT_MESSAGE` (code còn nhận alias `CHAT`, `SEND_CHAT`, `SEND_MESSAGE`); Server→Client `CHAT_MESSAGE` broadcast; lỗi `MESSAGE_TOO_LONG`.
- Server chủ động gửi `PING` mỗi 25 s (contract chỉ có chiều client gửi `PING`, 30 s).

### 2. Đề xuất
Thêm vào mục 4.1/4.2: `CHAT_MESSAGE` (payload theo code hiện tại) và `MESSAGE_TOO_LONG`, `PING` hai chiều. Nên bỏ các alias thừa (`CHAT`, `SEND_CHAT`, `SEND_MESSAGE`) ở task sau. Tương thích ngược hoàn toàn.
