from abc import ABC, abstractmethod

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_utils import now_utc
from app.domain.models.external_link import ExternalPlaceLink
from app.repositories.base import BaseRepository


class IExternalLinkRepository(ABC):
    """Interface bộ đệm liên kết OSM ↔ Google place_id (CR-02)."""

    @abstractmethod
    async def get(self, osm_external_id: str) -> ExternalPlaceLink | None:
        """Lấy liên kết đã lưu; `google_place_id` có thể là None (đã tra mà không thấy / bị báo sai)."""

    @abstractmethod
    async def save_match(
        self, osm_external_id: str, google_place_id: str | None
    ) -> ExternalPlaceLink:
        """Lưu kết quả tra cứu, giữ nguyên `rejected_count` nếu đã có dòng."""

    @abstractmethod
    async def reject(self, osm_external_id: str) -> ExternalPlaceLink:
        """Xoá liên kết (người dùng báo sai quán): đặt place_id = NULL và tăng `rejected_count`."""


class ExternalLinkRepository(BaseRepository, IExternalLinkRepository):
    """Hiện thực hóa IExternalLinkRepository với SQLAlchemy 2.0 Async."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get(self, osm_external_id: str) -> ExternalPlaceLink | None:
        return await self.session.get(ExternalPlaceLink, osm_external_id)

    async def save_match(
        self, osm_external_id: str, google_place_id: str | None
    ) -> ExternalPlaceLink:
        link = await self.get(osm_external_id)
        if link is None:
            link = ExternalPlaceLink(
                osm_external_id=osm_external_id,
                google_place_id=google_place_id,
                matched_at=now_utc(),
                rejected_count=0,
            )
            self.session.add(link)
        else:
            link.google_place_id = google_place_id
            link.matched_at = now_utc()
        await self.session.flush()
        return link

    async def reject(self, osm_external_id: str) -> ExternalPlaceLink:
        link = await self.get(osm_external_id)
        if link is None:
            link = ExternalPlaceLink(
                osm_external_id=osm_external_id,
                google_place_id=None,
                matched_at=now_utc(),
                rejected_count=1,
            )
            self.session.add(link)
        else:
            link.google_place_id = None
            link.rejected_count += 1
        await self.session.flush()
        return link
