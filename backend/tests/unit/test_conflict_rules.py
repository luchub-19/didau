from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest

from app.domain.enums import ConflictLevel, PlaceCategory, PlaceStatus
from app.domain.patterns.conflict_rule import (
    BudgetThresholdConflictRule,
    ConflictContext,
    ConflictDetectionEngine,
    ConflictResult,
    DuplicatePlaceConflictRule,
    IConflictRule,
    OpeningHoursConflictRule,
    PlaceVoteSummary,
    TimeOverlapConflictRule,
    TravelTimeConflictRule,
    format_minute,
    haversine_distance_km,
)


def create_place(
    name: str = "Quán ăn ngon",
    place_id: UUID | None = None,
    category: PlaceCategory = PlaceCategory.FOOD,
    status: PlaceStatus = PlaceStatus.PROPOSED,
    estimated_cost: int = 50000,
    open_minute: int | None = 480,  # 08:00
    close_minute: int | None = 1320,  # 22:00
    latitude: float | None = 10.7769,
    longitude: float | None = 106.7058,
    submitted_by_id: UUID | None = None,
) -> PlaceVoteSummary:
    """Helper tạo đối tượng PlaceVoteSummary nhanh phục vụ test."""
    return PlaceVoteSummary(
        place_id=place_id or uuid4(),
        name=name,
        category=category,
        status=status,
        submitted_by_id=submitted_by_id or uuid4(),
        estimated_cost=estimated_cost,
        open_minute=open_minute,
        close_minute=close_minute,
        latitude=latitude,
        longitude=longitude,
        created_at=datetime.now(UTC),
        upvotes=1,
        downvotes=0,
        score=1,
    )


def create_schedule_item(
    item_id: UUID | None = None,
    place_id: UUID | None = None,
    place_name: str | None = None,
    day_offset: int = 0,
    start_minute: int = 540,  # 09:00
    end_minute: int = 630,  # 10:30
    order_index: int = 0,
    latitude: float | None = None,
    longitude: float | None = None,
    open_minute: int | None = None,
    close_minute: int | None = None,
) -> dict:
    """Helper tạo dictionary schedule item mô phỏng theo CONTRACTS.md."""
    res = {
        "id": item_id or uuid4(),
        "day_offset": day_offset,
        "start_minute": start_minute,
        "end_minute": end_minute,
        "order_index": order_index,
    }
    if place_id is not None:
        res["place_id"] = place_id
    if place_name is not None:
        res["place_name"] = place_name
    if latitude is not None:
        res["latitude"] = latitude
    if longitude is not None:
        res["longitude"] = longitude
    if open_minute is not None:
        res["open_minute"] = open_minute
    if close_minute is not None:
        res["close_minute"] = close_minute
    return res


@pytest.fixture
def base_context() -> ConflictContext:
    return ConflictContext(
        room_id=UUID("00000000-0000-0000-0000-000000000001"),
        budget_limit=1_000_000,
        places=[],
        schedule_items=[],
    )


# ==============================================================================
# 1. Helper Functions Tests (haversine & format_minute)
# ==============================================================================


def test_format_minute_standard():
    assert format_minute(0) == "00:00"
    assert format_minute(540) == "09:00"
    assert format_minute(630) == "10:30"
    assert format_minute(1439) == "23:59"
    # Clamping test
    assert format_minute(-10) == "00:00"
    assert format_minute(2000) == "23:59"


def test_haversine_distance_same_point():
    lat, lon = 10.7769, 106.7058
    dist = haversine_distance_km(lat, lon, lat, lon)
    assert dist == pytest.approx(0.0, abs=1e-5)


def test_haversine_distance_hcmc_to_hanoi():
    # Tọa độ TP.HCM và Hà Nội xấp xỉ ~1100-1200 km
    lat_hcm, lon_hcm = 10.7769, 106.7058
    lat_hn, lon_hn = 21.0285, 105.8542
    dist = haversine_distance_km(lat_hcm, lon_hcm, lat_hn, lon_hn)
    assert 1100.0 < dist < 1200.0


# ==============================================================================
# 2. TimeOverlapConflictRule Tests
# ==============================================================================


def test_time_overlap_empty_or_single_item(base_context):
    rule = TimeOverlapConflictRule()
    assert rule.evaluate(base_context) == []

    base_context.schedule_items = [create_schedule_item()]
    assert rule.evaluate(base_context) == []


def test_time_overlap_consecutive_non_overlapping(base_context):
    rule = TimeOverlapConflictRule()
    # 09:00 - 10:00 và 10:00 - 11:00 (chạm biên, không trùng)
    item1 = create_schedule_item(start_minute=540, end_minute=600)
    item2 = create_schedule_item(start_minute=600, end_minute=660)
    base_context.schedule_items = [item1, item2]

    results = rule.evaluate(base_context)
    assert len(results) == 0


def test_time_overlap_different_days(base_context):
    rule = TimeOverlapConflictRule()
    # Cùng khung giờ nhưng khác ngày (day_offset 0 vs 1)
    item1 = create_schedule_item(day_offset=0, start_minute=540, end_minute=630)
    item2 = create_schedule_item(day_offset=1, start_minute=540, end_minute=630)
    base_context.schedule_items = [item1, item2]

    results = rule.evaluate(base_context)
    assert len(results) == 0


def test_time_overlap_detected(base_context):
    rule = TimeOverlapConflictRule()
    p1 = create_place(name="Cà Phê Trứng 3T")
    p2 = create_place(name="Cơm Tấm Ba Ghiền")
    base_context.places = [p1, p2]

    # 09:00 - 10:30 (540 - 630) đè với 10:00 - 11:30 (600 - 690)
    id1, id2 = uuid4(), uuid4()
    item1 = create_schedule_item(
        item_id=id1, place_id=p1.place_id, day_offset=0, start_minute=540, end_minute=630
    )
    item2 = create_schedule_item(
        item_id=id2, place_id=p2.place_id, day_offset=0, start_minute=600, end_minute=690
    )
    base_context.schedule_items = [item1, item2]

    results = rule.evaluate(base_context)
    assert len(results) == 1
    conflict = results[0]
    assert conflict.rule_code == "TIME_OVERLAP"
    assert conflict.level == ConflictLevel.CRITICAL
    assert conflict.entity_type == "SCHEDULE"
    assert id1 in conflict.entity_ids
    assert id2 in conflict.entity_ids
    assert "Cà Phê Trứng 3T" in conflict.message
    assert "Cơm Tấm Ba Ghiền" in conflict.message
    assert "09:00 - 10:30" in conflict.message
    assert "10:00 - 11:30" in conflict.message


def test_time_overlap_complete_enclosure(base_context):
    rule = TimeOverlapConflictRule()
    # 08:00 - 12:00 bao trọn 09:00 - 10:00
    item1 = create_schedule_item(start_minute=480, end_minute=720, place_name="Chợ Bến Thành")
    item2 = create_schedule_item(start_minute=540, end_minute=600, place_name="Quán Nước")
    base_context.schedule_items = [item1, item2]

    results = rule.evaluate(base_context)
    assert len(results) == 1
    assert results[0].level == ConflictLevel.CRITICAL


# ==============================================================================
# 3. TravelTimeConflictRule Tests
# ==============================================================================


def test_travel_time_empty_or_single(base_context):
    rule = TravelTimeConflictRule()
    assert rule.evaluate(base_context) == []
    base_context.schedule_items = [create_schedule_item()]
    assert rule.evaluate(base_context) == []


def test_travel_time_sufficient_gap(base_context):
    rule = TravelTimeConflictRule(average_speed_kmh=30.0)
    # 2 địa điểm cách nhau khoảng 1 km (~2 phút di chuyển), gap là 30 phút
    # Tọa độ Q1 TP.HCM cách nhau ~1km
    p1 = create_place(name="Bưu điện TP", latitude=10.7797, longitude=106.6999)
    p2 = create_place(name="Chợ Bến Thành", latitude=10.7725, longitude=106.6980)
    base_context.places = [p1, p2]

    item1 = create_schedule_item(
        place_id=p1.place_id, day_offset=0, start_minute=540, end_minute=600  # 09:00-10:00
    )
    item2 = create_schedule_item(
        place_id=p2.place_id, day_offset=0, start_minute=630, end_minute=690  # 10:30-11:30 (nghỉ 30p)
    )
    base_context.schedule_items = [item1, item2]

    results = rule.evaluate(base_context)
    assert len(results) == 0


def test_travel_time_insufficient_gap_triggers_warning(base_context):
    rule = TravelTimeConflictRule(average_speed_kmh=30.0)
    # Tọa độ Quận 1 đến Quận 9 (cách nhau ~15 km).
    # Với vận tốc 30 km/h cần ~30 phút di chuyển.
    # Nhưng gap thời gian chỉ có 5 phút (kết thúc 10:00, bắt đầu 10:05).
    p1 = create_place(name="Nhà thờ Đức Bà", latitude=10.7797, longitude=106.6990)
    p2 = create_place(name="Khu Công Nghệ Cao Q9", latitude=10.8550, longitude=106.7850)
    base_context.places = [p1, p2]

    id1, id2 = uuid4(), uuid4()
    item1 = create_schedule_item(
        item_id=id1, place_id=p1.place_id, day_offset=0, start_minute=540, end_minute=600
    )
    item2 = create_schedule_item(
        item_id=id2, place_id=p2.place_id, day_offset=0, start_minute=605, end_minute=665
    )
    base_context.schedule_items = [item1, item2]

    results = rule.evaluate(base_context)
    assert len(results) == 1
    conflict = results[0]
    assert conflict.rule_code == "TRAVEL_TIME"
    assert conflict.level == ConflictLevel.WARNING
    assert conflict.entity_type == "SCHEDULE"
    assert id1 in conflict.entity_ids
    assert id2 in conflict.entity_ids
    assert "Nhà thờ Đức Bà" in conflict.message
    assert "Khu Công Nghệ Cao Q9" in conflict.message
    assert "Thời gian di chuyển không đủ" in conflict.message


def test_travel_time_missing_coordinates_skipped(base_context):
    rule = TravelTimeConflictRule()
    p1 = create_place(name="Quán A", latitude=None, longitude=None)
    p2 = create_place(name="Quán B", latitude=10.7797, longitude=106.6990)
    base_context.places = [p1, p2]

    item1 = create_schedule_item(place_id=p1.place_id, start_minute=540, end_minute=600)
    item2 = create_schedule_item(place_id=p2.place_id, start_minute=605, end_minute=665)
    base_context.schedule_items = [item1, item2]

    results = rule.evaluate(base_context)
    assert len(results) == 0


def test_travel_time_same_location_no_conflict(base_context):
    rule = TravelTimeConflictRule()
    # 2 sự kiện tại cùng 1 vị trí, cách nhau 0 phút
    item1 = create_schedule_item(
        latitude=10.7769, longitude=106.7058, start_minute=540, end_minute=600
    )
    item2 = create_schedule_item(
        latitude=10.7769, longitude=106.7058, start_minute=600, end_minute=660
    )
    base_context.schedule_items = [item1, item2]

    results = rule.evaluate(base_context)
    assert len(results) == 0


# ==============================================================================
# 4. OpeningHoursConflictRule Tests
# ==============================================================================


def test_opening_hours_empty(base_context):
    rule = OpeningHoursConflictRule()
    assert rule.evaluate(base_context) == []


def test_opening_hours_within_window(base_context):
    rule = OpeningHoursConflictRule()
    # Mở cửa: 08:00 (480) - 22:00 (1320)
    # Lịch trình: 09:00 (540) - 10:30 (630)
    p = create_place(name="Quán Cafe", open_minute=480, close_minute=1320)
    base_context.places = [p]
    item = create_schedule_item(place_id=p.place_id, start_minute=540, end_minute=630)
    base_context.schedule_items = [item]

    results = rule.evaluate(base_context)
    assert len(results) == 0


def test_opening_hours_too_early_triggers_error(base_context):
    rule = OpeningHoursConflictRule()
    # Mở cửa: 08:00 (480) - 22:00 (1320)
    # Lịch trình: 06:30 (390) - 08:30 (510) -> bắt đầu trước giờ mở cửa
    p = create_place(name="Quán Cafe Sớm", open_minute=480, close_minute=1320)
    base_context.places = [p]
    item_id = uuid4()
    item = create_schedule_item(
        item_id=item_id, place_id=p.place_id, start_minute=390, end_minute=510
    )
    base_context.schedule_items = [item]

    results = rule.evaluate(base_context)
    assert len(results) == 1
    conflict = results[0]
    assert conflict.rule_code == "OPENING_HOURS"
    assert conflict.level == ConflictLevel.ERROR
    assert conflict.entity_type == "SCHEDULE"
    assert item_id in conflict.entity_ids
    assert "Quán Cafe Sớm" in conflict.message
    assert "08:00 - 22:00" in conflict.message
    assert "06:30 - 08:30" in conflict.message


def test_opening_hours_too_late_triggers_error(base_context):
    rule = OpeningHoursConflictRule()
    # Mở cửa: 08:00 (480) - 21:00 (1260)
    # Lịch trình: 20:30 (1230) - 22:00 (1320) -> kết thúc sau giờ đóng cửa
    p = create_place(name="Tiệm Bánh", open_minute=480, close_minute=1260)
    base_context.places = [p]
    item = create_schedule_item(place_id=p.place_id, start_minute=1230, end_minute=1320)
    base_context.schedule_items = [item]

    results = rule.evaluate(base_context)
    assert len(results) == 1
    assert results[0].level == ConflictLevel.ERROR


def test_opening_hours_overnight_valid_and_invalid(base_context):
    rule = OpeningHoursConflictRule()
    # Quán bar mở đêm: 20:00 (1200) đến 04:00 (240) sáng hôm sau
    p = create_place(name="Night Club", open_minute=1200, close_minute=240)
    base_context.places = [p]

    # Hợp lệ lúc 22:00 - 23:30 (1320 - 1410)
    item_valid = create_schedule_item(place_id=p.place_id, start_minute=1320, end_minute=1410)
    base_context.schedule_items = [item_valid]
    assert rule.evaluate(base_context) == []

    # Không hợp lệ lúc 10:00 - 12:00 trưa (600 - 720)
    item_invalid = create_schedule_item(place_id=p.place_id, start_minute=600, end_minute=720)
    base_context.schedule_items = [item_invalid]
    results = rule.evaluate(base_context)
    assert len(results) == 1
    assert results[0].level == ConflictLevel.ERROR


# ==============================================================================
# 5. DuplicatePlaceConflictRule Tests
# ==============================================================================


def test_duplicate_place_empty_or_single(base_context):
    rule = DuplicatePlaceConflictRule()
    assert rule.evaluate(base_context) == []
    base_context.places = [create_place()]
    assert rule.evaluate(base_context) == []


def test_duplicate_place_distinct(base_context):
    rule = DuplicatePlaceConflictRule()
    p1 = create_place(name="Phở Bát Đàn", latitude=21.0333, longitude=105.8450)
    p2 = create_place(name="Cơm Tấm Cali", latitude=10.7769, longitude=106.7058)
    base_context.places = [p1, p2]

    results = rule.evaluate(base_context)
    assert len(results) == 0


def test_duplicate_place_similar_names_triggers_warning(base_context):
    rule = DuplicatePlaceConflictRule(similarity_threshold=0.90)
    # Tên gần như hệt nhau (>90% tương đồng)
    p1 = create_place(name="Phở Thìn 13 Lò Đúc", latitude=21.0180, longitude=105.8550)
    p2 = create_place(name="Phở Thìn 13 Lò Đúc.", latitude=21.0500, longitude=105.8900)
    base_context.places = [p1, p2]

    results = rule.evaluate(base_context)
    assert len(results) == 1
    conflict = results[0]
    assert conflict.rule_code == "DUPLICATE_PLACE"
    assert conflict.level == ConflictLevel.WARNING
    assert conflict.entity_type == "PLACE"
    assert p1.place_id in conflict.entity_ids
    assert p2.place_id in conflict.entity_ids
    assert "tương đồng" in conflict.message


def test_duplicate_place_close_coordinates_triggers_warning(base_context):
    rule = DuplicatePlaceConflictRule(distance_threshold_meters=50.0)
    # Hai quán tên khác nhau nhưng tọa độ lệch nhau chỉ ~15 mét
    # 0.0001 độ vĩ độ xấp xỉ 11 mét
    lat1, lon1 = 10.77690, 106.70580
    lat2, lon2 = 10.77700, 106.70585
    p1 = create_place(name="Cà phê Góc Phố", latitude=lat1, longitude=lon1)
    p2 = create_place(name="Highlands Coffee", latitude=lat2, longitude=lon2)
    base_context.places = [p1, p2]

    dist = haversine_distance_km(lat1, lon1, lat2, lon2) * 1000.0
    assert dist < 50.0

    results = rule.evaluate(base_context)
    assert len(results) == 1
    conflict = results[0]
    assert conflict.rule_code == "DUPLICATE_PLACE"
    assert conflict.level == ConflictLevel.WARNING
    assert conflict.entity_type == "PLACE"
    assert p1.place_id in conflict.entity_ids
    assert p2.place_id in conflict.entity_ids
    assert "khoảng cách quá gần" in conflict.message


# ==============================================================================
# 6. BudgetThresholdConflictRule Tests
# ==============================================================================


def test_budget_threshold_no_limit(base_context):
    rule = BudgetThresholdConflictRule()
    base_context.budget_limit = None
    base_context.places = [create_place(estimated_cost=2_000_000)]
    assert rule.evaluate(base_context) == []


def test_budget_threshold_within_budget(base_context):
    rule = BudgetThresholdConflictRule()
    base_context.budget_limit = 500_000
    base_context.places = [
        create_place(estimated_cost=200_000),
        create_place(estimated_cost=250_000),
    ]
    assert rule.evaluate(base_context) == []


def test_budget_threshold_exceeded_triggers_warning(base_context):
    rule = BudgetThresholdConflictRule()
    base_context.budget_limit = 500_000
    p1 = create_place(name="Nhà hàng 5 Sao", estimated_cost=400_000)
    p2 = create_place(name="Quán Bar", estimated_cost=300_000)
    base_context.places = [p1, p2]

    results = rule.evaluate(base_context)
    assert len(results) == 1
    conflict = results[0]
    assert conflict.rule_code == "BUDGET_THRESHOLD"
    assert conflict.level == ConflictLevel.WARNING
    assert conflict.entity_type == "ROOM"
    assert conflict.entity_ids == [base_context.room_id]
    assert "700,000" in conflict.message
    assert "500,000" in conflict.message


def test_budget_threshold_prioritizes_accepted_places(base_context):
    rule = BudgetThresholdConflictRule()
    base_context.budget_limit = 500_000
    # Địa điểm đã được ACCEPTED chỉ có 300_000 (dưới 500_000)
    # Địa điểm PROPOSED có 600_000 nhưng chưa được chấp nhận
    p_accepted = create_place(estimated_cost=300_000, status=PlaceStatus.ACCEPTED)
    p_proposed = create_place(estimated_cost=600_000, status=PlaceStatus.PROPOSED)
    base_context.places = [p_accepted, p_proposed]

    # Vì đã có địa điểm ACCEPTED, chỉ tính các địa điểm ACCEPTED -> không vượt ngân sách
    assert rule.evaluate(base_context) == []


def test_budget_threshold_excludes_rejected_places(base_context):
    rule = BudgetThresholdConflictRule()
    base_context.budget_limit = 500_000
    p_active = create_place(estimated_cost=400_000, status=PlaceStatus.PROPOSED)
    p_rejected = create_place(estimated_cost=300_000, status=PlaceStatus.REJECTED)
    base_context.places = [p_active, p_rejected]

    # Tổng loại trừ REJECTED là 400_000 <= 500_000 -> không vượt
    assert rule.evaluate(base_context) == []


# ==============================================================================
# 7. ConflictDetectionEngine Tests
# ==============================================================================


def test_engine_default_initialization():
    engine = ConflictDetectionEngine()
    assert len(engine.rules) == 5
    codes = [r.rule_code for r in engine.rules]
    assert "TIME_OVERLAP" in codes
    assert "TRAVEL_TIME" in codes
    assert "OPENING_HOURS" in codes
    assert "DUPLICATE_PLACE" in codes
    assert "BUDGET_THRESHOLD" in codes


def test_engine_register_and_unregister():
    engine = ConflictDetectionEngine([])
    assert len(engine.rules) == 0

    rule = TimeOverlapConflictRule()
    engine.register_rule(rule)
    assert len(engine.rules) == 1
    assert engine.get_rule("TIME_OVERLAP") is rule

    unreg_ok = engine.unregister_rule("TIME_OVERLAP")
    assert unreg_ok is True
    assert len(engine.rules) == 0
    assert engine.get_rule("TIME_OVERLAP") is None


def test_engine_evaluate_all_comprehensive_scenario(base_context):
    engine = ConflictDetectionEngine()

    p1 = create_place(
        name="Cà Phê Trứng 3T",
        open_minute=480,  # 08:00
        close_minute=1200,  # 20:00
        latitude=10.7769,
        longitude=106.7058,
        estimated_cost=600_000,
    )
    p2 = create_place(
        name="Cơm Tấm Ba Ghiền",
        open_minute=480,
        close_minute=1200,
        latitude=10.7915,
        longitude=106.6690,  # Cách p1 khoảng ~5 km (~10p di chuyển)
        estimated_cost=600_000,
    )
    # Tạo p3 trùng tên p1
    p3 = create_place(
        name="Cà Phê Trứng 3T",
        latitude=21.0,
        longitude=105.0,
        estimated_cost=100_000,
    )

    base_context.places = [p1, p2, p3]
    base_context.budget_limit = 1_000_000  # Tổng cost = 1.3tr -> vượt ngân sách

    # Schedule: p1 từ 09:00 - 10:30 (540 - 630), p2 từ 10:00 - 11:30 (600 - 690) -> trùng giờ
    item1 = create_schedule_item(place_id=p1.place_id, start_minute=540, end_minute=630)
    item2 = create_schedule_item(place_id=p2.place_id, start_minute=600, end_minute=690)
    base_context.schedule_items = [item1, item2]

    results = engine.evaluate_all(base_context)
    rule_codes = {r.rule_code for r in results}

    # Kỳ vọng phát hiện đồng thời: TIME_OVERLAP, DUPLICATE_PLACE, BUDGET_THRESHOLD
    assert "TIME_OVERLAP" in rule_codes
    assert "DUPLICATE_PLACE" in rule_codes
    assert "BUDGET_THRESHOLD" in rule_codes


class CustomRule(IConflictRule):
    @property
    def rule_code(self) -> str:
        return "CUSTOM_TEST_RULE"

    def evaluate(self, context: ConflictContext) -> list[ConflictResult]:
        return [
            ConflictResult(
                rule_code=self.rule_code,
                level=ConflictLevel.INFO,
                message="Kiểm thử custom rule",
                entity_type="ROOM",
                entity_ids=[context.room_id],
            )
        ]


def test_engine_custom_rule(base_context):
    engine = ConflictDetectionEngine([CustomRule()])
    results = engine.evaluate_all(base_context)
    assert len(results) == 1
    assert results[0].rule_code == "CUSTOM_TEST_RULE"
    assert results[0].level == ConflictLevel.INFO


def test_cr06_all_rules_generate_valid_params(base_context):
    """Kiểm tra mọi quy tắc xung đột sinh ra trường params đúng khoá theo CR-06."""
    # 1. TIME_OVERLAP
    p1 = create_place(name="Quán 1")
    p2 = create_place(name="Quán 2")
    base_context.places = [p1, p2]
    item1 = create_schedule_item(place_id=p1.place_id, start_minute=540, end_minute=630, day_offset=0)
    item2 = create_schedule_item(place_id=p2.place_id, start_minute=600, end_minute=690, day_offset=0)
    base_context.schedule_items = [item1, item2]

    overlap_results = TimeOverlapConflictRule().evaluate(base_context)
    assert len(overlap_results) == 1
    p_overlap = overlap_results[0].params
    assert "item_ids" in p_overlap and len(p_overlap["item_ids"]) == 2
    assert "place_names" in p_overlap and p_overlap["place_names"] == ["Quán 1", "Quán 2"]
    assert "ranges" in p_overlap and len(p_overlap["ranges"]) == 2
    assert p_overlap["ranges"][0] == {"start_minute": 540, "end_minute": 630, "day_offset": 0}
    assert p_overlap["ranges"][1] == {"start_minute": 600, "end_minute": 690, "day_offset": 0}

    # 2. TRAVEL_TIME
    p_loc1 = create_place(name="Điểm A", latitude=10.7769, longitude=106.7009)
    p_loc2 = create_place(name="Điểm B", latitude=10.8231, longitude=106.6297)  # ~9.5 km
    base_context.places = [p_loc1, p_loc2]
    sched1 = create_schedule_item(place_id=p_loc1.place_id, start_minute=500, end_minute=600, order_index=1)
    sched2 = create_schedule_item(place_id=p_loc2.place_id, start_minute=605, end_minute=700, order_index=2)  # gap = 5 min
    base_context.schedule_items = [sched1, sched2]

    travel_results = TravelTimeConflictRule(average_speed_kmh=30.0).evaluate(base_context)
    assert len(travel_results) == 1
    p_travel = travel_results[0].params
    assert p_travel["from_item_id"] == str(sched1["id"])
    assert p_travel["to_item_id"] == str(sched2["id"])
    assert p_travel["place_names"] == ["Điểm A", "Điểm B"]
    assert p_travel["gap_min"] == 5
    assert p_travel["travel_min"] > 5
    assert p_travel["distance_km"] > 0

    # 3. OPENING_HOURS
    p_open = create_place(name="Cà Phê Sáng", open_minute=480, close_minute=720)  # 08:00 - 12:00
    base_context.places = [p_open]
    sched_late = create_schedule_item(place_id=p_open.place_id, start_minute=780, end_minute=840)  # 13:00 - 14:00
    base_context.schedule_items = [sched_late]

    hours_results = OpeningHoursConflictRule().evaluate(base_context)
    assert len(hours_results) == 1
    p_hours = hours_results[0].params
    assert p_hours["item_id"] == str(sched_late["id"])
    assert p_hours["place_name"] == "Cà Phê Sáng"
    assert p_hours["start_minute"] == 780
    assert p_hours["end_minute"] == 840
    assert p_hours["open_minute"] == 480
    assert p_hours["close_minute"] == 720

    # 4. DUPLICATE_PLACE
    p_dup1 = create_place(name="Trà Sữa Koi Thé", latitude=10.770, longitude=106.690)
    p_dup2 = create_place(name="Trà Sữa Koi Thé.", latitude=10.771, longitude=106.691)
    base_context.places = [p_dup1, p_dup2]
    base_context.schedule_items = []

    dup_results = DuplicatePlaceConflictRule(similarity_threshold=0.9).evaluate(base_context)
    assert len(dup_results) == 1
    p_dup = dup_results[0].params
    assert p_dup["place_ids"] == [str(p_dup1.place_id), str(p_dup2.place_id)]
    assert p_dup["place_names"] == ["Trà Sữa Koi Thé", "Trà Sữa Koi Thé."]
    assert p_dup["similarity"] > 0.9
    assert "distance_m" in p_dup

    # 5. BUDGET_THRESHOLD
    p_cost = create_place(name="Nhà hàng sang", estimated_cost=500_000)
    base_context.places = [p_cost]
    base_context.budget_limit = 200_000

    budget_results = BudgetThresholdConflictRule().evaluate(base_context)
    assert len(budget_results) == 1
    p_budget = budget_results[0].params
    assert p_budget["total_cost"] == 500_000
    assert p_budget["budget_limit"] == 200_000

