from datetime import datetime

import httpx
import pytest

from app.config import Settings
from app.core.time_utils import VIETNAM_TZ, now_utc
from app.domain.models.external_link import ExternalPlaceLink
from app.repositories.external_link_repo import IExternalLinkRepository
from app.services.google_places_service import DailyQuota, GooglePlacesService

OSM_ID = "osm:node/123"
ARGS = (OSM_ID, "Cơm Tấm Ba Ghiền", 10.7933, 106.6664)


class InMemoryLinkRepo(IExternalLinkRepository):
    def __init__(self) -> None:
        self.links: dict[str, ExternalPlaceLink] = {}

    async def get(self, osm_external_id: str) -> ExternalPlaceLink | None:
        return self.links.get(osm_external_id)

    async def save_match(
        self, osm_external_id: str, google_place_id: str | None
    ) -> ExternalPlaceLink:
        link = self.links.get(osm_external_id) or ExternalPlaceLink(
            osm_external_id=osm_external_id, rejected_count=0
        )
        link.google_place_id, link.matched_at = google_place_id, now_utc()
        self.links[osm_external_id] = link
        return link

    async def reject(self, osm_external_id: str) -> ExternalPlaceLink:
        link = self.links.get(osm_external_id) or ExternalPlaceLink(
            osm_external_id=osm_external_id, rejected_count=0
        )
        link.google_place_id = None
        link.rejected_count += 1
        self.links[osm_external_id] = link
        return link


class Recorder:
    """Giả lập Google qua httpx.MockTransport, ghi lại request."""

    def __init__(self, status: int = 200, body: dict | None = None, boom: bool = False) -> None:
        self.status, self.body, self.boom = status, body, boom
        self.requests: list[httpx.Request] = []

    def client(self) -> httpx.AsyncClient:
        def handler(request: httpx.Request) -> httpx.Response:
            self.requests.append(request)
            if self.boom:
                raise httpx.ConnectError("mạng đứt")
            return httpx.Response(self.status, json=self.body if self.body is not None else {})

        return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def make(
    repo: InMemoryLinkRepo,
    rec: Recorder,
    *,
    provider: str = "google",
    key: str = "k",
    limit: int = 1000,
) -> GooglePlacesService:
    settings = Settings(PLACES_PROVIDER=provider, GOOGLE_MAPS_SERVER_KEY=key, _env_file=None)
    return GooglePlacesService(repo, DailyQuota(limit), rec.client(), settings)


@pytest.mark.asyncio
async def test_miss_calls_api_with_ids_only_mask_and_caches() -> None:
    repo, rec = InMemoryLinkRepo(), Recorder(body={"places": [{"id": "ChIJabc"}]})
    result = await make(repo, rec).match(*ARGS)

    assert result == ("ChIJabc", "OK")
    assert repo.links[OSM_ID].google_place_id == "ChIJabc"
    req = rec.requests[0]
    assert req.headers["X-Goog-FieldMask"] == "places.id"
    assert req.headers["X-Goog-Api-Key"] == "k"
    body = req.read().decode()
    assert '"pageSize":1' in body.replace(" ", "") and "rectangle" in body


@pytest.mark.asyncio
async def test_cache_hit_skips_api_and_quota() -> None:
    repo, rec = InMemoryLinkRepo(), Recorder(body={"places": [{"id": "ChIJnew"}]})
    await repo.save_match(OSM_ID, "ChIJold")
    service = make(repo, rec, limit=0)

    assert await service.match(*ARGS) == ("ChIJold", "OK")
    assert rec.requests == []


@pytest.mark.asyncio
async def test_no_result_is_cached_as_not_found() -> None:
    repo, rec = InMemoryLinkRepo(), Recorder(body={})
    service = make(repo, rec)

    assert await service.match(*ARGS) == (None, "NOT_FOUND")
    assert await service.match(*ARGS) == (None, "NOT_FOUND")
    assert len(rec.requests) == 1


@pytest.mark.asyncio
async def test_quota_exceeded_returns_quota_without_calling() -> None:
    repo, rec = InMemoryLinkRepo(), Recorder(body={"places": [{"id": "ChIJ1"}]})
    service = make(repo, rec, limit=1)

    assert await service.match(OSM_ID, "A", 10.0, 106.0) == ("ChIJ1", "OK")
    assert await service.match("osm:node/2", "B", 10.0, 106.0) == (None, "QUOTA")
    assert len(rec.requests) == 1
    assert "osm:node/2" not in repo.links


@pytest.mark.asyncio
async def test_missing_key_and_disabled_provider() -> None:
    repo, rec = InMemoryLinkRepo(), Recorder()
    assert await make(repo, rec, key="").match(*ARGS) == (None, "NO_KEY")
    assert await make(repo, rec, provider="osm").match(*ARGS) == (None, "DISABLED")
    assert rec.requests == []


@pytest.mark.asyncio
@pytest.mark.parametrize("rec", [Recorder(status=403, body={"error": "x"}), Recorder(boom=True)])
async def test_google_failure_returns_error_and_is_not_cached(rec: Recorder) -> None:
    repo = InMemoryLinkRepo()
    assert await make(repo, rec).match(*ARGS) == (None, "ERROR")
    assert OSM_ID not in repo.links


@pytest.mark.asyncio
async def test_reject_clears_link_and_blocks_rematch() -> None:
    repo, rec = InMemoryLinkRepo(), Recorder(body={"places": [{"id": "ChIJabc"}]})
    service = make(repo, rec)
    await service.match(*ARGS)

    await service.reject(OSM_ID)

    assert repo.links[OSM_ID].rejected_count == 1
    assert await service.match(*ARGS) == (None, "REJECTED")
    assert len(rec.requests) == 1


def test_daily_quota_resets_next_day() -> None:
    quota = DailyQuota(1)
    d1 = datetime(2026, 10, 17, 23, 0, tzinfo=VIETNAM_TZ)
    d2 = datetime(2026, 10, 18, 0, 5, tzinfo=VIETNAM_TZ)
    assert quota.try_acquire(d1) is True
    assert quota.try_acquire(d1) is False
    assert quota.try_acquire(d2) is True
