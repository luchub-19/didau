import logging
from typing import Any
from uuid import UUID

from app.core.exceptions import (
    ForbiddenHostOnlyError,
    PlaceNotFoundError,
    RoomNotFoundError,
    RoomStatusInvalidError,
    ValidationError,
)
from app.core.time_utils import now_utc
from app.domain.enums import (
    MemberRole,
    PlaceCategory,
    PlaceStatus,
    RoomStatus,
    TieBreakStrategyName,
)
from app.domain.models.member import Member
from app.domain.patterns.event_bus import (
    IEventBus,
    PlaceStatusChangedEvent,
    VoteCastEvent,
    VotingResolvedEvent,
)
from app.domain.patterns.tie_break import (
    PlaceVoteSummary,
    TieBreakContext,
    TieBreakStrategyFactory,
    resolve_voting_with_tie_break,
)
from app.repositories import IMemberRepository, IPlaceRepository, IRoomRepository, IVoteRepository

logger = logging.getLogger(__name__)


class VotingService:
    """Application Service quản lý nghiệp vụ bỏ phiếu, hủy phiếu và chốt kết quả bình chọn."""

    def __init__(
        self,
        vote_repo: IVoteRepository,
        place_repo: IPlaceRepository,
        room_repo: IRoomRepository,
        member_repo: IMemberRepository,
        event_bus: IEventBus,
        tie_break_factory: TieBreakStrategyFactory | None = None,
    ) -> None:
        self.vote_repo = vote_repo
        self.place_repo = place_repo
        self.room_repo = room_repo
        self.member_repo = member_repo
        self.event_bus = event_bus
        self.tie_break_factory = tie_break_factory or TieBreakStrategyFactory()

    async def _get_vote_summary_for_place(
        self,
        room_id: UUID,
        place_id: UUID,
    ) -> dict[str, int]:
        """Lấy tổng hợp điểm vote cho một địa điểm cụ thể."""
        summary = await self.vote_repo.get_vote_summary_by_room(room_id)
        return summary.get(place_id, {"upvotes": 0, "downvotes": 0, "score": 0})

    async def cast_vote(
        self,
        room_id: UUID,
        place_id: UUID,
        member_id: UUID,
        vote_value: int,
    ) -> dict[str, Any]:
        """Bỏ phiếu hoặc thay đổi phiếu cho một địa điểm.

        Args:
            room_id: UUID của phòng.
            place_id: UUID của địa điểm.
            member_id: UUID của thành viên bỏ phiếu.
            vote_value: Giá trị phiếu: 1 (Upvote), -1 (Downvote), 0 (Neutral/Rút phiếu).

        Returns:
            Dict chứa place_id, upvotes, downvotes, score, current_user_vote.
        """
        # 1. Validate vote_value
        if vote_value not in (1, -1, 0):
            raise ValidationError(
                message="Giá trị phiếu bầu phải là 1, -1 hoặc 0.",
                details={"vote_value": vote_value},
            )

        # 2. Kiểm tra phòng tồn tại
        room = await self.room_repo.get_by_id(room_id)
        if room is None:
            raise RoomNotFoundError(
                message="Không tìm thấy phòng với mã yêu cầu.",
                details={"room_id": str(room_id)},
            )

        # 3. Kiểm tra trạng thái phòng cho phép vote
        room_status_str = (
            room.status.value if isinstance(room.status, RoomStatus) else str(room.status)
        )
        if room_status_str in (
            RoomStatus.FINALIZED.value,
            RoomStatus.COMPLETED.value,
            RoomStatus.ARCHIVED.value,
        ):
            raise RoomStatusInvalidError(
                message="Không thể bỏ phiếu trong phòng đã chốt, hoàn tất hoặc lưu trữ.",
                details={"room_id": str(room_id), "status": room_status_str},
            )

        # 4. Kiểm tra địa điểm tồn tại và thuộc phòng
        place = await self.place_repo.get_by_id(place_id)
        if place is None or place.room_id != room_id:
            raise PlaceNotFoundError(
                message="Không tìm thấy địa điểm được yêu cầu trong phòng này.",
                details={"place_id": str(place_id), "room_id": str(room_id)},
            )

        # 5. Upsert vote
        await self.vote_repo.upsert_vote(
            place_id=place_id,
            member_id=member_id,
            vote_value=vote_value,
        )

        # 6. Lấy tổng hợp điểm vote mới
        vote_summary = await self._get_vote_summary_for_place(room_id, place_id)

        # 7. Phát sự kiện VoteCastEvent qua EventBus
        event = VoteCastEvent(
            room_id=room_id,
            place_id=place_id,
            member_id=member_id,
            vote_value=vote_value,
            upvotes=vote_summary["upvotes"],
            downvotes=vote_summary["downvotes"],
            score=vote_summary["score"],
        )
        await self.event_bus.publish(event)

        logger.info(
            "Thành viên %s đã bỏ phiếu %d cho địa điểm %s trong phòng %s",
            member_id,
            vote_value,
            place_id,
            room_id,
        )

        return {
            "place_id": place_id,
            "upvotes": vote_summary["upvotes"],
            "downvotes": vote_summary["downvotes"],
            "score": vote_summary["score"],
            "current_user_vote": vote_value,
        }

    async def retract_vote(
        self,
        room_id: UUID,
        place_id: UUID,
        member_id: UUID,
    ) -> dict[str, Any]:
        """Rút/Hủy lá phiếu bầu của thành viên cho một địa điểm.

        Args:
            room_id: UUID của phòng.
            place_id: UUID của địa điểm.
            member_id: UUID của thành viên hủy phiếu.

        Returns:
            Dict chứa place_id, upvotes, downvotes, score, current_user_vote (luôn = 0).
        """
        # 1. Kiểm tra phòng tồn tại
        room = await self.room_repo.get_by_id(room_id)
        if room is None:
            raise RoomNotFoundError(
                message="Không tìm thấy phòng với mã yêu cầu.",
                details={"room_id": str(room_id)},
            )

        # 2. Kiểm tra trạng thái phòng cho phép rút phiếu
        room_status_str = (
            room.status.value if isinstance(room.status, RoomStatus) else str(room.status)
        )
        if room_status_str in (
            RoomStatus.FINALIZED.value,
            RoomStatus.COMPLETED.value,
            RoomStatus.ARCHIVED.value,
        ):
            raise RoomStatusInvalidError(
                message="Không thể rút phiếu trong phòng đã chốt, hoàn tất hoặc lưu trữ.",
                details={"room_id": str(room_id), "status": room_status_str},
            )

        # 3. Kiểm tra địa điểm tồn tại và thuộc phòng
        place = await self.place_repo.get_by_id(place_id)
        if place is None or place.room_id != room_id:
            raise PlaceNotFoundError(
                message="Không tìm thấy địa điểm được yêu cầu trong phòng này.",
                details={"place_id": str(place_id), "room_id": str(room_id)},
            )

        # 4. Xóa phiếu bầu
        await self.vote_repo.delete_vote(place_id=place_id, member_id=member_id)

        # 4. Lấy tổng hợp điểm vote mới
        vote_summary = await self._get_vote_summary_for_place(room_id, place_id)

        # 5. Phát sự kiện VoteCastEvent (vote_value = 0 biểu thị hủy phiếu)
        event = VoteCastEvent(
            room_id=room_id,
            place_id=place_id,
            member_id=member_id,
            vote_value=0,
            upvotes=vote_summary["upvotes"],
            downvotes=vote_summary["downvotes"],
            score=vote_summary["score"],
        )
        await self.event_bus.publish(event)

        logger.info(
            "Thành viên %s đã rút phiếu bầu cho địa điểm %s trong phòng %s",
            member_id,
            place_id,
            room_id,
        )

        return {
            "place_id": place_id,
            "upvotes": vote_summary["upvotes"],
            "downvotes": vote_summary["downvotes"],
            "score": vote_summary["score"],
            "current_user_vote": 0,
        }

    async def resolve_voting(
        self,
        room_id: UUID,
        host_member: Member,
        strategy_name: str,
        max_accepted_places: int = 1,
        explicit_accepted_place_ids: list[UUID] | None = None,
    ) -> dict[str, Any]:
        """Chốt kết quả bình chọn bằng chiến lược TieBreak hoặc GROUP_DECISION (chỉ HOST).

        Args:
            room_id: UUID của phòng.
            host_member: Đối tượng Member của Chủ phòng (HOST).
            strategy_name: Tên chiến lược phân định hòa phiếu.
            max_accepted_places: Số lượng địa điểm tối đa được chấp nhận.
            explicit_accepted_place_ids: Danh sách địa điểm thắng chỉ định sẵn (cho GROUP_DECISION).

        Returns:
            Dict chứa resolved_places, tie_break_applied, tie_break_strategy.
        """
        # 1. Kiểm tra role HOST
        role_val = (
            host_member.role.value
            if isinstance(host_member.role, MemberRole)
            else str(host_member.role)
        )
        if role_val != MemberRole.HOST.value:
            raise ForbiddenHostOnlyError(
                message="Chỉ Chủ phòng (HOST) mới có quyền chốt kết quả bình chọn.",
                details={"member_id": str(host_member.id), "role": role_val},
            )

        # 2. Kiểm tra phòng tồn tại
        room = await self.room_repo.get_by_id(room_id)
        if room is None:
            raise RoomNotFoundError(
                message="Không tìm thấy phòng với mã yêu cầu.",
                details={"room_id": str(room_id)},
            )

        # 3. Lấy danh sách địa điểm và vote summary
        places = await self.place_repo.list_by_room(room_id)
        vote_summary = await self.vote_repo.get_vote_summary_by_room(room_id)

        is_group_decision = (
            strategy_name.strip().upper() == TieBreakStrategyName.GROUP_DECISION.value
        )

        if is_group_decision:
            strategy_key = TieBreakStrategyName.GROUP_DECISION.value
            accepted_set = set(explicit_accepted_place_ids or [])
            resolved_places = []
            for p in places:
                if p.id in accepted_set:
                    summary = vote_summary.get(p.id, {"upvotes": 0, "downvotes": 0, "score": 0})
                    category_val = (
                        p.category if isinstance(p.category, PlaceCategory) else PlaceCategory(p.category)
                    )
                    resolved_places.append(
                        PlaceVoteSummary(
                            place_id=p.id,
                            name=p.name,
                            category=category_val,
                            status=PlaceStatus.ACCEPTED,
                            submitted_by_id=p.submitted_by_id,
                            estimated_cost=int(p.estimated_cost or 0),
                            open_minute=p.open_minute,
                            close_minute=p.close_minute,
                            created_at=p.created_at or now_utc(),
                            upvotes=summary["upvotes"],
                            downvotes=summary["downvotes"],
                            score=summary["score"],
                        )
                    )
            tie_break_applied = True
        else:
            # Lấy strategy từ factory (sẽ raise InvalidStrategyError nếu không hợp lệ)
            strategy = self.tie_break_factory.get_strategy(strategy_name)
            strategy_key = strategy.strategy_name

            # Xây dựng danh sách PlaceVoteSummary cho hàm resolve
            candidates: list[PlaceVoteSummary] = []
            for p in places:
                summary = vote_summary.get(p.id, {"upvotes": 0, "downvotes": 0, "score": 0})
                category_val = (
                    p.category if isinstance(p.category, PlaceCategory) else PlaceCategory(p.category)
                )
                status_val = p.status if isinstance(p.status, PlaceStatus) else PlaceStatus(p.status)

                # Chỉ lấy địa điểm chưa bị REJECTED hoặc VISITED
                if status_val in (PlaceStatus.REJECTED, PlaceStatus.VISITED):
                    continue

                candidates.append(
                    PlaceVoteSummary(
                        place_id=p.id,
                        name=p.name,
                        category=category_val,
                        status=status_val,
                        submitted_by_id=p.submitted_by_id,
                        estimated_cost=int(p.estimated_cost or 0),
                        open_minute=p.open_minute,
                        close_minute=p.close_minute,
                        created_at=p.created_at,
                        upvotes=summary["upvotes"],
                        downvotes=summary["downvotes"],
                        score=summary["score"],
                    )
                )

            # Tìm danh mục đã được chấp nhận trước đó (cho CategoryDiversity)
            already_accepted_categories: list[PlaceCategory] = [
                (p.category if isinstance(p.category, PlaceCategory) else PlaceCategory(p.category))
                for p in places
                if (
                    (p.status if isinstance(p.status, PlaceStatus) else PlaceStatus(p.status))
                    == PlaceStatus.ACCEPTED
                )
            ]

            context = TieBreakContext(
                room_id=room_id,
                host_member_id=host_member.id,
                already_accepted_categories=already_accepted_categories,
            )

            # Áp dụng TieBreak resolve
            resolved_places, tie_break_applied = resolve_voting_with_tie_break(
                candidates=candidates,
                max_accepted_places=max_accepted_places,
                strategy=strategy,
                context=context,
            )

        old_status_map: dict[UUID, PlaceStatus] = {
            p.id: (p.status if isinstance(p.status, PlaceStatus) else PlaceStatus(p.status))
            for p in places
        }

        # 8. Cập nhật trạng thái từng địa điểm trong database
        accepted_place_ids: list[UUID] = []
        resolved_places_response: list[dict[str, Any]] = []

        for rp in resolved_places:
            new_status_str = (
                rp.status.value if isinstance(rp.status, PlaceStatus) else str(rp.status)
            )
            await self.place_repo.update(rp.place_id, {"status": new_status_str})

            if rp.status == PlaceStatus.ACCEPTED:
                accepted_place_ids.append(rp.place_id)

            resolved_places_response.append(
                {
                    "id": rp.place_id,
                    "name": rp.name,
                    "status": new_status_str,
                    "score": rp.score,
                    "upvotes": rp.upvotes,
                }
            )

            # Phát sự kiện PlaceStatusChangedEvent cho từng địa điểm
            old_status = old_status_map.get(rp.place_id, PlaceStatus.PROPOSED)
            status_event = PlaceStatusChangedEvent(
                room_id=room_id,
                place_id=rp.place_id,
                new_status=rp.status,
                old_status=old_status,
            )
            await self.event_bus.publish(status_event)

        # 9. Phát sự kiện VotingResolvedEvent
        resolved_event = VotingResolvedEvent(
            room_id=room_id,
            strategy=strategy_key,
            accepted_place_ids=accepted_place_ids,
        )
        await self.event_bus.publish(resolved_event)

        # 10. Cập nhật trạng thái phòng sang FINALIZED và lưu tie_break_strategy
        await self.room_repo.update(
            room_id,
            {
                "status": RoomStatus.FINALIZED.value,
                "tie_break_strategy": strategy_key,
            },
        )

        logger.info(
            "Chủ phòng %s đã chốt vote phòng %s bằng chiến lược '%s', "
            "%d/%d địa điểm được chấp nhận (tie_break_applied=%s)",
            host_member.id,
            room_id,
            strategy_key,
            len(accepted_place_ids),
            len(resolved_places),
            tie_break_applied,
        )

        return {
            "resolved_places": resolved_places_response,
            "tie_break_applied": tie_break_applied,
            "tie_break_strategy": strategy_key,
        }
