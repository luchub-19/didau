from collections import defaultdict
from collections.abc import Sequence
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.core.time_utils import now_utc
from app.domain.enums import PlaceCategory, PlaceStatus, TriggerHint


class DeciderHint(BaseModel):
    """Gợi ý kích hoạt tính năng Chọn hộ theo CR-02 và CONTRACTS.md."""

    type: TriggerHint
    category: str | None = None
    candidate_place_ids: list[UUID] = Field(default_factory=list)


def _to_uuid(val: Any) -> UUID | None:
    if val is None:
        return None
    if isinstance(val, UUID):
        return val
    try:
        return UUID(str(val))
    except (ValueError, TypeError):
        return None


def _get_val(obj: Any, field_name: str, default: Any = None) -> Any:
    if isinstance(obj, dict):
        return obj.get(field_name, default)
    return getattr(obj, field_name, default)


class DeciderTrigger:
    """Đánh giá điều kiện hiển thị nút '🎲 Chọn hộ' (Pure Logic theo Plan 4.1)."""

    def __init__(
        self,
        stalled_threshold_minutes: int = 10,
        target_categories: Sequence[PlaceCategory | str] | None = None,
    ) -> None:
        self.stalled_threshold_minutes = stalled_threshold_minutes
        self.target_categories = target_categories

    @classmethod
    def evaluate(
        cls,
        places: Sequence[Any],
        votes: Sequence[Any] = (),
        members: Sequence[Any] = (),
        now: datetime | None = None,
        target_categories: Sequence[PlaceCategory | str] | None = None,
        stalled_threshold_minutes: int = 10,
    ) -> list[DeciderHint]:
        """Đánh giá trạng thái phòng và sinh danh sách gợi ý kích hoạt chọn hộ.

        Các điều kiện:
        - TIE_AT_TOP: >= 2 quán cùng category có điểm cao nhất bằng nhau (có vote hoặc điểm > 0).
        - NEAR_TIE: Top-1 và top-2 chênh <= 1 điểm và >= 50% thành viên đã vote.
        - TOO_MANY: > 5 quán PROPOSED cùng category mà mỗi quán có < 2 vote.
        - STALLED: Không có vote mới trong 10 phút và chưa có quán ACCEPTED.
        - EMPTY: Phòng chưa có quán nào trong category đang cần (mặc định FOOD, DRINK).
        """
        if now is None:
            now = now_utc()

        hints: list[DeciderHint] = []

        # 1. Trích xuất thông tin places
        extracted_places: list[dict[str, Any]] = []
        for p in places:
            p_id = _to_uuid(_get_val(p, "id") or _get_val(p, "place_id"))
            if not p_id:
                continue
            cat = _get_val(p, "category")
            cat_str = cat.value if hasattr(cat, "value") else (str(cat) if cat else PlaceCategory.OTHER.value)
            status = _get_val(p, "status")
            status_str = status.value if hasattr(status, "value") else (str(status) if status else PlaceStatus.PROPOSED.value)
            extracted_places.append({
                "id": p_id,
                "name": _get_val(p, "name", ""),
                "category": cat_str,
                "status": status_str,
                "created_at": _get_val(p, "created_at"),
                "score": _get_val(p, "score", 0) or 0,
                "upvotes": _get_val(p, "upvotes", 0) or 0,
                "downvotes": _get_val(p, "downvotes", 0) or 0,
                "obj": p,
            })

        # 2. Trích xuất votes
        place_votes_map: dict[UUID, list[dict[str, Any]]] = defaultdict(list)
        room_voters: set[UUID] = set()
        latest_vote_time: datetime | None = None

        for v in votes:
            v_pid = _to_uuid(_get_val(v, "place_id"))
            v_mid = _to_uuid(_get_val(v, "member_id"))
            v_val = _get_val(v, "vote_value", 1)
            v_time = _get_val(v, "created_at")
            if v_pid:
                place_votes_map[v_pid].append({
                    "member_id": v_mid,
                    "val": v_val,
                    "created_at": v_time,
                })
            if v_mid:
                room_voters.add(v_mid)
            if v_time is not None and (latest_vote_time is None or v_time > latest_vote_time):
                latest_vote_time = v_time

        # 3. Tính điểm thực tế cho từng place
        for p_info in extracted_places:
            pid = p_info["id"]
            if pid in place_votes_map:
                p_votes = place_votes_map[pid]
                p_info["score"] = sum(v["val"] for v in p_votes)
                p_info["upvotes"] = sum(1 for v in p_votes if v["val"] > 0)
                p_info["downvotes"] = sum(1 for v in p_votes if v["val"] < 0)
                p_info["vote_count"] = len(p_votes)
            else:
                p_info["vote_count"] = p_info["upvotes"] + p_info["downvotes"]

        # 4. Phân nhóm theo category (chỉ xét địa điểm chưa bị REJECTED)
        active_places = [p for p in extracted_places if p["status"] != PlaceStatus.REJECTED.value]
        places_by_cat: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for p in active_places:
            places_by_cat[p["category"]].append(p)

        # 5. Đánh giá TIE_AT_TOP và NEAR_TIE theo từng category
        total_members = len(members)

        for cat, cat_places in places_by_cat.items():
            if len(cat_places) < 2:
                continue

            # Sắp xếp theo score giảm dần
            sorted_places = sorted(cat_places, key=lambda x: x["score"], reverse=True)
            top_score = sorted_places[0]["score"]
            top_places = [p for p in sorted_places if p["score"] == top_score]

            cat_voters = {
                v["member_id"]
                for p in cat_places
                for v in place_votes_map.get(p["id"], [])
                if v["member_id"] is not None
            }
            cat_total_votes = sum(p["vote_count"] for p in cat_places)
            has_voting_activity = cat_total_votes > 0 or any(p["score"] != 0 for p in cat_places)

            is_tie = False
            # TIE_AT_TOP: >= 2 quán cùng category có điểm cao nhất bằng nhau
            if len(top_places) >= 2 and has_voting_activity:
                hints.append(
                    DeciderHint(
                        type=TriggerHint.TIE_AT_TOP,
                        category=cat,
                        candidate_place_ids=[p["id"] for p in top_places],
                    )
                )
                is_tie = True

            # NEAR_TIE: Top-1 và top-2 chênh <= 1 điểm và >= 50% thành viên đã vote
            if not is_tie and len(sorted_places) >= 2:
                diff = sorted_places[0]["score"] - sorted_places[1]["score"]
                if diff <= 1:
                    voter_ratio = len(cat_voters | room_voters) / max(1, total_members) if total_members > 0 else 0.0
                    if voter_ratio >= 0.5:
                        near_candidates = [
                            p["id"]
                            for p in sorted_places
                            if sorted_places[0]["score"] - p["score"] <= 1
                        ]
                        hints.append(
                            DeciderHint(
                                type=TriggerHint.NEAR_TIE,
                                category=cat,
                                candidate_place_ids=near_candidates,
                            )
                        )

        # 6. Đánh giá TOO_MANY (> 5 quán PROPOSED cùng category mà mỗi quán < 2 vote)
        for cat, cat_places in places_by_cat.items():
            proposed = [p for p in cat_places if p["status"] == PlaceStatus.PROPOSED.value]
            if len(proposed) > 5 and all(p["vote_count"] < 2 for p in proposed):
                hints.append(
                    DeciderHint(
                        type=TriggerHint.TOO_MANY,
                        category=cat,
                        candidate_place_ids=[p["id"] for p in proposed],
                    )
                )

        # 7. Đánh giá STALLED (Không có vote mới trong 10 phút và chưa có quán ACCEPTED)
        has_accepted = any(p["status"] == PlaceStatus.ACCEPTED.value for p in extracted_places)
        if not has_accepted and active_places:
            last_activity: datetime | None = latest_vote_time
            if last_activity is None:
                place_times = [p["created_at"] for p in extracted_places if p["created_at"] is not None]
                if place_times:
                    last_activity = max(place_times)

            if last_activity is not None:
                # Đảm bảo timezone đồng nhất khi tính toán
                diff_sec = (now - last_activity).total_seconds()
                if diff_sec >= stalled_threshold_minutes * 60:
                    sorted_active = sorted(active_places, key=lambda x: x["score"], reverse=True)
                    hints.append(
                        DeciderHint(
                            type=TriggerHint.STALLED,
                            category=None,
                            candidate_place_ids=[p["id"] for p in sorted_active],
                        )
                    )

        # 8. Đánh giá EMPTY (Phòng chưa có quán nào trong category đang cần)
        if target_categories is None:
            check_categories = [PlaceCategory.FOOD.value, PlaceCategory.DRINK.value]
        else:
            check_categories = [
                c.value if hasattr(c, "value") else str(c)
                for c in target_categories
            ]

        for req_cat in check_categories:
            places_in_cat = [
                p for p in active_places
                if p["category"].upper() == req_cat.upper()
            ]
            if not places_in_cat:
                hints.append(
                    DeciderHint(
                        type=TriggerHint.EMPTY,
                        category=req_cat,
                        candidate_place_ids=[],
                    )
                )

        return hints
