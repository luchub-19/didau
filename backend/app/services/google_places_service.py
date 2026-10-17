import logging
import math
from datetime import date, datetime
from typing import Any

import httpx

from app.config import Settings, get_settings
from app.core.time_utils import VIETNAM_TZ
from app.repositories.external_link_repo import IExternalLinkRepository

logger = logging.getLogger(__name__)

SEARCH_TEXT_URL = "https://places.googleapis.com/v1/places:searchText"
# Chỉ xin `places.id` để rơi vào SKU "Text Search Essentials IDs Only" (miễn phí); thêm field khác là sang SKU Pro.
FIELD_MASK = "places.id"
MATCH_RADIUS_M = 80.0
HTTP_TIMEOUT_S = 5.0
_METERS_PER_DEG_LAT = 111_320.0


class DailyQuota:
    """Bộ đếm lần gọi Google theo ngày (giờ Việt Nam), giữ trong bộ nhớ tiến trình."""

    def __init__(self, limit: int) -> None:
        self.limit = limit
        self._day: date | None = None
        self._count = 0

    def _roll(self, now: datetime | None = None) -> None:
        today = (now or datetime.now(VIETNAM_TZ)).date()
        if self._day != today:
            self._day, self._count = today, 0

    def try_acquire(self, now: datetime | None = None) -> bool:
        """Tăng bộ đếm nếu còn hạn mức; hết thì trả False và không tăng."""
        self._roll(now)
        if self._count >= self.limit:
            return False
        self._count += 1
        return True


_quota: DailyQuota | None = None


def get_quota() -> DailyQuota:
    """Singleton bộ đếm, dùng chung giữa các request."""
    global _quota
    limit = get_settings().GOOGLE_MATCH_DAILY_LIMIT
    if _quota is None or _quota.limit != limit:
        _quota = DailyQuota(limit)
    return _quota


def _bounding_rect(lat: float, lng: float, radius_m: float) -> dict[str, Any]:
    """Hình chữ nhật ±radius_m quanh (lat, lng) cho `locationRestriction`."""
    d_lat = radius_m / _METERS_PER_DEG_LAT
    d_lng = radius_m / (_METERS_PER_DEG_LAT * max(math.cos(math.radians(lat)), 0.01))
    return {
        "rectangle": {
            "low": {"latitude": lat - d_lat, "longitude": lng - d_lng},
            "high": {"latitude": lat + d_lat, "longitude": lng + d_lng},
        }
    }


class GooglePlacesService:
    """Khớp quán OSM với Google `place_id` (Text Search IDs Only), có cache DB và chặn quota.

    Không bao giờ ném lỗi ra ngoài: mọi sự cố đều trả `(None, reason)`.
    """

    def __init__(
        self,
        repo: IExternalLinkRepository,
        quota: DailyQuota | None = None,
        client: httpx.AsyncClient | None = None,
        settings: Settings | None = None,
    ) -> None:
        self.repo = repo
        self.quota = quota or get_quota()
        self._client = client
        self.settings = settings or get_settings()

    async def match(
        self, external_id: str, name: str, lat: float, lng: float
    ) -> tuple[str | None, str]:
        """Trả `(google_place_id, reason)`."""
        if self.settings.PLACES_PROVIDER != "google":
            return None, "DISABLED"

        link = await self.repo.get(external_id)
        if link is not None:
            if link.google_place_id:
                return link.google_place_id, "OK"
            return None, "REJECTED" if link.rejected_count > 0 else "NOT_FOUND"

        if not self.settings.GOOGLE_MAPS_SERVER_KEY:
            return None, "NO_KEY"
        if not self.quota.try_acquire():
            return None, "QUOTA"

        try:
            place_id = await self._search(name, lat, lng)
        except (httpx.HTTPError, ValueError) as exc:
            # Không cache lỗi: lần sau thử lại.
            logger.warning("Google Text Search lỗi cho %s: %s", external_id, exc)
            return None, "ERROR"

        await self.repo.save_match(external_id, place_id)
        return (place_id, "OK") if place_id else (None, "NOT_FOUND")

    async def reject(self, external_id: str) -> None:
        """Người dùng báo "Không đúng quán?": xoá liên kết và nhớ để không khớp lại."""
        await self.repo.reject(external_id)

    async def _search(self, name: str, lat: float, lng: float) -> str | None:
        body = {
            "textQuery": name,
            "locationRestriction": _bounding_rect(lat, lng, MATCH_RADIUS_M),
            "pageSize": 1,
        }
        headers = {
            "X-Goog-Api-Key": self.settings.GOOGLE_MAPS_SERVER_KEY,
            "X-Goog-FieldMask": FIELD_MASK,
            "Content-Type": "application/json",
        }
        if self._client is not None:
            resp = await self._client.post(SEARCH_TEXT_URL, json=body, headers=headers)
        else:
            async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_S) as client:
                resp = await client.post(SEARCH_TEXT_URL, json=body, headers=headers)
        resp.raise_for_status()
        places = resp.json().get("places") or []
        return places[0].get("id") if places else None
