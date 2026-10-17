from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# Danh sách tag nhanh cố định (plan mục 6); tag lạ bị loại ở service.
ALLOWED_REVIEW_TAGS: tuple[str, ...] = (
    "ngon",
    "đáng tiền",
    "chỗ ngồi thoải mái",
    "đông",
    "phục vụ chậm",
)
MAX_REVIEW_ITEMS = 20


class UpsertReviewRequest(BaseModel):
    """Payload đăng / cập nhật đánh giá nội bộ theo CR-02."""

    external_key: str = Field(..., min_length=1, max_length=320)
    rating: int = Field(..., ge=1, le=5)
    comment: str | None = Field(default=None, max_length=280)
    tags: list[str] = Field(default_factory=list, max_length=20)


class ReviewResponse(BaseModel):
    """Một đánh giá nội bộ (khớp `PlaceReview` ở FE)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    external_key: str
    room_id: UUID | None = None
    member_id: UUID | None = None
    nickname: str
    rating: int
    comment: str | None = None
    tags: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime | None = None


class ReviewSummaryResponse(BaseModel):
    """Tổng hợp đánh giá của một quán (khớp `ReviewSummary` ở FE)."""

    avg: float
    count: int
    tags_top3: list[str]
    items: list[ReviewResponse]
