import logging
from typing import Any
from uuid import UUID

from app.core.exceptions import (
    ForbiddenHostOnlyError,
    PlaceAlreadyAddedError,
    PlaceNotFoundError,
    RoomNotFoundError,
    RoomStatusInvalidError,
    ValidationError,
)
from app.domain.enums import MemberRole, PlaceCategory, PlaceSource, PlaceStatus, RoomStatus
from app.domain.models.member import Member
from app.domain.models.place import Place
from app.domain.patterns.category_detector import (
    CompositeCategoryDetector,
    IPlaceCategoryDetector,
)
from app.domain.patterns.event_bus import (
    IEventBus,
    PlaceAddedEvent,
    PlaceDeletedEvent,
    PlaceStatusChangedEvent,
)
from app.repositories import IPlaceRepository, IRoomRepository, IVoteRepository

logger = logging.getLogger(__name__)


class PlaceService:
    """Application Service quản lý nghiệp vụ địa điểm đề xuất (Place) và phân loại tự động."""

    def __init__(
        self,
        place_repo: IPlaceRepository,
        room_repo: IRoomRepository,
        vote_repo: IVoteRepository,
        event_bus: IEventBus,
        category_detector: IPlaceCategoryDetector | None = None,
    ) -> None:
        self.place_repo = place_repo
        self.room_repo = room_repo
        self.vote_repo = vote_repo
        self.event_bus = event_bus
        self.category_detector = category_detector or CompositeCategoryDetector()

    def _format_place_dict(
        self,
        place: Place,
        upvotes: int = 0,
        downvotes: int = 0,
        score: int = 0,
        current_user_vote: int = 0,
    ) -> dict[str, Any]:
        """Chuẩn hóa đối tượng Place thành dictionary đáp ứng PlaceResponse."""
        submitter_data = None
        submitter_nickname = None
        if place.submitted_by is not None:
            submitter_data = {
                "id": place.submitted_by.id,
                "nickname": place.submitted_by.nickname,
            }
            submitter_nickname = place.submitted_by.nickname

        category_val = (
            place.category.value
            if isinstance(place.category, PlaceCategory)
            else str(place.category)
        )
        status_val = (
            place.status.value if isinstance(place.status, PlaceStatus) else str(place.status)
        )

        return {
            "id": place.id,
            "room_id": place.room_id,
            "name": place.name,
            "address": place.address,
            "latitude": place.latitude,
            "longitude": place.longitude,
            "category": category_val,
            "status": status_val,
            "url": place.url,
            "notes": place.notes,
            "estimated_cost": int(place.estimated_cost or 0),
            "open_minute": place.open_minute,
            "close_minute": place.close_minute,
            "source": (
                place.source.value if isinstance(place.source, PlaceSource) else str(place.source)
            ),
            "external_id": place.external_id,
            "google_place_id": place.google_place_id,
            "cuisine": place.cuisine,
            "opening_hours_raw": place.opening_hours_raw,
            "coords_source": place.coords_source,
            "coords_fetched_at": place.coords_fetched_at,
            "upvotes": upvotes,
            "downvotes": downvotes,
            "score": score,
            "current_user_vote": current_user_vote,
            "submitted_by_id": place.submitted_by_id,
            "submitted_by": submitter_data,
            "submitted_by_nickname": submitter_nickname,
            "created_at": place.created_at,
            "updated_at": place.updated_at,
        }

    async def add_place(
        self,
        room_id: UUID,
        member_id: UUID,
        data: dict[str, Any],
    ) -> dict[str, Any]:
        """Thêm địa điểm đề xuất mới vào phòng và tự động nhận diện danh mục."""
        # 1. Kiểm tra phòng tồn tại
        room = await self.room_repo.get_by_id(room_id)
        if room is None:
            raise RoomNotFoundError(
                message="Không tìm thấy phòng với mã yêu cầu.",
                details={"room_id": str(room_id)},
            )

        # 2. Kiểm tra trạng thái phòng
        room_status_str = (
            room.status.value if isinstance(room.status, RoomStatus) else str(room.status)
        )
        if room_status_str in (RoomStatus.COMPLETED.value, RoomStatus.ARCHIVED.value):
            raise RoomStatusInvalidError(
                message="Không thể đề xuất địa điểm cho phòng đã hoàn tất hoặc lưu trữ.",
                details={"room_id": str(room_id), "status": room_status_str},
            )

        # 3. Kiểm tra tên địa điểm
        raw_name = data.get("name")
        if not raw_name or not str(raw_name).strip():
            raise ValidationError(
                message="Tên địa điểm không được để trống.",
                details={"field": "name"},
            )
        name = str(raw_name).strip()

        # 4. Tự động nhận diện danh mục qua PlaceCategoryDetector nếu category là OTHER hoặc chưa có
        raw_category = data.get("category")
        category_str = (
            raw_category.value
            if isinstance(raw_category, PlaceCategory)
            else str(raw_category or "OTHER")
        )

        if category_str == PlaceCategory.OTHER.value:
            detected_category = self.category_detector.detect(
                name=name,
                address=data.get("address"),
                url=data.get("url"),
            )
            category_str = (
                detected_category.value
                if isinstance(detected_category, PlaceCategory)
                else str(detected_category)
            )

        raw_source = data.get("source")
        source_str = str(getattr(raw_source, "value", raw_source) or PlaceSource.MANUAL.value)

        # 4b. Chặn trùng (room_id, external_id) trước khi chạm unique constraint (CR-03)
        external_id = data.get("external_id")
        if external_id:
            for existing in await self.place_repo.list_by_room(room_id):
                if existing.external_id == external_id:
                    raise PlaceAlreadyAddedError(
                        details={"place_id": str(existing.id), "external_id": external_id},
                    )

        # 5. Lưu vào cơ sở dữ liệu
        place_data = {
            "room_id": room_id,
            "submitted_by_id": member_id,
            "name": name,
            "address": data.get("address"),
            "latitude": data.get("latitude"),
            "longitude": data.get("longitude"),
            "category": category_str,
            "status": PlaceStatus.PROPOSED.value,
            "url": data.get("url"),
            "notes": data.get("notes"),
            "estimated_cost": data.get("estimated_cost") or 0,
            "open_minute": data.get("open_minute"),
            "close_minute": data.get("close_minute"),
            "source": source_str,
            "external_id": data.get("external_id"),
            "google_place_id": data.get("google_place_id"),
            "cuisine": data.get("cuisine"),
            "opening_hours_raw": data.get("opening_hours_raw"),
            "coords_source": data.get("coords_source"),
        }
        place = await self.place_repo.create(place_data)

        # 6. Phát sự kiện PlaceAddedEvent qua EventBus
        event = PlaceAddedEvent(
            room_id=room_id,
            place_id=place.id,
            name=place.name,
            category=place.category,
            submitted_by_id=place.submitted_by_id,
            estimated_cost=place.estimated_cost or 0,
            open_minute=place.open_minute,
            close_minute=place.close_minute,
            latitude=place.latitude,
            longitude=place.longitude,
            address=place.address,
            place=place,
        )
        await self.event_bus.publish(event)

        logger.info(
            "Đã thêm địa điểm mới '%s' (category: %s) vào phòng %s",
            place.name,
            place.category,
            room_id,
        )
        return self._format_place_dict(place, upvotes=0, downvotes=0, score=0, current_user_vote=0)

    async def list_places(
        self,
        room_id: UUID,
        current_member_id: UUID,
    ) -> list[dict[str, Any]]:
        """Lấy danh sách toàn bộ địa điểm trong phòng kèm tổng điểm vote và vote của thành viên."""
        # 1. Kiểm tra phòng tồn tại
        room = await self.room_repo.get_by_id(room_id)
        if room is None:
            raise RoomNotFoundError(
                message="Không tìm thấy phòng với mã yêu cầu.",
                details={"room_id": str(room_id)},
            )

        # 2. Lấy danh sách địa điểm và tóm tắt điểm bình chọn
        places = await self.place_repo.list_by_room(room_id)
        vote_summary = await self.vote_repo.get_vote_summary_by_room(room_id)

        # 3. Lấy lá phiếu của thành viên hiện tại cho từng địa điểm
        result: list[dict[str, Any]] = []
        for p in places:
            summary = vote_summary.get(p.id, {"upvotes": 0, "downvotes": 0, "score": 0})
            vote_obj = await self.vote_repo.get_vote(p.id, current_member_id)
            current_user_vote = vote_obj.vote_value if vote_obj else 0

            result.append(
                self._format_place_dict(
                    p,
                    upvotes=summary["upvotes"],
                    downvotes=summary["downvotes"],
                    score=summary["score"],
                    current_user_vote=current_user_vote,
                )
            )

        return result

    async def get_place(
        self,
        room_id: UUID,
        place_id: UUID,
        current_member_id: UUID,
    ) -> dict[str, Any]:
        """Lấy chi tiết một địa điểm cụ thể theo ID."""
        place = await self.place_repo.get_by_id(place_id)
        if place is None or place.room_id != room_id:
            raise PlaceNotFoundError(
                message="Không tìm thấy địa điểm được yêu cầu trong phòng này.",
                details={"place_id": str(place_id), "room_id": str(room_id)},
            )

        vote_summary = await self.vote_repo.get_vote_summary_by_room(room_id)
        summary = vote_summary.get(place.id, {"upvotes": 0, "downvotes": 0, "score": 0})
        vote_obj = await self.vote_repo.get_vote(place.id, current_member_id)
        current_user_vote = vote_obj.vote_value if vote_obj else 0

        return self._format_place_dict(
            place,
            upvotes=summary["upvotes"],
            downvotes=summary["downvotes"],
            score=summary["score"],
            current_user_vote=current_user_vote,
        )

    async def update_place(
        self,
        room_id: UUID,
        place_id: UUID,
        member: Member,
        data: dict[str, Any],
    ) -> dict[str, Any]:
        """Cập nhật thông tin địa điểm (chỉ Submitter hoặc Host mới có quyền)."""
        place = await self.place_repo.get_by_id(place_id)
        if place is None or place.room_id != room_id:
            raise PlaceNotFoundError(
                message="Không tìm thấy địa điểm được yêu cầu trong phòng này.",
                details={"place_id": str(place_id), "room_id": str(room_id)},
            )

        # Kiểm tra phân quyền: Phải là HOST hoặc chính người đề xuất (Submitter)
        role_val = member.role.value if isinstance(member.role, MemberRole) else str(member.role)
        is_host = role_val == MemberRole.HOST.value
        is_submitter = place.submitted_by_id == member.id

        if not (is_host or is_submitter):
            raise ForbiddenHostOnlyError(
                message="Chỉ người đề xuất hoặc Chủ phòng (HOST) mới có quyền chỉnh sửa địa điểm này.",
                details={"place_id": str(place_id), "member_id": str(member.id)},
            )

        # Lọc dữ liệu cập nhật hợp lệ
        update_dict: dict[str, Any] = {}
        if "name" in data and data["name"] is not None:
            name_val = str(data["name"]).strip()
            if not name_val:
                raise ValidationError(
                    "Tên địa điểm không được để trống.", details={"field": "name"}
                )
            update_dict["name"] = name_val

        if "address" in data:
            update_dict["address"] = data["address"]
        if "latitude" in data:
            update_dict["latitude"] = data["latitude"]
        if "longitude" in data:
            update_dict["longitude"] = data["longitude"]
        if "category" in data and data["category"] is not None:
            cat = data["category"]
            update_dict["category"] = cat.value if isinstance(cat, PlaceCategory) else str(cat)
        if "status" in data and data["status"] is not None:
            st = data["status"]
            update_dict["status"] = st.value if isinstance(st, PlaceStatus) else str(st)
        if "url" in data:
            update_dict["url"] = data["url"]
        if "notes" in data:
            update_dict["notes"] = data["notes"]
        if "estimated_cost" in data and data["estimated_cost"] is not None:
            update_dict["estimated_cost"] = data["estimated_cost"]
        if "open_minute" in data:
            update_dict["open_minute"] = data["open_minute"]
        if "close_minute" in data:
            update_dict["close_minute"] = data["close_minute"]

        old_status = place.status
        updated_place = await self.place_repo.update(place_id, update_dict)
        if updated_place is None:
            raise PlaceNotFoundError(
                message="Không tìm thấy địa điểm được yêu cầu.",
                details={"place_id": str(place_id)},
            )

        # Nạp lại bản ghi kèm quan hệ submitted_by tránh MissingGreenlet lazy-loading
        reloaded_place = await self.place_repo.get_by_id(place_id)
        final_place = reloaded_place or updated_place

        # Nếu có đổi status, phát sự kiện PlaceStatusChangedEvent
        if "status" in update_dict and update_dict["status"] != old_status:
            status_event = PlaceStatusChangedEvent(
                room_id=room_id,
                place_id=place_id,
                new_status=final_place.status,
                old_status=old_status,
                place=final_place,
            )
            await self.event_bus.publish(status_event)

        vote_summary = await self.vote_repo.get_vote_summary_by_room(room_id)
        summary = vote_summary.get(final_place.id, {"upvotes": 0, "downvotes": 0, "score": 0})
        vote_obj = await self.vote_repo.get_vote(final_place.id, member.id)
        current_user_vote = vote_obj.vote_value if vote_obj else 0

        return self._format_place_dict(
            final_place,
            upvotes=summary["upvotes"],
            downvotes=summary["downvotes"],
            score=summary["score"],
            current_user_vote=current_user_vote,
        )

    async def delete_place(
        self,
        room_id: UUID,
        place_id: UUID,
        member: Member,
    ) -> bool:
        """Xóa địa điểm khỏi phòng (chỉ Submitter hoặc Host mới có quyền)."""
        place = await self.place_repo.get_by_id(place_id)
        if place is None or place.room_id != room_id:
            raise PlaceNotFoundError(
                message="Không tìm thấy địa điểm được yêu cầu trong phòng này.",
                details={"place_id": str(place_id), "room_id": str(room_id)},
            )

        # Kiểm tra phân quyền: Phải là HOST hoặc chính người đề xuất (Submitter)
        role_val = member.role.value if isinstance(member.role, MemberRole) else str(member.role)
        is_host = role_val == MemberRole.HOST.value
        is_submitter = place.submitted_by_id == member.id

        if not (is_host or is_submitter):
            raise ForbiddenHostOnlyError(
                message="Chỉ người đề xuất hoặc Chủ phòng (HOST) mới có quyền xóa địa điểm này.",
                details={"place_id": str(place_id), "member_id": str(member.id)},
            )

        # Xóa khỏi database
        deleted = await self.place_repo.delete(place_id)
        if not deleted:
            raise PlaceNotFoundError(
                message="Không tìm thấy địa điểm để xóa.",
                details={"place_id": str(place_id)},
            )

        # Phát sự kiện PlaceDeletedEvent qua EventBus
        event = PlaceDeletedEvent(room_id=room_id, place_id=place_id)
        await self.event_bus.publish(event)

        logger.info("Đã xóa địa điểm %s khỏi phòng %s", place_id, room_id)
        return True
