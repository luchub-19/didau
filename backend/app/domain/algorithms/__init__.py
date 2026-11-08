"""Algorithm Engine giai đoạn 6 — hàm thuần (ALGORITHMS.md)."""

from app.domain.algorithms.feasibility import (
    LegAssessment,
    PlanFeasibility,
    PlanItem,
    Risk,
    assess_leg,
    consecutive_pairs,
    margin_for,
    plan_feasibility,
)
from app.domain.algorithms.group_center import GroupCenter, compute_group_center
from app.domain.algorithms.priority import (
    PlacePriority,
    PriorityInput,
    PriorityLabel,
    available_minutes,
    rank_places,
)
from app.domain.algorithms.tie_travel import (
    OriginSource,
    RankedPlace,
    TieMember,
    TieOutcome,
    TiePlace,
    UnavailableReason,
    decide,
    rank_by_travel,
    resolve_origins,
    tied_candidates,
)

__all__ = [
    "GroupCenter",
    "LegAssessment",
    "OriginSource",
    "PlacePriority",
    "PlanFeasibility",
    "PlanItem",
    "PriorityInput",
    "PriorityLabel",
    "RankedPlace",
    "Risk",
    "TieMember",
    "TieOutcome",
    "TiePlace",
    "UnavailableReason",
    "assess_leg",
    "available_minutes",
    "compute_group_center",
    "consecutive_pairs",
    "decide",
    "margin_for",
    "plan_feasibility",
    "rank_by_travel",
    "rank_places",
    "resolve_origins",
    "tied_candidates",
]
