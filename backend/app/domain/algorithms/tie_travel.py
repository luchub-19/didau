"""ALGO-02 — Hoà phiếu bằng Ordered Median của Sơn (docs/phase7/ALGORITHMS.md §1, §6; CR-15). Hàm thuần.

Service lo việc lấy dữ liệu và gọi estimator; ở đây chỉ có luật:
- hoà = ≥ 2 quán cùng ĐIỂM (Muốn đi − Không) lớn nhất trong CÙNG loại quán (`tied_groups`);
- người không tự chia sẻ vị trí bị loại (`member_origins`, không dùng điểm hẹn host);
- mỗi loại hoà là một bài K = 1: `Nhà → quán → Nhà`, Ψ khứ hồi (`decide`, lõi ở `ordered_median`).

`resolve_origins` (có lùi về điểm hẹn) chỉ còn cho ALGO-04 (gđ6 §1, không đổi ở gđ7).
"""

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from uuid import UUID

from app.core import algo_config as cfg
from app.domain.algorithms.ordered_median import omp_weights, rank_candidates
from app.domain.enums import PlaceCategory, PlaceStatus
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
    origin_source: OriginSource = OriginSource.MEMBER


@dataclass(frozen=True, slots=True)
class TiePlace:
    place_id: UUID
    name: str
    status: PlaceStatus
    upvotes: int
    created_at: datetime
    coord: Coord | None
    category: PlaceCategory = PlaceCategory.OTHER
    downvotes: int = 0

    @property
    def score(self) -> int:
        return self.upvotes - self.downvotes


@dataclass(frozen=True, slots=True)
class TieGroup:
    """Một loại quán đang hoà; `candidates` sắp theo (created_at, place_id)."""

    category: PlaceCategory
    candidates: tuple[TiePlace, ...]


@dataclass(frozen=True, slots=True)
class RankedPlace:
    place_id: UUID
    rank: int
    psi: float
    max_km: float  # người đi xa nhất (khứ hồi)
    total_km: float  # cả nhóm (khứ hồi)
    max_min: int  # phút khứ hồi của người đi lâu nhất


@dataclass(frozen=True, slots=True)
class MemberCost:
    """Một thành viên ở quán đề xuất: km/phút khứ hồi, hạng theo chi phí (1 = gần nhất), trọng số w_r."""

    member_id: UUID
    nickname: str
    km: float
    minutes: int
    rank: int
    weight: float


@dataclass(frozen=True, slots=True)
class TieOutcome:
    category: PlaceCategory
    candidates: tuple[TiePlace, ...]
    ranking: tuple[RankedPlace, ...]
    unranked: tuple[UUID, ...]
    recommended_place_id: UUID | None
    members: tuple[MemberCost, ...]
    runner_up_psi: float | None
    estimated: bool
    source: str
    lam: float
    k: float


def resolve_origins(
    members: Sequence[tuple[UUID, str, Coord | None]], meeting_point: Coord | None
) -> tuple[list[TieMember], int]:
    """ALGO-04 (gđ6 §1): `origin = vị trí riêng ?? điểm hẹn host ?? loại`; người bị loại được đếm."""
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


def member_origins(members: Sequence[tuple[UUID, str, Coord | None]]) -> tuple[list[TieMember], int]:
    """Hoà phiếu (gđ7 §1): chỉ người TỰ chia sẻ vị trí; người thiếu bị loại và được đếm (không dùng điểm hẹn)."""
    return resolve_origins(members, None)


def tied_groups(places: Sequence[TiePlace], *, ignore_accepted: bool = False) -> list[TieGroup]:
    """Kích hoạt (§6): trong từng loại, quán chưa REJECTED/VISITED, ≥ 2 quán cùng điểm lớn nhất, có hoạt động bỏ
    phiếu trong loại, và loại chưa có quán ACCEPTED. Cùng luật với `TIE_AT_TOP` (`decision/trigger.py`).

    `ignore_accepted` dùng khi host chốt (resolve): vẫn xếp hạng dù loại đã có quán ACCEPTED.
    Trả các loại theo thứ tự khai báo của `PlaceCategory`; [] nếu không loại nào hoà.
    """
    by_cat: dict[PlaceCategory, list[TiePlace]] = defaultdict(list)
    for p in places:
        if p.status not in (PlaceStatus.REJECTED, PlaceStatus.VISITED):
            by_cat[p.category].append(p)
    groups: list[TieGroup] = []
    for cat in PlaceCategory:
        alive = by_cat.get(cat, [])
        if len(alive) < 2:
            continue
        if not ignore_accepted and any(p.status == PlaceStatus.ACCEPTED for p in alive):
            continue
        if not any(p.upvotes + p.downvotes > 0 for p in alive):
            continue  # chưa ai bỏ phiếu: bằng 0 điểm không phải hoà có nghĩa
        top = max(p.score for p in alive)
        tied = [p for p in alive if p.score == top]
        if len(tied) < 2:
            continue
        groups.append(TieGroup(cat, tuple(sorted(tied, key=lambda p: (p.created_at, str(p.place_id))))))
    return groups


def _source(legs: Sequence[Leg]) -> str:
    """`ESTIMATE` nếu còn ô ước lượng; một nguồn duy nhất → tên nguồn; trộn nhiều nguồn thật → `MIXED`."""
    sources = {leg.source for leg in legs}
    if not sources or TravelSource.ESTIMATE in sources:
        return TravelSource.ESTIMATE.value
    if len(sources) == 1:
        return next(iter(sources)).value
    return "MIXED"


def decide(
    group: TieGroup,
    members: Sequence[TieMember],
    to_place: Sequence[Sequence[Leg | None]],
    to_home: Sequence[Sequence[Leg | None]],
    *,
    lam: float = cfg.OMP_LAMBDA,
    k: float = cfg.OMP_K,
) -> TieOutcome:
    """Một bài K = 1. `to_place[i][j]` = `members[i]` → `group.candidates[j]`; `to_home[i][j]` = chiều ngược lại
    (quán j → nhà người i) — KHÔNG giả định đối xứng. Ô None ở quán thiếu toạ độ.

    Quán thiếu toạ độ (hoặc thiếu ô nào) không so được → nằm sau mọi quán xếp hạng được, không bao giờ được đề xuất.
    `members` rỗng → không quán nào xếp hạng được.
    """
    cands = group.candidates
    rankable = [
        j
        for j, p in enumerate(cands)
        if p.coord is not None
        and members
        and all(to_place[i][j] is not None and to_home[i][j] is not None for i in range(len(members)))
    ]
    unranked = tuple(p.place_id for j, p in enumerate(cands) if j not in rankable)
    if not rankable:
        return TieOutcome(
            group.category, cands, (), unranked, None, (), None, True, TravelSource.ESTIMATE.value, lam, k
        )

    # Nút của hàm khoảng cách: chỉ số thành viên ("m", i) và chỉ số quán ("p", j)
    km: dict[tuple[tuple[str, int], tuple[str, int]], float] = {}
    for i in range(len(members)):
        for j in rankable:
            km[("m", i), ("p", j)] = to_place[i][j].distance_km  # type: ignore[union-attr]
            km[("p", j), ("m", i)] = to_home[i][j].distance_km  # type: ignore[union-attr]

    def minutes(i: int, j: int) -> int:
        return to_place[i][j].minutes + to_home[i][j].minutes  # type: ignore[union-attr]

    evals = rank_candidates(
        [("m", i) for i in range(len(members))],
        [("p", j) for j in rankable],
        lambda a, b: km[a, b],
        lam=lam,
        k=k,
        tie_key=lambda node: (cands[node[1]].created_at, str(cands[node[1]].place_id)),
    )
    ranking = tuple(
        RankedPlace(
            place_id=cands[ev.combo[0][1]].place_id,
            rank=r + 1,
            psi=round(ev.psi, 3),
            max_km=round(ev.max_km, 3),
            total_km=round(ev.total_km, 3),
            max_min=max(minutes(i, ev.combo[0][1]) for i in range(len(members))),
        )
        for r, ev in enumerate(evals)
    )

    best = evals[0]
    j_best = best.combo[0][1]
    weights = omp_weights(len(members), lam)
    # Hạng theo chi phí; bằng nhau → member_id để không phụ thuộc thứ tự đầu vào
    order = sorted(range(len(members)), key=lambda i: (best.costs[i], str(members[i].member_id)))
    member_costs = tuple(
        MemberCost(
            member_id=members[i].member_id,
            nickname=members[i].nickname,
            km=round(best.distances[i], 3),
            minutes=minutes(i, j_best),
            rank=r + 1,
            weight=round(weights[r], 4),
        )
        for r, i in enumerate(order)
    )
    legs_used = [
        leg
        for grid in (to_place, to_home)
        for i in range(len(members))
        for j in rankable
        if (leg := grid[i][j]) is not None
    ]
    source = _source(legs_used)
    return TieOutcome(
        category=group.category,
        candidates=cands,
        ranking=ranking,
        unranked=unranked,
        recommended_place_id=ranking[0].place_id,
        members=member_costs,
        runner_up_psi=ranking[1].psi if len(ranking) >= 2 else None,
        estimated=source == TravelSource.ESTIMATE.value,
        source=source,
        lam=lam,
        k=k,
    )
