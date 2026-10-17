from collections import Counter
from uuid import UUID

from app.domain.models.member import Member
from app.domain.models.review import PlaceReview
from app.repositories.review_repo import IReviewRepository
from app.schemas.review import (
    ALLOWED_REVIEW_TAGS,
    MAX_REVIEW_ITEMS,
    ReviewResponse,
    ReviewSummaryResponse,
)


class ReviewService:
    """Nghiệp vụ đánh giá nội bộ: mỗi thành viên 1 review/quán, tích luỹ qua mọi phòng."""

    def __init__(self, review_repo: IReviewRepository) -> None:
        self.review_repo = review_repo

    @staticmethod
    def clean_tags(tags: list[str]) -> list[str]:
        """Giữ tag thuộc danh sách cố định, bỏ trùng, giữ thứ tự nhập."""
        seen: set[str] = set()
        cleaned: list[str] = []
        for tag in tags:
            normalized = tag.strip()
            if normalized in ALLOWED_REVIEW_TAGS and normalized not in seen:
                seen.add(normalized)
                cleaned.append(normalized)
        return cleaned

    @staticmethod
    def summarize(reviews: list[PlaceReview]) -> ReviewSummaryResponse:
        """Tính avg (1 chữ số), count, 3 tag nhiều nhất và tối đa 20 review mới nhất."""
        count = len(reviews)
        avg = round(sum(r.rating for r in reviews) / count, 1) if count else 0.0
        counter: Counter[str] = Counter()
        for r in reviews:
            counter.update(r.tags or [])
        # Hòa số lần thì theo thứ tự danh sách tag cố định để kết quả ổn định.
        order = {tag: i for i, tag in enumerate(ALLOWED_REVIEW_TAGS)}
        top = sorted(counter, key=lambda t: (-counter[t], order.get(t, len(order))))[:3]
        return ReviewSummaryResponse(
            avg=avg,
            count=count,
            tags_top3=top,
            items=[ReviewResponse.model_validate(r) for r in reviews[:MAX_REVIEW_ITEMS]],
        )

    async def get_summary(self, external_key: str) -> ReviewSummaryResponse:
        reviews = await self.review_repo.list_by_external_key(external_key)
        return self.summarize(reviews)

    async def upsert_review(
        self,
        member: Member,
        external_key: str,
        rating: int,
        comment: str | None,
        tags: list[str],
    ) -> PlaceReview:
        text = comment.strip() if comment else None
        room_id: UUID = member.room_id
        return await self.review_repo.upsert(
            member_id=member.id,
            external_key=external_key,
            room_id=room_id,
            nickname=member.nickname,
            rating=rating,
            comment=text or None,
            tags=self.clean_tags(tags),
        )
