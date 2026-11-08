"""ALGO-04 — Sắp xếp ưu tiên danh sách bình chọn (ALGORITHMS §6). Hàm thuần: không DB, không mạng.

Mỗi quán chưa bị loại: giờ mở cửa còn dùng được trong khung phòng (`available`), người đi xa nhất (`max_eta`),
`required = DEFAULT_ACTIVITY_MIN + max_eta + biên(max_eta, giờ bắt đầu phòng) + BUFFER_MIN`, `slack = available − required`.
Khoá `(risk_rank, −upvotes, −slack, max_eta, created_at)` với `sorted` (ổn định, TimSort — tài liệu §1.1).
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime
from enum import Enum
from uuid import UUID

from app.core import algo_config as cfg
from app.domain.algorithms.feasibility import DAY_MIN, RISK_RANK, Risk, margin_for


class PriorityLabel(str, Enum):
    RECOMMENDED = "RECOMMENDED"  # hạng 1 và SAFE
    MOST_VOTED_RISKY = "MOST_VOTED_RISKY"  # nhiều phiếu nhất nhưng không SAFE ("Nhiều phiếu nhưng khó kịp")
    MOST_VOTED = "MOST_VOTED"
    SCHEDULE_SAFE = "SCHEDULE_SAFE"  # SAFE và dư ≥ SCHEDULE_SAFE_SLACK_MIN


@dataclass(frozen=True, slots=True)
class PriorityInput:
    """Một quán chưa bị loại. `max_eta_min` None = không tính được (không ai có xuất phát / quán thiếu toạ độ)."""

    place_id: UUID
    upvotes: int
    created_at: datetime
    open_minute: int | None
    close_minute: int | None
    max_eta_min: int | None
    estimated: bool = True


@dataclass(frozen=True, slots=True)
class PlacePriority:
    place_id: UUID
    rank: int
    risk: Risk
    slack_min: int
    max_eta_min: int
    available_min: int
    required_min: int
    margin_min: int
    upvotes: int
    labels: tuple[PriorityLabel, ...]
    estimated: bool
    hours_unknown: bool
    eta_unknown: bool


def _overlap(a0: int, a1: int, b0: int, b1: int) -> int:
    return max(0, min(a1, b1) - max(a0, b0))


def available_minutes(
    open_minute: int | None, close_minute: int | None, start_minute: int, end_minute: int
) -> int | None:
    """Số phút giao giữa giờ mở cửa và khung phòng; None khi không rõ giờ mở cửa.

    Mở = đóng → mở cả ngày (như `hoursFit` ở FE). Quán qua đêm (đóng ≤ mở) được xét cả phần của hôm trước
    (vd. mở 18:00–02:00 với phòng 00:30–03:00) bằng cách dời khoảng mở ±24h.
    """
    if open_minute is None or close_minute is None:
        return None
    end = end_minute if end_minute > start_minute else end_minute + DAY_MIN
    if open_minute == close_minute:
        return end - start_minute
    close = close_minute if close_minute > open_minute else close_minute + DAY_MIN
    return sum(
        _overlap(open_minute + shift, close + shift, start_minute, end)
        for shift in (-DAY_MIN, 0, DAY_MIN)
    )


def assess_place(
    p: PriorityInput, start_minute: int, end_minute: int, on: date | None
) -> tuple[Risk, int, int, int, int, int, bool, bool]:
    """(risk, slack, max_eta, available, required, margin, hours_unknown, eta_unknown) cho một quán."""
    avail = available_minutes(p.open_minute, p.close_minute, start_minute, end_minute)
    hours_unknown = avail is None
    if avail is None:
        avail = available_minutes(0, 0, start_minute, end_minute) or 0
    eta_unknown = p.max_eta_min is None
    max_eta = p.max_eta_min or 0
    margin = margin_for(max_eta, start_minute, on)
    required = cfg.DEFAULT_ACTIVITY_MIN + max_eta + margin + cfg.BUFFER_MIN
    slack = avail - required
    if avail == 0 or slack < cfg.HIGH_RISK_SLACK_MIN:
        risk = Risk.HIGH_RISK
    elif slack < 0:
        risk = Risk.SOFT_CONFLICT
    else:
        risk = Risk.SAFE
    return risk, slack, max_eta, avail, required, margin, hours_unknown, eta_unknown


def rank_places(
    places: Sequence[PriorityInput], start_minute: int, end_minute: int, on: date | None
) -> list[PlacePriority]:
    """Thứ tự ưu tiên (rank 1 = đầu danh sách) + tối đa 1 nhãn mỗi quán."""
    assessed = []
    for p in places:
        risk, slack, max_eta, avail, required, margin, hours_unknown, eta_unknown = assess_place(
            p, start_minute, end_minute, on
        )
        assessed.append((p, risk, slack, max_eta, avail, required, margin, hours_unknown, eta_unknown))

    ordered = sorted(
        assessed,
        key=lambda a: (RISK_RANK[a[1]], -a[0].upvotes, -a[2], a[3], a[0].created_at),
    )
    max_up = max((a[0].upvotes for a in ordered), default=0)

    out: list[PlacePriority] = []
    for idx, (p, risk, slack, max_eta, avail, required, margin, hours_unknown, eta_unknown) in enumerate(
        ordered
    ):
        label: PriorityLabel | None = None
        if idx == 0 and risk is Risk.SAFE:
            label = PriorityLabel.RECOMMENDED
        elif max_up > 0 and p.upvotes == max_up:
            label = PriorityLabel.MOST_VOTED if risk is Risk.SAFE else PriorityLabel.MOST_VOTED_RISKY
        elif risk is Risk.SAFE and slack >= cfg.SCHEDULE_SAFE_SLACK_MIN:
            label = PriorityLabel.SCHEDULE_SAFE
        out.append(
            PlacePriority(
                place_id=p.place_id,
                rank=idx + 1,
                risk=risk,
                slack_min=slack,
                max_eta_min=max_eta,
                available_min=avail,
                required_min=required,
                margin_min=margin,
                upvotes=p.upvotes,
                labels=(label,) if label else (),
                estimated=p.estimated and not eta_unknown,
                hours_unknown=hours_unknown,
                eta_unknown=eta_unknown,
            )
        )
    return out
