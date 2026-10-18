from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import DecisionMode, PlaceCategory, TriggerHint


class CreateDecisionRequest(BaseModel):
    """Payload tạo phiên Chọn hộ mới theo CR-02."""

    mode: DecisionMode | str = Field(..., description="Chế độ chọn: SMART | WHEEL | SWIPE | LADDER")
    category: PlaceCategory | str | None = Field(default=None, description="Danh mục áp dụng (nếu có)")
    candidate_place_ids: list[UUID] | None = Field(default=None, description="Danh sách ID quán ứng viên")
    weighted: bool = Field(default=False, description="Có áp dụng trọng số vote cho vòng quay hay không")


class DecisionSessionResponse(BaseModel):
    """Dữ liệu chi tiết của một phiên Chọn hộ."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    room_id: UUID
    mode: str
    status: str
    category: str | None = None
    candidate_place_ids: list[Any] = Field(default_factory=list)
    seed: int
    result_place_id: UUID | None = None
    result_payload: dict[str, Any] | None = None
    created_by_id: UUID
    created_at: datetime
    closes_at: datetime | None = None


class CreateDecisionResponse(BaseModel):
    """Response trả về khi tạo phiên Chọn hộ thành công."""

    session: DecisionSessionResponse
    seed: int
    result_place_id: UUID | None = None
    result_payload: dict[str, Any] | None = None


class SubmitSwipeRequest(BaseModel):
    """Payload quẹt thẻ bình chọn trong chế độ SWIPE."""

    place_id: UUID = Field(..., description="ID quán được quẹt")
    liked: bool = Field(..., description="True: Like/Quẹt phải, False: Dislike/Quẹt trái")


class SubmitSwipeResponse(BaseModel):
    """Response trả về sau khi ghi nhận lượt quẹt thẻ."""

    success: bool = True
    session_id: UUID
    place_id: UUID
    liked: bool


class DecisionActionResponse(BaseModel):
    """Response trả về khi chấp nhận hoặc hủy phiên Chọn hộ."""

    session: DecisionSessionResponse
    resolved_place: Any | None = None
    strategy: str | None = None
    message: str | None = None


class DecisionHintItem(BaseModel):
    """Gợi ý kích hoạt tính năng Chọn hộ."""

    model_config = ConfigDict(from_attributes=True)

    type: TriggerHint | str
    category: str | None = None
    candidate_place_ids: list[UUID] = Field(default_factory=list)


class SmartPickItem(BaseModel):
    """Gợi ý địa điểm thông minh 1 chạm kèm điểm số và lý do (CR-06)."""

    model_config = ConfigDict(from_attributes=True)

    place_id: UUID
    score: float
    reasons: list[str] = Field(default_factory=list)
    reason_codes: list[dict[str, Any]] = Field(
        default_factory=list, description="Mã và tham số cho lý do gợi ý (CR-06)"
    )


class DecisionHintsResponse(BaseModel):
    """Response trả về danh sách hints và smart picks cho phòng."""

    hints: list[DecisionHintItem] = Field(default_factory=list)
    smart_picks: list[SmartPickItem] = Field(default_factory=list)
