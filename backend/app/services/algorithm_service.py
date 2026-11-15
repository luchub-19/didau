"""Algorithm Engine: tâm nhóm (ALGO-01), hoà phiếu OMP (ALGO-02, gđ7), khả thi lịch (ALGO-03), ưu tiên quán (ALGO-04).

Service lo phần có I/O (đọc phòng/thành viên/quán/phiếu/lịch, gọi estimator); luật tính nằm ở
`app/domain/algorithms` (hàm thuần). Google (nếu bật qua `get_travel_estimator`) chỉ được gọi ở: gợi ý hoà phiếu
(khi chắc có hoà), `GET /schedule/feasibility` và làm ấm cache trước khi đánh giá xung đột. ALGO-04 chạy sau MỖI
phiếu nên chỉ dùng phần đồng bộ (ước lượng, hoặc số Google đã có trong cache) — không bao giờ gọi mạng.
"""

import logging
import math
from datetime import datetime, time
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core import algo_config as cfg
from app.core.exceptions import RoomNotFoundError
from app.core.time_utils import VIETNAM_TZ
from app.domain.algorithms import (
    TieGroup,
    TieMember,
    TieOutcome,
    TiePlace,
    UnavailableReason,
    compute_group_center,
    decide,
    member_origins,
    resolve_origins,
    tied_groups,
)
from app.domain.algorithms.feasibility import (
    PlanItem,
    assess_leg,
    consecutive_pairs,
    depart_datetime,
    plan_feasibility,
    plan_items_from_dicts,
)
from app.domain.algorithms.group_center import within_radius
from app.domain.algorithms.priority import PlacePriority, PriorityInput, rank_places
from app.domain.enums import PlaceCategory, PlaceStatus
from app.domain.models.member import Member
from app.domain.models.place import Place
from app.domain.models.room import Room
from app.domain.patterns.conflict_rule.rule import ConflictContext
from app.domain.patterns.event_bus import DomainEvent, IEventBus
from app.domain.patterns.itinerary.travel import (
    CachedEstimator,
    Coord,
    Leg,
    TravelSource,
    get_travel_estimator,
)
from app.repositories import (
    IMemberRepository,
    IPlaceRepository,
    IRoomRepository,
    IScheduleRepository,
    IVoteRepository,
)
from app.schemas.algorithm import (
    CategoryTieSuggestion,
    FeasibilityLeg,
    GroupCenterResponse,
    LatLng,
    OmpParams,
    ScheduleFeasibility,
    TieCandidate,
    TieMemberCost,
    TieRanking,
    TieSuggestion,
)
from app.schemas.poi import PoiResponse
from app.services.poi_service import PoiService, get_poi_service
from app.services.state_version import publish_versioned

logger = logging.getLogger(__name__)

KM_PER_DEG = 111.32


def shared_origins(members: list[Member]) -> list[tuple[float, float]]:
    """Vị trí của các thành viên hoạt động ĐÃ CHIA SẺ (không gồm điểm hẹn của host — §3)."""
    return [
        (m.origin_lat, m.origin_lng)
        for m in members
        if m.is_active and m.origin_lat is not None and m.origin_lng is not None
    ]


class AlgorithmService:
    def __init__(
        self,
        room_repo: IRoomRepository,
        member_repo: IMemberRepository,
        place_repo: IPlaceRepository,
        vote_repo: IVoteRepository,
        poi_service: PoiService | None = None,
        schedule_repo: IScheduleRepository | None = None,
    ) -> None:
        self.room_repo = room_repo
        self.member_repo = member_repo
        self.place_repo = place_repo
        self.vote_repo = vote_repo
        self._poi_service = poi_service
        self.schedule_repo = schedule_repo

    @property
    def poi_service(self) -> PoiService:
        return self._poi_service or get_poi_service()

    async def _room(self, room_id: UUID) -> Room:
        room = await self.room_repo.get_by_id(room_id)
        if room is None:
            raise RoomNotFoundError(
                message="Không tìm thấy phòng với mã yêu cầu.", details={"room_id": str(room_id)}
            )
        return room

    # ── ALGO-01 ───────────────────────────────────────────────────────────────────────────────
    async def group_center(self, room_id: UUID) -> GroupCenterResponse:
        room = await self._room(room_id)
        members = await self.member_repo.list_by_room(room_id)
        result = compute_group_center(shared_origins(members), room.city)
        if not result.available or result.center is None:
            return GroupCenterResponse(available=False, member_count=result.member_count)
        return GroupCenterResponse(
            available=True,
            center=LatLng(lat=result.center[0], lng=result.center[1]),
            area_label=result.area_label,
            member_count=result.member_count,
            nearby_pois=self._nearby_pois(result.center),
        )

    def _nearby_pois(self, center: tuple[float, float]) -> list[PoiResponse]:
        """POI trong `CENTER_RADIUS_KM` quanh tâm, gần → xa, tối đa `CENTER_MAX_PLACES`."""
        lat, lng = center
        dlat = cfg.CENTER_RADIUS_KM / KM_PER_DEG
        dlng = cfg.CENTER_RADIUS_KM / (KM_PER_DEG * max(0.01, math.cos(math.radians(lat))))
        pois = self.poi_service.in_bbox(
            (lat - dlat, lng - dlng, lat + dlat, lng + dlng), None, limit=10**6
        )
        out: list[PoiResponse] = []
        for dist, poi in within_radius(center, pois)[: cfg.CENTER_MAX_PLACES]:
            item = PoiResponse.model_validate(poi, from_attributes=True)
            out.append(item.model_copy(update={"distance_km": round(dist, 3)}))
        return out

    # ── ALGO-02 ───────────────────────────────────────────────────────────────────────────────
    @staticmethod
    def _depart_at(room: Room) -> datetime:
        return datetime.combine(
            room.event_date, time(room.start_minute // 60, room.start_minute % 60), tzinfo=VIETNAM_TZ
        )

    @staticmethod
    def _origins(room: Room, members: list[Member]) -> tuple[list[TieMember], int]:
        """ALGO-04: `origin = vị trí riêng ?? điểm hẹn host ?? loại` (gđ6 §1) cho các thành viên đang hoạt động.
        Hoà phiếu (gđ7) KHÔNG dùng hàm này: chỉ người tự chia sẻ vị trí (`member_origins`)."""
        meeting = (
            (room.origin_lat, room.origin_lng)
            if room.origin_lat is not None and room.origin_lng is not None
            else None
        )
        return resolve_origins(
            [
                (
                    m.id,
                    m.nickname,
                    (m.origin_lat, m.origin_lng)
                    if m.origin_lat is not None and m.origin_lng is not None
                    else None,
                )
                for m in members
                if m.is_active
            ],
            meeting,
        )

    async def compute_ties(
        self, room_id: UUID, *, ignore_accepted: bool = False
    ) -> tuple[list[TieOutcome], UnavailableReason | None, int, list[TieGroup]]:
        """OMP theo từng loại đang hoà (gđ7 §6): (kết quả từng loại, lý do không có, số người bị loại, nhóm hoà).

        Kết quả rỗng khi không tính được (lý do khác None). Một loại không quán nào có toạ độ vẫn có mục trong kết
        quả (ranking rỗng); lý do `NO_PLACE_COORDS` chỉ khi MỌI loại như vậy.
        """
        room = await self._room(room_id)
        places = await self.place_repo.list_by_room(room_id)
        votes = await self.vote_repo.get_vote_summary_by_room(room_id)
        tie_places = [
            TiePlace(
                place_id=p.id,
                name=p.name,
                status=_status(p),
                upvotes=votes.get(p.id, {}).get("upvotes", 0),
                downvotes=votes.get(p.id, {}).get("downvotes", 0),
                created_at=p.created_at,
                coord=(float(p.latitude), float(p.longitude))
                if p.latitude is not None and p.longitude is not None
                else None,
                category=_category(p),
            )
            for p in places
        ]
        groups = tied_groups(tie_places, ignore_accepted=ignore_accepted)
        if not groups:
            return [], UnavailableReason.NO_TIE, 0, []

        tie_members, excluded = member_origins(
            [
                (
                    m.id,
                    m.nickname,
                    (m.origin_lat, m.origin_lng)
                    if m.origin_lat is not None and m.origin_lng is not None
                    else None,
                )
                for m in await self.member_repo.list_by_room(room_id)
                if m.is_active
            ]
        )
        if not tie_members:
            return [], UnavailableReason.NO_ORIGINS, excluded, groups

        with_coords = list(
            {p.place_id: p for g in groups for p in g.candidates if p.coord is not None}.values()
        )
        if not with_coords:
            return [], UnavailableReason.NO_PLACE_COORDS, excluded, groups

        # Google (nếu bật) chỉ được gọi ở đây — sau khi đã chắc có hoà và đủ dữ liệu; lỗi → ước lượng.
        # Khứ hồi = hai lần hỏi đúng chiều (đi: nhà → quán, về: quán → nhà); không giả định đối xứng.
        estimator = get_travel_estimator()
        depart = self._depart_at(room)
        origins = [m.origin for m in tie_members]
        dests: list[Coord] = [p.coord for p in with_coords]  # type: ignore[misc]
        go = await estimator.amatrix(origins, dests, depart)
        back = await estimator.amatrix(dests, origins, depart)
        col = {p.place_id: j for j, p in enumerate(with_coords)}

        outcomes: list[TieOutcome] = []
        for g in groups:
            to_place: list[list[Leg | None]] = [
                [go[i][col[p.place_id]] if p.place_id in col else None for p in g.candidates]
                for i in range(len(tie_members))
            ]
            to_home: list[list[Leg | None]] = [
                [back[col[p.place_id]][i] if p.place_id in col else None for p in g.candidates]
                for i in range(len(tie_members))
            ]
            outcomes.append(decide(g, tie_members, to_place, to_home))
        return outcomes, None, excluded, groups

    async def tie_suggestion(self, room_id: UUID) -> TieSuggestion:
        outcomes, reason, excluded, groups = await self.compute_ties(room_id)
        by_cat = {o.category: o for o in outcomes}
        params = OmpParams(lambda_=cfg.OMP_LAMBDA, k=cfg.OMP_K)
        suggestions: list[CategoryTieSuggestion] = []
        for g in groups:
            candidates = [
                TieCandidate(
                    place_id=p.place_id,
                    name=p.name,
                    upvotes=p.upvotes,
                    downvotes=p.downvotes,
                    score=p.score,
                )
                for p in g.candidates
            ]
            o = by_cat.get(g.category)
            if o is None:
                suggestions.append(
                    CategoryTieSuggestion(
                        category=g.category.value,
                        candidates=candidates,
                        excluded_member_count=excluded,
                        params=params,
                    )
                )
                continue
            suggestions.append(
                CategoryTieSuggestion(
                    category=g.category.value,
                    candidates=candidates,
                    recommended_place_id=o.recommended_place_id,
                    ranking=[
                        TieRanking(
                            place_id=r.place_id,
                            rank=r.rank,
                            psi=r.psi,
                            max_km=r.max_km,
                            total_km=r.total_km,
                            max_min=r.max_min,
                        )
                        for r in o.ranking
                    ],
                    members=[
                        TieMemberCost(
                            member_id=m.member_id,
                            nickname=m.nickname,
                            km=m.km,
                            minutes=m.minutes,
                            rank=m.rank,
                            weight=m.weight,
                        )
                        for m in o.members
                    ],
                    runner_up_psi=o.runner_up_psi,
                    excluded_member_count=excluded,
                    estimated=o.estimated,
                    source=o.source,
                    params=params,
                )
            )
        available = any(s.recommended_place_id is not None for s in suggestions)
        if not available and reason is None:
            reason = UnavailableReason.NO_PLACE_COORDS
        return TieSuggestion(
            available=available,
            reason=None if available else reason.value if reason else None,
            suggestions=suggestions,
        )

    async def travel_ranking(self, room_id: UUID) -> list[UUID]:
        """Thứ hạng place_id cho `POST /voting/resolve {TRAVEL_TIME}` (tính lại Ψ ở server, không tin client).

        Nối thứ hạng của từng loại hoà (tốt → kém, quán thiếu toạ độ cuối loại). Chiến lược nhóm theo (điểm, loại)
        nên chỉ so hạng trong cùng một loại. [] nếu không có hoà / không ai có vị trí.
        """
        outcomes, _, _, _ = await self.compute_ties(room_id, ignore_accepted=True)
        out: list[UUID] = []
        for o in outcomes:
            out.extend(r.place_id for r in o.ranking)
            out.extend(o.unranked)
        return out

    # ── ALGO-03 ───────────────────────────────────────────────────────────────────────────────
    async def schedule_feasibility(self, room_id: UUID) -> ScheduleFeasibility:
        """Tổng kế hoạch của ngày phòng (`day_offset = 0`, vì khung giờ là của một ngày) — §5.

        Mỗi cặp liên tiếp: chặng khởi hành lúc kết thúc mục trước (Google nếu bật, lỗi → ước lượng).
        """
        if self.schedule_repo is None:
            raise RuntimeError("AlgorithmService cần schedule_repo để tính khả thi lịch.")
        room = await self._room(room_id)
        places = await self.place_repo.list_by_room(room_id)
        schedule = await self.schedule_repo.list_by_room(room_id)
        items = plan_items_from_dicts(
            [
                {
                    "id": s.id,
                    "place_id": s.place_id,
                    "day_offset": s.day_offset,
                    "start_minute": s.start_minute,
                    "end_minute": s.end_minute,
                    "order_index": s.order_index,
                }
                for s in schedule
                if (s.day_offset or 0) == 0
            ],
            _place_coords(places),
        )
        estimator = get_travel_estimator()
        legs = []
        unknown = 0
        for curr, nxt in consecutive_pairs(items):
            if curr.coord is None or nxt.coord is None:
                unknown += 1
                continue
            leg = await estimator.aleg(
                curr.coord, nxt.coord, depart_datetime(room.event_date, 0, curr.end_minute)
            )
            legs.append(assess_leg(curr, nxt, leg, room.event_date))
        result = plan_feasibility(room.start_minute, room.end_minute, items, legs, unknown)
        return ScheduleFeasibility(
            window_min=result.window_min,
            required_total_min=result.required_total_min,
            buffer_total_min=result.buffer_total_min,
            is_feasible=result.is_feasible,
            legs=[
                FeasibilityLeg(
                    from_item_id=lg.from_item.item_id,
                    to_item_id=lg.to_item.item_id,
                    eta_min=lg.eta_min,
                    margin_min=lg.margin_min,
                    buffer_min=lg.buffer_min,
                    gap_min=lg.gap_min,
                    slack_min=lg.slack_min,
                    distance_km=round(lg.distance_km, 3),
                    risk=lg.risk.value,
                    peak=lg.peak,
                    source=lg.source.value,
                )
                for lg in result.legs
            ],
            estimated=result.estimated,
            item_count=result.item_count,
            unknown_leg_count=result.unknown_leg_count,
        )

    # ── ALGO-04 ───────────────────────────────────────────────────────────────────────────────
    async def place_priorities(
        self,
        room_id: UUID,
        *,
        places: list[Place] | None = None,
        votes: dict[UUID, dict[str, int]] | None = None,
    ) -> dict[UUID, PlacePriority]:
        """Ưu tiên của mọi quán chưa bị loại (khác REJECTED); quán bị loại không có mục trong kết quả.

        Đồng bộ với estimator (không gọi mạng — chạy sau mỗi phiếu): O(n·m) chặng + O(m log m) sắp.
        """
        room = await self._room(room_id)
        if places is None:
            places = await self.place_repo.list_by_room(room_id)
        active = [p for p in places if _status(p) is not PlaceStatus.REJECTED]
        if not active:
            return {}
        if votes is None:
            votes = await self.vote_repo.get_vote_summary_by_room(room_id)
        members = await self.member_repo.list_by_room(room_id)
        origins = [m.origin for m in self._origins(room, members)[0]]

        coords = _place_coords(active)
        with_coords = [p for p in active if str(p.id) in coords]
        etas: dict[UUID, tuple[int, bool]] = {}
        if origins and with_coords:
            matrix = get_travel_estimator().matrix(
                origins, [coords[str(p.id)] for p in with_coords], self._depart_at(room)
            )
            for j, p in enumerate(with_coords):
                col = [row[j] for row in matrix]
                etas[p.id] = (
                    max(leg.minutes for leg in col),
                    any(leg.source is TravelSource.ESTIMATE for leg in col),
                )

        inputs = [
            PriorityInput(
                place_id=p.id,
                upvotes=votes.get(p.id, {}).get("upvotes", 0),
                created_at=p.created_at,
                open_minute=p.open_minute,
                close_minute=p.close_minute,
                max_eta_min=etas[p.id][0] if p.id in etas else None,
                estimated=etas[p.id][1] if p.id in etas else False,
            )
            for p in active
        ]
        ranked = rank_places(inputs, room.start_minute, room.end_minute, room.event_date)
        return {r.place_id: r for r in ranked}


def _status(p: Place) -> PlaceStatus:
    return p.status if isinstance(p.status, PlaceStatus) else PlaceStatus(str(p.status))


def _category(p: Place) -> PlaceCategory:
    raw = p.category if isinstance(p.category, PlaceCategory) else str(p.category or "OTHER")
    try:
        return PlaceCategory(raw)
    except ValueError:
        return PlaceCategory.OTHER


def _place_coords(places: list[Place]) -> dict[str, tuple[float, float]]:
    return {
        str(p.id): (float(p.latitude), float(p.longitude))
        for p in places
        if p.latitude is not None and p.longitude is not None
    }


def priority_payload(p: PlacePriority) -> dict[str, Any]:
    """Dạng JSON của `priority` trên place summary (REST) và trong `PRIORITY_UPDATED` (CR-12)."""
    return {
        "rank": p.rank,
        "risk": p.risk.value,
        "slack_min": p.slack_min,
        "max_eta_min": p.max_eta_min,
        "labels": [label.value for label in p.labels],
        "estimated": p.estimated,
        "hours_unknown": p.hours_unknown,
        "eta_unknown": p.eta_unknown,
    }


def algorithm_service_for(repo: Any) -> AlgorithmService | None:
    """AlgorithmService dùng CHUNG session của một repo có sẵn (thấy cả thay đổi chưa commit của request).

    Repo giả trong unit test (không có `AsyncSession` thật) → None, nơi gọi bỏ qua phần ALGO-04.
    """
    session = getattr(repo, "session", None)
    if not isinstance(session, AsyncSession):
        return None
    from app.repositories import (
        MemberRepository,
        PlaceRepository,
        RoomRepository,
        ScheduleRepository,
        VoteRepository,
    )

    return AlgorithmService(
        room_repo=RoomRepository(session),
        member_repo=MemberRepository(session),
        place_repo=PlaceRepository(session),
        vote_repo=VoteRepository(session),
        schedule_repo=ScheduleRepository(session),
    )


class PriorityUpdatedEvent(DomainEvent):
    """Thứ tự ưu tiên danh sách bình chọn đổi (PRIORITY_UPDATED, CR-12 phần 2).

    Mang TOÀN BỘ danh sách (rank 1 trước) vì một phiếu có thể đổi hạng của mọi quán; quán bị loại không có mặt.
    Không có toạ độ hay thời gian của từng thành viên — chỉ `max_eta_min` của cả nhóm.
    """

    items: list[dict[str, Any]]

    @property
    def event_type(self) -> str:
        return "PRIORITY_UPDATED"

    def to_envelope_payload(self) -> dict[str, Any]:
        return {"items": self.items}


async def publish_priority_update(room_repo: Any, event_bus: IEventBus | None, room_id: UUID) -> None:
    """Tính lại ALGO-04 TRONG request (cùng session, nên thấy thay đổi vừa làm) rồi phát `PRIORITY_UPDATED` (+1
    `state_version`, ngay sau tin gây ra nó). Gọi sau: phiếu, thêm/sửa/xoá quán, chốt, đổi vị trí thành viên, thành
    viên mới, đổi khung giờ/ngày/điểm hẹn. Phòng chưa có quán nào còn hiệu lực → không phát. Lỗi tính toán không làm
    hỏng thao tác chính (chỉ ghi log)."""
    if event_bus is None:
        return
    service = algorithm_service_for(room_repo)
    if service is None:
        return
    try:
        priorities = await service.place_priorities(room_id)
    except Exception:
        logger.exception("Không tính được ưu tiên quán cho phòng %s", room_id)
        return
    if not priorities:
        return
    items = [
        {"place_id": str(p.place_id), **priority_payload(p)}
        for p in sorted(priorities.values(), key=lambda x: x.rank)
    ]
    await publish_versioned(room_repo, event_bus, PriorityUpdatedEvent(room_id=room_id, items=items))


async def warm_schedule_legs(context: ConflictContext) -> None:
    """Làm ấm cache Google cho các cặp liên tiếp trước khi `TravelTimeConflictRule` (đồng bộ) chạy, để cảnh báo và
    `GET /schedule/feasibility` cùng số. Estimator ước lượng thuần thì không làm gì (không có gì để ấm)."""
    estimator = get_travel_estimator()
    if not isinstance(estimator, CachedEstimator):
        return
    coords = {
        str(p.place_id): (float(p.latitude), float(p.longitude))
        for p in context.places
        if p.latitude is not None and p.longitude is not None
    }
    pairs: list[tuple[PlanItem, PlanItem]] = consecutive_pairs(
        plan_items_from_dicts(context.schedule_items, coords)
    )
    for curr, nxt in pairs:
        if curr.coord is None or nxt.coord is None or nxt.start_minute < curr.end_minute:
            continue
        try:
            await estimator.aleg(
                curr.coord,
                nxt.coord,
                depart_datetime(context.event_date, curr.day_offset, curr.end_minute),
            )
        except Exception:  # Google lỗi → luật đồng bộ tự dùng ước lượng
            logger.exception("Không làm ấm được chặng di chuyển cho phòng %s", context.room_id)
