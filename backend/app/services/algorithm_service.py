"""Algorithm Engine: tâm nhóm (ALGO-01) và gợi ý hoà phiếu (ALGO-02), CR-11/CR-12.

Service lo phần có I/O (đọc phòng/thành viên/quán/phiếu, gọi estimator — Google CHỈ khi có hoà và đã bật qua
`get_travel_estimator`); luật tính nằm ở `app/domain/algorithms` (hàm thuần).
"""

import math
from datetime import datetime, time
from uuid import UUID

from app.core import algo_config as cfg
from app.core.exceptions import RoomNotFoundError
from app.core.time_utils import VIETNAM_TZ
from app.domain.algorithms import (
    TieOutcome,
    TiePlace,
    UnavailableReason,
    compute_group_center,
    decide,
    resolve_origins,
    tied_candidates,
)
from app.domain.algorithms.group_center import within_radius
from app.domain.enums import PlaceStatus
from app.domain.models.member import Member
from app.domain.models.room import Room
from app.domain.patterns.itinerary.travel import Leg, get_travel_estimator
from app.repositories import IMemberRepository, IPlaceRepository, IRoomRepository, IVoteRepository
from app.schemas.algorithm import (
    GroupCenterResponse,
    LatLng,
    TieCandidate,
    TieLeg,
    TieMemberInfo,
    TieRanking,
    TieSuggestion,
)
from app.schemas.poi import PoiResponse
from app.services.poi_service import PoiService, get_poi_service

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
    ) -> None:
        self.room_repo = room_repo
        self.member_repo = member_repo
        self.place_repo = place_repo
        self.vote_repo = vote_repo
        self._poi_service = poi_service

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

    async def compute_tie(
        self, room_id: UUID, *, ignore_accepted: bool = False
    ) -> tuple[TieOutcome | None, UnavailableReason | None, int, list[TiePlace]]:
        """(kết quả, lý do không có, số người bị loại, ứng viên hoà). Kết quả None khi không tính được."""
        room = await self._room(room_id)
        places = await self.place_repo.list_by_room(room_id)
        votes = await self.vote_repo.get_vote_summary_by_room(room_id)
        tie_places = [
            TiePlace(
                place_id=p.id,
                name=p.name,
                status=p.status if isinstance(p.status, PlaceStatus) else PlaceStatus(p.status),
                upvotes=votes.get(p.id, {}).get("upvotes", 0),
                created_at=p.created_at,
                coord=(p.latitude, p.longitude)
                if p.latitude is not None and p.longitude is not None
                else None,
            )
            for p in places
        ]
        tied = tied_candidates(tie_places, ignore_accepted=ignore_accepted)
        if not tied:
            return None, UnavailableReason.NO_TIE, 0, []

        members = [m for m in await self.member_repo.list_by_room(room_id) if m.is_active]
        meeting = (
            (room.origin_lat, room.origin_lng)
            if room.origin_lat is not None and room.origin_lng is not None
            else None
        )
        tie_members, excluded = resolve_origins(
            [
                (
                    m.id,
                    m.nickname,
                    (m.origin_lat, m.origin_lng)
                    if m.origin_lat is not None and m.origin_lng is not None
                    else None,
                )
                for m in members
            ],
            meeting,
        )
        if not tie_members:
            return None, UnavailableReason.NO_ORIGINS, excluded, tied

        rankable = [j for j, p in enumerate(tied) if p.coord is not None]
        if not rankable:
            return None, UnavailableReason.NO_PLACE_COORDS, excluded, tied

        # Google (nếu bật) chỉ được gọi ở đây — sau khi đã chắc có hoà và đủ dữ liệu; lỗi → ước lượng
        fetched = await get_travel_estimator().amatrix(
            [m.origin for m in tie_members],
            [tied[j].coord for j in rankable],  # type: ignore[misc]
            self._depart_at(room),
        )
        matrix: list[list[Leg | None]] = [[None] * len(tied) for _ in tie_members]
        for i, row in enumerate(fetched):
            for col, j in enumerate(rankable):
                matrix[i][j] = row[col]
        return decide(tied, tie_members, matrix), None, excluded, tied

    async def tie_suggestion(self, room_id: UUID) -> TieSuggestion:
        outcome, reason, excluded, tied = await self.compute_tie(room_id)
        base = {"threshold_min": cfg.TIE_THRESHOLD_MIN, "travel_mode": cfg.TRAVEL_MODE}
        candidates = [TieCandidate(place_id=p.place_id, name=p.name, upvotes=p.upvotes) for p in tied]
        if outcome is None:
            return TieSuggestion(
                available=False,
                reason=reason.value if reason else None,
                candidates=candidates,
                excluded_member_count=excluded,
                **base,
            )
        return TieSuggestion(
            available=True,
            candidates=candidates,
            members=[
                TieMemberInfo(
                    member_id=m.member_id, nickname=m.nickname, origin_source=m.origin_source.value
                )
                for m in outcome.members
            ],
            matrix=[
                [
                    None
                    if leg is None
                    else TieLeg(
                        minutes=leg.minutes,
                        distance_km=round(leg.distance_km, 3),
                        source=leg.source.value,
                    )
                    for leg in row
                ]
                for row in outcome.matrix
            ],
            ranking=[
                TieRanking(
                    place_id=r.place_id,
                    rank=r.rank,
                    total_min=r.total_min,
                    max_min=r.max_min,
                    total_km=r.total_km,
                )
                for r in outcome.ranking
            ],
            unranked_place_ids=list(outcome.unranked),
            recommended_place_id=outcome.recommended_place_id,
            margin_vs_second_min=outcome.margin_vs_second_min,
            excluded_member_count=excluded,
            estimated=outcome.estimated,
            **base,
        )

    async def travel_ranking(self, room_id: UUID) -> list[UUID]:
        """Thứ hạng place_id (tốt → kém) cho `POST /voting/resolve` (tính lại ở server); [] nếu không có hoà."""
        outcome, _, _, _ = await self.compute_tie(room_id, ignore_accepted=True)
        if outcome is None:
            return []
        return [r.place_id for r in outcome.ranking] + list(outcome.unranked)
