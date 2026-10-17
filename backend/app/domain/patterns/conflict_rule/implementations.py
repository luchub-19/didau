import math
from collections import defaultdict
from difflib import SequenceMatcher
from typing import Any
from uuid import UUID

from app.domain.enums import ConflictLevel, PlaceStatus
from app.domain.patterns.conflict_rule.rule import (
    ConflictContext,
    ConflictResult,
    IConflictRule,
    PlaceVoteSummary,
)
from app.domain.patterns.itinerary.travel import ITravelTimeEstimator, haversine_distance_km


def format_minute(minute: int) -> str:
    """Định dạng số phút từ đầu ngày (0..1439) thành chuỗi HH:MM."""
    clamped = max(0, min(1439, minute))
    hours = clamped // 60
    mins = clamped % 60
    return f"{hours:02d}:{mins:02d}"


def to_uuid(val: Any) -> UUID:
    """Chuyển đổi an toàn giá trị thành UUID."""
    if isinstance(val, UUID):
        return val
    return UUID(str(val))


def find_place_by_id(
    place_id: Any,
    places: list[PlaceVoteSummary],
) -> PlaceVoteSummary | None:
    """Tìm địa điểm trong danh sách theo place_id."""
    if place_id is None:
        return None
    target_id_str = str(place_id)
    for p in places:
        if str(p.place_id) == target_id_str:
            return p
    return None


class TimeOverlapConflictRule(IConflictRule):
    """Quy tắc kiểm tra trùng lặp thời gian trong lịch trình (TIME_OVERLAP).

    Báo CRITICAL nếu 2 mục lịch trình cùng ngày có khung giờ [start_minute, end_minute] giao nhau.
    """

    @property
    def rule_code(self) -> str:
        return "TIME_OVERLAP"

    def evaluate(self, context: ConflictContext) -> list[ConflictResult]:
        results: list[ConflictResult] = []
        if not context.schedule_items or len(context.schedule_items) < 2:
            return results

        # Gom nhóm các mục lịch trình theo day_offset
        items_by_day: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for item in context.schedule_items:
            day = int(item.get("day_offset", 0))
            items_by_day[day].append(item)

        for day, items in items_by_day.items():
            count = len(items)
            for i in range(count):
                for j in range(i + 1, count):
                    item_a = items[i]
                    item_b = items[j]

                    start_a = int(item_a.get("start_minute", 0))
                    end_a = int(item_a.get("end_minute", 0))
                    start_b = int(item_b.get("start_minute", 0))
                    end_b = int(item_b.get("end_minute", 0))

                    # Giao nhau khi max(start_a, start_b) < min(end_a, end_b)
                    if start_a < end_b and start_b < end_a:
                        place_a = find_place_by_id(item_a.get("place_id"), context.places)
                        place_b = find_place_by_id(item_b.get("place_id"), context.places)

                        name_a = (
                            item_a.get("place_name")
                            or (place_a.name if place_a else None)
                            or f"Mục lịch {item_a.get('id', 'A')}"
                        )
                        name_b = (
                            item_b.get("place_name")
                            or (place_b.name if place_b else None)
                            or f"Mục lịch {item_b.get('id', 'B')}"
                        )

                        time_a_str = f"{format_minute(start_a)} - {format_minute(end_a)}"
                        time_b_str = f"{format_minute(start_b)} - {format_minute(end_b)}"

                        msg = (
                            f"Trùng lặp thời gian: '{name_a}' ({time_a_str}) "
                            f"bị đè khung giờ với '{name_b}' ({time_b_str}) "
                            f"vào ngày {day + 1}"
                        )

                        results.append(
                            ConflictResult(
                                rule_code=self.rule_code,
                                level=ConflictLevel.CRITICAL,
                                message=msg,
                                entity_type="SCHEDULE",
                                entity_ids=[to_uuid(item_a["id"]), to_uuid(item_b["id"])],
                            )
                        )

        return results


class TravelTimeConflictRule(IConflictRule):
    """Quy tắc kiểm tra thời gian di chuyển giữa 2 địa điểm liên tiếp (TRAVEL_TIME).

    Báo WARNING nếu khoảng thời gian giữa 2 địa điểm liên tiếp bé hơn thời gian di chuyển
    ước tính dựa trên khoảng cách tọa độ Haversine.
    """

    def __init__(
        self,
        average_speed_kmh: float = 30.0,
        estimator: ITravelTimeEstimator | None = None,
    ) -> None:
        """Khởi tạo luật di chuyển với vận tốc trung bình (mặc định 30 km/h trong đô thị).

        Nếu truyền `estimator` thì dùng nó thay cho công thức Haversine / vận tốc.
        """
        self.average_speed_kmh = max(1.0, average_speed_kmh)
        self.estimator = estimator

    @property
    def rule_code(self) -> str:
        return "TRAVEL_TIME"

    def evaluate(self, context: ConflictContext) -> list[ConflictResult]:
        results: list[ConflictResult] = []
        if not context.schedule_items or len(context.schedule_items) < 2:
            return results

        # Gom nhóm và sắp xếp các mục lịch trình theo ngày và thứ tự thời gian
        items_by_day: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for item in context.schedule_items:
            day = int(item.get("day_offset", 0))
            items_by_day[day].append(item)

        for day, items in items_by_day.items():
            sorted_items = sorted(
                items,
                key=lambda x: (
                    int(x.get("start_minute", 0)),
                    int(x.get("order_index", 0)),
                ),
            )

            for i in range(len(sorted_items) - 1):
                item_curr = sorted_items[i]
                item_next = sorted_items[i + 1]

                end_curr = int(item_curr.get("end_minute", 0))
                start_next = int(item_next.get("start_minute", 0))
                gap_minutes = start_next - end_curr

                # Lấy tọa độ của 2 địa điểm
                place_curr = find_place_by_id(item_curr.get("place_id"), context.places)
                place_next = find_place_by_id(item_next.get("place_id"), context.places)

                lat_curr = item_curr.get("latitude")
                if lat_curr is None and place_curr:
                    lat_curr = place_curr.latitude

                lon_curr = item_curr.get("longitude")
                if lon_curr is None and place_curr:
                    lon_curr = place_curr.longitude

                lat_next = item_next.get("latitude")
                if lat_next is None and place_next:
                    lat_next = place_next.latitude

                lon_next = item_next.get("longitude")
                if lon_next is None and place_next:
                    lon_next = place_next.longitude

                # Nếu thiếu tọa độ một trong hai địa điểm thì bỏ qua tính toán
                if lat_curr is None or lon_curr is None or lat_next is None or lon_next is None:
                    continue

                distance_km = haversine_distance_km(
                    float(lat_curr),
                    float(lon_curr),
                    float(lat_next),
                    float(lon_next),
                )

                # Ước tính số phút di chuyển = (khoảng cách / vận tốc) * 60 (làm tròn lên)
                if self.estimator is not None:
                    estimated_travel_minutes = self.estimator.minutes(
                        (float(lat_curr), float(lon_curr)),
                        (float(lat_next), float(lon_next)),
                    )
                else:
                    estimated_travel_minutes = math.ceil(
                        (distance_km / self.average_speed_kmh) * 60.0
                    )

                # Nếu khoảng cách > 0 và thời gian nghỉ giữa 2 chặng < thời gian di chuyển ước tính
                if estimated_travel_minutes > 0 and gap_minutes < estimated_travel_minutes:
                    name_curr = (
                        item_curr.get("place_name")
                        or (place_curr.name if place_curr else None)
                        or f"Mục lịch {item_curr.get('id', 'A')}"
                    )
                    name_next = (
                        item_next.get("place_name")
                        or (place_next.name if place_next else None)
                        or f"Mục lịch {item_next.get('id', 'B')}"
                    )

                    msg = (
                        f"Thời gian di chuyển không đủ: Từ '{name_curr}' đến '{name_next}' "
                        f"cách nhau {distance_km:.1f} km, ước tính cần {estimated_travel_minutes} phút di chuyển "
                        f"nhưng chỉ có {gap_minutes} phút nghỉ (ngày {day + 1})"
                    )

                    results.append(
                        ConflictResult(
                            rule_code=self.rule_code,
                            level=ConflictLevel.WARNING,
                            message=msg,
                            entity_type="SCHEDULE",
                            entity_ids=[to_uuid(item_curr["id"]), to_uuid(item_next["id"])],
                        )
                    )

        return results


class OpeningHoursConflictRule(IConflictRule):
    """Quy tắc kiểm tra xếp lịch ngoài khung giờ mở cửa (OPENING_HOURS).

    Báo ERROR nếu xếp lịch ngoài khung giờ mở cửa [open_minute, close_minute] của địa điểm.
    """

    @property
    def rule_code(self) -> str:
        return "OPENING_HOURS"

    def evaluate(self, context: ConflictContext) -> list[ConflictResult]:
        results: list[ConflictResult] = []
        if not context.schedule_items:
            return results

        for item in context.schedule_items:
            start_minute = item.get("start_minute")
            end_minute = item.get("end_minute")
            if start_minute is None or end_minute is None:
                continue

            start_min = int(start_minute)
            end_min = int(end_minute)
            day = int(item.get("day_offset", 0))

            place = find_place_by_id(item.get("place_id"), context.places)

            # Lấy open_minute và close_minute từ item hoặc place
            open_min = item.get("open_minute")
            if open_min is None and place:
                open_min = place.open_minute

            close_min = item.get("close_minute")
            if close_min is None and place:
                close_min = place.close_minute

            if open_min is None or close_min is None:
                continue

            open_min = int(open_min)
            close_min = int(close_min)

            place_name = (
                item.get("place_name")
                or (place.name if place else None)
                or f"Mục lịch {item.get('id', '')}"
            )

            is_outside = False
            if open_min <= close_min:
                # Giờ mở cửa thông thường trong ngày (ví dụ 08:00 - 22:00)
                if start_min < open_min or end_min > close_min:
                    is_outside = True
            else:
                # Giờ mở cửa qua đêm (ví dụ 20:00 tối đến 04:00 sáng hôm sau)
                # Khoảng đóng cửa là từ close_min đến open_min
                if (
                    (close_min < start_min < open_min)
                    or (close_min < end_min < open_min)
                    or (start_min <= close_min and end_min >= open_min)
                ):
                    is_outside = True

            if is_outside:
                time_sched_str = f"{format_minute(start_min)} - {format_minute(end_min)}"
                time_open_str = f"{format_minute(open_min)} - {format_minute(close_min)}"

                msg = (
                    f"Xếp lịch ngoài giờ mở cửa: '{place_name}' mở cửa lúc {time_open_str}, "
                    f"nhưng được xếp lịch lúc {time_sched_str} (ngày {day + 1})"
                )

                results.append(
                    ConflictResult(
                        rule_code=self.rule_code,
                        level=ConflictLevel.ERROR,
                        message=msg,
                        entity_type="SCHEDULE",
                        entity_ids=[to_uuid(item["id"])],
                    )
                )

        return results


class DuplicatePlaceConflictRule(IConflictRule):
    """Quy tắc kiểm tra địa điểm trùng lặp trong phòng (DUPLICATE_PLACE).

    Báo WARNING nếu 2 địa điểm có tên giống nhau (>90% tương đồng)
    hoặc khoảng cách tọa độ < 50 mét.
    """

    def __init__(
        self,
        similarity_threshold: float = 0.90,
        distance_threshold_meters: float = 50.0,
    ) -> None:
        """Khởi tạo ngưỡng trùng lặp tên và khoảng cách tọa độ (mét)."""
        self.similarity_threshold = similarity_threshold
        self.distance_threshold_meters = distance_threshold_meters

    @property
    def rule_code(self) -> str:
        return "DUPLICATE_PLACE"

    def evaluate(self, context: ConflictContext) -> list[ConflictResult]:
        results: list[ConflictResult] = []
        places = context.places
        if not places or len(places) < 2:
            return results

        count = len(places)
        for i in range(count):
            for j in range(i + 1, count):
                p1 = places[i]
                p2 = places[j]

                # 1. Kiểm tra tương đồng tên (> 90%)
                name1_norm = " ".join(p1.name.strip().lower().split())
                name2_norm = " ".join(p2.name.strip().lower().split())
                similarity = SequenceMatcher(None, name1_norm, name2_norm).ratio()
                is_name_dup = similarity > self.similarity_threshold

                # 2. Kiểm tra khoảng cách tọa độ < 50 mét
                is_distance_dup = False
                dist_m = 0.0
                if (
                    p1.latitude is not None
                    and p1.longitude is not None
                    and p2.latitude is not None
                    and p2.longitude is not None
                ):
                    dist_km = haversine_distance_km(
                        p1.latitude,
                        p1.longitude,
                        p2.latitude,
                        p2.longitude,
                    )
                    dist_m = dist_km * 1000.0
                    if dist_m < self.distance_threshold_meters:
                        is_distance_dup = True

                if is_name_dup or is_distance_dup:
                    if is_name_dup and is_distance_dup:
                        msg = (
                            f"Địa điểm trùng lặp: '{p1.name}' và '{p2.name}' có tên tương đồng "
                            f"({similarity * 100:.1f}%) và tọa độ cách nhau chỉ {dist_m:.1f}m "
                            f"(< {self.distance_threshold_meters:.0f}m)"
                        )
                    elif is_name_dup:
                        msg = (
                            f"Địa điểm trùng lặp: '{p1.name}' và '{p2.name}' có tên tương đồng "
                            f"({similarity * 100:.1f}% > {self.similarity_threshold * 100:.0f}%)"
                        )
                    else:
                        msg = (
                            f"Địa điểm trùng lặp: '{p1.name}' và '{p2.name}' có khoảng cách quá gần "
                            f"({dist_m:.1f}m < {self.distance_threshold_meters:.0f}m)"
                        )

                    results.append(
                        ConflictResult(
                            rule_code=self.rule_code,
                            level=ConflictLevel.WARNING,
                            message=msg,
                            entity_type="PLACE",
                            entity_ids=[p1.place_id, p2.place_id],
                        )
                    )

        return results


class BudgetThresholdConflictRule(IConflictRule):
    """Quy tắc kiểm tra tổng chi phí vượt ngân sách phòng (BUDGET_THRESHOLD).

    Báo WARNING nếu tổng chi phí ước tính vượt ngân sách budget_limit của phòng.
    """

    def __init__(self, only_accepted: bool = False) -> None:
        """Khởi tạo luật ngân sách.

        Args:
            only_accepted: Nếu True, chỉ tính các địa điểm đã ACCEPTED.
                           Nếu False, ưu tiên ACCEPTED nếu có, nếu chưa có thì tính các địa điểm
                           đã được lên lịch trình hoặc các địa điểm đề xuất (trừ REJECTED).
        """
        self.only_accepted = only_accepted

    @property
    def rule_code(self) -> str:
        return "BUDGET_THRESHOLD"

    def evaluate(self, context: ConflictContext) -> list[ConflictResult]:
        if context.budget_limit is None:
            return []

        # Lọc danh sách địa điểm cần tính chi phí
        if self.only_accepted:
            places_to_count = [p for p in context.places if p.status == PlaceStatus.ACCEPTED]
        else:
            accepted = [p for p in context.places if p.status == PlaceStatus.ACCEPTED]
            if accepted:
                places_to_count = accepted
            elif context.schedule_items:
                scheduled_ids = {
                    str(item.get("place_id"))
                    for item in context.schedule_items
                    if item.get("place_id")
                }
                scheduled_places = [
                    p
                    for p in context.places
                    if str(p.place_id) in scheduled_ids and p.status != PlaceStatus.REJECTED
                ]
                places_to_count = (
                    scheduled_places
                    if scheduled_places
                    else [p for p in context.places if p.status != PlaceStatus.REJECTED]
                )
            else:
                places_to_count = [p for p in context.places if p.status != PlaceStatus.REJECTED]

        total_cost = sum(p.estimated_cost or 0 for p in places_to_count)

        if total_cost > context.budget_limit:
            msg = (
                f"Vượt ngân sách: Tổng chi phí ước tính ({total_cost:,.0f} VNĐ) "
                f"vượt quá ngân sách phòng ({context.budget_limit:,.0f} VNĐ)"
            )
            return [
                ConflictResult(
                    rule_code=self.rule_code,
                    level=ConflictLevel.WARNING,
                    message=msg,
                    entity_type="ROOM",
                    entity_ids=[context.room_id],
                )
            ]

        return []
