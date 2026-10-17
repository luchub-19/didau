from datetime import timedelta
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi import Header
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_current_member
from app.api.v1.reviews import get_review_service
from app.api.v1.router import api_router, register_exception_handlers
from app.core.exceptions import UnauthorizedError
from app.core.id_generator import generate_uuid
from app.core.time_utils import now_utc
from app.domain.enums import MemberRole
from app.domain.models import Member
from app.domain.models.review import PlaceReview
from app.main import app
from app.repositories.review_repo import IReviewRepository
from app.services.review_service import ReviewService

if not any(getattr(r, "prefix", "") == "/api/v1" for r in app.routes):
    app.include_router(api_router)
register_exception_handlers(app)

KEY = "osm:node/123"


class InMemoryReviewRepo(IReviewRepository):
    def __init__(self) -> None:
        self.reviews: list[PlaceReview] = []
        self._tick = 0

    async def list_by_external_key(self, external_key: str) -> list[PlaceReview]:
        found = [r for r in self.reviews if r.external_key == external_key]
        return sorted(found, key=lambda r: r.updated_at, reverse=True)

    async def upsert(
        self,
        member_id: UUID,
        external_key: str,
        room_id: UUID | None,
        nickname: str,
        rating: int,
        comment: str | None,
        tags: list[str],
    ) -> PlaceReview:
        self._tick += 1
        stamp = now_utc() + timedelta(seconds=self._tick)
        for r in self.reviews:
            if r.member_id == member_id and r.external_key == external_key:
                r.room_id, r.nickname, r.rating = room_id, nickname, rating
                r.comment, r.tags, r.updated_at = comment, tags, stamp
                return r
        r = PlaceReview(
            id=generate_uuid(),
            external_key=external_key,
            room_id=room_id,
            member_id=member_id,
            nickname=nickname,
            rating=rating,
            comment=comment,
            tags=tags,
            created_at=stamp,
            updated_at=stamp,
        )
        self.reviews.append(r)
        return r


@pytest.fixture
def review_repo() -> InMemoryReviewRepo:
    return InMemoryReviewRepo()


@pytest.fixture
def members() -> dict[str, Member]:
    room_id = generate_uuid()
    return {
        name: Member(
            id=generate_uuid(),
            room_id=room_id,
            nickname=name,
            role=MemberRole.MEMBER.value,
            token=f"token-{name}",
        )
        for name in ("An", "Binh", "Chi")
    }


@pytest.fixture
async def client(review_repo: InMemoryReviewRepo, members: dict[str, Member]):
    by_token = {m.token: m for m in members.values()}

    async def _member(
        x_member_token: str | None = Header(None, alias="X-Member-Token"),
    ) -> Member:
        if not x_member_token or x_member_token not in by_token:
            raise UnauthorizedError("Invalid token")
        return by_token[x_member_token]

    app.dependency_overrides[get_review_service] = lambda: ReviewService(review_repo)
    app.dependency_overrides[get_current_member] = _member
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


def _put(client: AsyncClient, token: str, **body: Any):
    payload = {"external_key": KEY, "rating": 5, **body}
    return client.put("/api/v1/reviews", json=payload, headers={"X-Member-Token": token})


async def test_empty_summary(client: AsyncClient) -> None:
    res = await client.get("/api/v1/reviews", params={"external_key": KEY})
    assert res.status_code == 200
    assert res.json() == {"avg": 0.0, "count": 0, "tags_top3": [], "items": []}


async def test_get_requires_external_key(client: AsyncClient) -> None:
    res = await client.get("/api/v1/reviews")
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_put_requires_token(client: AsyncClient) -> None:
    res = await client.put("/api/v1/reviews", json={"external_key": KEY, "rating": 4})
    assert res.status_code == 401


async def test_put_creates_review(client: AsyncClient, members: dict[str, Member]) -> None:
    res = await _put(client, "token-An", comment="  Ngon tuyệt  ", tags=["ngon"])
    assert res.status_code == 200
    body = res.json()
    assert body["rating"] == 5
    assert body["comment"] == "Ngon tuyệt"
    assert body["nickname"] == "An"
    assert body["member_id"] == str(members["An"].id)
    assert body["tags"] == ["ngon"]


async def test_upsert_does_not_duplicate(client: AsyncClient) -> None:
    first = (await _put(client, "token-An", rating=2, tags=["đông"])).json()
    second = (await _put(client, "token-An", rating=4, comment="Khá hơn", tags=["ngon"])).json()
    assert second["id"] == first["id"]

    summary = (await client.get("/api/v1/reviews", params={"external_key": KEY})).json()
    assert summary["count"] == 1
    assert summary["avg"] == 4.0
    assert summary["items"][0]["comment"] == "Khá hơn"
    assert summary["items"][0]["tags"] == ["ngon"]


@pytest.mark.parametrize("rating", [0, 6, -1])
async def test_rating_out_of_range_rejected(client: AsyncClient, rating: int) -> None:
    res = await _put(client, "token-An", rating=rating)
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_comment_length_limit(client: AsyncClient) -> None:
    assert (await _put(client, "token-An", comment="a" * 280)).status_code == 200
    res = await _put(client, "token-Binh", comment="a" * 281)
    assert res.status_code == 422


async def test_unknown_and_duplicate_tags_dropped(client: AsyncClient) -> None:
    res = await _put(client, "token-An", tags=["ngon", "lạ hoắc", "ngon", "đông"])
    assert res.json()["tags"] == ["ngon", "đông"]


async def test_aggregate_avg_count_and_top3(client: AsyncClient) -> None:
    await _put(client, "token-An", rating=5, tags=["ngon", "đáng tiền"])
    await _put(client, "token-Binh", rating=4, tags=["ngon", "đông"])
    await _put(client, "token-Chi", rating=4, tags=["ngon", "đông", "phục vụ chậm"])
    summary = (await client.get("/api/v1/reviews", params={"external_key": KEY})).json()
    assert summary["count"] == 3
    assert summary["avg"] == 4.3
    assert summary["tags_top3"] == ["ngon", "đông", "đáng tiền"]


async def test_reviews_isolated_by_external_key(client: AsyncClient) -> None:
    await _put(client, "token-An", rating=5)
    await _put(client, "token-An", rating=1, external_key="google:ChIJabc")
    a = (await client.get("/api/v1/reviews", params={"external_key": KEY})).json()
    b = (await client.get("/api/v1/reviews", params={"external_key": "google:ChIJabc"})).json()
    assert (a["count"], a["avg"]) == (1, 5.0)
    assert (b["count"], b["avg"]) == (1, 1.0)


async def test_items_capped_at_20_but_count_is_total(
    client: AsyncClient, review_repo: InMemoryReviewRepo
) -> None:
    for i in range(25):
        await review_repo.upsert(uuid4(), KEY, None, f"u{i}", 3, None, [])
    summary = (await client.get("/api/v1/reviews", params={"external_key": KEY})).json()
    assert summary["count"] == 25
    assert len(summary["items"]) == 20
