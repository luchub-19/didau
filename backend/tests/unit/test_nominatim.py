import json
import time
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.services.nominatim_service import NominatimService


@pytest.mark.asyncio
async def test_nominatim_user_agent_header_and_cache() -> None:
    service = NominatimService(user_agent="TestAgent/1.0", cache_ttl=60.0)

    payload = [
        {
            "place_id": 12345,
            "name": "Quán Cà Phê Mẫu",
            "display_name": "Quán Cà Phê Mẫu, Quận 1, TP.HCM",
            "lat": "10.7769",
            "lon": "106.7058",
            "type": "cafe",
        }
    ]
    mock_resp = httpx.Response(
        status_code=200,
        content=json.dumps(payload).encode("utf-8"),
        request=httpx.Request("GET", "https://nominatim.openstreetmap.org/search"),
    )

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_resp

        # Lần gọi thứ 1: Phải gửi HTTP request kèm User-Agent
        results1 = await service.search("cà phê", 10.7769, 106.7058)
        assert len(results1) == 1
        assert results1[0]["name"] == "Quán Cà Phê Mẫu"
        assert results1[0]["external_id"] == "osm_12345"

        # Kiểm tra User-Agent
        assert mock_get.call_count == 1
        _, kwargs = mock_get.call_args
        assert kwargs["headers"]["User-Agent"] == "TestAgent/1.0"

        # Lần gọi thứ 2 cùng query & tọa độ: Phải lấy từ cache trong bộ nhớ (không gọi lại HTTP)
        results2 = await service.search("cà phê", 10.7769, 106.7058)
        assert len(results2) == 1
        assert mock_get.call_count == 1  # Không tăng thêm số lần gọi HTTP


@pytest.mark.asyncio
async def test_nominatim_rate_limit_1_per_second() -> None:
    service = NominatimService(user_agent="TestAgent/1.0")

    mock_resp = httpx.Response(
        status_code=200,
        content=b"[]",
        request=httpx.Request("GET", "https://nominatim.openstreetmap.org/search"),
    )

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_resp

        start_time = time.time()
        # Gọi 2 query khác nhau để không dính cache
        await service.search("quán 1", 10.0, 106.0)
        await service.search("quán 2", 10.5, 106.5)
        duration = time.time() - start_time

        # Giữa 2 request phải cách nhau ít nhất 1.0 giây
        assert duration >= 0.95
        assert mock_get.call_count == 2
