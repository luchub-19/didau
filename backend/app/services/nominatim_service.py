import asyncio
import logging
import time
from typing import Any

import httpx

from app.config import get_settings
from app.domain.phase2_interfaces.external_places import IExternalPlacesProvider

logger = logging.getLogger(__name__)


class NominatimService:
    """Dịch vụ tích hợp Nominatim (OpenStreetMap) với User-Agent, cache bộ nhớ và rate-limit 1 req/s."""

    def __init__(
        self,
        user_agent: str | None = None,
        cache_ttl: float = 3600.0,
    ) -> None:
        self.settings = get_settings()
        self.user_agent = user_agent or self.settings.NOMINATIM_USER_AGENT
        self.cache_ttl = cache_ttl
        self._cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}
        self._last_request_time: float = 0.0
        self._lock = asyncio.Lock()

    async def search(
        self,
        query: str,
        lat: float | None = None,
        lng: float | None = None,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """Tìm kiếm địa điểm qua Nominatim với cache và giới hạn tốc độ <= 1 request/giây."""
        cache_key = f"{query.strip().lower()}:{lat}:{lng}:{limit}"
        now = time.time()

        # 1. Kiểm tra cache trong bộ nhớ
        if cache_key in self._cache:
            cached_at, cached_data = self._cache[cache_key]
            if now - cached_at < self.cache_ttl:
                logger.debug("Trả về kết quả Nominatim từ bộ nhớ cache cho: %s", query)
                return cached_data

        async with self._lock:
            # 2. Đảm bảo giới hạn không quá 1 request / giây
            now = time.time()
            elapsed = now - self._last_request_time
            if elapsed < 1.0:
                await asyncio.sleep(1.0 - elapsed)

            headers = {
                "User-Agent": self.user_agent,
                "Accept": "application/json",
            }
            params: dict[str, Any] = {
                "q": query,
                "format": "jsonv2",
                "addressdetails": 1,
                "limit": limit,
            }
            if lat is not None and lng is not None:
                params["viewbox"] = f"{lng-0.1},{lat+0.1},{lng+0.1},{lat-0.1}"

            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    response = await client.get(
                        "https://nominatim.openstreetmap.org/search",
                        params=params,
                        headers=headers,
                    )
                    self._last_request_time = time.time()
                    response.raise_for_status()
                    raw_data = response.json()
            except Exception as exc:
                logger.error("Lỗi khi gọi API Nominatim: %s", exc)
                raise

            results: list[dict[str, Any]] = []
            for item in raw_data:
                results.append({
                    "external_id": f"osm_{item.get('place_id')}",
                    "name": item.get("name") or item.get("display_name", "").split(",")[0],
                    "address": item.get("display_name", ""),
                    "latitude": float(item.get("lat", 0.0)),
                    "longitude": float(item.get("lon", 0.0)),
                    "category": item.get("type", "OTHER"),
                })

            # 3. Lưu vào bộ nhớ cache
            self._cache[cache_key] = (time.time(), results)
            return results


class NominatimPlacesProvider(IExternalPlacesProvider):
    """Hiện thực IExternalPlacesProvider sử dụng NominatimService."""

    def __init__(self, service: NominatimService | None = None) -> None:
        self.service = service or NominatimService()

    async def search_places(
        self,
        query: str,
        lat: float,
        lng: float,
    ) -> list[dict[str, Any]]:
        return await self.service.search(query=query, lat=lat, lng=lng)
