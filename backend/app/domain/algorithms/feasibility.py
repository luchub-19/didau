"""ALGO-03 — Sai số thời gian di chuyển trên lịch (ALGORITHMS §5). Hàm thuần: không DB, không mạng.

Dùng chung cho `TravelTimeConflictRule` (cảnh báo từng cặp) và `GET /schedule/feasibility` (tổng kế hoạch), nên
hai chỗ luôn ra cùng số. Thời gian đi (`eta`) do nơi gọi lấy từ estimator chung (§2) rồi đưa vào đây.

Quyết định của T-87 (ghi ở PROGRESS):
- Giờ cao điểm là nửa mở `[16:30, 19:30)`: rời quán đúng 16:30 tính cao điểm, đúng 19:30 thì không.
- Hai mục cùng một chỗ (`eta = 0` và quãng đường 0) không có chặng: biên = 0, gửi xe = 0.
"""

import math
from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from enum import Enum
from itertools import pairwise
from typing import Any
from uuid import UUID

from app.core import algo_config as cfg
from app.core.time_utils import VIETNAM_TZ
from app.domain.patterns.itinerary.travel import Coord, Leg, TravelSource

DAY_MIN = 24 * 60


class Risk(str, Enum):
    """Mức khả thi dùng chung ALGO-03/04."""

    SAFE = "SAFE"
    SOFT_CONFLICT = "SOFT_CONFLICT"
    HIGH_RISK = "HIGH_RISK"


RISK_RANK = {Risk.SAFE: 0, Risk.SOFT_CONFLICT: 1, Risk.HIGH_RISK: 2}


def day_of(event_date: date | None, day_offset: int = 0) -> date | None:
    """Ngày thật của một mục (ngày phòng + `day_offset`)."""
    if event_date is None:
        return None
    return event_date + timedelta(days=day_offset)


def is_peak(depart_minute: int, on: date | None) -> bool:
    """Rời đi trong `[PEAK_START_MIN, PEAK_END_MIN)` của một ngày thứ Hai–Sáu. Không biết ngày → không cao điểm."""
    if on is None or on.weekday() >= 5:
        return False
    return cfg.PEAK_START_MIN <= depart_minute % DAY_MIN < cfg.PEAK_END_MIN


def margin_for(eta_min: int, depart_minute: int, on: date | None) -> int:
    """Biên dự phòng = max(MARGIN_MIN, ceil(eta × 50% giờ cao điểm ngày thường | 25% còn lại)) (§5)."""
    ratio = cfg.PEAK_MARGIN_RATIO if is_peak(depart_minute, on) else cfg.OFFPEAK_MARGIN_RATIO
    # round(…, 6): tránh ceil nhảy +1 vì sai số float (vd. 12 × 0,25)
    return max(cfg.MARGIN_MIN, math.ceil(round(eta_min * ratio, 6)))


def risk_for(gap_min: int, eta_min: int, slack_min: int) -> Risk:
    """SAFE (slack ≥ 0) · SOFT_CONFLICT (thiếu nhưng còn đủ thời gian đi thường) · HIGH_RISK (gap < eta)."""
    if slack_min >= 0:
        return Risk.SAFE
    if gap_min >= eta_min:
        return Risk.SOFT_CONFLICT
    return Risk.HIGH_RISK


def depart_datetime(event_date: date | None, day_offset: int, minute: int) -> datetime | None:
    """Giờ khởi hành thật (giờ Việt Nam) để estimator Google/cache dùng; None nếu phòng không có ngày."""
    on = day_of(event_date, day_offset)
    if on is None:
        return None
    minute = max(0, min(DAY_MIN - 1, minute))
    return datetime.combine(on, time(minute // 60, minute % 60), tzinfo=VIETNAM_TZ)


@dataclass(frozen=True, slots=True)
class PlanItem:
    """Một mục lịch rút gọn cho ALGO-03. `coord` None = quán thiếu toạ độ (không tính được chặng)."""

    item_id: UUID
    day_offset: int
    start_minute: int
    end_minute: int
    order_index: int
    coord: Coord | None
    name: str = ""

    @property
    def duration_min(self) -> int:
        return max(0, self.end_minute - self.start_minute)


@dataclass(frozen=True, slots=True)
class LegAssessment:
    """Một cặp mục liên tiếp đã đánh giá (§5)."""

    from_item: PlanItem
    to_item: PlanItem
    eta_min: int
    margin_min: int
    buffer_min: int
    gap_min: int
    slack_min: int
    distance_km: float
    risk: Risk
    peak: bool
    source: TravelSource

    @property
    def required_min(self) -> int:
        return self.eta_min + self.margin_min + self.buffer_min

    @property
    def estimated(self) -> bool:
        return self.source is TravelSource.ESTIMATE


def plan_items_from_dicts(items: Iterable[dict[str, Any]], coords: dict[str, Coord]) -> list[PlanItem]:
    """Dựng `PlanItem` từ dict mục lịch kiểu `ConflictContext.schedule_items`.

    Toạ độ: ưu tiên `latitude/longitude` ngay trên dict, rồi tới `coords[str(place_id)]`.
    """
    out: list[PlanItem] = []
    for it in items:
        lat, lng = it.get("latitude"), it.get("longitude")
        coord: Coord | None
        if lat is not None and lng is not None:
            coord = (float(lat), float(lng))
        else:
            coord = coords.get(str(it.get("place_id")))
        raw_id = it.get("id")
        out.append(
            PlanItem(
                item_id=raw_id if isinstance(raw_id, UUID) else UUID(str(raw_id)),
                day_offset=int(it.get("day_offset", 0) or 0),
                start_minute=int(it.get("start_minute", 0) or 0),
                end_minute=int(it.get("end_minute", 0) or 0),
                order_index=int(it.get("order_index", 0) or 0),
                coord=coord,
                name=str(it.get("place_name") or ""),
            )
        )
    return out


def consecutive_pairs(items: Sequence[PlanItem]) -> list[tuple[PlanItem, PlanItem]]:
    """Các cặp mục liên tiếp CÙNG NGÀY, sắp theo (giờ bắt đầu, order_index). Không có chặng từ nhà tới điểm đầu."""
    by_day: dict[int, list[PlanItem]] = defaultdict(list)
    for it in items:
        by_day[it.day_offset].append(it)
    pairs: list[tuple[PlanItem, PlanItem]] = []
    for day in sorted(by_day):
        ordered = sorted(by_day[day], key=lambda x: (x.start_minute, x.order_index))
        pairs.extend(pairwise(ordered))
    return pairs


def assess_leg(curr: PlanItem, nxt: PlanItem, leg: Leg, event_date: date | None) -> LegAssessment:
    """eta = chặng curr → next khởi hành lúc `end_curr`; required = eta + biên + gửi xe; slack = gap − required."""
    gap = nxt.start_minute - curr.end_minute
    on = day_of(event_date, curr.day_offset)
    peak = is_peak(curr.end_minute, on)
    eta = int(leg.minutes)
    if eta <= 0 and leg.distance_km <= 0:
        margin, buffer = 0, 0  # cùng một chỗ: không di chuyển, không gửi xe lại
    else:
        margin, buffer = margin_for(eta, curr.end_minute, on), cfg.BUFFER_MIN
    slack = gap - (eta + margin + buffer)
    return LegAssessment(
        from_item=curr,
        to_item=nxt,
        eta_min=eta,
        margin_min=margin,
        buffer_min=buffer,
        gap_min=gap,
        slack_min=slack,
        distance_km=float(leg.distance_km),
        risk=risk_for(gap, eta, slack),
        peak=peak,
        source=leg.source,
    )


@dataclass(frozen=True, slots=True)
class PlanFeasibility:
    """Tổng kế hoạch (OUTPUT `feasibility`, §5)."""

    window_min: int
    required_total_min: int
    buffer_total_min: int
    is_feasible: bool
    legs: tuple[LegAssessment, ...]
    estimated: bool
    item_count: int
    unknown_leg_count: int


def window_minutes(start_minute: int, end_minute: int) -> int:
    """Độ dài khung phòng; khung qua nửa đêm (end ≤ start) được cộng 24h."""
    return end_minute - start_minute if end_minute > start_minute else end_minute + DAY_MIN - start_minute


def plan_feasibility(
    start_minute: int,
    end_minute: int,
    items: Sequence[PlanItem],
    legs: Sequence[LegAssessment],
    unknown_leg_count: int = 0,
) -> PlanFeasibility:
    """`required_total = Σ thời lượng + Σ (eta + biên + gửi xe)`; khả thi khi dư ≥ 0 và không có HIGH_RISK.

    Nơi gọi quyết định tập mục (T-87: chỉ ngày của phòng, `day_offset = 0`, vì khung giờ là của một ngày).
    Cặp thiếu toạ độ không vào `legs` (không đoán) mà đếm vào `unknown_leg_count`.
    """
    window = window_minutes(start_minute, end_minute)
    required = sum(it.duration_min for it in items) + sum(lg.required_min for lg in legs)
    buffer_total = window - required
    feasible = buffer_total >= 0 and all(lg.risk is not Risk.HIGH_RISK for lg in legs)
    return PlanFeasibility(
        window_min=window,
        required_total_min=required,
        buffer_total_min=buffer_total,
        is_feasible=feasible,
        legs=tuple(legs),
        estimated=any(lg.estimated for lg in legs),
        item_count=len(items),
        unknown_leg_count=unknown_leg_count,
    )
