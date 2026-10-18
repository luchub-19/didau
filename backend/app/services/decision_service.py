import logging
import secrets
from collections import defaultdict
from datetime import timedelta
from typing import Any
from uuid import UUID

from app.core.exceptions import (
    AppException,
    ForbiddenHostOnlyError,
    RoomNotFoundError,
    ValidationError,
)
from app.core.time_utils import now_utc
from app.domain.enums import (
    DecisionMode,
    DecisionStatus,
    MemberRole,
    PlaceStatus,
    TieBreakStrategyName,
)
from app.domain.models.member import Member
from app.domain.patterns.decision.randomizers import LadderGenerator, WheelPicker
from app.domain.patterns.decision.smart_pick import SmartPickContext, SmartPickScorer
from app.domain.patterns.decision.trigger import DeciderTrigger
from app.domain.patterns.event_bus import IEventBus
from app.domain.patterns.event_bus.events import (
    DecisionProgressEvent,
    DecisionResolvedEvent,
    DecisionStartedEvent,
)
from app.repositories import (
    IDecisionRepository,
    IMemberRepository,
    IPlaceRepository,
    IRoomRepository,
    IVoteRepository,
)
from app.schemas.decision import CreateDecisionRequest, SubmitSwipeRequest
from app.services.voting_service import VotingService

logger = logging.getLogger(__name__)


def _extract_uuid(val: Any) -> UUID:
    if isinstance(val, UUID):
        return val
    if isinstance(val, dict):
        v = val.get("id") or val.get("place_id")
        return UUID(str(v))
    v = getattr(val, "id", None) or getattr(val, "place_id", None)
    if v:
        return UUID(str(v))
    return UUID(str(val))


class DecisionService:
    """Application Service quản lý nghiệp vụ phiên Chọn hộ theo CR-02."""

    def __init__(
        self,
        decision_repo: IDecisionRepository,
        room_repo: IRoomRepository,
        place_repo: IPlaceRepository,
        member_repo: IMemberRepository,
        vote_repo: IVoteRepository,
        voting_service: VotingService,
        event_bus: IEventBus,
    ) -> None:
        self.decision_repo = decision_repo
        self.room_repo = room_repo
        self.place_repo = place_repo
        self.member_repo = member_repo
        self.vote_repo = vote_repo
        self.voting_service = voting_service
        self.event_bus = event_bus

    async def get_hints(self, room_id: UUID) -> dict[str, Any]:
        """Lấy gợi ý kích hoạt chọn hộ và danh sách top 3 smart picks."""
        room = await self.room_repo.get_by_id(room_id)
        if room is None:
            raise RoomNotFoundError(
                message="Không tìm thấy phòng với thông tin yêu cầu.",
                details={"room_id": str(room_id)},
            )

        places = await self.place_repo.list_by_room(room_id)
        vote_summary = await self.vote_repo.get_vote_summary_by_room(room_id)
        members = await self.member_repo.list_by_room(room_id)

        # 1. Chuẩn bị dữ liệu cho DeciderTrigger
        trigger_places: list[dict[str, Any]] = []
        for p in places:
            summary = vote_summary.get(p.id, {"upvotes": 0, "downvotes": 0, "score": 0})
            cat_val = p.category.value if hasattr(p.category, "value") else str(p.category)
            status_val = p.status.value if hasattr(p.status, "value") else str(p.status)
            trigger_places.append({
                "id": p.id,
                "name": p.name,
                "category": cat_val,
                "status": status_val,
                "created_at": p.created_at,
                "score": summary["score"],
                "upvotes": summary["upvotes"],
                "downvotes": summary["downvotes"],
            })

        hints = DeciderTrigger.evaluate(
            places=trigger_places,
            votes=(),
            members=members,
            now=now_utc(),
        )

        # 2. Chuẩn bị dữ liệu cho SmartPickScorer
        already_accepted: list[str] = [
            (p.category.value if hasattr(p.category, "value") else str(p.category))
            for p in places
            if (p.status.value if hasattr(p.status, "value") else str(p.status)) == PlaceStatus.ACCEPTED.value
        ]

        ctx = SmartPickContext(
            origin_lat=room.origin_lat,
            origin_lng=room.origin_lng,
            target_minute=room.start_minute,
            target_date=room.event_date,
            budget_limit=room.budget_limit,
            already_accepted_categories=already_accepted,
        )

        candidates = [
            p for p in places
            if (p.status.value if hasattr(p.status, "value") else str(p.status))
            not in (PlaceStatus.REJECTED.value, PlaceStatus.VISITED.value)
        ]

        scored_candidates: list[dict[str, Any]] = []
        for p in candidates:
            summary = vote_summary.get(p.id, {"upvotes": 0, "downvotes": 0, "score": 0})
            scored_candidates.append({
                "id": p.id,
                "name": p.name,
                "category": p.category,
                "status": p.status,
                "latitude": p.latitude,
                "longitude": p.longitude,
                "open_minute": p.open_minute,
                "close_minute": p.close_minute,
                "opening_hours_raw": p.opening_hours_raw,
                "estimated_cost": p.estimated_cost,
                "score": summary["score"],
            })

        ranked_picks = SmartPickScorer().rank(scored_candidates, ctx)
        top_picks = ranked_picks[:3]

        return {
            "hints": hints,
            "smart_picks": top_picks,
        }

    async def create_decision_session(
        self,
        room_id: UUID,
        host_member: Member,
        payload: CreateDecisionRequest,
    ) -> dict[str, Any]:
        """Tạo một phiên Chọn hộ mới (chỉ Host)."""
        role_val = host_member.role.value if hasattr(host_member.role, "value") else str(host_member.role)
        if role_val != MemberRole.HOST.value:
            raise ForbiddenHostOnlyError(
                message="Chỉ Chủ phòng (HOST) mới có quyền tạo phiên chọn hộ.",
                details={"member_id": str(host_member.id), "role": role_val},
            )

        room = await self.room_repo.get_by_id(room_id)
        if room is None:
            raise RoomNotFoundError(
                message="Không tìm thấy phòng với thông tin yêu cầu.",
                details={"room_id": str(room_id)},
            )

        # Kiểm tra phiên OPEN hiện có
        existing = await self.decision_repo.get_open_session_by_room(room_id)
        if existing is not None:
            if existing.closes_at and now_utc() > existing.closes_at:
                await self.decision_repo.update_session(existing.id, {"status": DecisionStatus.EXPIRED.value})
            else:
                raise AppException(
                    code="CONFLICT",
                    message="Phòng đã có phiên chọn hộ đang mở",
                    status_code=409,
                    details={"session_id": str(existing.id)},
                )

        # Lấy danh sách quán ứng viên
        all_places = await self.place_repo.list_by_room(room_id)
        all_places_map = {p.id: p for p in all_places}

        candidates = []
        if payload.candidate_place_ids:
            for cid in payload.candidate_place_ids:
                if cid not in all_places_map:
                    raise ValidationError(
                        message=f"Địa điểm {cid} không thuộc phòng này.",
                        details={"place_id": str(cid)},
                    )
                candidates.append(all_places_map[cid])
        else:
            filtered = list(all_places)
            if payload.category:
                cat_filter = (
                    payload.category.value
                    if hasattr(payload.category, "value")
                    else str(payload.category)
                )
                filtered = [
                    p for p in filtered
                    if (p.category.value if hasattr(p.category, "value") else str(p.category)) == cat_filter
                ]
            candidates = [
                p for p in filtered
                if (p.status.value if hasattr(p.status, "value") else str(p.status))
                not in (PlaceStatus.REJECTED.value, PlaceStatus.VISITED.value)
            ]

        if not candidates:
            raise ValidationError(message="Không có địa điểm ứng viên hợp lệ để tạo phiên chọn hộ.")

        candidate_ids = [p.id for p in candidates]
        mode_val = payload.mode.value if hasattr(payload.mode, "value") else str(payload.mode).upper()

        if mode_val == DecisionMode.LADDER.value and len(candidate_ids) < 2:
            raise ValidationError(message="Thang may mắn cần ít nhất 2 địa điểm ứng viên.")

        seed = secrets.randbits(48) + 1
        result_place_id: UUID | None = None
        result_payload: dict[str, Any] | None = None
        closes_at = None

        vote_summary = await self.vote_repo.get_vote_summary_by_room(room_id)

        if mode_val == DecisionMode.SMART.value:
            scored_candidates: list[dict[str, Any]] = []
            for p in candidates:
                s = vote_summary.get(p.id, {"score": 0})
                scored_candidates.append({
                    "id": p.id,
                    "name": p.name,
                    "category": p.category,
                    "status": p.status,
                    "latitude": p.latitude,
                    "longitude": p.longitude,
                    "open_minute": p.open_minute,
                    "close_minute": p.close_minute,
                    "opening_hours_raw": p.opening_hours_raw,
                    "estimated_cost": p.estimated_cost,
                    "score": s["score"],
                })
            ctx = SmartPickContext(
                origin_lat=room.origin_lat,
                origin_lng=room.origin_lng,
                target_minute=room.start_minute,
                target_date=room.event_date,
                budget_limit=room.budget_limit,
            )
            picks = SmartPickScorer().rank(scored_candidates, ctx)
            if picks:
                result_place_id = picks[0].place_id
                result_payload = {
                    "score": picks[0].score,
                    "reasons": picks[0].reasons,
                    "reason_codes": picks[0].reason_codes,
                }
            else:
                result_place_id = candidate_ids[0]
                result_payload = {}

        elif mode_val == DecisionMode.WHEEL.value:
            candidate_items = [{"id": p.id, "name": p.name} for p in candidates]
            weights = (
                [max(1.0, float(vote_summary.get(p.id, {}).get("score", 0) + 1)) for p in candidates]
                if payload.weighted
                else None
            )
            wheel_res = WheelPicker.pick(candidate_items, weights=weights, seed=seed)
            result_place_id = _extract_uuid(wheel_res.winner)
            result_payload = {
                "stop_angle_deg": wheel_res.stop_angle_deg,
                "winner_index": wheel_res.winner_index,
            }

        elif mode_val == DecisionMode.LADDER.value:
            ladder_res = LadderGenerator.generate(n_columns=len(candidates), seed=seed)
            winning_top_col = ladder_res.winning_top_column
            result_place_id = candidate_ids[winning_top_col]
            result_payload = ladder_res.model_dump(mode="json")

        elif mode_val == DecisionMode.SWIPE.value:
            result_place_id = None
            result_payload = None
            closes_at = now_utc() + timedelta(seconds=90)
        else:
            raise ValidationError(message=f"Chế độ chọn '{mode_val}' không hợp lệ.")

        session_data: dict[str, Any] = {
            "room_id": room_id,
            "mode": mode_val,
            "status": DecisionStatus.OPEN.value,
            "category": str(payload.category) if payload.category else None,
            "candidate_place_ids": [str(cid) for cid in candidate_ids],
            "seed": seed,
            "result_place_id": result_place_id,
            "result_payload": result_payload,
            "created_by_id": host_member.id,
            "closes_at": closes_at,
        }

        session = await self.decision_repo.create_session(session_data)

        # Phát tán sự kiện DECISION_STARTED qua EventBus
        event = DecisionStartedEvent(
            room_id=room_id,
            session_id=session.id,
            mode=session.mode,
            candidate_place_ids=session.candidate_place_ids,
            seed=session.seed,
            result_place_id=session.result_place_id,
            result_payload=session.result_payload,
            closes_at=session.closes_at,
        )
        await self.event_bus.publish(event)

        logger.info(
            "Đã tạo phiên chọn hộ %s (mode=%s) trong phòng %s với seed=%d",
            session.id,
            session.mode,
            room_id,
            seed,
        )

        return {
            "session": session,
            "seed": seed,
            "result_place_id": result_place_id,
            "result_payload": result_payload,
        }

    async def submit_swipe(
        self,
        room_id: UUID,
        session_id: UUID,
        member: Member,
        payload: SubmitSwipeRequest,
    ) -> dict[str, Any]:
        """Ghi nhận lượt quẹt thẻ (like/dislike) trong chế độ SWIPE."""
        session = await self.decision_repo.get_by_id(session_id)
        if session is None or session.room_id != room_id:
            raise AppException(
                code="NOT_FOUND",
                message="Không tìm thấy phiên chọn hộ.",
                status_code=404,
                details={"session_id": str(session_id)},
            )

        if session.mode != DecisionMode.SWIPE.value:
            raise ValidationError(message="Phiên chọn hộ này không ở chế độ SWIPE.")

        if session.status != DecisionStatus.OPEN.value:
            raise ValidationError(message="Phiên không tồn tại hoặc đã đóng.")

        if session.closes_at and now_utc() > session.closes_at:
            await self.decision_repo.update_session(session.id, {"status": DecisionStatus.EXPIRED.value})
            raise ValidationError(message="Phiên chọn hộ đã hết hạn.")

        cand_str_set = {str(cid) for cid in session.candidate_place_ids}
        if str(payload.place_id) not in cand_str_set:
            raise ValidationError(
                message="Địa điểm không nằm trong danh sách ứng viên của phiên.",
                details={"place_id": str(payload.place_id)},
            )

        # Upsert swipe
        await self.decision_repo.upsert_swipe(
            session_id=session.id,
            member_id=member.id,
            place_id=payload.place_id,
            liked=payload.liked,
        )

        # Tính toán tiến độ người tham gia
        swipes = await self.decision_repo.list_swipes_by_session(session.id)
        members_in_room = await self.member_repo.list_by_room(room_id)
        total_members = len(members_in_room)

        member_swiped_places: dict[UUID, set[str]] = defaultdict(set)
        for s in swipes:
            member_swiped_places[s.member_id].add(str(s.place_id))

        done_member_ids = [
            mid for mid, swiped_set in member_swiped_places.items()
            if cand_str_set.issubset(swiped_set)
        ]

        # Phát sự kiện DECISION_PROGRESS
        progress_event = DecisionProgressEvent(
            room_id=room_id,
            session_id=session.id,
            done_member_ids=done_member_ids,
            total_members=total_members,
        )
        await self.event_bus.publish(progress_event)

        # Nếu toàn bộ thành viên đã hoàn thành quẹt, tự động tổng hợp kết quả
        if total_members > 0 and len(done_member_ids) >= total_members:
            likes_count: dict[str, int] = {str(cid): 0 for cid in session.candidate_place_ids}
            for s in swipes:
                if s.liked and str(s.place_id) in likes_count:
                    likes_count[str(s.place_id)] += 1

            max_likes = max(likes_count.values()) if likes_count else 0
            top_candidates = [cid for cid, count in likes_count.items() if count == max_likes]

            if len(top_candidates) == 1:
                winner_id = UUID(top_candidates[0])
                result_payload = {"tally": likes_count, "winner_place_id": str(winner_id)}
            else:
                # Hòa phiếu -> tự động quay vòng quay giữa các quán hòa
                wheel_candidates = [{"id": UUID(cid)} for cid in top_candidates]
                wheel_res = WheelPicker.pick(wheel_candidates, seed=session.seed)
                winner_id = _extract_uuid(wheel_res.winner)
                result_payload = {
                    "tally": likes_count,
                    "tied_place_ids": top_candidates,
                    "sub_wheel": {
                        "stop_angle_deg": wheel_res.stop_angle_deg,
                        "winner_index": wheel_res.winner_index,
                    },
                }

            await self.decision_repo.update_session(
                session.id,
                {
                    "result_place_id": winner_id,
                    "result_payload": result_payload,
                },
            )
            session.result_place_id = winner_id
            session.result_payload = result_payload

        return {
            "success": True,
            "session_id": session.id,
            "place_id": payload.place_id,
            "liked": payload.liked,
        }

    async def accept_decision(
        self,
        room_id: UUID,
        session_id: UUID,
        host_member: Member,
    ) -> dict[str, Any]:
        """Host chấp nhận kết quả phiên Chọn hộ và áp dụng vào phòng (ACCEPTED)."""
        role_val = host_member.role.value if hasattr(host_member.role, "value") else str(host_member.role)
        if role_val != MemberRole.HOST.value:
            raise ForbiddenHostOnlyError(
                message="Chỉ Chủ phòng (HOST) mới có quyền chốt kết quả phiên chọn hộ.",
                details={"member_id": str(host_member.id), "role": role_val},
            )

        session = await self.decision_repo.get_by_id(session_id)
        if session is None or session.room_id != room_id:
            raise AppException(
                code="NOT_FOUND",
                message="Không tìm thấy phiên chọn hộ",
                status_code=404,
                details={"session_id": str(session_id)},
            )

        if session.status in (DecisionStatus.CANCELLED.value, DecisionStatus.EXPIRED.value):
            raise ValidationError(message="Không thể chấp nhận phiên đã bị hủy hoặc hết hạn.")

        if session.result_place_id is None:
            # Nếu là Swipe chưa đủ người nhưng Host muốn chốt sớm, tổng hợp các swipe hiện có
            swipes = await self.decision_repo.list_swipes_by_session(session.id)
            if swipes:
                likes_count: dict[str, int] = {str(cid): 0 for cid in session.candidate_place_ids}
                for s in swipes:
                    if s.liked and str(s.place_id) in likes_count:
                        likes_count[str(s.place_id)] += 1
                max_likes = max(likes_count.values()) if likes_count else 0
                top_candidates = [cid for cid, count in likes_count.items() if count == max_likes]
                if len(top_candidates) == 1:
                    session.result_place_id = UUID(top_candidates[0])
                else:
                    wheel_candidates = [{"id": UUID(cid)} for cid in top_candidates]
                    wheel_res = WheelPicker.pick(wheel_candidates, seed=session.seed)
                    session.result_place_id = _extract_uuid(wheel_res.winner)
            else:
                session.result_place_id = UUID(str(session.candidate_place_ids[0]))

        # Cập nhật trạng thái session sang RESOLVED
        updated_session = await self.decision_repo.update_session(
            session.id,
            {
                "status": DecisionStatus.RESOLVED.value,
                "result_place_id": session.result_place_id,
            },
        )
        if updated_session:
            session = updated_session

        # Áp dụng kết quả qua VotingService
        await self.voting_service.resolve_voting(
            room_id=room_id,
            host_member=host_member,
            strategy_name=TieBreakStrategyName.GROUP_DECISION.value,
            max_accepted_places=1,
            explicit_accepted_place_ids=[session.result_place_id],
        )

        # Phát sự kiện DECISION_RESOLVED
        resolved_event = DecisionResolvedEvent(
            room_id=room_id,
            session_id=session.id,
            result_place_id=session.result_place_id,
            status=DecisionStatus.RESOLVED.value,
        )
        await self.event_bus.publish(resolved_event)

        resolved_place = await self.place_repo.get_by_id(session.result_place_id)
        resolved_place_data: dict[str, Any] | None = None
        if resolved_place:
            cat_val = (
                resolved_place.category.value
                if hasattr(resolved_place.category, "value")
                else str(resolved_place.category)
            )
            status_val = (
                resolved_place.status.value
                if hasattr(resolved_place.status, "value")
                else str(resolved_place.status)
            )
            source_val = (
                resolved_place.source.value
                if hasattr(resolved_place.source, "value")
                else str(resolved_place.source or "MANUAL")
            )
            resolved_place_data = {
                "id": resolved_place.id,
                "room_id": resolved_place.room_id,
                "name": resolved_place.name,
                "address": resolved_place.address,
                "latitude": resolved_place.latitude,
                "longitude": resolved_place.longitude,
                "category": cat_val,
                "status": status_val,
                "source": source_val,
                "external_id": resolved_place.external_id,
                "google_place_id": resolved_place.google_place_id,
                "cuisine": resolved_place.cuisine,
                "opening_hours_raw": resolved_place.opening_hours_raw,
                "coords_source": resolved_place.coords_source,
                "coords_fetched_at": resolved_place.coords_fetched_at,
                "url": resolved_place.url,
                "notes": resolved_place.notes,
                "estimated_cost": int(resolved_place.estimated_cost or 0),
                "open_minute": resolved_place.open_minute,
                "close_minute": resolved_place.close_minute,
                "submitted_by_id": resolved_place.submitted_by_id,
                "created_at": resolved_place.created_at or now_utc(),
                "updated_at": resolved_place.updated_at,
            }

        return {
            "session": session,
            "resolved_place": resolved_place_data,
            "strategy": TieBreakStrategyName.GROUP_DECISION.value,
        }

    async def cancel_decision(
        self,
        room_id: UUID,
        session_id: UUID,
        host_member: Member,
    ) -> dict[str, Any]:
        """Host hủy phiên Chọn hộ đang diễn ra."""
        role_val = host_member.role.value if hasattr(host_member.role, "value") else str(host_member.role)
        if role_val != MemberRole.HOST.value:
            raise ForbiddenHostOnlyError(
                message="Chỉ Chủ phòng (HOST) mới có quyền hủy phiên chọn hộ.",
                details={"member_id": str(host_member.id), "role": role_val},
            )

        session = await self.decision_repo.get_by_id(session_id)
        if session is None or session.room_id != room_id:
            raise AppException(
                code="NOT_FOUND",
                message="Không tìm thấy phiên chọn hộ",
                status_code=404,
                details={"session_id": str(session_id)},
            )

        updated_session = await self.decision_repo.update_session(
            session.id,
            {"status": DecisionStatus.CANCELLED.value},
        )
        if updated_session:
            session = updated_session

        resolved_event = DecisionResolvedEvent(
            room_id=room_id,
            session_id=session.id,
            result_place_id=None,
            status=DecisionStatus.CANCELLED.value,
        )
        await self.event_bus.publish(resolved_event)

        return {"session": session}
