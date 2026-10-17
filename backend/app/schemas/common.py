from typing import Any

from pydantic import BaseModel, Field


class ApiErrorDetail(BaseModel):
    """Chi tiết lỗi nghiệp vụ theo chuẩn CONTRACTS.md."""

    code: str = Field(..., description="Mã lỗi dạng SCREAMING_SNAKE_CASE")
    message: str = Field(..., description="Thông điệp mô tả lỗi chi tiết bằng tiếng Việt")
    details: dict[str, Any] = Field(default_factory=dict, description="Metadata bổ sung cho lỗi")


class ApiErrorEnvelope(BaseModel):
    """Cấu trúc bao gói lỗi thống nhất cho mọi API (status >= 400)."""

    error: ApiErrorDetail
