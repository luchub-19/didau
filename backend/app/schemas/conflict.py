from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import ConflictLevel


class ConflictResponse(BaseModel):
    """Dữ liệu phản hồi chuẩn cho một cảnh báo xung đột theo CONTRACTS.md."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    room_id: UUID | None = None
    rule_code: str = Field(..., description="Mã quy tắc xung đột (TIME_OVERLAP, TRAVEL_TIME, ...)")
    level: ConflictLevel = Field(
        ..., description="Mức độ nghiêm trọng (INFO, WARNING, ERROR, CRITICAL)"
    )
    message: str = Field(..., description="Nội dung thông điệp cảnh báo chi tiết")
    entity_type: str = Field(..., description="Loại thực thể bị ảnh hưởng (SCHEDULE, PLACE, ROOM)")
    entity_ids: list[UUID] = Field(
        default_factory=list,
        description="Danh sách ID các thực thể liên quan đến xung đột",
    )
    resolved: bool = Field(default=False, description="Trạng thái đã được giải quyết hay chưa")
    created_at: datetime = Field(..., description="Thời điểm hệ thống phát hiện xung đột")
