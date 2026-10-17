from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import PlaceCategory, PlaceSource, PlaceStatus


class PlaceSubmitter(BaseModel):
    """Thông tin rút gọn của thành viên đề xuất địa điểm."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nickname: str


class CreatePlaceRequest(BaseModel):
    """Dữ liệu yêu cầu khi thêm địa điểm đề xuất mới."""

    name: str = Field(..., min_length=1, max_length=255, description="Tên địa điểm")
    address: str | None = Field(default=None, max_length=500, description="Địa chỉ cụ thể")
    latitude: float | None = Field(default=None, ge=-90.0, le=90.0, description="Vĩ độ WGS84")
    longitude: float | None = Field(default=None, ge=-180.0, le=180.0, description="Kinh độ WGS84")
    category: PlaceCategory = Field(
        default=PlaceCategory.OTHER,
        description="Danh mục loại hình; nếu là OTHER hệ thống sẽ tự động nhận diện",
    )
    url: str | None = Field(default=None, max_length=1000, description="Link tham chiếu/bản đồ")
    notes: str | None = Field(default=None, description="Ghi chú thêm của người đề xuất")
    estimated_cost: int | None = Field(default=0, ge=0, description="Chi phí ước lượng (VND)")
    open_minute: int | None = Field(
        default=None, ge=0, le=1439, description="Giờ mở cửa (phút tính từ 00:00)"
    )
    close_minute: int | None = Field(
        default=None, ge=0, le=1439, description="Giờ đóng cửa (phút tính từ 00:00)"
    )
    source: PlaceSource = Field(
        default=PlaceSource.MANUAL,
        description="Nguồn dữ liệu địa điểm (MANUAL | OSM | GOOGLE)",
    )
    external_id: str | None = Field(
        default=None,
        max_length=100,
        description="Mã định danh nguồn ngoài (osm:node/123 | google:place_id)",
    )
    google_place_id: str | None = Field(default=None, max_length=300, description="Google Place ID")
    cuisine: str | None = Field(default=None, max_length=100, description="Ẩm thực/chuyên món")
    opening_hours_raw: str | None = Field(
        default=None, max_length=255, description="Chuỗi opening_hours gốc từ OSM"
    )
    coords_source: str | None = Field(
        default=None, max_length=20, description="Nguồn tọa độ (MANUAL | OSM | GOOGLE)"
    )


class UpdatePlaceRequest(BaseModel):
    """Dữ liệu cập nhật địa điểm (PATCH)."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    address: str | None = Field(default=None, max_length=500)
    latitude: float | None = Field(default=None, ge=-90.0, le=90.0)
    longitude: float | None = Field(default=None, ge=-180.0, le=180.0)
    category: PlaceCategory | None = None
    status: PlaceStatus | None = None
    url: str | None = Field(default=None, max_length=1000)
    notes: str | None = None
    estimated_cost: int | None = Field(default=None, ge=0)
    open_minute: int | None = Field(default=None, ge=0, le=1439)
    close_minute: int | None = Field(default=None, ge=0, le=1439)
    cuisine: str | None = Field(default=None, max_length=100)
    opening_hours_raw: str | None = Field(default=None, max_length=255)


class PlaceResponse(BaseModel):
    """Dữ liệu phản hồi chuẩn cho địa điểm theo CONTRACTS.md."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    room_id: UUID
    name: str
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    category: PlaceCategory
    status: PlaceStatus = PlaceStatus.PROPOSED
    source: PlaceSource | str = PlaceSource.MANUAL
    external_id: str | None = None
    google_place_id: str | None = None
    cuisine: str | None = None
    opening_hours_raw: str | None = None
    coords_source: str | None = None
    coords_fetched_at: datetime | None = None
    url: str | None = None
    notes: str | None = None
    estimated_cost: int = 0
    open_minute: int | None = None
    close_minute: int | None = None
    upvotes: int = 0
    downvotes: int = 0
    score: int = 0
    current_user_vote: int = 0
    submitted_by_id: UUID
    submitted_by: PlaceSubmitter | None = None
    submitted_by_nickname: str | None = None
    created_at: datetime
    updated_at: datetime | None = None


class DeletePlaceResponse(BaseModel):
    """Dữ liệu phản hồi khi xóa thành công địa điểm."""

    success: bool = True
    place_id: UUID
    message: str = "Đã xóa địa điểm thành công."
