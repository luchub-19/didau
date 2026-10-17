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
