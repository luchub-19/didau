import math
from abc import ABC, abstractmethod


def haversine_distance_km(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> float:
    """Tính khoảng cách đường chim bay giữa hai tọa độ địa lý theo công thức Haversine (km)."""
    radius = 6371.0  # Bán kính Trái Đất xấp xỉ tính bằng km
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return radius * c


class ITravelTimeEstimator(ABC):
    """Ước lượng thời gian di chuyển giữa 2 tọa độ (CR-02)."""

    @abstractmethod
    def minutes(self, a: tuple[float, float], b: tuple[float, float]) -> int:
        """Số phút di chuyển từ a=(lat, lng) đến b=(lat, lng)."""


class HaversineTravelEstimator(ITravelTimeEstimator):
    """Haversine × hệ số đường vòng, chia vận tốc, cộng thời gian gửi xe.

    Mặc định (1,3 và 10 phút) khiến planner luôn bảo thủ hơn hoặc bằng
    `TravelTimeConflictRule` bản gốc (chỉ Haversine / vận tốc).
    """

    def __init__(
        self,
        average_speed_kmh: float = 30.0,
        detour_factor: float = 1.3,
        parking_minutes: int = 10,
    ) -> None:
        self.average_speed_kmh = max(1.0, average_speed_kmh)
        self.detour_factor = max(1.0, detour_factor)
        self.parking_minutes = max(0, parking_minutes)

    def minutes(self, a: tuple[float, float], b: tuple[float, float]) -> int:
        distance_km = haversine_distance_km(a[0], a[1], b[0], b[1])
        driving = math.ceil((distance_km * self.detour_factor / self.average_speed_kmh) * 60.0)
        return driving + self.parking_minutes
