"""ALGO-01 — Tâm nhóm (ALGORITHMS §3). Hàm thuần: không DB, không mạng.

Trung bình vector trên mặt cầu (w_i = 1) rồi gắn nhãn khu vực từ bảng tâm quận đóng gói trong repo.
Riêng tư (CR-11): chỉ trả tâm đã làm tròn 3 chữ số (~100 m); không bao giờ trả toạ độ từng người.
"""

import json
import math
from collections.abc import Sequence
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from app.core import algo_config as cfg
from app.domain.patterns.itinerary.travel import haversine_distance_km

Coord = tuple[float, float]

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
MIN_MEMBERS = 2
"""Dưới ngưỡng này không có tâm (§3: <2 người → widget ẩn)."""

LABEL_MAX_KM = 15.0
"""Tâm cách mọi điểm của bảng thành phố quá ngưỡng này → thử bảng thành phố khác, rồi bỏ nhãn."""

_CITY_FILES = {"HCM": "districts_hcm.json", "HN": "districts_hn.json"}


@dataclass(frozen=True, slots=True)
class District:
    name: str
    short: str
    lat: float
    lng: float


@dataclass(frozen=True, slots=True)
class GroupCenter:
    """Kết quả ALGO-01. `center`/`area_label` None khi `available` False."""

    available: bool
    member_count: int
    center: Coord | None = None
    area_label: str | None = None


def spherical_mean(points: Sequence[Coord]) -> Coord | None:
    """Tâm vector: x=cosφ cosλ, y=cosφ sinλ, z=sinφ → cộng → φc, λc (độ, CHƯA làm tròn).

    Trả None khi rỗng hoặc tổng vector ≈ 0 (các điểm đối xứng qua tâm Trái Đất — không có tâm xác định).
    """
    if not points:
        return None
    x = y = z = 0.0
    for lat, lng in points:
        phi, lam = math.radians(lat), math.radians(lng)
        x += math.cos(phi) * math.cos(lam)
        y += math.cos(phi) * math.sin(lam)
        z += math.sin(phi)
    if math.hypot(x, y, z) < 1e-9:
        return None
    return math.degrees(math.atan2(z, math.hypot(x, y))), math.degrees(math.atan2(y, x))


def round_center(center: Coord) -> Coord:
    d = cfg.CENTER_COORD_DECIMALS
    return round(center[0], d), round(center[1], d)


@lru_cache(maxsize=4)
def load_districts(city: str) -> tuple[District, ...]:
    """Bảng tâm khu vực của thành phố (`HCM`/`HN`); thiếu file/lỗi JSON → rỗng (nhãn None, không làm hỏng tâm)."""
    filename = _CITY_FILES.get(city.upper())
    if filename is None:
        return ()
    try:
        raw = json.loads((DATA_DIR / filename).read_text(encoding="utf-8"))
        return tuple(
            District(d["name"], d.get("short") or d["name"], float(d["lat"]), float(d["lng"]))
            for d in raw.get("districts", [])
        )
    except (OSError, ValueError, KeyError, TypeError):
        return ()


def area_label(center: Coord, districts: Sequence[District]) -> str | None:
    """Quận gần nhất; nếu quận KHÁC (theo `short`) thứ hai chênh ≤ `DISTRICT_TIE_KM` thì "Q3 – Phú Nhuận".

    Nhiều điểm cùng `short` (vd. các phường của TP Thủ Đức) được coi là một khu vực.
    """
    if not districts:
        return None
    ranked = sorted(
        ((haversine_distance_km(center[0], center[1], d.lat, d.lng), d.short) for d in districts),
        key=lambda t: (t[0], t[1]),
    )
    first_km, first = ranked[0]
    if first_km > LABEL_MAX_KM:
        return None
    for km, short in ranked[1:]:
        if short == first:
            continue
        return f"{first} – {short}" if km - first_km <= cfg.DISTRICT_TIE_KM else first
    return first


def label_for(center: Coord, city: str) -> str | None:
    """Nhãn theo bảng của `city`; tâm quá xa bảng đó (phòng ghi sai thành phố) thì thử bảng còn lại."""
    for name in (city.upper(), *(c for c in _CITY_FILES if c != city.upper())):
        districts = load_districts(name)
        nearest = min(
            (haversine_distance_km(center[0], center[1], d.lat, d.lng) for d in districts),
            default=None,
        )
        if nearest is not None and nearest <= LABEL_MAX_KM:
            return area_label(center, districts)
    return None


def compute_group_center(points: Sequence[Coord], city: str = "HCM") -> GroupCenter:
    """`points` = vị trí của các thành viên ĐÃ CHIA SẺ (không gồm điểm hẹn của host)."""
    n = len(points)
    if n < MIN_MEMBERS:
        return GroupCenter(available=False, member_count=n)
    mean = spherical_mean(points)
    if mean is None:
        return GroupCenter(available=False, member_count=n)
    center = round_center(mean)
    return GroupCenter(True, n, center, label_for(center, city))


def within_radius(
    center: Coord, items: Sequence, radius_km: float = cfg.CENTER_RADIUS_KM
) -> list[tuple[float, object]]:
    """[(khoảng cách km, item)] cho item có `.lat/.lng` trong bán kính, sắp gần → xa (ổn định theo thứ tự vào)."""
    found = [
        (haversine_distance_km(center[0], center[1], it.lat, it.lng), it) for it in items
    ]
    return sorted(((d, it) for d, it in found if d <= radius_km), key=lambda t: t[0])
