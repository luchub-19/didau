# HỢP ĐỒNG KỸ THUẬT VÀ GIAO DIỆN (CONTRACTS & SPECIFICATIONS)
> **NGUỒN SỰ THẬT DUY NHẤT (SINGLE SOURCE OF TRUTH)**
> Mọi session AI và kỹ sư triển khai độc lập PHẢI tuân thủ 100% tài liệu này. Không tự ý thay đổi tên trường, kiểu dữ liệu, mã lỗi hay đường dẫn endpoint.

---

## 1. HỆ THỐNG ENUM TOÀN CỤC

### 1.1. `PlaceStatus`
Trạng thái của một địa điểm trong vòng đời lên kế hoạch:
- `PROPOSED`: Địa điểm vừa được thành viên thêm vào danh sách gợi ý.
- `VOTING`: Địa điểm đang được mở để các thành viên bỏ phiếu.
- `ACCEPTED`: Địa điểm đã thắng cuộc bình chọn (hoặc được chọn trực tiếp vào lịch trình).
- `REJECTED`: Địa điểm bị loại bỏ do không đủ phiếu hoặc bị thành viên/chủ phòng từ chối.
- `VISITED`: Địa điểm đã hoàn thành trong chuyến đi thực tế.

### 1.2. `PlaceCategory`
Danh mục loại hình địa điểm:
- `FOOD`: Quán ăn, nhà hàng, ẩm thực đường phố, tiệm bánh.
- `DRINK`: Quán cà phê, trà sữa, quán bar, pub, lounge.
- `ENTERTAINMENT`: Rạp chiếu phim, karaoke, bowling, bida, board game, khu vui chơi.
- `SIGHTSEEING`: Danh lam thắng cảnh, bảo tàng, công viên, di tích lịch sử, phố đi bộ.
- `ACCOMMODATION`: Khách sạn, homestay, resort, nhà nghỉ.
- `SHOPPING`: Trung tâm thương mại, chợ truyền thống, siêu thị, phố mua sắm.
- `OTHER`: Các điểm hẹn, địa điểm dịch vụ khác.

### 1.3. `VoteValue`
Giá trị lá phiếu bình chọn:
- `UPVOTE` ($+1$): Đồng ý, ủng hộ địa điểm này.
- `DOWNVOTE` ($-1$): Không đồng ý, phản đối địa điểm này.
- `NEUTRAL` ($0$): Phiếu trắng hoặc rút lại lá phiếu đã bỏ.

### 1.4. `ConflictLevel`
Mức độ nghiêm trọng của xung đột lịch trình/quy tắc:
- `INFO`: Thông tin lưu ý (ví dụ: chi phí tiệm cận hạn mức ngân sách).
- `WARNING`: Cảnh báo nhẹ (ví dụ: thời gian di chuyển giữa 2 điểm hơi gấp; trùng tên địa điểm).
- `ERROR`: Lỗi cấu hình (ví dụ: xếp lịch rơi vào khung giờ đóng cửa của địa điểm).
- `CRITICAL`: Lỗi bất khả thi (ví dụ: hai địa điểm bị xếp trùng đè thời gian lên nhau).

### 1.5. `MemberRole`
Vai trò thành viên trong phòng:
- `HOST`: Người tạo phòng, nắm toàn quyền chốt vote, chọn TieBreak, sửa cấu hình phòng.
- `MEMBER`: Thành viên tham gia, có quyền đề xuất địa điểm, vote, thảo luận.

### 1.6. `RoomStatus`
Trạng thái hoạt động của phòng:
- `PLANNING`: Giai đoạn chuẩn bị, đề xuất địa điểm.
- `VOTING`: Giai đoạn đang mở bình chọn.
- `FINALIZED`: Đã chốt danh sách địa điểm và hoàn tất lịch trình.
- `COMPLETED`: Buổi đi chơi đã diễn ra xong.
- `ARCHIVED`: Phòng đã đóng và lưu trữ.

### 1.7. `PlaceSource` (CR-02)
Nguồn gốc dữ liệu của địa điểm:
- `MANUAL`: Địa điểm do người dùng tự nhập thủ công hoặc dán URL.
- `OSM`: Địa điểm trích xuất từ dữ liệu OpenStreetMap snapshot.
- `GOOGLE`: Địa điểm tra cứu và liên kết với Google Places API / UI Kit.

### 1.8. `CityCode` (CR-02)
Mã thành phố hỗ trợ cho phòng:
- `HCM`: Thành phố Hồ Chí Minh.
- `HN`: Thủ đô Hà Nội.

### 1.9. `DecisionMode` (CR-02)
Chế độ quyết định chọn hộ khi hòa phiếu hoặc phân vân:
- `SMART`: Gợi ý thông minh 1 chạm theo điểm số và trọng số ngữ cảnh.
- `WHEEL`: Vòng quay may mắn realtime.
- `SWIPE`: Quẹt thẻ bình chọn nhanh (Tinder-style swipe deck).
- `LADDER`: Trò chơi Thang may mắn (Ghost Leg / Amidakuji).

### 1.10. `DecisionStatus` (CR-02)
Trạng thái của phiên quyết định chọn hộ:
- `OPEN`: Đang diễn ra, chờ thành viên tương tác.
- `RESOLVED`: Đã chốt kết quả thành công.
- `CANCELLED`: Phiên bị hủy bởi Host.
- `EXPIRED`: Hết hạn thời gian đóng phiên (`closes_at`).

### 1.11. `TriggerHint` (CR-02)
Gợi ý kích hoạt tính năng Chọn hộ:
- `TIE_AT_TOP`: Hòa phiếu ở nhóm địa điểm dẫn đầu.
- `NEAR_TIE`: Điểm số sít sao giữa các địa điểm top đầu.
- `TOO_MANY`: Quá nhiều địa điểm được đề xuất gây phân vân.
- `STALLED`: Bình chọn bị trì trệ, không có hoạt động mới.
- `EMPTY`: Phòng chưa có địa điểm nào được thêm.

### 1.12. `TieBreakStrategyName` bổ sung (CR-02)
- `GROUP_DECISION`: Phân định theo kết quả phiên Chọn hộ nhóm (Vòng quay / Swipe / Thang / Gợi ý 1 chạm).
- `TRAVEL_TIME` (CR-12, CR-15): Hoà phiếu bằng Ordered Median (OMP) theo km khứ hồi của cả nhóm (ALGO-02, `docs/phase7/ALGORITHMS.md`; tên chiến lược giữ cho tương thích). **Mặc định của phòng mới** (`POST /rooms` bỏ trống `tie_break_strategy`); phòng cũ và cột DB giữ mặc định `EARLIEST_SUBMISSION`. Hoà tính theo **điểm** (`score` = upvotes − downvotes) ở hạng đầu **trong cùng loại quán** (CR-15; trước đó: số `upvotes`, cả phòng); sáu chiến lược cũ vẫn hợp lệ.

### 1.13. Mã lý do và tham số phục vụ song ngữ (Reason Codes & Conflict Params) (CR-06)
Các mã chuẩn hoá và tham số cấu trúc để frontend hiển thị song ngữ VI/EN mà không phụ thuộc vào chuỗi tự do do backend sinh ra.

#### A. Tham số quy tắc xung đột (`params` trong `ConflictAlert` / `conflicts` table)
| `rule_code` | Cấu trúc `params` |
| :--- | :--- |
| `TIME_OVERLAP` | `item_ids: [str, str]`, `place_names: [str, str]`, `ranges: [{start_minute, end_minute, day_offset}, {start_minute, end_minute, day_offset}]` |
| `TRAVEL_TIME` | (CR-12 phần 2, ALGO-03) `from_item_id: str`, `to_item_id: str`, `place_names: [str, str]`, `eta_min: int`, `margin_min: int`, `buffer_min: int`, `gap_min: int`, `slack_min: int`, `distance_km: float`, `risk: "SOFT_CONFLICT" \| "HIGH_RISK"`, `peak: bool`, `source: "ESTIMATE" \| "GOOGLE" \| "VALHALLA"` (VALHALLA: CR-15, T-95), `estimated: bool` (trước T-87: `travel_min` thay `eta_min`, không có các trường còn lại) |
| `OPENING_HOURS` | `item_id: str`, `place_name: str`, `start_minute: int`, `end_minute: int`, `open_minute: int`, `close_minute: int` |
| `DUPLICATE_PLACE` | `place_ids: [str, str]`, `place_names: [str, str]`, `similarity: float`, `distance_m: float` |
| `BUDGET_THRESHOLD` | `total_cost: int`, `budget_limit: int` |

(CR-07) `TRAVEL_TIME` chỉ sinh khi `gap_min >= 0`; cặp mục lịch đã chồng giờ chỉ có `TIME_OVERLAP` báo.

(CR-12 phần 2) Luật `TRAVEL_TIME` theo `docs/phase6/ALGORITHMS.md` §5: xét từng cặp mục liên tiếp **cùng ngày** (sắp theo `start_minute`, rồi `order_index`), không có chặng từ nhà tới điểm đầu. `eta_min` = chặng xe máy của estimator chung, khởi hành lúc `end_minute` của mục trước; `margin_min = max(5, ceil(eta × 50%))` nếu giờ rời quán thuộc **`[16:30, 19:30)`** (gồm 16:30, không gồm 19:30) của một ngày thứ Hai–Sáu (`event_date + day_offset`), ngược lại `max(5, ceil(eta × 25%))`; `buffer_min = 5` (gửi xe). `slack_min = gap_min − (eta + margin + buffer)`. Mức: `SAFE` (slack ≥ 0, **không sinh cảnh báo**) · `SOFT_CONFLICT` (slack < 0 nhưng gap ≥ eta) · `HIGH_RISK` (gap < eta). Cả hai mức có cảnh báo đều là `level = WARNING`. Hai mục cùng một toạ độ (eta 0, quãng đường 0) không có chặng: margin = buffer = 0. Cặp có quán thiếu toạ độ: bỏ qua.

#### B. Mã lý do Chọn hộ thông minh (`reason_codes` trong `ScoredPick` / SMART `result_payload`)
| `code` | Tham số `params` | Mô tả hiển thị |
| :--- | :--- | :--- |
| `TOP_VOTED` | `score: int`, `upvotes: int` | Được bình chọn cao nhất (+score điểm, upvotes lượt thích) |
| `SUPPORTED` | `score: int`, `upvotes: int` | Được ủng hộ (+score điểm, upvotes lượt thích) |
| `NEAREST` | `distance_km: float` | Gần điểm hẹn nhất |
| `NEAR` | `distance_km: float` | Gần điểm hẹn |
| `DISTANCE` | `distance_km: float` | Khoảng cách từ điểm hẹn |
| `OPEN_AT` | `minute: int` | Đang mở cửa lúc HH:MM |
| `FREE` | `cost: int (=0)`, `budget_limit: int?` | Miễn phí vé / chi phí 0đ |
| `WITHIN_BUDGET` | `cost: int`, `budget_limit: int` | Vừa ngân sách (cost / limit) |
| `CHEAPEST` | `cost: int` | Chi phí tiết kiệm nhất |
| `COST_ESTIMATE` | `cost: int` | Chi phí ước tính |
| `QUALITY_PICK` | `category: str`, `total_score: float` | Gợi ý địa điểm chất lượng cho nhóm |

#### C. Mã lý do Lên lịch tự động (`reason_codes` trong `PlannedSlot`)
| `code` | Tham số `params` | Mô tả hiển thị |
| :--- | :--- | :--- |
| `MEAL_WINDOW` | `window: "lunch" \| "dinner"`, `start_minute: int`, `end_minute: int` | Rơi vào khung bữa trưa/bữa tối HH:MM–HH:MM |
| `OFF_MEAL_WINDOW` | `{}` | Lệch khung giờ bữa ăn thông thường |
| `AFTER_MEAL` | `{}` | Xếp sau bữa ăn |
| `DRINK` | `{}` | Đồ uống |
| `TRAVEL_FROM` | `travel_min: int`, `from_name?: str`, `from_origin?: bool` | Di chuyển khoảng minutes phút từ điểm trước hoặc điểm hẹn |

#### D. Mã lý do Quán bị loại (`reason_code` và `reason_params` trong `DroppedPlace`)
| `reason_code` | Tham số `reason_params` | Mô tả hiển thị |
| :--- | :--- | :--- |
| `CLOSED_OR_NO_FIT` | `{}` | Quán không mở cửa hoặc không kịp giờ đóng cửa trong ngày này |
| `OUT_OF_TIME` | `{}` | Hết giờ trong buổi |

---



## 2. SCHEMA CƠ SỞ DỮ LIỆU (DATABASE SCHEMA DDL)

Cơ sở dữ liệu hỗ trợ PostgreSQL 15+ (và SQLite 3.38+ cho local development/testing).

```sql
-- Kích hoạt extension UUID nếu dùng PostgreSQL
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. BẢNG ROOMS (Phòng lập kế hoạch)
CREATE TABLE rooms (
    id UUID PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    event_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PLANNING',
    tie_break_strategy VARCHAR(50) NOT NULL DEFAULT 'EARLIEST_SUBMISSION',
    budget_limit BIGINT NULL,
    city VARCHAR(10) NOT NULL DEFAULT 'HCM',
    origin_lat DOUBLE PRECISION NULL,
    origin_lng DOUBLE PRECISION NULL,
    start_minute INTEGER NOT NULL DEFAULT 1020 CHECK (start_minute >= 0 AND start_minute <= 1439),
    end_minute INTEGER NOT NULL DEFAULT 1380 CHECK (end_minute >= 0 AND end_minute <= 1439),
    state_version BIGINT NOT NULL DEFAULT 0, -- CR-13: +1 trong cùng transaction với mỗi thay đổi có phát WS
    max_places_per_member INTEGER NULL      -- CR-14: NULL = không giới hạn (phòng cũ); phòng mới mặc định 2
        CONSTRAINT chk_rooms_max_places_per_member CHECK (max_places_per_member IS NULL OR (max_places_per_member >= 1 AND max_places_per_member <= 10)),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_rooms_code ON rooms(code);
CREATE INDEX idx_rooms_status ON rooms(status);

-- 2. BẢNG MEMBERS (Thành viên trong phòng)
CREATE TABLE members (
    id UUID PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    nickname VARCHAR(100) NOT NULL,
    avatar_url VARCHAR(500) NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'MEMBER',
    token VARCHAR(64) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    origin_lat DOUBLE PRECISION NULL, -- CR-11: vị trí xuất phát RIÊNG TƯ, chỉ chính chủ đọc được
    origin_lng DOUBLE PRECISION NULL,
    joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_room_nickname UNIQUE (room_id, nickname),
    CONSTRAINT chk_members_origin_range CHECK ((origin_lat IS NULL OR (origin_lat >= -90 AND origin_lat <= 90)) AND (origin_lng IS NULL OR (origin_lng >= -180 AND origin_lng <= 180))),
    CONSTRAINT chk_members_origin_pair CHECK ((origin_lat IS NULL) = (origin_lng IS NULL))
);

CREATE INDEX idx_members_room_id ON members(room_id);
CREATE INDEX idx_members_token ON members(token);

-- 3. BẢNG PLACES (Địa điểm đề xuất)
CREATE TABLE places (
    id UUID PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    submitted_by_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    address VARCHAR(500) NULL,
    latitude DOUBLE PRECISION NULL,
    longitude DOUBLE PRECISION NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'OTHER',
    status VARCHAR(30) NOT NULL DEFAULT 'PROPOSED',
    source VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
    external_id VARCHAR(100) NULL,
    google_place_id VARCHAR(300) NULL,
    cuisine VARCHAR(100) NULL,
    opening_hours_raw VARCHAR(255) NULL,
    coords_source VARCHAR(20) NULL,
    coords_fetched_at TIMESTAMP WITH TIME ZONE NULL,
    url VARCHAR(1000) NULL,
    notes TEXT NULL,
    estimated_cost BIGINT NULL DEFAULT 0,
    open_minute INTEGER NULL CHECK (open_minute >= 0 AND open_minute <= 1439),
    close_minute INTEGER NULL CHECK (close_minute >= 0 AND close_minute <= 1439),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_places_room_id ON places(room_id);
CREATE INDEX idx_places_status ON places(status);
CREATE INDEX idx_places_category ON places(category);
CREATE UNIQUE INDEX uq_places_room_external ON places(room_id, external_id) WHERE external_id IS NOT NULL;

-- 4. BẢNG VOTES (Bình chọn địa điểm)
CREATE TABLE votes (
    id UUID PRIMARY KEY,
    place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    vote_value SMALLINT NOT NULL CHECK (vote_value IN (-1, 0, 1)),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_place_member_vote UNIQUE (place_id, member_id)
);

CREATE INDEX idx_votes_place_id ON votes(place_id);
CREATE INDEX idx_votes_member_id ON votes(member_id);

-- 5. BẢNG SCHEDULE_ITEMS (Lịch trình thời gian)
CREATE TABLE schedule_items (
    id UUID PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    day_offset INTEGER NOT NULL DEFAULT 0 CHECK (day_offset >= 0),
    start_minute INTEGER NOT NULL CHECK (start_minute >= 0 AND start_minute <= 1439),
    end_minute INTEGER NOT NULL CHECK (end_minute >= 0 AND end_minute <= 1439),
    order_index INTEGER NOT NULL DEFAULT 0,
    note TEXT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_schedule_minutes CHECK (start_minute < end_minute)
);

CREATE INDEX idx_schedule_room_id ON schedule_items(room_id);
CREATE INDEX idx_schedule_place_id ON schedule_items(place_id);
CREATE INDEX idx_schedule_day_order ON schedule_items(room_id, day_offset, start_minute);

-- 6. BẢNG CONFLICTS (Nhật ký xung đột hệ thống ghi nhận, CR-06)
CREATE TABLE conflicts (
    id UUID PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    rule_code VARCHAR(100) NOT NULL,
    level VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    params JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_conflicts_room_id ON conflicts(room_id);
CREATE INDEX idx_conflicts_resolved ON conflicts(resolved);

-- 7. BẢNG EXTERNAL_PLACE_LINKS (Bộ đệm liên kết OSM và Google Place ID)
CREATE TABLE external_place_links (
    osm_external_id VARCHAR(100) PRIMARY KEY,
    google_place_id VARCHAR(300) NULL,
    matched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    rejected_count INTEGER NOT NULL DEFAULT 0
);

-- 8. BẢNG PLACE_REVIEWS (Đánh giá nội bộ của các thành viên)
CREATE TABLE place_reviews (
    id UUID PRIMARY KEY,
    external_key VARCHAR(320) NOT NULL,
    room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
    member_id UUID REFERENCES members(id) ON DELETE SET NULL,
    nickname VARCHAR(50) NOT NULL,
    rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment VARCHAR(280) NULL,
    tags JSON NOT NULL DEFAULT '[]'::json,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_place_reviews_member_external_key UNIQUE (member_id, external_key)
);

CREATE INDEX idx_reviews_external_key ON place_reviews(external_key);

-- 9. BẢNG DECISION_SESSIONS (Phiên giải quyết chọn hộ)
CREATE TABLE decision_sessions (
    id UUID PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    mode VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    category VARCHAR(50) NULL,
    candidate_place_ids JSON NOT NULL,
    seed BIGINT NOT NULL,
    result_place_id UUID REFERENCES places(id) ON DELETE SET NULL,
    result_payload JSON NULL,
    created_by_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closes_at TIMESTAMP WITH TIME ZONE NULL
);

CREATE INDEX idx_decision_sessions_room_id ON decision_sessions(room_id);
CREATE INDEX idx_decision_sessions_status ON decision_sessions(status);
CREATE UNIQUE INDEX uq_decision_open_per_room ON decision_sessions(room_id) WHERE status = 'OPEN';

-- 10. BẢNG DECISION_SWIPES (Lá phiếu quẹt trong phiên SWIPE)
CREATE TABLE decision_swipes (
    session_id UUID NOT NULL REFERENCES decision_sessions(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    liked BOOLEAN NOT NULL,
    CONSTRAINT pk_decision_swipes PRIMARY KEY (session_id, member_id, place_id)
);
```

---

## 3. ĐẶC TẢ REST API VÀ MẪU REQUEST / RESPONSE

### 3.1. Headers Chung
Mọi request (ngoại trừ tạo phòng và join phòng) bắt buộc phải truyền header xác thực:
- `Content-Type: application/json`
- `X-Member-Token: <UUIDv4_TOKEN>`

**Header response `X-State-Version` (CR-13)**: mọi response của endpoint có token (thuộc một phòng) mang số `rooms.state_version` hiện tại; endpoint ghi dữ liệu trả số **sau** khi tăng. CORS đã `expose` header này. Cùng số xuất hiện ở trường `state_version` của `RoomResponse` / `RoomDetailResponse`.

### 3.2. Định dạng Lỗi Thống nhất
Khi có lỗi (status $\ge 400$):
```json
{
  "error": {
    "code": "PLACE_NOT_FOUND",
    "message": "Không tìm thấy địa điểm được yêu cầu.",
    "details": {
      "place_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
    }
  }
}
```

---

### 3.3. Chi tiết Từng Endpoint

#### 1. Tạo phòng mới
- **Method & Path**: `POST /api/v1/rooms`
- **Auth**: Không yêu cầu header `X-Member-Token`.
- **Request Body**:
```json
{
  "title": "Cuối tuần ăn sập Sài Gòn",
  "description": "Lên kèo ăn uống từ sáng tới đêm thứ 7",
  "event_date": "2026-10-24",
  "creator_nickname": "HoangNam",
  "creator_avatar_url": "https://api.dicebear.com/7.x/bottts/svg?seed=HoangNam",
  "budget_limit": 500000,
  "tie_break_strategy": "EARLIEST_SUBMISSION",
  "max_places_per_member": 2
}
```
- `max_places_per_member` (CR-14, tuỳ chọn, 1–10): bỏ trống = **2**; `null` = không giới hạn.
- `tie_break_strategy` (tuỳ chọn): bỏ trống = **`TRAVEL_TIME`** (CR-12; ví dụ trên ghi tường minh `EARLIEST_SUBMISSION`).
- **Response 201 Created**: (`creator_member` là `SelfMemberResponse`, CR-11; `room` có thêm `max_places_per_member`, `state_version`)
```json
{
  "room": {
    "id": "c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21",
    "code": "DIDAU8",
    "title": "Cuối tuần ăn sập Sài Gòn",
    "description": "Lên kèo ăn uống từ sáng tới đêm thứ 7",
    "event_date": "2026-10-24",
    "status": "PLANNING",
    "tie_break_strategy": "EARLIEST_SUBMISSION",
    "budget_limit": 500000,
    "created_at": "2026-10-17T07:30:00Z",
    "updated_at": "2026-10-17T07:30:00Z"
  },
  "creator_member": {
    "id": "e4a2d815-1a3b-4c22-b5f7-920478bf1144",
    "room_id": "c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21",
    "nickname": "HoangNam",
    "avatar_url": "https://api.dicebear.com/7.x/bottts/svg?seed=HoangNam",
    "role": "HOST",
    "is_active": true,
    "joined_at": "2026-10-17T07:30:00Z"
  },
  "member_token": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"
}
```

#### 2. Tham gia phòng bằng mã (Join Room)
- **Method & Path**: `POST /api/v1/rooms/join`
- **Auth**: Không yêu cầu header.
- **Request Body**:
```json
{
  "room_code": "DIDAU8",
  "nickname": "ThuTrang",
  "avatar_url": "https://api.dicebear.com/7.x/bottts/svg?seed=ThuTrang"
}
```
- **Response 200 OK**:
```json
{
  "room": {
    "id": "c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21",
    "code": "DIDAU8",
    "title": "Cuối tuần ăn sập Sài Gòn",
    "event_date": "2026-10-24",
    "status": "PLANNING"
  },
  "member": {
    "id": "f5c3b927-2b4c-4d33-a6e8-031589ca2255",
    "room_id": "c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21",
    "nickname": "ThuTrang",
    "avatar_url": "https://api.dicebear.com/7.x/bottts/svg?seed=ThuTrang",
    "role": "MEMBER",
    "is_active": true,
    "joined_at": "2026-10-17T07:35:00Z"
  },
  "member_token": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e"
}
```
- **Error Codes**: `ROOM_NOT_FOUND` (404), `NICKNAME_TAKEN` (409).
- Ghi chú (CR-02): `room` và response của #1, #3 còn mang `city`, `origin_lat`, `origin_lng`, `start_minute`, `end_minute`.

#### 3. Lấy toàn bộ thông tin phòng
- **Method & Path**: `GET /api/v1/rooms/{room_id}`
- **Auth**: Header `X-Member-Token: <token>`
- **Response 200 OK**:
```json
{
  "id": "c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21",
  "code": "DIDAU8",
  "title": "Cuối tuần ăn sập Sài Gòn",
  "description": "Lên kèo ăn uống từ sáng tới đêm thứ 7",
  "event_date": "2026-10-24",
  "status": "PLANNING",
  "tie_break_strategy": "EARLIEST_SUBMISSION",
  "budget_limit": 500000,
  "members": [
    {
      "id": "e4a2d815-1a3b-4c22-b5f7-920478bf1144",
      "nickname": "HoangNam",
      "avatar_url": "https://api.dicebear.com/7.x/bottts/svg?seed=HoangNam",
      "role": "HOST",
      "is_active": true
    }
  ],
  "total_places": 3,
  "created_at": "2026-10-17T07:30:00Z"
}
```

#### 4. Thêm địa điểm đề xuất
- **Method & Path**: `POST /api/v1/rooms/{room_id}/places`
- **Auth**: Header `X-Member-Token: <token>`
- **Request Body**:
```json
{
  "name": "Cà Phê Trứng 3T",
  "address": "1A Tôn Đức Thắng, Bến Nghé, Quận 1, TP.HCM",
  "latitude": 10.7769,
  "longitude": 106.7058,
  "category": "OTHER",
  "url": "https://shopeefood.vn/ho-chi-minh/ca-phe-trung-3t",
  "notes": "View bờ sông Sài Gòn cực đẹp",
  "estimated_cost": 55000,
  "open_minute": 420,
  "close_minute": 1380
}
```
- **Response 201 Created**:
*(Lưu ý: Hệ thống chạy `PlaceCategoryDetector` tự động chuyển `category` từ `OTHER` thành `DRINK` do phát hiện từ khoá "Cà Phê")*
```json
{
  "id": "8f3e2b1a-9c4d-4e5f-8a1b-7c6d5e4f3a2b",
  "room_id": "c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21",
  "submitted_by": {
    "id": "e4a2d815-1a3b-4c22-b5f7-920478bf1144",
    "nickname": "HoangNam"
  },
  "name": "Cà Phê Trứng 3T",
  "address": "1A Tôn Đức Thắng, Bến Nghé, Quận 1, TP.HCM",
  "latitude": 10.7769,
  "longitude": 106.7058,
  "category": "DRINK",
  "status": "PROPOSED",
  "url": "https://shopeefood.vn/ho-chi-minh/ca-phe-trung-3t",
  "notes": "View bờ sông Sài Gòn cực đẹp",
  "estimated_cost": 55000,
  "open_minute": 420,
  "close_minute": 1380,
  "upvotes": 0,
  "downvotes": 0,
  "score": 0,
  "current_user_vote": 0,
  "created_at": "2026-10-17T07:40:00Z"
}
```

#### 5. Lấy danh sách địa điểm (kèm vote summary)
- **Method & Path**: `GET /api/v1/rooms/{room_id}/places`
- **Auth**: Header `X-Member-Token: <token>`
- **Response 200 OK**:
```json
[
  {
    "id": "8f3e2b1a-9c4d-4e5f-8a1b-7c6d5e4f3a2b",
    "name": "Cà Phê Trứng 3T",
    "category": "DRINK",
    "status": "VOTING",
    "estimated_cost": 55000,
    "open_minute": 420,
    "close_minute": 1380,
    "upvotes": 4,
    "downvotes": 1,
    "score": 3,
    "current_user_vote": 1,
    "submitted_by_id": "e4a2d815-1a3b-4c22-b5f7-920478bf1144",
    "created_at": "2026-10-17T07:40:00Z",
    "priority": {
      "rank": 1,
      "risk": "SAFE",
      "slack_min": 85,
      "max_eta_min": 20,
      "labels": ["RECOMMENDED"],
      "estimated": true,
      "hours_unknown": false,
      "eta_unknown": false
    }
  }
]
```
- **Query `sort` (CR-12 phần 2)**: bỏ trống = thứ tự cũ (thời điểm thêm, tăng dần) để client cũ không vỡ; `sort=priority` = theo `priority.rank` (quán bị loại xuống cuối, giữ thứ tự thêm). Giá trị khác → 422.
- **`priority` (CR-12 phần 2, ALGO-04, `ALGORITHMS.md` §6)**: có trên mọi quán chưa `REJECTED` (các quán `REJECTED` có `priority: null`); cũng có ở mục 29 (chi tiết một quán). Phản hồi tạo/sửa quán (mục 4, 30) **không** có (đợi `PRIORITY_UPDATED`). Tính ở server, mỗi lần đọc: `available` = số phút giao giữa giờ mở cửa và khung phòng (không rõ giờ → cả khung, `hours_unknown: true`; quán qua đêm tính cả phần của hôm trước; mở = đóng → cả ngày); `max_eta_min` = chặng lâu nhất từ xuất phát của mọi thành viên đang hoạt động (`vị trí riêng ?? điểm hẹn`) tới quán, khởi hành lúc `start_minute` (không ai có xuất phát hoặc quán thiếu toạ độ → 0, `eta_unknown: true`); `slack_min = available − (60 + max_eta + margin(max_eta, start_minute) + 5)`; `risk` = `HIGH_RISK` nếu `available = 0` hoặc `slack < −30`, `SOFT_CONFLICT` nếu `slack < 0`, còn lại `SAFE`. Thứ tự: `(risk SAFE<SOFT<HIGH, −upvotes, −slack, max_eta, created_at)` tăng dần, sắp ổn định. `labels` tối đa 1, ưu tiên: `RECOMMENDED` (hạng 1 và SAFE) · `MOST_VOTED_RISKY` (bằng số `upvotes` lớn nhất > 0 nhưng không SAFE) · `MOST_VOTED` · `SCHEDULE_SAFE` (SAFE và slack ≥ 30). Chỉ dùng phần đồng bộ của estimator (ước lượng, hoặc số Google đã có trong cache) — **không bao giờ gọi Google**; `estimated` = có chặng ước lượng. Không chứa toạ độ hay số phút của từng thành viên.

#### 6. Bỏ phiếu cho địa điểm
- **Method & Path**: `POST /api/v1/rooms/{room_id}/places/{place_id}/votes`
- **Auth**: Header `X-Member-Token: <token>`
- **Request Body**:
```json
{
  "vote_value": 1
}
```
- **Response 200 OK**:
```json
{
  "place_id": "8f3e2b1a-9c4d-4e5f-8a1b-7c6d5e4f3a2b",
  "upvotes": 5,
  "downvotes": 1,
  "score": 4,
  "current_user_vote": 1
}
```

#### 7. Rút phiếu bầu (Hủy vote)
- **Method & Path**: `DELETE /api/v1/rooms/{room_id}/places/{place_id}/votes`
- **Auth**: Header `X-Member-Token: <token>`
- **Response 200 OK**:
```json
{
  "place_id": "8f3e2b1a-9c4d-4e5f-8a1b-7c6d5e4f3a2b",
  "upvotes": 4,
  "downvotes": 1,
  "score": 3,
  "current_user_vote": 0
}
```

#### 8. Chốt kết quả bình chọn (Resolve Voting with TieBreak)
- **Method & Path**: `POST /api/v1/rooms/{room_id}/voting/resolve`
- **Auth**: Header `X-Member-Token: <token>` (Chỉ `HOST` mới có quyền)
- **Request Body**:
```json
{
  "strategy": "MOST_UPVOTES",
  "max_accepted_places": 3
}
```
- **Response 200 OK**:
```json
{
  "resolved_places": [
    {
      "id": "8f3e2b1a-9c4d-4e5f-8a1b-7c6d5e4f3a2b",
      "name": "Cà Phê Trứng 3T",
      "status": "ACCEPTED",
      "score": 4,
      "upvotes": 5
    }
  ],
  "tie_break_applied": true,
  "tie_break_strategy": "MOST_UPVOTES"
}
```
- **`strategy: "TRAVEL_TIME"` (CR-12, CR-15)**: server **tính lại** Ψ của từng loại đang hoà (mục 35, kể cả loại đã có quán `ACCEPTED`) rồi chốt; mọi trường ngoài `strategy` và `max_accepted_places` đều bị bỏ qua, nên client không ép được kết quả. Nhóm hoà = cùng `score` **và** cùng loại (`category`); trong nhóm xếp theo thứ hạng OMP (Ψ tăng dần), các nhóm xếp theo `score` giảm dần (cùng điểm khác loại: theo tên loại giảm dần). Quán ngoài tập hoà / không xếp hạng được xếp sau theo `upvotes` giảm dần rồi `created_at`. Không tính được thứ hạng (không ai tự chia sẻ vị trí, quán thiếu toạ độ) → lùi về "nhiều Muốn đi hơn → thêm sớm hơn". Luồng chốt giữ như cũ ở MVP (quán thắng ACCEPTED, còn lại REJECTED, phòng FINALIZED — `docs/phase7/PLAN.md` §2). Google Routes (nếu bật) chỉ được gọi ở bước tính này.
- **Error Codes**: `FORBIDDEN_HOST_ONLY` (403), `INVALID_STRATEGY` (400).

#### 9. Lấy danh sách lịch trình
- **Method & Path**: `GET /api/v1/rooms/{room_id}/schedule`
- **Auth**: Header `X-Member-Token: <token>`
- **Response 200 OK**:
```json
[
  {
    "id": "4a5b6c7d-8e9f-0a1b-2c3d-4e5f6a7b8c9d",
    "room_id": "c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21",
    "place_id": "8f3e2b1a-9c4d-4e5f-8a1b-7c6d5e4f3a2b",
    "place_name": "Cà Phê Trứng 3T",
    "place_address": "1A Tôn Đức Thắng, Q1",
    "day_offset": 0,
    "start_minute": 540,
    "end_minute": 630,
    "order_index": 0,
    "note": "Uống cà phê sáng và ngắm tàu thuyền"
  }
]
```

#### 10. Thêm địa điểm vào lịch trình
- **Method & Path**: `POST /api/v1/rooms/{room_id}/schedule`
- **Auth**: Header `X-Member-Token: <token>`
- **Request Body**:
```json
{
  "place_id": "8f3e2b1a-9c4d-4e5f-8a1b-7c6d5e4f3a2b",
  "day_offset": 0,
  "start_minute": 540,
  "end_minute": 630,
  "note": "Uống cà phê sáng"
}
```
- **Response 201 Created**: Trả về schedule item vừa tạo kèm danh sách cảnh báo xung đột tức thời (nếu có).

#### 11. Cập nhật / Sắp xếp lại toàn bộ lịch trình (Reorder / Bulk Update)
- **Method & Path**: `PUT /api/v1/rooms/{room_id}/schedule`
- **Auth**: Header `X-Member-Token: <token>`
- **Request Body**:
```json
{
  "items": [
    {
      "id": "4a5b6c7d-8e9f-0a1b-2c3d-4e5f6a7b8c9d",
      "day_offset": 0,
      "start_minute": 540,
      "end_minute": 630,
      "order_index": 0,
      "note": "Uống cà phê sáng"
    },
    {
      "id": "5b6c7d8e-9f0a-1b2c-3d4e-5f6a7b8c9d0e",
      "day_offset": 0,
      "start_minute": 660,
      "end_minute": 750,
      "order_index": 1,
      "note": null
    }
  ]
}
```
- **`note` (CR-10)**: tuỳ chọn nhưng **thiếu `note` = đặt `NULL`** (xoá ghi chú). Client phải gửi lại ghi chú hiện có
  cho mục không đổi ghi chú (frontend dựng payload qua `toBulkPayload()` ở `room/calendar.ts`).
- **Response 200 OK**: Trả về mảng schedule items đã cập nhật.

#### 12. Kiểm tra xung đột (Evaluate Conflicts)
- **Method & Path**: `POST /api/v1/rooms/{room_id}/conflicts/evaluate`
- **Auth**: Header `X-Member-Token: <token>`
- **Response 200 OK**:
```json
[
  {
    "id": "3c4d5e6f-7a8b-9c0d-1e2f-3a4b5c6d7e8f",
    "rule_code": "TIME_OVERLAP",
    "level": "CRITICAL",
    "message": "Trùng lặp thời gian: 'Cà Phê Trứng 3T' (09:00 - 10:30) bị đè khung giờ với 'Cơm Tấm Ba Ghiền' (10:00 - 11:30)",
    "entity_type": "SCHEDULE",
    "entity_ids": [
      "4a5b6c7d-8e9f-0a1b-2c3d-4e5f6a7b8c9d",
      "5b6c7d8e-9f0a-1b2c-3d4e-5f6a7b8c9d0e"
    ],
    "params": {
      "item_ids": ["4a5b6c7d-8e9f-0a1b-2c3d-4e5f6a7b8c9d", "5b6c7d8e-9f0a-1b2c-3d4e-5f6a7b8c9d0e"],
      "place_names": ["Cà Phê Trứng 3T", "Cơm Tấm Ba Ghiền"],
      "ranges": [
        {"start_minute": 540, "end_minute": 630, "day_offset": 0},
        {"start_minute": 600, "end_minute": 690, "day_offset": 0}
      ]
    },
    "created_at": "2026-10-17T07:45:00Z"
  }
]
```

#### 13. Danh sách POI theo Bounding Box (CR-02, CR-17 A)
- **Method & Path**: `GET /api/v1/pois?bbox={min_lat,min_lng,max_lat,max_lng}&category={category}&limit={limit}`
- **Auth**: Công khai.
- **Nguồn** (CR-17 A): snapshot `places_{hcm,hn}.json.gz` = Overture Maps Places (`confidence ≥ 0,7`, CDLA-Permissive-2.0)
  gộp OpenStreetMap (ODbL). `category` có thể là `FOOD`, `DRINK`, `SHOPPING`, `ENTERTAINMENT`, `SIGHTSEEING`.
- **Thứ tự**: `score` giảm dần (trước CR-17: theo tên) để `limit` giữ quán nổi bật.
- Mỗi phần tử là `Poi` (§6) với các trường CR-17 A: `kind`, `district`, `brand`, `brand_key`, `score` (0–100), `minzoom` (12–17).

#### 14. Tìm kiếm POI không dấu (CR-02, CR-17 A, CR-17 B, CR-18)
- **Method & Path**: `GET /api/v1/pois/search?q={query}&lat={lat}&lng={lng}&limit={limit}&city={city}`
- **Auth**: Công khai.
- Khớp không dấu trên tên + ẩm thực + brand. **Thứ tự** (CR-17 A): độ khớp tên (đầu tên/đủ từ → chứa chuỗi → chỉ khớp
  ẩm thực/brand) → khi có `lat,lng`: dải khoảng cách 3 km → `score` giảm dần → khoảng cách.
- (CR-17 B) Tìm trong Postgres (`pg_trgm`) khi bảng `pois` đã nạp snapshot: thêm tầng cuối **khớp gần đúng** (gõ sai,
  vd. "vincon" → Vincom; truy vấn ≥ 3 ký tự), trong tầng này: dải 3 km → độ giống → `score` → khoảng cách. Bảng chưa nạp
  hoặc lỗi DB → tìm trong RAM (chỉ khớp chuỗi con). Hình dạng phản hồi không đổi (`Poi[]`).
- (CR-18) `city` tuỳ chọn (`HCM` | `HN`, mã khác → 422): chỉ trả quán trong khung thành phố đó (HCM
  `10.35–11.17°N, 106.35–107.05°E`, HN `20.85–21.25°N, 105.60–106.05°E` — cùng khung `scripts/build_places.py`).
  Không gửi = mọi thành phố (như cũ). Frontend luôn gửi `city` của phòng.

#### 14a. Chuỗi cửa hàng khớp truy vấn (CR-17 B, CR-18)
- **Method & Path**: `GET /api/v1/pois/brands?q={query}&lat={lat}&lng={lng}&limit={limit}&city={city}` (`limit` 1–20, mặc định 5;
  `city` như mục 14: chỉ đếm chi nhánh trong thành phố đó)
- **Auth**: Công khai.
- **Response 200 OK**: `PoiBrand[]` — `[{ "brand_key": "phuc-long-coffee-tea", "name": "Phuc Long Coffee & Tea", "count": 93, "nearest_km": 0.42 }]`
- Chỉ chuỗi có **≥ 3 chi nhánh**. Khớp: `q` (không dấu) là **tiền tố** tên chuỗi (bỏ "the " đầu) hoặc gần đúng với số từ
  đầu tương ứng (≥ 4 ký tự; "coffee" không khớp "Highlands Coffee"). Có `lat,lng`: `count` chỉ đếm chi nhánh trong
  **60 km**, `nearest_km` = chi nhánh gần nhất; không có: đếm hết, `nearest_km = null`. `name` = tên chuỗi hay gặp nhất.
  Thứ tự: khớp tiền tố trước gần đúng → `count` giảm dần → gần.

#### 14b. Chi nhánh của một chuỗi (CR-17 B, CR-18)
- **Method & Path**: `GET /api/v1/pois/brands/{brand_key}?lat={lat}&lng={lng}&limit={limit}&city={city}` (`limit` 1–500, mặc định 300;
  `city` như mục 14)
- **Auth**: Công khai.
- **Response 200 OK**: `Poi[]` — có `lat,lng`: chi nhánh trong 60 km, **gần → xa**, kèm `distance_km`; không có: mọi chi
  nhánh, `score` giảm dần. `brand_key` không tồn tại → `[]` (không 404).

#### 15. Chi tiết một POI (CR-02, CR-17 A)
- **Method & Path**: `GET /api/v1/pois/{external_id}`
- **Auth**: Công khai.
- `external_id`: `osm:{type}/{id}` khi quán khớp OSM (giữ tương thích quán đã thêm vào phòng), ngược lại `ovt:{gers_id}`.
  Id OSM cũ đã gộp vào quán khác hoặc đã mất khỏi nguồn vẫn tra được (alias / mục `retired` của snapshot).

#### 16. Khớp Google Place ID (CR-02)
- **Method & Path**: `POST /api/v1/pois/google-match`
- **Auth**: Header `X-Member-Token: <token>`
- **Payload**: `{ "external_id": "osm:node/123", "name": "Cơm Tấm Ba Ghiền", "lat": 10.7933, "lng": 106.6664 }`
- **Response 200 OK**: `{ "google_place_id": "ChIJ...", "reason": "OK" }`

#### 17. Báo sai khớp Google Place ID (CR-02)
- **Method & Path**: `DELETE /api/v1/pois/google-match/{external_id}`
- **Auth**: Header `X-Member-Token: <token>`

#### 18. Lấy đánh giá nội bộ (CR-02)
- **Method & Path**: `GET /api/v1/reviews?external_key={external_key}`
- **Auth**: Công khai.
- **Response 200 OK**: `{ "avg": 4.5, "count": 2, "tags_top3": ["ngon", "rẻ"], "items": [...] }`

#### 19. Đăng / cập nhật đánh giá nội bộ (CR-02)
- **Method & Path**: `PUT /api/v1/reviews`
- **Auth**: Header `X-Member-Token: <token>`
- **Payload**: `{ "external_key": "osm:node/123", "rating": 5, "comment": "Ngon tuyệt", "tags": ["ngon"] }`

#### 20. Lấy gợi ý Chọn hộ (CR-02, CR-06)
- **Method & Path**: `GET /api/v1/rooms/{room_id}/decisions/hints`
- **Auth**: Header `X-Member-Token: <token>`
- **Response 200 OK**: `{ "hints": [...], "smart_picks": [{ "place_id": "...", "score": 0.95, "reasons": ["..."], "reason_codes": [{ "code": "TOP_VOTED", "params": {"score": 10, "upvotes": 8} }] }] }`

#### 21. Tạo phiên Chọn hộ (CR-02, CR-06)
- **Method & Path**: `POST /api/v1/rooms/{room_id}/decisions`
- **Auth**: Header `X-Member-Token: <token>` (Host only)
- **Payload**: `{ "mode": "WHEEL", "category": "FOOD", "candidate_place_ids": ["..."], "weighted": false }`
- **Response 201 Created**: `{ "session": {...}, "seed": 123456789, "result_place_id": "...", "result_payload": {...} }` (ở chế độ SMART, `result_payload` gồm `score`, `reasons`, và `reason_codes`)

#### 22. Quẹt thẻ bình chọn Swipe (CR-02)
- **Method & Path**: `POST /api/v1/rooms/{room_id}/decisions/{session_id}/swipes`
- **Auth**: Header `X-Member-Token: <token>`
- **Payload**: `{ "place_id": "...", "liked": true }`

#### 23. Chấp nhận kết quả phiên Chọn hộ (CR-02)
- **Method & Path**: `POST /api/v1/rooms/{room_id}/decisions/{session_id}/accept`
- **Auth**: Header `X-Member-Token: <token>` (Host only)

#### 24. Hủy phiên Chọn hộ (CR-02)
- **Method & Path**: `POST /api/v1/rooms/{room_id}/decisions/{session_id}/cancel`
- **Auth**: Header `X-Member-Token: <token>` (Host only)

#### 25. Xem trước lịch trình tự động (Auto-plan Preview) (CR-02, CR-06)
- **Method & Path**: `POST /api/v1/rooms/{room_id}/schedule/auto-plan`
- **Auth**: Header `X-Member-Token: <token>`
- **Payload**: `{ "day_offset": 0, "duration_overrides": {} }`
- **Response 200 OK**:
```json
{
  "slots": [
    {
      "place_id": "...",
      "day_offset": 0,
      "start_minute": 1080,
      "end_minute": 1155,
      "travel_from_prev_min": 10,
      "reasons": ["Rơi vào khung bữa tối 17:30–20:30"],
      "reason_codes": [{"code": "MEAL_WINDOW", "params": {"window": "dinner", "start_minute": 1050, "end_minute": 1230}}]
    }
  ],
  "dropped": [
    {
      "place_id": "...",
      "reason": "Hết giờ trong buổi",
      "reason_code": "OUT_OF_TIME",
      "reason_params": {}
    }
  ],
  "total_travel_min": 25,
  "total_cost": 300000,
  "used_fallback": false,
  "plan_hash": "..."
}
```

#### 26. Áp dụng lịch trình tự động (Auto-plan Apply) (CR-02)
- **Method & Path**: `POST /api/v1/rooms/{room_id}/schedule/auto-plan/apply`
- **Auth**: Header `X-Member-Token: <token>` (Host only)
- **Payload**: `{ "plan_hash": "...", "slots": [...] }`
- **Response 200 OK**: Trả về schedule items và kích hoạt `SCHEDULE_UPDATED` + `CONFLICTS_UPDATED`. 409 nếu `plan_hash` không khớp.

#### 27. Cập nhật cấu hình phòng (CR-03)
- **Method & Path**: `PATCH /api/v1/rooms/{room_id}`
- **Auth**: Header `X-Member-Token: <token>` (Host only)
- **Payload**: mọi trường tuỳ chọn: `title`, `description`, `event_date`, `budget_limit`, `tie_break_strategy`, `city`, `origin_lat`, `origin_lng`, `start_minute`, `end_minute`, `max_places_per_member` (CR-14: 1–10; gửi `null` tường minh = bỏ giới hạn; không gửi = giữ nguyên)
- **Response 200 OK**: `RoomResponse`; phát WS `ROOM_UPDATED`.
- **Error Codes**: `FORBIDDEN_HOST_ONLY` (403), `VALIDATION_ERROR` (422).

#### Mã lỗi bổ sung (CR-03)
- `PLACE_ALREADY_ADDED` (409): `POST /rooms/{room_id}/places` trùng `(room_id, external_id)`; `details.place_id` là id quán đã có.
- `PLACE_LIMIT_REACHED` (409, CR-14): `POST /rooms/{room_id}/places` khi người gọi đã đề xuất đủ `rooms.max_places_per_member` quán; `details = { "limit": 2, "used": 2 }`. Quán đã xoá không tính (xoá là xoá thật); xoá một quán rồi thêm lại được; `max_places_per_member = NULL` thì không bao giờ gặp mã này. Kiểm tra tuần tự hoá theo phòng (khoá hàng phòng) nên hai request song song của cùng một người không cùng lọt qua.

#### 28. Lấy thành viên hiện tại (CR-05, CR-11)
- **Method & Path**: `GET /api/v1/members/me`
- **Auth**: Header `X-Member-Token: <token>`
- **Response 200 OK**: `SelfMemberResponse` của thành viên ứng với token: `MemberResponse` + `origin_lat`, `origin_lng` (toạ độ riêng của CHÍNH người gọi, `null` nếu chưa đặt).
- **Error Codes**: `UNAUTHORIZED` (401).

#### 33. Đặt / xoá vị trí xuất phát riêng của mình (CR-11)
- **Method & Path**: `PATCH /api/v1/rooms/{room_id}/members/me`
- **Auth**: Header `X-Member-Token: <token>` (thành viên của phòng)
- **Payload**: `{ "origin_lat": 10.7712, "origin_lng": 106.6987 }`. Cả hai trường **bắt buộc có mặt**: cả hai `null` = xoá vị trí; chỉ một `null`, thiếu trường hoặc ngoài biên (±90 / ±180) = `VALIDATION_ERROR` (422).
- **Response 200 OK**: `SelfMemberResponse` (có toạ độ của chính người gọi); phát WS `MEMBER_UPDATED { member_id, has_origin }` (không có toạ độ).
- **Riêng tư (bất biến)**: toạ độ xuất phát của một thành viên chỉ xuất hiện ở `GET /members/me`, phản hồi endpoint này, phản hồi tạo/vào phòng của chính người đó và mục *của chính người nhận* trong `ROOM_STATE_SYNC`. Mọi chỗ trả thành viên khác (`GET /rooms/{id}`, `ROOM_STATE_SYNC`, `MEMBER_JOINED`, `MEMBER_UPDATED`) chỉ có `has_origin: bool`.
- **Error Codes**: `UNAUTHORIZED` (401, kể cả khi `room_id` không phải phòng của token), `VALIDATION_ERROR` (422).

#### 34. Tâm nhóm (CR-11, ALGO-01)
- **Method & Path**: `GET /api/v1/rooms/{room_id}/group-center`
- **Auth**: Header `X-Member-Token: <token>` (thành viên của phòng)
- **Response 200 OK** (`GroupCenterResponse`):
```json
{
  "available": true,
  "center": { "lat": 10.786, "lng": 106.674 },
  "area_label": "Q3 – Phú Nhuận",
  "member_count": 3,
  "nearby_pois": [ { "external_id": "osm:node/1", "name": "…", "category": "FOOD", "lat": 10.79, "lng": 106.67, "distance_km": 0.412 } ]
}
```
- Chỉ tính thành viên đã chia sẻ vị trí (`members.origin_*`); **không** tính điểm hẹn của host. Dưới 2 người → `{ "available": false, "center": null, "area_label": null, "member_count": n, "nearby_pois": [] }`.
- `center` = trung bình vector trên mặt cầu, **làm tròn 3 chữ số** (~100 m). `area_label` = tên khu vực gần nhất theo bảng đóng gói `backend/app/data/districts_{hcm,hn}.json` (OSM, ODbL); hai khu vực chênh ≤ 1,5 km thì gộp "A – B"; tâm quá xa mọi khu vực → `null`. `nearby_pois`: tối đa 10 quán OSM trong 2 km, gần → xa (`distance_km` luôn có).
- **Riêng tư**: phản hồi không bao giờ chứa toạ độ của từng thành viên.
- **Error Codes**: `UNAUTHORIZED` (401, kể cả khi `room_id` không phải phòng của token), `ROOM_NOT_FOUND` (404).

#### 35. Gợi ý hoà phiếu bằng Ordered Median (CR-12 → CR-15, ALGO-02)
- **Method & Path**: `GET /api/v1/rooms/{room_id}/tie-break/suggestion`
- **Auth**: Header `X-Member-Token: <token>` (thành viên của phòng)
- **Response 200 OK** (`TieSuggestion`, CR-15 — thay bản CR-12; bỏ `matrix`, `members.origin_source`, `unranked_place_ids`, `margin_vs_second_min`, `threshold_min`, `travel_mode`):
```json
{
  "available": true,
  "reason": null,
  "suggestions": [
    {
      "category": "FOOD",
      "candidates": [ { "place_id": "…", "name": "Vạn Hạnh Mall", "upvotes": 7, "downvotes": 0, "score": 7 } ],
      "recommended_place_id": "…",
      "ranking": [ { "place_id": "…", "rank": 1, "psi": 1003.08, "max_km": 17.066, "total_km": 37.647, "max_min": 42 } ],
      "members": [ { "member_id": "…", "nickname": "Bảo", "km": 4.19, "minutes": 12, "rank": 1, "weight": 1.0 } ],
      "runner_up_psi": 1208.954,
      "excluded_member_count": 0,
      "estimated": true,
      "source": "ESTIMATE",
      "params": { "lambda": 1.0, "k": 2.0 }
    }
  ]
}
```
- **Kích hoạt (theo từng loại quán)**: trong một `category`, các quán chưa `REJECTED`/`VISITED`, ≥ 2 quán cùng `score` (upvotes − downvotes) lớn nhất, loại đó có ít nhất một phiếu, và loại chưa có quán `ACCEPTED`; mọi quán bằng điểm đó là ứng viên (có thể > 3). Mỗi loại hoà là một mục của `suggestions` (thứ tự khai báo `PlaceCategory`: FOOD, DRINK, ENTERTAINMENT, …). Không loại nào hoà → `{available:false, reason:"NO_TIE", suggestions:[]}` (không gọi estimator/Google). `NEAR_TIE` không kích hoạt.
- **Xuất phát**: chỉ thành viên đang hoạt động **tự chia sẻ** vị trí (`members.origin_*`); **không** dùng điểm hẹn của host (khác CR-12). Người thiếu bị loại, đếm ở `excluded_member_count`. Không ai → `available:false`, `reason:"NO_ORIGINS"` (vẫn có `suggestions` với `candidates`, `ranking: []`). Mọi ứng viên của mọi loại thiếu toạ độ → `reason:"NO_PLACE_COORDS"`.
- **Thuật toán (MVP K = 1)**: người i với quán s: `dᵢ = km(nhà_i → s) + km(s → nhà_i)` (hai chiều hỏi riêng, không giả định đối xứng), `cᵢ = dᵢ^k`, sắp c tăng dần, `Ψ = Σ w_r·c₍r₎` với `w_r = 1 + λ·(r−1)/(N−1)` (N = 1 → w = 1). Xếp Ψ tăng dần; hoà Ψ (sai số 1e-9) → `max_km` nhỏ hơn → `total_km` nhỏ hơn → quán thêm sớm hơn → `place_id`. Mặc định `λ = 1.0`, `k = 2.0` (`params`; CR-16, T-99 — trước đó `λ = 0.5`, `k = 1` của Sơn). Với `k = 2`, Ψ có đơn vị km² (chỉ để so).
- **Trường**: km là **khứ hồi**, làm tròn 3 số; `minutes` = phút đi + phút về của người đó; `max_min` = lớn nhất của các `minutes` ở quán đó. `members[]` là của **quán đề xuất**, sắp theo `rank` (1 = đi gần nhất), `weight` = w của hạng đó. Quán thiếu toạ độ có trong `candidates` nhưng không có dòng `ranking`, không bao giờ được đề xuất. `runner_up_psi` = Ψ hạng 2 (`null` nếu chỉ một quán xếp hạng được). `source` = `ESTIMATE` nếu còn ô ước lượng, ngược lại nguồn chung (`GOOGLE`, `VALHALLA`) hoặc `MIXED`; `estimated` = `source == "ESTIMATE"`. Km khởi hành lúc `room.start_minute` của `event_date` (cả hai chiều). Với `ROUTING_PROVIDER=valhalla` (CR-15 phần B, T-95) km **chỉ đọc từ cache DB** (không chờ mạng); ô chưa có → ước lượng, và server hẹn làm ấm nền nên lần gọi sau có số Valhalla.
- **Riêng tư**: không có toạ độ của ai, không hình học đường đi (CR-11).
- **Error Codes**: `UNAUTHORIZED` (401), `ROOM_NOT_FOUND` (404).

#### 36. Tổng khả thi của lịch (CR-12 phần 2, ALGO-03)
- **Method & Path**: `GET /api/v1/rooms/{room_id}/schedule/feasibility`
- **Auth**: Header `X-Member-Token: <token>` (thành viên của phòng)
- **Response 200 OK** (`ScheduleFeasibility`):
```json
{
  "window_min": 360,
  "required_total_min": 193,
  "buffer_total_min": 167,
  "is_feasible": true,
  "legs": [
    {
      "from_item_id": "…", "to_item_id": "…",
      "eta_min": 3, "margin_min": 5, "buffer_min": 5, "gap_min": 10, "slack_min": -3,
      "distance_km": 1.069, "risk": "SOFT_CONFLICT", "peak": true, "source": "ESTIMATE"
    }
  ],
  "estimated": true,
  "item_count": 3,
  "unknown_leg_count": 1
}
```
- **Phạm vi**: chỉ mục của ngày phòng (`day_offset = 0`), vì khung giờ là của một ngày. `window_min = end_minute − start_minute` (khung qua nửa đêm +24h).
- **Chặng**: mọi cặp mục liên tiếp (sắp như luật `TRAVEL_TIME`, §1.13 A), **kể cả cặp chồng giờ** (`gap_min < 0`, luôn `HIGH_RISK`; cảnh báo của cặp này vẫn chỉ là `TIME_OVERLAP`). Số liệu và mức giống hệt `params` của `TRAVEL_TIME` (cùng hàm); `SAFE` cũng có mặt. Cặp có quán thiếu toạ độ không vào `legs`, đếm ở `unknown_leg_count`. Chặng gọi Google nếu `PLACES_PROVIDER=google` + key (lỗi → `ESTIMATE`); `ROUTING_PROVIDER=valhalla` → km cache DB (`VALHALLA`), chưa có → `ESTIMATE` (CR-15).
- **Tổng**: `required_total_min = Σ (end − start) + Σ (eta + margin + buffer)`; `buffer_total_min = window − required_total`; `is_feasible = buffer_total ≥ 0 và không chặng nào HIGH_RISK`. `estimated` = có chặng ước lượng.
- **Cập nhật**: không có sự kiện WS riêng — client gọi lại khi nhận `SCHEDULE_UPDATED`, `CONFLICTS_UPDATED`, `ROOM_UPDATED`.
- **Error Codes**: `UNAUTHORIZED` (401), `ROOM_NOT_FOUND` (404).

#### 37. Đường của tôi tới một quán (CR-15 phần B, T-95)
- **Method & Path**: `GET /api/v1/rooms/{room_id}/routes/me?place_id=<uuid>`
- **Auth**: Header `X-Member-Token: <token>` (thành viên của phòng)
- **Response 200 OK** (`MyRoutes`):
```json
{
  "place_id": "…",
  "to_place": { "km": 6.214, "minutes": 15, "shape": "_p~iF~ps|U_ulL…", "source": "VALHALLA" },
  "to_home": { "km": 6.873, "minutes": 17, "shape": "…", "source": "VALHALLA" }
}
```
- **Ý nghĩa**: `to_place` = nhà **người gọi** → quán, `to_home` = quán → nhà người gọi (một chiều, không đối xứng). Chỉ dùng vị trí người gọi **tự chia sẻ** (`origin_source = MEMBER`), không dùng điểm hẹn host.
- **Trường**: `km` làm tròn 3 số; `minutes = ceil(km ÷ MOTORBIKE_KMH × 60)` (Google: phút có kẹt xe); `shape` = polyline mã hoá **độ chính xác 6** (định dạng Valhalla), `null` khi chưa có đường thật (`source = ESTIMATE`, hoặc nguồn Google); `source ∈ ESTIMATE | VALHALLA | GOOGLE`.
- **Nguồn**: cache DB → (thiếu `shape` và Valhalla bật) gọi `/route` ngay, timeout `VALHALLA_TIMEOUT_S`, lưu lại → lỗi thì km cache/ước lượng, `shape: null`. Mặc định (`ROUTING_PROVIDER` trống): ước lượng, `shape: null`, không gọi mạng.
- **Riêng tư (CR-11)**: không bao giờ có đường/km xuất phát từ nhà người khác; không có trường toạ độ, không khoá cache.
- **Error Codes**: `UNAUTHORIZED` (401), `ROOM_NOT_FOUND` (404), `PLACE_NOT_FOUND` (404, quán không thuộc phòng), `NO_ORIGIN` (404, người gọi chưa chia sẻ vị trí), `NO_PLACE_COORDS` (404, quán thiếu toạ độ), `VALIDATION_ERROR` (422, thiếu/sai `place_id`).

#### 38. Đường giữa các mục trên lịch (CR-15 phần B, T-95)
- **Method & Path**: `GET /api/v1/rooms/{room_id}/schedule/routes`
- **Auth**: Header `X-Member-Token: <token>` (thành viên của phòng)
- **Response 200 OK** (`ScheduleRoutes`):
```json
{
  "legs": [
    { "from_item_id": "…", "to_item_id": "…", "km": 1.31, "minutes": 4, "shape": "…", "source": "VALHALLA" }
  ],
  "unknown_leg_count": 1
}
```
- **Phạm vi**: các cặp mục liên tiếp của ngày phòng (`day_offset = 0`), cùng cách ghép cặp với mục 36 (kể cả cặp chồng giờ). Cặp có quán thiếu toạ độ không vào `legs`, đếm ở `unknown_leg_count`. Trường `km/minutes/shape/source` như mục 37.
- **Cập nhật**: không có sự kiện WS riêng — client gọi lại khi nhận `SCHEDULE_UPDATED`, `PLACE_UPDATED`.
- **Error Codes**: `UNAUTHORIZED` (401), `ROOM_NOT_FOUND` (404).

#### 29. Chi tiết một địa điểm trong phòng (CR-05)
- **Method & Path**: `GET /api/v1/rooms/{room_id}/places/{place_id}`
- **Auth**: Header `X-Member-Token: <token>` (thành viên của phòng)
- **Response 200 OK**: `PlaceResponse` (kèm vote summary và `current_user_vote` như endpoint 5).
- **Error Codes**: `PLACE_NOT_FOUND` (404) khi quán không tồn tại hoặc không thuộc `room_id`.

#### 30. Chỉnh sửa địa điểm (CR-05)
- **Method & Path**: `PATCH /api/v1/rooms/{room_id}/places/{place_id}`
- **Auth**: Header `X-Member-Token: <token>` (người đề xuất quán hoặc Host)
- **Payload**: mọi trường tuỳ chọn (`UpdatePlaceRequest`): `name`, `address`, `latitude`, `longitude`, `category`, `status`, `url`, `notes`, `estimated_cost`, `open_minute`, `close_minute`, `cuisine`, `opening_hours_raw`.
- **Response 200 OK**: `PlaceResponse`. Nếu `status` đổi thì phát WS `PLACE_UPDATED`.
- **Error Codes**: `PLACE_NOT_FOUND` (404), `FORBIDDEN_HOST_ONLY` (403) khi không phải người đề xuất hay Host, `VALIDATION_ERROR` (422).

#### 31. Xoá địa điểm (CR-05)
- **Method & Path**: `DELETE /api/v1/rooms/{room_id}/places/{place_id}`
- **Auth**: Header `X-Member-Token: <token>` (người đề xuất quán hoặc Host)
- **Response 200 OK**: `{ "success": true, "place_id": "...", "message": "..." }`; phát WS `PLACE_DELETED`.
- **Error Codes**: `PLACE_NOT_FOUND` (404), `FORBIDDEN_HOST_ONLY` (403).

#### 32. Xoá mục lịch trình (CR-05)
- **Method & Path**: `DELETE /api/v1/rooms/{room_id}/schedule/{item_id}`
- **Auth**: Header `X-Member-Token: <token>` (mọi thành viên của phòng)
- **Response 200 OK**: `{ "success": true, "item_id": "...", "message": "..." }`; đánh giá lại xung đột, lưu lại bảng `conflicts` và phát WS `SCHEDULE_UPDATED`.
- **Error Codes**: `ROOM_NOT_FOUND` (404), `SCHEDULE_ITEM_NOT_FOUND` (404).

---

## 4. GIAO THỨC VÀ SỰ KIỆN WEBSOCKET (WEBSOCKET CONTRACT)

- **URL kết nối**: `ws://<host>:<port>/ws/rooms/{room_id}?token={member_token}`
- **Cấu trúc khung dữ liệu (Standard Envelope Format)**:
```json
{
  "type": "TÊN_SỰ_KIỆN_IN_HOA",
  "payload": {},
  "ts": 1729148400000,
  "state_version": 42
}
```

**`state_version` (CR-13)** — có ở **mọi** tin server → client sau khi xác thực (riêng `ERROR` do xác thực thất bại không có vì chưa biết phòng):
- Tin **đổi trạng thái** (`MEMBER_JOINED`, `MEMBER_UPDATED`, `GROUP_CENTER_UPDATED`, `PLACE_*`, `VOTE_UPDATED`, `VOTING_RESOLVED`, `SCHEDULE_UPDATED`, `ROOM_UPDATED`, `DECISION_*`, `CONFLICTS_UPDATED` do API gọi trực tiếp) mang số **mới**, tăng đúng +1 so với tin đổi trạng thái liền trước của phòng (bump trong cùng transaction với thay đổi). Một thao tác phát hai tin (vd. `VOTE_UPDATED` + `PLACE_UPDATED`) thì tăng +2.
- Tin **tạm thời** (`CHAT_MESSAGE`, `TYPING_PLACE`, `PRESENCE_UPDATED`, `PING`, `PONG`, `ERROR` sau xác thực) mang số **hiện tại**, không làm số tăng.
- `CONFLICTS_UPDATED` do **đánh giá ngầm** sau `SCHEDULE_UPDATED`/`PLACE_ADDED` mang lại **chính số của tin gây ra nó** (bằng, không +1): handler chạy ở session riêng, tăng số ở đó sẽ chờ khoá hàng phòng mà request gốc đang giữ.
- `ROOM_STATE_SYNC` mang số hiện tại ở khung ngoài, ở `payload.state_version` và ở `payload.room.state_version`.
- **Quy tắc client**: giữ số lớn nhất đã áp; tin có số **nhỏ hơn** → bỏ; số **lớn hơn +1** so với tin đổi trạng thái đã áp (nhảy cóc) → gửi `SUBSCRIBE_ROOM` để đồng bộ lại; bằng nhau thì áp bình thường.

### 4.1. Chiều Client $\rightarrow$ Server
| Type | Ý nghĩa | Payload mẫu |
| :--- | :--- | :--- |
| `PING` | Nhịp tim giữ kết nối (mỗi 30s) | `{}` |
| `SUBSCRIBE_ROOM` | Yêu cầu nhận đồng bộ toàn diện | `{ "room_id": "c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21" }` |
| `TYPING_PLACE` | Báo hiệu thành viên đang nhập địa điểm | `{ "is_typing": true, "nickname": "ThuTrang" }` |
| `CHAT_MESSAGE` | Gửi tin chat tới cả phòng (CR-04; tối đa 500 ký tự, 20 tin/10 s/member) | `{ "message": "Tối nay đi đâu?" }` |
| `PRESENCE_UPDATE` | Tiêu điểm hiện tại của người gửi (CR-08): quán đang xem, con trỏ trên bản đồ, hoặc `null`. ≤ 5 lần/giây/member, vượt hoặc sai dạng thì server bỏ im lặng; không ghi DB. Đang giữ tiêu điểm thì gửi lại mỗi 10 s | `{ "focus": { "kind": "place", "place_id": "..." } }` · `{ "focus": { "kind": "map", "lng": 106.70, "lat": 10.77 } }` · `{ "focus": null }` |

### 4.2. Chiều Server $\rightarrow$ Client
| Type | Ý nghĩa | Payload mẫu |
| :--- | :--- | :--- |
| `PONG` | Phản hồi lại PING | `{}` |
| `PING` | Server chủ động gửi mỗi 25 s; client có thể trả `PONG` hoặc bỏ qua (CR-04) | `{}` |
| `CHAT_MESSAGE` | Tin chat broadcast tới cả phòng (CR-04) | `{ "member_id": "...", "nickname": "ThuTrang", "avatar_url": null, "message": "Tối nay đi đâu?" }` |
| `ERROR` | Thông báo lỗi xử lý socket | `{ "code": "UNAUTHORIZED", "message": "Token không hợp lệ" }`; mã bổ sung (CR-04): `MESSAGE_TOO_LONG`, `RATE_LIMIT_EXCEEDED` |
| `ROOM_STATE_SYNC` | Đồng bộ toàn bộ dữ liệu khi vừa connect (CR-11: mục `members` của chính người nhận có `origin_lat/lng`, của người khác chỉ có `has_origin`; CR-13: có `state_version`) | `{ "room": {...}, "members": [...], "places": [...], "schedule": [...], "conflicts": [...], "state_version": 42 }` |
| `MEMBER_JOINED` | Có thành viên mới tham gia (CR-11: có `has_origin`, luôn `false` lúc mới vào) | `{ "member": { "id": "...", "nickname": "ThuTrang", "role": "MEMBER", "has_origin": false } }` |
| `MEMBER_UPDATED` | Thành viên đặt/xoá vị trí xuất phát (CR-11); chỉ có cờ, **không bao giờ** có toạ độ | `{ "member_id": "...", "has_origin": true }` |
| `GROUP_CENTER_UPDATED` | Tâm nhóm vừa có / đổi / mất vì có người đặt/xoá vị trí (CR-11/CR-12). Phát ngay sau `MEMBER_UPDATED` (+1 `state_version`), chỉ khi trước hoặc sau thay đổi có ≥ 2 người chia sẻ. Tâm đã làm tròn 3 chữ số, không có toạ độ cá nhân | `{ "available": true, "center": { "lat": 10.786, "lng": 106.674 }, "area_label": "Q3", "member_count": 3 }` · khi mất tâm: `{ "available": false, "member_count": 1 }` |
| `MEMBER_LEFT` | Thành viên ngắt kết nối / rời phòng | `{ "member_id": "...", "nickname": "ThuTrang" }` |
| `PLACE_ADDED` | Có địa điểm mới được thêm | `{ "place": { "id": "...", "name": "Cà phê 3T", "category": "DRINK", ... } }` |
| `PLACE_UPDATED` | Thông tin địa điểm cập nhật | `{ "place": { "id": "...", "status": "ACCEPTED", ... } }` |
| `PLACE_DELETED` | Địa điểm bị xóa | `{ "place_id": "8f3e2b1a-9c4d-4e5f-8a1b-7c6d5e4f3a2b" }` |
| `VOTE_UPDATED` | Kết quả vote của một địa điểm thay đổi (CR-08: thêm `voter_id` tuỳ chọn) | `{ "place_id": "...", "upvotes": 5, "downvotes": 1, "score": 4, "voter_id": "..." }` |
| `PRESENCE_UPDATED` | Tiêu điểm của một member (CR-08); phát cho cả phòng trừ người gửi; kết nối cuối của member đóng → `focus: null`. Client xoá tiêu điểm sau 15 s không cập nhật | `{ "member_id": "...", "focus": { "kind": "place", "place_id": "..." } }` |
| `VOTING_RESOLVED` | Chủ phòng đã chốt kết quả vote | `{ "strategy": "MOST_UPVOTES", "accepted_place_ids": ["..."] }` |
| `SCHEDULE_UPDATED` | Lịch trình thời gian thay đổi | `{ "items": [ {...}, {...} ] }` |
| `PRIORITY_UPDATED` | (CR-12 phần 2) Thứ tự ưu tiên danh sách bình chọn đổi (ALGO-04). Mang **toàn bộ** danh sách, `rank` 1 trước, quán `REJECTED` không có mặt; mỗi mục = `priority` của mục 5 + `place_id`. Phát **ngay sau** tin gây ra nó, trong cùng request (+1 `state_version`): `VOTE_UPDATED`, `PLACE_ADDED`, `PLACE_DELETED`, sửa quán (trạng thái/toạ độ/giờ mở cửa), `VOTING_RESOLVED`, `MEMBER_UPDATED` (sau `GROUP_CENTER_UPDATED` nếu có), `MEMBER_JOINED` (chỉ khi phòng có điểm hẹn), `ROOM_UPDATED` (chỉ khi đổi `start_minute`/`end_minute`/`event_date`/`origin_lat`/`origin_lng`). Phòng chưa có quán chưa bị loại → không phát | `{ "items": [ { "place_id": "...", "rank": 1, "risk": "SAFE", "slack_min": 85, "max_eta_min": 20, "labels": ["RECOMMENDED"], "estimated": true, "hours_unknown": false, "eta_unknown": false } ] }` |
| `CONFLICTS_UPDATED`| Danh sách cảnh báo xung đột được làm mới (CR-06: mỗi conflict chứa `params`). (T-87) Mọi thao tác lịch (thêm/sửa hàng loạt/xoá mục) tự phát tin này **trong request**, ngay sau `SCHEDULE_UPDATED` (+1 `state_version`); đánh giá ngầm chỉ còn chạy sau `PLACE_ADDED` (dùng lại số của tin đó) | `{ "conflicts": [ { "id": "...", "rule_code": "TIME_OVERLAP", "params": { "place_names": [...], "ranges": [...] }, ... } ] }` |
| `ROOM_UPDATED` | Cấu hình phòng thay đổi (CR-03) | `{ "room": {...} }` |
| `DECISION_STARTED` | Phiên chọn hộ bắt đầu (CR-02, CR-06) | `{ "session_id": "...", "mode": "WHEEL", "candidate_place_ids": [...], "seed": 812734, "result_place_id": "...", "result_payload": {"stop_angle_deg": 1532.5}, "closes_at": null }` (ở chế độ SMART, `result_payload` gồm `score`, `reasons`, và `reason_codes`) |
| `DECISION_PROGRESS`| Cập nhật tiến độ người đã swipe (CR-02) | `{ "session_id": "...", "done_member_ids": ["..."], "total_members": 5 }` |
| `DECISION_RESOLVED`| Phiên chọn hộ đã chốt (CR-02) | `{ "session_id": "...", "result_place_id": "...", "status": "RESOLVED" }` |

---


## 5. CHỮ KÝ PYTHON (INTERFACES, REPOSITORIES & SERVICES)

```python
from abc import ABC, abstractmethod
from typing import Optional, List, Dict, Any, Generic, TypeVar
from uuid import UUID
from datetime import date, datetime
from pydantic import BaseModel
from app.domain.enums import (
    PlaceStatus, PlaceCategory, VoteValue, ConflictLevel, MemberRole, RoomStatus
)

# ==========================================
# 1. CORE DOMAIN VALUE OBJECTS & DTOs
# ==========================================

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

class TieBreakContext(BaseModel):
    room_id: UUID
    host_member_id: UUID
    already_accepted_categories: List[PlaceCategory] = []

class ConflictResult(BaseModel):
    rule_code: str
    level: ConflictLevel
    message: str
    entity_type: str
    entity_ids: List[UUID]

class ConflictContext(BaseModel):
    room_id: UUID
    budget_limit: Optional[int]
    places: List[PlaceVoteSummary]
    schedule_items: List[Dict[str, Any]]

# ==========================================
# 2. DESIGN PATTERN INTERFACES
# ==========================================

class ITieBreakStrategy(ABC):
    @property
    @abstractmethod
    def strategy_name(self) -> str:
        pass

    @abstractmethod
    def break_ties(
        self,
        candidates: List[PlaceVoteSummary],
        context: TieBreakContext
    ) -> List[PlaceVoteSummary]:
        """Sắp xếp lại danh sách các địa điểm hòa phiếu theo mức độ ưu tiên."""
        pass


class IConflictRule(ABC):
    @property
    @abstractmethod
    def rule_code(self) -> str:
        pass

    @abstractmethod
    def evaluate(self, context: ConflictContext) -> List[ConflictResult]:
        """Đánh giá xung đột trên ngữ cảnh dữ liệu phòng."""
        pass


class IPlaceCategoryDetector(ABC):
    @abstractmethod
    def detect(
        self,
        name: str,
        address: Optional[str] = None,
        url: Optional[str] = None,
        tags: Optional[List[str]] = None
    ) -> PlaceCategory:
        """Nhận diện danh mục của địa điểm dựa trên văn bản và đường dẫn."""
        pass


# ==========================================
# 3. EVENT BUS INTERFACES
# ==========================================

TEvent = TypeVar("TEvent")

class IEventHandler(Generic[TEvent], ABC):
    @abstractmethod
    async def handle(self, event: TEvent) -> None:
        pass

class IEventBus(ABC):
    @abstractmethod
    def register(self, event_type: type, handler: IEventHandler) -> None:
        pass

    @abstractmethod
    async def publish(self, event: Any) -> None:
        pass


# ==========================================
# 4. REPOSITORY INTERFACES
# ==========================================

class IRoomRepository(ABC):
    @abstractmethod
    async def get_by_id(self, room_id: UUID) -> Optional[Any]: pass
    @abstractmethod
    async def get_by_code(self, code: str) -> Optional[Any]: pass
    @abstractmethod
    async def create(self, room_data: Dict[str, Any]) -> Any: pass
    @abstractmethod
    async def update(self, room_id: UUID, update_data: Dict[str, Any]) -> Optional[Any]: pass

class IMemberRepository(ABC):
    @abstractmethod
    async def get_by_token(self, token: str) -> Optional[Any]: pass
    @abstractmethod
    async def get_by_room_and_nickname(self, room_id: UUID, nickname: str) -> Optional[Any]: pass
    @abstractmethod
    async def list_by_room(self, room_id: UUID) -> List[Any]: pass
    @abstractmethod
    async def create(self, member_data: Dict[str, Any]) -> Any: pass
    @abstractmethod
    async def update_last_active(self, member_id: UUID) -> None: pass

class IPlaceRepository(ABC):
    @abstractmethod
    async def get_by_id(self, place_id: UUID) -> Optional[Any]: pass
    @abstractmethod
    async def list_by_room(self, room_id: UUID) -> List[Any]: pass
    @abstractmethod
    async def create(self, place_data: Dict[str, Any]) -> Any: pass
    @abstractmethod
    async def update(self, place_id: UUID, update_data: Dict[str, Any]) -> Optional[Any]: pass
    @abstractmethod
    async def delete(self, place_id: UUID) -> bool: pass

class IVoteRepository(ABC):
    @abstractmethod
    async def get_vote(self, place_id: UUID, member_id: UUID) -> Optional[Any]: pass
    @abstractmethod
    async def upsert_vote(self, place_id: UUID, member_id: UUID, vote_value: int) -> Any: pass
    @abstractmethod
    async def delete_vote(self, place_id: UUID, member_id: UUID) -> bool: pass
    @abstractmethod
    async def get_vote_summary_by_room(self, room_id: UUID) -> Dict[UUID, Dict[str, int]]: pass

class IScheduleRepository(ABC):
    @abstractmethod
    async def list_by_room(self, room_id: UUID) -> List[Any]: pass
    @abstractmethod
    async def create(self, item_data: Dict[str, Any]) -> Any: pass
    @abstractmethod
    async def bulk_update(self, room_id: UUID, items: List[Dict[str, Any]]) -> List[Any]: pass
    @abstractmethod
    async def delete(self, item_id: UUID) -> bool: pass

class IConflictRepository(ABC):
    @abstractmethod
    async def list_by_room(self, room_id: UUID) -> List[Any]: pass
    @abstractmethod
    async def replace_conflicts(self, room_id: UUID, conflicts: List[ConflictResult]) -> List[Any]: pass


# ==========================================
# 5. SERVICE INTERFACES
# ==========================================

class IRoomService(ABC):
    @abstractmethod
    async def create_room(self, data: Dict[str, Any]) -> Dict[str, Any]: pass
    @abstractmethod
    async def join_room(self, code: str, nickname: str, avatar_url: Optional[str]) -> Dict[str, Any]: pass
    @abstractmethod
    async def get_room_details(self, room_id: UUID) -> Dict[str, Any]: pass
    @abstractmethod
    async def update_room(self, room_id: UUID, data: Dict[str, Any]) -> Any: pass  # CR-03

class IPlaceService(ABC):
    @abstractmethod
    async def add_place(self, room_id: UUID, member_id: UUID, data: Dict[str, Any]) -> Dict[str, Any]: pass
    @abstractmethod
    async def list_places(self, room_id: UUID, current_member_id: UUID) -> List[Dict[str, Any]]: pass
    @abstractmethod
    async def get_place(self, room_id: UUID, place_id: UUID, current_member_id: UUID) -> Dict[str, Any]: pass
    @abstractmethod
    async def update_place(self, room_id: UUID, place_id: UUID, member: Any, data: Dict[str, Any]) -> Dict[str, Any]: pass
    @abstractmethod
    async def delete_place(self, room_id: UUID, place_id: UUID, member: Any) -> bool: pass

class IVotingService(ABC):
    @abstractmethod
    async def cast_vote(self, place_id: UUID, member_id: UUID, vote_value: int) -> Dict[str, Any]: pass
    @abstractmethod
    async def retract_vote(self, place_id: UUID, member_id: UUID) -> Dict[str, Any]: pass
    @abstractmethod
    async def resolve_voting(
        self,
        room_id: UUID,
        host_member: Any,
        strategy_name: str,
        max_accepted_places: int = 1,
        explicit_accepted_place_ids: Optional[List[UUID]] = None,
    ) -> Dict[str, Any]: pass  # CR-02

class IScheduleService(ABC):
    @abstractmethod
    async def get_schedule(self, room_id: UUID) -> List[Dict[str, Any]]: pass
    @abstractmethod
    async def add_item(self, room_id: UUID, data: Dict[str, Any]) -> Dict[str, Any]: pass
    @abstractmethod
    async def update_schedule(self, room_id: UUID, items: List[Dict[str, Any]]) -> List[Dict[str, Any]]: pass
    @abstractmethod
    async def delete_item(self, room_id: UUID, item_id: UUID) -> bool: pass
    @abstractmethod
    async def replace_all(self, room_id: UUID, slots: List[Any]) -> List[Any]: pass  # CR-02

class IConflictService(ABC):
    @abstractmethod
    async def evaluate_conflicts(self, room_id: UUID) -> List[ConflictResult]: pass

class IWebSocketConnectionManager(ABC):
    @abstractmethod
    async def connect(self, room_id: UUID, member_id: UUID, websocket: Any) -> None: pass
    @abstractmethod
    async def disconnect(self, room_id: UUID, member_id: UUID) -> None: pass
    @abstractmethod
    async def broadcast_to_room(self, room_id: UUID, message: Dict[str, Any]) -> None: pass


# ==========================================
# 6. PHASE 2 ABSTRACT INTERFACES
# ==========================================

class ITravelTimeEstimator(ABC):
    """Ước lượng thời gian di chuyển giữa 2 toạ độ (CR-02)."""
    @abstractmethod
    def minutes(self, a: tuple[float, float], b: tuple[float, float]) -> int: pass

class IRouteOptimizationService(ABC):
    """Thuật toán tối ưu hóa lộ trình di chuyển và tự động lên lịch trình (CR-02)."""
    @abstractmethod
    async def optimize_route(self, place_ids: List[UUID]) -> List[UUID]: pass

    @abstractmethod
    async def plan_day(
        self, places: List[PlaceVoteSummary], constraints: Any
    ) -> tuple[List[Any], List[Any]]: pass

class IPoiProvider(ABC):
    """Cung cấp dữ liệu POI từ snapshot Overture + OSM (CR-02, CR-17 A); in_bbox xếp score giảm dần."""
    @abstractmethod
    def in_bbox(self, bbox: tuple[float, float, float, float], category: Optional[PlaceCategory], limit: int) -> List[Any]: pass

    @abstractmethod
    def search(self, q: str, near: Optional[tuple[float, float]], limit: int) -> List[Any]: pass

class IExternalPlacesProvider(ABC):
    """Phase 2: Đồng bộ trực tiếp Google Places / OpenStreetMap."""
    @abstractmethod
    async def search_places(self, query: str, lat: float, lng: float) -> List[Dict[str, Any]]: pass

class IExpenseSplittingService(ABC):
    """Phase 2: Tính toán chia hóa đơn theo nhóm."""
    @abstractmethod
    async def calculate_split(self, room_id: UUID, expenses: List[Dict[str, Any]]) -> Dict[str, Any]: pass
```

---

## 6. TYPESCRIPT TYPES (1-1 VỚI PYDANTIC SCHEMAS)

```typescript
// frontend/src/types/enums.ts

export type PlaceStatus = 'PROPOSED' | 'VOTING' | 'ACCEPTED' | 'REJECTED' | 'VISITED';

export type PlaceCategory =
  | 'FOOD'
  | 'DRINK'
  | 'ENTERTAINMENT'
  | 'SIGHTSEEING'
  | 'ACCOMMODATION'
  | 'SHOPPING'
  | 'OTHER';

export type VoteValue = -1 | 0 | 1;

export type ConflictLevel = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export type MemberRole = 'HOST' | 'MEMBER';

export type RoomStatus = 'PLANNING' | 'VOTING' | 'FINALIZED' | 'COMPLETED' | 'ARCHIVED';

export type TieBreakStrategyName =
  | 'EARLIEST_SUBMISSION'
  | 'MOST_UPVOTES'
  | 'CREATOR_PRIORITY'
  | 'RANDOM'
  | 'CATEGORY_DIVERSITY'
  | 'GROUP_DECISION' // CR-02
  | 'TRAVEL_TIME'; // CR-12

export type PlaceSource = 'MANUAL' | 'OSM' | 'GOOGLE'; // CR-02
export type CityCode = 'HCM' | 'HN'; // CR-02
export type DecisionMode = 'SMART' | 'WHEEL' | 'SWIPE' | 'LADDER'; // CR-02
export type DecisionStatus = 'OPEN' | 'RESOLVED' | 'CANCELLED' | 'EXPIRED'; // CR-02
export type TriggerHint =
  | 'TIE_AT_TOP'
  | 'NEAR_TIE'
  | 'TOO_MANY'
  | 'STALLED'
  | 'EMPTY'; // CR-02

// frontend/src/types/models.ts

export interface Room {
  id: string;
  code: string;
  title: string;
  description?: string | null;
  event_date: string; // YYYY-MM-DD
  status: RoomStatus;
  tie_break_strategy: TieBreakStrategyName;
  budget_limit?: number | null;
  city?: CityCode | string; // CR-02
  origin_lat?: number | null; // CR-02
  origin_lng?: number | null; // CR-02
  start_minute?: number; // CR-02, mặc định 1020 (17:00)
  end_minute?: number; // CR-02, mặc định 1380 (23:00)
  max_places_per_member?: number | null; // CR-14, null = không giới hạn
  state_version?: number; // CR-13
  created_at: string;
  updated_at: string;
}

export interface Member {
  id: string;
  room_id: string;
  nickname: string;
  avatar_url?: string | null;
  role: MemberRole;
  is_active: boolean;
  has_origin?: boolean; // CR-11
  joined_at: string;
  last_active_at?: string;
}

/** CR-11: dạng dành cho chính chủ (GET /members/me, PATCH .../members/me, tạo/vào phòng). */
export interface SelfMember extends Member {
  origin_lat?: number | null;
  origin_lng?: number | null;
}

export interface Place {
  id: string;
  room_id: string;
  submitted_by_id: string;
  submitted_by_nickname?: string;
  name: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  category: PlaceCategory;
  status: PlaceStatus;
  source?: PlaceSource; // CR-02
  external_id?: string | null; // CR-02
  google_place_id?: string | null; // CR-02
  cuisine?: string | null; // CR-02
  opening_hours_raw?: string | null; // CR-02
  coords_source?: string | null; // CR-02
  coords_fetched_at?: string | null; // CR-02
  url?: string | null;
  notes?: string | null;
  estimated_cost: number;
  open_minute?: number | null; // 0 - 1439
  close_minute?: number | null; // 0 - 1439
  upvotes: number;
  downvotes: number;
  score: number;
  current_user_vote: VoteValue;
  created_at: string;
  updated_at?: string;
}

export interface ScheduleItem {
  id: string;
  room_id: string;
  place_id: string;
  place_name: string;
  place_address?: string | null;
  day_offset: number;
  start_minute: number; // 0 - 1439
  end_minute: number; // 0 - 1439
  order_index: number;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ConflictAlert {
  id: string;
  rule_code: string;
  level: ConflictLevel;
  message: string;
  entity_type: 'SCHEDULE' | 'PLACE' | 'ROOM';
  entity_ids: string[];
  resolved: boolean;
  created_at: string;
}

export interface Poi {
  external_id: string;
  name: string;
  category: PlaceCategory;
  lat: number;
  lng: number;
  address?: string | null;
  cuisine?: string | null;
  opening_hours_raw?: string | null;
  open_minute?: number | null;
  close_minute?: number | null;
  distance_km?: number | null;
  tags?: Record<string, string>;
  // CR-17 A
  kind?: PoiKind | null; // restaurant | eatery | fast_food | bakery | cafe | tea | dessert | bar | mall | supermarket | cinema | karaoke | play | park | museum
  district?: string | null; // khu vực gần nhất, dùng khi address trống
  brand?: string | null;
  brand_key?: string | null;
  score?: number; // 0–100, điểm nổi bật
  minzoom?: number; // 12–17, zoom bắt đầu hiện icon + tên
}

export interface PlaceReview {
  id: string;
  external_key: string;
  room_id?: string | null;
  member_id?: string | null;
  nickname: string;
  rating: number; // 1 - 5
  comment?: string | null;
  tags: string[];
  created_at: string;
  updated_at?: string;
}

export interface ReviewSummary {
  avg: number;
  count: number;
  tags_top3: string[];
  items: PlaceReview[];
}

export interface DecisionSession {
  id: string;
  room_id: string;
  mode: DecisionMode;
  status: DecisionStatus;
  category?: string | null;
  candidate_place_ids: string[];
  seed: number;
  result_place_id?: string | null;
  result_payload?: Record<string, unknown> | null;
  created_by_id: string;
  created_at: string;
  closes_at?: string | null;
}

export interface DecisionSwipe {
  session_id: string;
  member_id: string;
  place_id: string;
  liked: boolean;
}

export interface DeciderHint {
  type: TriggerHint;
  category?: string | null;
  candidate_place_ids: string[];
}

export interface ScoredPick {
  place_id: string;
  score: number;
  reasons: string[];
}

export interface DecisionHintsResponse {
  hints: DeciderHint[];
  smart_picks: ScoredPick[];
}

export interface PlannedSlot {
  place_id: string;
  day_offset: number;
  start_minute: number;
  end_minute: number;
  travel_from_prev_min: number;
  reasons: string[];
}

export interface DroppedPlace {
  place_id: string;
  reason: string;
}

export interface AutoPlanPreviewResponse {
  slots: PlannedSlot[];
  dropped: DroppedPlace[];
  total_travel_min: number;
  total_cost: number;
  used_fallback: boolean;
  plan_hash: string;
}

// frontend/src/types/api.ts

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown> | null;
  };
}

export interface CreateRoomRequest {
  title: string;
  description?: string;
  event_date: string;
  creator_nickname: string;
  creator_avatar_url?: string;
  budget_limit?: number;
  tie_break_strategy?: TieBreakStrategyName;
  city?: CityCode | string; // CR-02
  origin_lat?: number; // CR-02
  origin_lng?: number; // CR-02
  start_minute?: number; // CR-02
  end_minute?: number; // CR-02
}

export interface UpdateRoomRequest {
  title?: string;
  description?: string | null;
  event_date?: string;
  budget_limit?: number | null;
  tie_break_strategy?: TieBreakStrategyName;
  city?: CityCode | string;
  origin_lat?: number | null;
  origin_lng?: number | null;
  start_minute?: number;
  end_minute?: number;
}

export interface CreateRoomResponse {
  room: Room;
  creator_member: Member;
  member_token: string;
}

export interface JoinRoomRequest {
  room_code: string;
  nickname: string;
  avatar_url?: string;
}

export interface JoinRoomResponse {
  room: Room;
  member: Member;
  member_token: string;
}

export interface RoomDetailResponse extends Room {
  members: Member[];
  total_places?: number;
}

export interface CreatePlaceRequest {
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  category?: PlaceCategory;
  url?: string;
  notes?: string;
  estimated_cost?: number;
  open_minute?: number;
  close_minute?: number;
  source?: PlaceSource; // CR-02
  external_id?: string; // CR-02
  google_place_id?: string; // CR-02
  cuisine?: string; // CR-02
  opening_hours_raw?: string; // CR-02
  coords_source?: string; // CR-02
}

export interface VoteRequest {
  vote_value: VoteValue;
}

export interface VoteResponse {
  place_id: string;
  upvotes: number;
  downvotes: number;
  score: number;
  current_user_vote: VoteValue;
}

export interface ResolveVotingRequest {
  strategy: TieBreakStrategyName;
  max_accepted_places: number;
}

export interface ResolvedPlaceItem {
  id: string;
  name: string;
  status: PlaceStatus;
  score: number;
  upvotes: number;
}

export interface ResolveVotingResponse {
  resolved_places: ResolvedPlaceItem[];
  tie_break_applied: boolean;
  tie_break_strategy: TieBreakStrategyName;
}

export interface CreateScheduleItemRequest {
  place_id: string;
  day_offset: number;
  start_minute: number;
  end_minute: number;
  note?: string;
}

export interface BulkUpdateScheduleItem {
  id: string;
  day_offset: number;
  start_minute: number;
  end_minute: number;
  order_index: number;
  /** CR-10: thiếu = backend đặt NULL; client luôn gửi note hiện có. */
  note?: string | null;
}

export interface BulkUpdateScheduleRequest {
  items: BulkUpdateScheduleItem[];
}

export interface DeleteScheduleResponse {
  success: boolean;
  deleted_item_id: string;
}

export type PlaceListResponse = Place[];
export type ScheduleListResponse = ScheduleItem[];
export type ConflictListResponse = ConflictAlert[];
export type PoiListResponse = Poi[];

export interface PoiQueryParams {
  bbox?: string;
  category?: PlaceCategory;
  limit?: number;
}

export interface PoiSearchParams {
  q: string;
  lat?: number;
  lng?: number;
  limit?: number;
}

/** CR-17 B: `GET /pois/brands` (khai báo ở `frontend/src/services/api/poiApi.ts`). */
export interface PoiBrand {
  brand_key: string;
  name: string;
  count: number; // có lat/lng: chỉ trong 60 km
  nearest_km: number | null;
}

export interface GoogleMatchRequest {
  external_id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface GoogleMatchResponse {
  google_place_id: string | null;
  reason: 'OK' | 'NO_MATCH' | 'QUOTA' | 'DISABLED' | string;
}

export interface CreateReviewRequest {
  external_key: string;
  rating: number; // 1 - 5
  comment?: string | null;
  tags?: string[];
}

export interface CreateDecisionRequest {
  mode: DecisionMode;
  category?: PlaceCategory | null;
  candidate_place_ids?: string[];
  weighted?: boolean;
}

export interface CreateDecisionResponse {
  session: DecisionSession;
  seed: number;
  result_place_id?: string | null;
  result_payload?: Record<string, unknown> | null;
}

export interface SubmitSwipeRequest {
  place_id: string;
  liked: boolean;
}

export interface SubmitSwipeResponse {
  success: boolean;
  session_id?: string;
  place_id?: string;
  liked?: boolean;
}

export interface DecisionActionResponse {
  session: DecisionSession;
  resolved_place?: Place;
  strategy?: TieBreakStrategyName;
  message?: string;
}

export interface AutoPlanPreviewRequest {
  day_offset?: number;
  duration_overrides?: Record<string, number>;
}

export interface AutoPlanApplyRequest {
  plan_hash: string;
  slots: PlannedSlot[];
}

// Algorithm Engine (CR-11 / CR-12 phần 1) — thêm vào frontend/src/types/api.ts (mục 34, 35)
export interface LatLng { lat: number; lng: number }

export interface GroupCenterResponse {
  available: boolean;
  center: LatLng | null; // làm tròn 3 chữ số
  area_label: string | null; // "Q3" | "Q3 – Phú Nhuận"
  member_count: number;
  nearby_pois: Poi[]; // ≤ 10, trong 2 km, gần → xa
}

export type TravelSource = 'ESTIMATE' | 'GOOGLE' | 'VALHALLA'; // VALHALLA: CR-15 phần B (T-95)
export type TieUnavailableReason = 'NO_TIE' | 'NO_ORIGINS' | 'NO_PLACE_COORDS';
// CR-15 (T-94): hoà phiếu OMP theo từng loại — thay TieMemberInfo/TieLeg/matrix của CR-12
export interface TieCandidate { place_id: string; name: string; upvotes: number; downvotes: number; score: number }
export interface TieRanking { place_id: string; rank: number; psi: number; max_km: number; total_km: number; max_min: number }
export interface TieMemberCost { member_id: string; nickname: string; km: number; minutes: number; rank: number; weight: number }
export interface CategoryTieSuggestion {
  category: PlaceCategory;
  candidates: TieCandidate[];
  recommended_place_id: string | null;
  ranking: TieRanking[]; // Ψ tăng dần; km khứ hồi
  members: TieMemberCost[]; // của quán đề xuất, theo rank (1 = gần nhất)
  runner_up_psi: number | null;
  excluded_member_count: number;
  estimated: boolean;
  source: TravelSource | 'MIXED';
  params: { lambda: number; k: number };
}

export interface TieSuggestion {
  available: boolean;
  reason: TieUnavailableReason | null;
  suggestions: CategoryTieSuggestion[];
}

// Algorithm Engine (CR-12 phần 2, T-87) — frontend/src/types/models.ts + api.ts (mục 5, 36, §1.13 A)
export type FeasibilityRisk = 'SAFE' | 'SOFT_CONFLICT' | 'HIGH_RISK';
export type PriorityLabel = 'RECOMMENDED' | 'MOST_VOTED_RISKY' | 'MOST_VOTED' | 'SCHEDULE_SAFE';
export interface PlacePriority {
  rank: number; risk: FeasibilityRisk; slack_min: number; max_eta_min: number;
  labels: PriorityLabel[]; estimated: boolean; hours_unknown: boolean; eta_unknown: boolean;
}
// Place thêm: priority?: PlacePriority | null
export interface TravelTimeConflictParams {
  from_item_id: string; to_item_id: string; place_names: [string, string];
  eta_min: number; margin_min: number; buffer_min: number; gap_min: number; slack_min: number;
  distance_km: number; risk: 'SOFT_CONFLICT' | 'HIGH_RISK'; peak: boolean; source: TravelSource; estimated: boolean;
}
export interface FeasibilityLeg {
  from_item_id: string; to_item_id: string; eta_min: number; margin_min: number; buffer_min: number;
  gap_min: number; slack_min: number; distance_km: number; risk: FeasibilityRisk; peak: boolean; source: TravelSource;
}
export interface ScheduleFeasibility {
  window_min: number; required_total_min: number; buffer_total_min: number; is_feasible: boolean;
  legs: FeasibilityLeg[]; estimated: boolean; item_count: number; unknown_leg_count: number;
}
export type PlaceSort = 'priority';
// Đường đi (CR-15 phần B, T-95) — mục 37, 38. `shape`: polyline độ chính xác 6, null = chưa có đường thật
export interface RouteLeg { km: number; minutes: number; shape: string | null; source: TravelSource }
export interface MyRoutes { place_id: string; to_place: RouteLeg; to_home: RouteLeg }
export interface ScheduleRouteLeg extends RouteLeg { from_item_id: string; to_item_id: string }
export interface ScheduleRoutes { legs: ScheduleRouteLeg[]; unknown_leg_count: number }
// websocket.ts
export interface PriorityUpdatedPayload { items: (PlacePriority & { place_id: string })[] }

// frontend/src/types/websocket.ts

export interface WebSocketEnvelope<T = unknown> {
  type: string;
  payload: T;
  ts: number;
}

export interface PingPayload {
  [key: string]: never;
}

export interface SubscribeRoomPayload {
  room_id: string;
}

export interface TypingPlacePayload {
  is_typing: boolean;
  nickname: string;
}

export interface WsErrorPayload {
  code: string;
  message: string;
}

export interface RoomStateSyncPayload {
  room: Room;
  members: Member[];
  places: Place[];
  schedule: ScheduleItem[];
  conflicts: ConflictAlert[];
}

export interface RoomUpdatedPayload {
  room: Room;
}

export interface MemberJoinedPayload {
  member: Member;
}

// GROUP_CENTER_UPDATED (CR-11/12): thêm vào frontend/src/types/websocket.ts
export interface GroupCenterUpdatedPayload {
  available: boolean;
  center?: { lat: number; lng: number };
  area_label?: string;
  member_count: number;
}

export interface MemberLeftPayload {
  member_id: string;
  nickname: string;
}

export interface PlaceAddedPayload {
  place: Place;
}

export interface PlaceUpdatedPayload {
  place: Place;
}

export interface PlaceDeletedPayload {
  place_id: string;
}

export interface VoteUpdatedPayload {
  place_id: string;
  upvotes: number;
  downvotes: number;
  score: number;
  current_user_vote?: VoteValue;
}

export interface VotingResolvedPayload {
  strategy: TieBreakStrategyName;
  accepted_place_ids: string[];
}

export interface ScheduleUpdatedPayload {
  items: ScheduleItem[];
}

export interface ConflictsUpdatedPayload {
  conflicts: ConflictAlert[];
}

export interface DecisionStartedPayload {
  session_id: string;
  mode: DecisionMode;
  candidate_place_ids: string[];
  seed: number;
  result_place_id?: string | null;
  result_payload?: Record<string, unknown> | null;
  closes_at?: string | null;
}

export interface DecisionProgressPayload {
  session_id: string;
  done_member_ids: string[];
  total_members: number;
}

export interface DecisionResolvedPayload {
  session_id: string;
  result_place_id: string;
  status: DecisionStatus;
}

export interface ChatMessagePayload {
  member_id?: string;
  nickname?: string;
  avatar_url?: string | null;
  message: string;
}
```
