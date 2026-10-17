from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.exceptions import ValidationError


class ScheduleItemBase(BaseModel):
    """Thông tin cơ bản của một mục trong lịch trình."""

    day_offset: int = Field(
        default=0, ge=0, description="Ngày trong chuyến đi (0 là ngày đầu tiên)"
    )
    start_minute: int = Field(
        ...,
        ge=0,
        le=1439,
        description="Thời điểm bắt đầu (số phút tính từ 00:00, 0-1439)",
    )
    end_minute: int = Field(
        ...,
        ge=0,
        le=1439,
        description="Thời điểm kết thúc (số phút tính từ 00:00, 0-1439)",
    )
    note: str | None = Field(default=None, description="Ghi chú hoạt động cho mục lịch trình")

    @model_validator(mode="after")
    def validate_minutes(self) -> "ScheduleItemBase":
        if self.start_minute >= self.end_minute:
            raise ValidationError(
                message="Thời điểm bắt đầu (start_minute) phải nhỏ hơn thời điểm kết thúc (end_minute).",
                details={
                    "start_minute": self.start_minute,
                    "end_minute": self.end_minute,
                },
            )
        return self


class CreateScheduleItemRequest(ScheduleItemBase):
    """Dữ liệu yêu cầu khi thêm địa điểm vào lịch trình (POST)."""

    place_id: UUID = Field(..., description="ID địa điểm được thêm vào lịch trình")


class ScheduleItemReorderItem(BaseModel):
    """Thông tin cập nhật cho từng mục lịch trình trong bulk update."""

    id: UUID = Field(..., description="ID mục lịch trình")
    day_offset: int = Field(default=0, ge=0, description="Ngày diễn ra (>= 0)")
    start_minute: int = Field(..., ge=0, le=1439, description="Giờ bắt đầu")
    end_minute: int = Field(..., ge=0, le=1439, description="Giờ kết thúc")
    order_index: int = Field(default=0, ge=0, description="Thứ tự hiển thị trong ngày")
    note: str | None = Field(default=None, description="Ghi chú tùy chọn")

    @model_validator(mode="after")
    def validate_minutes(self) -> "ScheduleItemReorderItem":
        if self.start_minute >= self.end_minute:
            raise ValidationError(
                message="Thời điểm bắt đầu (start_minute) phải nhỏ hơn thời điểm kết thúc (end_minute).",
                details={
                    "item_id": str(self.id),
                    "start_minute": self.start_minute,
                    "end_minute": self.end_minute,
                },
            )
        return self


class BulkUpdateScheduleRequest(BaseModel):
    """Dữ liệu yêu cầu sắp xếp / cập nhật lại toàn bộ lịch trình (PUT)."""

    items: list[ScheduleItemReorderItem] = Field(
        ...,
        description="Danh sách các mục lịch trình cần cập nhật vị trí/thời gian",
    )


class ScheduleItemResponse(BaseModel):
    """Dữ liệu phản hồi chuẩn cho một mục lịch trình theo CONTRACTS.md."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    room_id: UUID
    place_id: UUID
    place_name: str
    place_address: str | None = None
    day_offset: int = 0
    start_minute: int
    end_minute: int
    order_index: int = 0
    note: str | None = None
    conflicts: list[dict[str, object]] | None = Field(
        default=None,
        description="Danh sách cảnh báo xung đột tức thời phát hiện khi thêm mục (nếu có)",
    )


class DeleteScheduleItemResponse(BaseModel):
    """Dữ liệu phản hồi khi xóa thành công mục lịch trình."""

    success: bool = True
    item_id: UUID
    message: str = "Đã xóa mục lịch trình thành công."
