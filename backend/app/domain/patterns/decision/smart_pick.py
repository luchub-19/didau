from collections.abc import Sequence
from datetime import date
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.domain.enums import PlaceCategory
from app.domain.patterns.itinerary.opening_hours import parse_opening_hours
from app.domain.patterns.itinerary.travel import haversine_distance_km

_CATEGORY_VN = {
    PlaceCategory.FOOD.value: "quán ăn",
    PlaceCategory.DRINK.value: "quán nước",
    PlaceCategory.ENTERTAINMENT.value: "chỗ vui chơi",
    PlaceCategory.SIGHTSEEING.value: "điểm tham quan",
    PlaceCategory.ACCOMMODATION.value: "chỗ lưu trú",
    PlaceCategory.SHOPPING.value: "điểm mua sắm",
    PlaceCategory.OTHER.value: "địa điểm này",
}


class SmartPickWeights(BaseModel):
    """Trọng số cấu hình được cho SmartPickScorer (Plan 4.3)."""

    vote: float = 0.35
    distance: float = 0.25
    opening_hours: float = 0.15
    budget: float = 0.10
    category_diversity: float = 0.10
    internal_review: float = 0.05


class SmartPickContext(BaseModel):
    """Ngữ cảnh chấm điểm chọn hộ thông minh."""

    origin_lat: float | None = None
    origin_lng: float | None = None
    target_minute: int | None = 1080  # Mặc định 18:00
    target_date: date | None = None  # Để xác định thứ trong tuần
    budget_limit: int | None = None
    already_accepted_categories: list[PlaceCategory | str] = Field(default_factory=list)
    internal_ratings: dict[str, float] = Field(default_factory=dict)
    max_distance_km: float = 15.0


class ScoredPick(BaseModel):
    """Kết quả gợi ý địa điểm đã chấm điểm kèm lý do (Plan 4.3, CR-02, CR-06)."""

    place_id: UUID
    score: float
    reasons: list[str]
    reason_codes: list[dict[str, Any]] = Field(default_factory=list)


def _to_uuid(val: Any) -> UUID:
    if isinstance(val, UUID):
        return val
    return UUID(str(val))


def _get_val(obj: Any, field_name: str, default: Any = None) -> Any:
    if isinstance(obj, dict):
        return obj.get(field_name, default)
    return getattr(obj, field_name, default)


def _format_minute(m: int) -> str:
    clamped = max(0, min(1439, m))
    return f"{clamped // 60:02d}:{clamped % 60:02d}"


class SmartPickScorer:
    """Chấm điểm và xếp hạng ứng viên cho tính năng Chọn hộ thông minh (Pure Logic)."""

    def __init__(self, weights: SmartPickWeights | None = None) -> None:
        self.weights = weights or SmartPickWeights()

    def rank(
        self,
        candidates: Sequence[Any],
        ctx: SmartPickContext | None = None,
    ) -> list[ScoredPick]:
        """Xếp hạng các ứng viên theo 6 tiêu chí có trọng số và sinh lý do tiếng Việt cụ thể.

        Args:
            candidates: Danh sách Place model hoặc PlaceVoteSummary hoặc dict.
            ctx: Ngữ cảnh chấm điểm (điểm hẹn, giờ hẹn, ngân sách, danh mục đã có...).

        Returns:
            Danh sách ScoredPick được sắp xếp từ điểm cao xuống thấp.
        """
        if not candidates:
            return []

        if ctx is None:
            ctx = SmartPickContext()

        # Chuẩn bị danh mục đã có
        accepted_cats: set[str] = set()
        for c in ctx.already_accepted_categories:
            c_str = c.value if hasattr(c, "value") else str(c)
            accepted_cats.add(c_str.upper())

        # Chuẩn bị thông tin ứng viên
        items: list[dict[str, Any]] = []
        for c in candidates:
            cid = _to_uuid(_get_val(c, "id") or _get_val(c, "place_id"))
            cat = _get_val(c, "category")
            cat_str = cat.value if hasattr(cat, "value") else (str(cat) if cat else PlaceCategory.OTHER.value)
            items.append({
                "id": cid,
                "name": _get_val(c, "name", ""),
                "category": cat_str,
                "lat": _get_val(c, "latitude"),
                "lng": _get_val(c, "longitude"),
                "score": _get_val(c, "score", 0) or 0,
                "upvotes": _get_val(c, "upvotes", 0) or 0,
                "estimated_cost": _get_val(c, "estimated_cost", 0) or 0,
                "open_minute": _get_val(c, "open_minute"),
                "close_minute": _get_val(c, "close_minute"),
                "opening_hours_raw": _get_val(c, "opening_hours_raw"),
                "external_id": _get_val(c, "external_id"),
            })

        # 1. Thang đo Vote chuẩn hoá
        scores = [item["score"] for item in items]
        max_vote = max(scores)
        min_vote = min(scores)

        # 2. Thang đo Khoảng cách
        distances: dict[UUID, float] = {}
        has_origin = ctx.origin_lat is not None and ctx.origin_lng is not None
        if has_origin:
            for item in items:
                if item["lat"] is not None and item["lng"] is not None:
                    d = haversine_distance_km(
                        ctx.origin_lat, ctx.origin_lng, item["lat"], item["lng"]
                    )
                    distances[item["id"]] = d
        min_dist = min(distances.values()) if distances else None

        # 3. Thang đo Giờ mở cửa
        target_min = ctx.target_minute if ctx.target_minute is not None else 1080
        time_str = _format_minute(target_min)
        weekday = ctx.target_date.weekday() if ctx.target_date is not None else 0

        # 4. Thang đo Ngân sách
        costs = [item["estimated_cost"] for item in items]
        max_cost = max(costs) if costs else 0
        min_cost = min(costs) if costs else 0

        w = self.weights
        total_w = w.vote + w.distance + w.opening_hours + w.budget + w.category_diversity + w.internal_review
        norm_factor = 1.0 / total_w if total_w > 0 else 1.0

        results: list[ScoredPick] = []

        for item in items:
            reasons_scored: list[tuple[float, str, dict[str, Any]]] = []

            # A. Vote score (0.35)
            if max_vote > min_vote:
                s_vote = (item["score"] - min_vote) / (max_vote - min_vote)
            else:
                s_vote = 1.0 if item["score"] > 0 else 0.5

            if item["score"] > 0 or item["upvotes"] > 0:
                if item["score"] == max_vote and max_vote > 0:
                    reasons_scored.append((
                        1.0,
                        f"Được bình chọn cao nhất (+{item['score']} điểm, {item['upvotes']} lượt thích)",
                        {"code": "TOP_VOTED", "params": {"score": item["score"], "upvotes": item["upvotes"]}},
                    ))
                else:
                    reasons_scored.append((
                        0.7,
                        f"Được ủng hộ (+{item['score']} điểm, {item['upvotes']} lượt thích)",
                        {"code": "SUPPORTED", "params": {"score": item["score"], "upvotes": item["upvotes"]}},
                    ))

            # B. Distance score (0.25)
            pid = item["id"]
            if pid in distances:
                d = distances[pid]
                s_dist = max(0.0, 1.0 - d / max(0.1, ctx.max_distance_km))
                if min_dist is not None and abs(d - min_dist) < 0.05:
                    reasons_scored.append((
                        0.95,
                        f"Gần điểm hẹn nhất ({d:.1f} km)",
                        {"code": "NEAREST", "params": {"distance_km": round(d, 1)}},
                    ))
                elif d <= 5.0:
                    reasons_scored.append((
                        0.8,
                        f"Gần điểm hẹn ({d:.1f} km)",
                        {"code": "NEAR", "params": {"distance_km": round(d, 1)}},
                    ))
                else:
                    reasons_scored.append((
                        0.4,
                        f"Khoảng cách {d:.1f} km từ điểm hẹn",
                        {"code": "DISTANCE", "params": {"distance_km": round(d, 1)}},
                    ))
            else:
                s_dist = 0.5

            # C. Opening hours score (0.15)
            s_open = 0.5  # mặc định không rõ
            is_open = None

            raw_hours = item["opening_hours_raw"]
            if raw_hours:
                intervals = parse_opening_hours(raw_hours, weekday)
                if intervals is not None:
                    if intervals:
                        is_open = any(start <= target_min <= end for start, end in intervals)
                    else:
                        is_open = False

            if is_open is None and item["open_minute"] is not None and item["close_minute"] is not None:
                op, cl = item["open_minute"], item["close_minute"]
                if cl < op:  # qua đêm
                    is_open = target_min >= op or target_min <= cl
                else:
                    is_open = op <= target_min <= cl

            if is_open is True:
                s_open = 1.0
                reasons_scored.append((
                    0.9,
                    f"Đang mở cửa lúc {time_str}",
                    {"code": "OPEN_AT", "params": {"minute": target_min}},
                ))
            elif is_open is False:
                s_open = 0.0

            # D. Budget score (0.10)
            cost = item["estimated_cost"]
            if ctx.budget_limit is not None and ctx.budget_limit > 0:
                if cost <= ctx.budget_limit:
                    s_bud = 1.0
                    if cost == 0:
                        reasons_scored.append((
                            0.9,
                            "Miễn phí vé / chi phí 0đ",
                            {"code": "FREE", "params": {"cost": 0, "budget_limit": ctx.budget_limit}},
                        ))
                    else:
                        reasons_scored.append((
                            0.85,
                            f"Vừa ngân sách ({cost:,}đ / {ctx.budget_limit:,}đ)",
                            {"code": "WITHIN_BUDGET", "params": {"cost": cost, "budget_limit": ctx.budget_limit}},
                        ))
                else:
                    s_bud = max(0.0, 1.0 - (cost - ctx.budget_limit) / ctx.budget_limit)
            else:
                if cost == 0:
                    s_bud = 1.0
                    reasons_scored.append((
                        0.9,
                        "Chi phí 0đ (miễn phí)",
                        {"code": "FREE", "params": {"cost": 0}},
                    ))
                elif max_cost > min_cost:
                    s_bud = 1.0 - (cost - min_cost) / (max_cost - min_cost)
                    if cost <= min_cost:
                        reasons_scored.append((
                            0.8,
                            f"Chi phí tiết kiệm nhất ({cost:,}đ)",
                            {"code": "CHEAPEST", "params": {"cost": cost}},
                        ))
                    else:
                        reasons_scored.append((
                            0.6,
                            f"Chi phí ước tính {cost:,}đ",
                            {"code": "COST_ESTIMATE", "params": {"cost": cost}},
                        ))
                else:
                    s_bud = 1.0
                    reasons_scored.append((
                        0.6,
                        f"Chi phí ước tính {cost:,}đ",
                        {"code": "COST_ESTIMATE", "params": {"cost": cost}},
                    ))

            # E. Category diversity score (0.10)
            item_cat_str = item["category"].upper()
            if accepted_cats and item_cat_str not in accepted_cats:
                s_cat = 1.0
                cat_vn = _CATEGORY_VN.get(item_cat_str, "danh mục này")
                reasons_scored.append((
                    0.85,
                    f"Đa dạng trải nghiệm (nhóm chưa có {cat_vn})",
                    {"code": "QUALITY_PICK", "params": {"category": item_cat_str, "total_score": round(1.0, 4)}},
                ))
            elif not accepted_cats:
                s_cat = 1.0
            else:
                s_cat = 0.2

            # F. Internal review score (0.05)
            # Tra cứu theo id hoặc external_id
            rating = ctx.internal_ratings.get(str(pid)) or (
                ctx.internal_ratings.get(str(item["external_id"])) if item["external_id"] else None
            )
            if rating is not None:
                rating_clamped = max(1.0, min(5.0, float(rating)))
                s_rev = (rating_clamped - 1.0) / 4.0
                if rating_clamped >= 3.5:
                    reasons_scored.append((
                        0.8,
                        f"Đánh giá nội bộ tốt ({rating_clamped:.1f}⭐)",
                        {"code": "QUALITY_PICK", "params": {"category": item_cat_str, "total_score": round(rating_clamped / 5.0, 4)}},
                    ))
            else:
                s_rev = 0.5

            total_score = (
                w.vote * s_vote
                + w.distance * s_dist
                + w.opening_hours * s_open
                + w.budget * s_bud
                + w.category_diversity * s_cat
                + w.internal_review * s_rev
            ) * norm_factor

            # Chọn tối đa 3 lý do điểm cao nhất
            reasons_scored.sort(key=lambda r: r[0], reverse=True)
            top = reasons_scored[:3]
            top_reasons = [r[1] for r in top]
            top_reason_codes = [r[2] for r in top]
            if not top_reasons:
                cat_vn = _CATEGORY_VN.get(item["category"].upper(), "địa điểm phù hợp")
                top_reasons.append(f"Gợi ý {cat_vn} chất lượng cho nhóm (điểm tổng hợp: {total_score * 100:.1f}%)")
                top_reason_codes.append({
                    "code": "QUALITY_PICK",
                    "params": {"category": item["category"].upper(), "total_score": round(total_score, 4)},
                })

            results.append(
                ScoredPick(
                    place_id=pid,
                    score=round(total_score, 4),
                    reasons=top_reasons,
                    reason_codes=top_reason_codes,
                )
            )

        # Sắp xếp theo score giảm dần, hòa điểm thì sắp theo place_id để deterministic
        results.sort(key=lambda x: (x.score, str(x.place_id)), reverse=True)
        return results
