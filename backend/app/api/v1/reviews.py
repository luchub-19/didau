from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_member, get_db
from app.domain.models.member import Member
from app.repositories.review_repo import ReviewRepository
from app.schemas.review import ReviewResponse, ReviewSummaryResponse, UpsertReviewRequest
from app.services.review_service import ReviewService

router = APIRouter(prefix="/reviews", tags=["Reviews"])


def get_review_service(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> ReviewService:
    """Dependency cung cấp ReviewService."""
    return ReviewService(ReviewRepository(session))


@router.get("", response_model=ReviewSummaryResponse)
async def get_reviews(
    service: Annotated[ReviewService, Depends(get_review_service)],
    external_key: Annotated[str, Query(min_length=1, max_length=320)],
) -> ReviewSummaryResponse:
    """Tổng hợp đánh giá nội bộ của một quán (công khai)."""
    return await service.get_summary(external_key)


@router.put("", response_model=ReviewResponse)
async def put_review(
    payload: UpsertReviewRequest,
    service: Annotated[ReviewService, Depends(get_review_service)],
    current_member: Annotated[Member, Depends(get_current_member)],
) -> ReviewResponse:
    """Đăng hoặc cập nhật đánh giá của thành viên hiện tại cho quán."""
    review = await service.upsert_review(
        member=current_member,
        external_key=payload.external_key,
        rating=payload.rating,
        comment=payload.comment,
        tags=payload.tags,
    )
    return ReviewResponse.model_validate(review)
