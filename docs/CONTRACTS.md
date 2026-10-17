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
    joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_room_nickname UNIQUE (room_id, nickname)
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

-- 6. BẢNG CONFLICTS (Nhật ký xung đột hệ thống ghi nhận)
CREATE TABLE conflicts (
    id UUID PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    rule_code VARCHAR(100) NOT NULL,
    level VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_conflicts_room_id ON conflicts(room_id);
CREATE INDEX idx_conflicts_resolved ON conflicts(resolved);
```

---

## 3. ĐẶC TẢ REST API VÀ MẪU REQUEST / RESPONSE

### 3.1. Headers Chung
Mọi request (ngoại trừ tạo phòng và join phòng) bắt buộc phải truyền header xác thực:
- `Content-Type: application/json`
- `X-Member-Token: <UUIDv4_TOKEN>`

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
  "tie_break_strategy": "EARLIEST_SUBMISSION"
}
```
- **Response 201 Created**:
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
    "created_at": "2026-10-17T07:40:00Z"
  }
]
```

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
      "order_index": 0
    },
    {
      "id": "5b6c7d8e-9f0a-1b2c-3d4e-5f6a7b8c9d0e",
      "day_offset": 0,
      "start_minute": 660,
      "end_minute": 750,
      "order_index": 1
    }
  ]
}
```
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
    "created_at": "2026-10-17T07:45:00Z"
  }
]
```

---

## 4. GIAO THỨC VÀ SỰ KIỆN WEBSOCKET (WEBSOCKET CONTRACT)

- **URL kết nối**: `ws://<host>:<port>/ws/rooms/{room_id}?token={member_token}`
- **Cấu trúc khung dữ liệu (Standard Envelope Format)**:
```json
{
  "type": "TÊN_SỰ_KIỆN_IN_HOA",
  "payload": {},
  "ts": 1729148400000
}
```

### 4.1. Chiều Client $\rightarrow$ Server
| Type | Ý nghĩa | Payload mẫu |
| :--- | :--- | :--- |
| `PING` | Nhịp tim giữ kết nối (mỗi 30s) | `{}` |
| `SUBSCRIBE_ROOM` | Yêu cầu nhận đồng bộ toàn diện | `{ "room_id": "c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21" }` |
| `TYPING_PLACE` | Báo hiệu thành viên đang nhập địa điểm | `{ "is_typing": true, "nickname": "ThuTrang" }` |

### 4.2. Chiều Server $\rightarrow$ Client
| Type | Ý nghĩa | Payload mẫu |
| :--- | :--- | :--- |
| `PONG` | Phản hồi lại PING | `{}` |
| `ERROR` | Thông báo lỗi xử lý socket | `{ "code": "UNAUTHORIZED", "message": "Token không hợp lệ" }` |
| `ROOM_STATE_SYNC` | Đồng bộ toàn bộ dữ liệu khi vừa connect | `{ "room": {...}, "members": [...], "places": [...], "schedule": [...], "conflicts": [...] }` |
| `MEMBER_JOINED` | Có thành viên mới tham gia | `{ "member": { "id": "...", "nickname": "ThuTrang", "role": "MEMBER" } }` |
| `MEMBER_LEFT` | Thành viên ngắt kết nối / rời phòng | `{ "member_id": "...", "nickname": "ThuTrang" }` |
| `PLACE_ADDED` | Có địa điểm mới được thêm | `{ "place": { "id": "...", "name": "Cà phê 3T", "category": "DRINK", ... } }` |
| `PLACE_UPDATED` | Thông tin địa điểm cập nhật | `{ "place": { "id": "...", "status": "ACCEPTED", ... } }` |
| `PLACE_DELETED` | Địa điểm bị xóa | `{ "place_id": "8f3e2b1a-9c4d-4e5f-8a1b-7c6d5e4f3a2b" }` |
| `VOTE_UPDATED` | Kết quả vote của một địa điểm thay đổi | `{ "place_id": "...", "upvotes": 5, "downvotes": 1, "score": 4 }` |
| `VOTING_RESOLVED` | Chủ phòng đã chốt kết quả vote | `{ "strategy": "MOST_UPVOTES", "accepted_place_ids": ["..."] }` |
| `SCHEDULE_UPDATED` | Lịch trình thời gian thay đổi | `{ "items": [ {...}, {...} ] }` |
| `CONFLICTS_UPDATED`| Danh sách cảnh báo xung đột được làm mới | `{ "conflicts": [ {...} ] }` |

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

class IPlaceService(ABC):
    @abstractmethod
    async def add_place(self, room_id: UUID, member_id: UUID, data: Dict[str, Any]) -> Dict[str, Any]: pass
    @abstractmethod
    async def list_places(self, room_id: UUID, current_member_id: UUID) -> List[Dict[str, Any]]: pass

class IVotingService(ABC):
    @abstractmethod
    async def cast_vote(self, place_id: UUID, member_id: UUID, vote_value: int) -> Dict[str, Any]: pass
    @abstractmethod
    async def retract_vote(self, place_id: UUID, member_id: UUID) -> Dict[str, Any]: pass
    @abstractmethod
    async def resolve_voting(self, room_id: UUID, host_id: UUID, strategy_name: str, max_places: int) -> List[Dict[str, Any]]: pass

class IScheduleService(ABC):
    @abstractmethod
    async def get_schedule(self, room_id: UUID) -> List[Dict[str, Any]]: pass
    @abstractmethod
    async def add_item(self, room_id: UUID, data: Dict[str, Any]) -> Dict[str, Any]: pass
    @abstractmethod
    async def update_schedule(self, room_id: UUID, items: List[Dict[str, Any]]) -> List[Dict[str, Any]]: pass

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
# 6. PHASE 2 ABSTRACT INTERFACES (STUBS ONLY)
# ==========================================

class IRouteOptimizationService(ABC):
    """Phase 2: Thuật toán tối ưu hóa lộ trình di chuyển qua nhiều địa điểm."""
    @abstractmethod
    async def optimize_route(self, place_ids: List[UUID]) -> List[UUID]: pass

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
  | 'CATEGORY_DIVERSITY';

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
  joined_at: string;
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
  updated_at: string;
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

export interface CreateScheduleItemRequest {
  place_id: string;
  day_offset: number;
  start_minute: number;
  end_minute: number;
  note?: string;
}

export interface BulkUpdateScheduleRequest {
  items: Array<{
    id: string;
    day_offset: number;
    start_minute: number;
    end_minute: number;
    order_index: number;
  }>;
}

// frontend/src/types/websocket.ts

export interface WebSocketEnvelope<T = unknown> {
  type: string;
  payload: T;
  ts: number;
}
```
