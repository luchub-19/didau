"""ALGO-02 — Hoà phiếu theo thời gian di chuyển (ALGORITHMS §4). Hàm thuần: không DB, không mạng.

Service lo việc lấy dữ liệu và gọi estimator (Google nếu bật); ở đây chỉ có luật chọn:
ứng viên hoà → S/M/D → chọn theo tập với ngưỡng 2' → xếp hạng bằng cách lặp.
KHÔNG dùng `sort` với so sánh có ngưỡng: quan hệ "S gần bằng" không bắc cầu (60~62, 62~64, nhưng 60≁64).
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from uuid import UUID

from app.core import algo_config as cfg
from app.domain.enums import PlaceStatus
from app.domain.patterns.itinerary.travel import Coord, Leg, TravelSource


class OriginSource(str, Enum):
    MEMBER = "MEMBER"
    MEETING_POINT = "MEETING_POINT"


class UnavailableReason(str, Enum):
    NO_TIE = "NO_TIE"
    NO_ORIGINS = "NO_ORIGINS"
    NO_PLACE_COORDS = "NO_PLACE_COORDS"


@dataclass(frozen=True, slots=True)
class TieMember:
    member_id: UUID
    nickname: str
    origin: Coord
    origin_source: OriginSource


@dataclass(frozen=True, slots=True)
class TiePlace:
    place_id: UUID
    name: str
    status: PlaceStatus
    upvotes: int
    created_at: datetime
    coord: Coord | None


@dataclass(frozen=True, slots=True)
class RankedPlace:
    place_id: UUID
    rank: int
    total_min: int  # S_j
    max_min: int  # M_j
    total_km: float  # D_j


@dataclass(frozen=True, slots=True)
class TieOutcome:
    """Kết quả chọn. `matrix[i][j]` ứng với `members[i]` × `candidates[j]`; None ở cột quán thiếu toạ độ."""

    candidates: tuple[TiePlace, ...]
    members: tuple[TieMember, ...]
    matrix: tuple[tuple[Leg | None, ...], ...]
    ranking: tuple[RankedPlace, ...]
    unranked: tuple[UUID, ...]
    recommended_place_id: UUID | None
    margin_vs_second_min: int | None
    estimated: bool


def resolve_origins(
    members: Sequence[tuple[UUID, str, Coord | None]], meeting_point: Coord | None
) -> tuple[list[TieMember], int]:
    """`origin(member) = member.origin ?? điểm hẹn host ?? None`; thành viên None bị loại và được đếm (§1)."""
    out: list[TieMember] = []
    excluded = 0
    for member_id, nickname, own in members:
        if own is not None:
            out.append(TieMember(member_id, nickname, own, OriginSource.MEMBER))
        elif meeting_point is not None:
            out.append(TieMember(member_id, nickname, meeting_point, OriginSource.MEETING_POINT))
        else:
            excluded += 1
    return out, excluded


def tied_candidates(places: Sequence[TiePlace], *, ignore_accepted: bool = False) -> list[TiePlace]:
    """Kích hoạt (§4): ≥2 quán chưa bị loại có cùng `upvotes` lớn nhất (>0) và chưa có quán ACCEPTED.

    Trả [] nếu không hoà. Sắp theo (created_at, place_id) để kết quả không phụ thuộc thứ tự đầu vào.
    `ignore_accepted` dùng khi host chốt (resolve): vẫn xếp hạng dù trong phòng đã có quán ACCEPTED.
    """
    alive = [p for p in places if p.status not in (PlaceStatus.REJECTED, PlaceStatus.VISITED)]
    if not ignore_accepted and any(p.status == PlaceStatus.ACCEPTED for p in alive):
        return []
    if not alive:
        return []
    top = max(p.upvotes for p in alive)
    if top <= 0:
        return []
    tied = [p for p in alive if p.upvotes == top]
    if len(tied) < 2:
        return []
    return sorted(tied, key=lambda p: (p.created_at, str(p.place_id)))


def _select(rows: list[dict]) -> dict:
    """Một bước chọn: C = {S ≤ min S + ngưỡng} → M nhỏ nhất → D nhỏ nhất → thêm sớm hơn → place_id."""
    low = min(r["S"] for r in rows)
    in_set = [r for r in rows if r["S"] <= low + cfg.TIE_THRESHOLD_MIN]
    return min(in_set, key=lambda r: (r["M"], round(r["D"], 6), r["created_at"], str(r["id"])))


def rank_by_travel(rows: Sequence[dict]) -> list[dict]:
    """Xếp hạng bằng cách lặp `_select` trên tập còn lại. Mỗi dòng: `id, S, M, D, created_at`."""
    remaining = list(rows)
    ranked: list[dict] = []
    while remaining:
        best = _select(remaining)
        ranked.append(best)
        remaining = [r for r in remaining if r is not best]
    return ranked


def decide(
    candidates: Sequence[TiePlace],
    members: Sequence[TieMember],
    matrix: Sequence[Sequence[Leg | None]],
) -> TieOutcome:
    """Từ ma trận (hàng = thành viên, cột = ứng viên theo thứ tự `candidates`) ra thứ hạng.

    Quán thiếu toạ độ (cột toàn None) không so được → nằm sau mọi quán xếp hạng được (theo thứ tự đầu vào,
    tức `created_at`), không có S/M/D, không bao giờ được đề xuất.
    """
    rows: list[dict] = []
    unranked: list[UUID] = []
    for j, place in enumerate(candidates):
        legs = [matrix[i][j] for i in range(len(members))]
        if place.coord is None or any(leg is None for leg in legs):
            unranked.append(place.place_id)
            continue
        rows.append(
            {
                "id": place.place_id,
                "S": sum(leg.minutes for leg in legs),
                "M": max(leg.minutes for leg in legs),
                "D": sum(leg.distance_km for leg in legs),
                "created_at": place.created_at,
            }
        )
    ordered = rank_by_travel(rows)
    ranking = tuple(
        RankedPlace(r["id"], k + 1, r["S"], r["M"], round(r["D"], 3)) for k, r in enumerate(ordered)
    )
    margin = ranking[1].total_min - ranking[0].total_min if len(ranking) >= 2 else None
    legs_used = [leg for row in matrix for leg in row if leg is not None]
    return TieOutcome(
        candidates=tuple(candidates),
        members=tuple(members),
        matrix=tuple(tuple(row) for row in matrix),
        ranking=ranking,
        unranked=tuple(unranked),
        recommended_place_id=ranking[0].place_id if ranking else None,
        margin_vs_second_min=margin,
        estimated=any(leg.source is not TravelSource.GOOGLE for leg in legs_used),
    )
