import re
from datetime import date
from uuid import uuid4

from app.domain.enums import PlaceCategory
from app.domain.patterns.decision import (
    SmartPickContext,
    SmartPickScorer,
    SmartPickWeights,
)


def test_smart_pick_empty_candidates():
    """Danh sách rỗng trả về rỗng."""
    scorer = SmartPickScorer()
    assert scorer.rank([]) == []


def test_smart_pick_single_candidate():
    """Một ứng viên duy nhất trả về kết quả kèm lý do cụ thể."""
    pid = uuid4()
    candidate = {
        "id": pid,
        "name": "Bánh mì Huỳnh Hoa",
        "category": "FOOD",
        "score": 4,
        "upvotes": 4,
        "estimated_cost": 65000,
        "latitude": 10.7712,
        "longitude": 106.6934,
    }
    scorer = SmartPickScorer()
    ctx = SmartPickContext(origin_lat=10.7720, origin_lng=106.6940)
    picks = scorer.rank([candidate], ctx)

    assert len(picks) == 1
    assert picks[0].place_id == pid
    assert picks[0].score > 0
    assert len(picks[0].reasons) >= 1
    # Có lý do chứa số liệu
    assert any("km" in r or "đ" in r or "điểm" in r for r in picks[0].reasons)


def test_smart_pick_ranking_by_vote():
    """Ứng viên có vote cao hơn được xếp trên khi các yếu tố khác ngang nhau."""
    id1, id2 = uuid4(), uuid4()
    c1 = {"id": id1, "name": "Quán A", "category": "FOOD", "score": 10, "upvotes": 10}
    c2 = {"id": id2, "name": "Quán B", "category": "FOOD", "score": 2, "upvotes": 2}

    scorer = SmartPickScorer()
    picks = scorer.rank([c1, c2])

    assert picks[0].place_id == id1
    assert picks[0].score > picks[1].score
    assert any("10" in r and "điểm" in r for r in picks[0].reasons)


def test_smart_pick_ranking_by_distance():
    """Ứng viên gần điểm hẹn hơn được xếp trên khi ưu tiên khoảng cách."""
    id_near, id_far = uuid4(), uuid4()
    # Điểm hẹn tại Nhà thờ Đức Bà: 10.77978, 106.69902
    origin_lat, origin_lng = 10.77978, 106.69902

    # Quán gần: Bưu điện TP (cách ~0.2 km)
    c_near = {
        "id": id_near,
        "name": "Bưu điện TP",
        "category": "SIGHTSEEING",
        "latitude": 10.7799,
        "longitude": 106.6999,
    }
    # Quán xa: Sân bay Tân Sơn Nhất (cách ~6 km)
    c_far = {
        "id": id_far,
        "name": "Sân bay TSN",
        "category": "SIGHTSEEING",
        "latitude": 10.8185,
        "longitude": 106.6588,
    }

    # Đặt trọng số khoảng cách chiếm ưu thế
    weights = SmartPickWeights(
        vote=0.0,
        distance=0.8,
        opening_hours=0.0,
        budget=0.0,
        category_diversity=0.0,
        internal_review=0.2,
    )
    scorer = SmartPickScorer(weights=weights)
    ctx = SmartPickContext(origin_lat=origin_lat, origin_lng=origin_lng)
    picks = scorer.rank([c_far, c_near], ctx)

    assert picks[0].place_id == id_near
    assert picks[0].score > picks[1].score
    # Lý do phải có khoảng cách cụ thể dạng km
    assert any(re.search(r"\d+\.\d+\s*km", r) for r in picks[0].reasons)


def test_smart_pick_ranking_by_opening_hours():
    """Quán đang mở cửa tại giờ hẹn được ưu tiên điểm hơn quán đóng cửa."""
    id_open, id_closed = uuid4(), uuid4()

    # Hẹn lúc 18:00 (1080 phút)
    c_open = {
        "id": id_open,
        "name": "Quán mở tối",
        "category": "FOOD",
        "open_minute": 1020,  # 17:00
        "close_minute": 1380,  # 23:00
    }
    c_closed = {
        "id": id_closed,
        "name": "Quán chỉ bán sáng",
        "category": "FOOD",
        "open_minute": 360,  # 06:00
        "close_minute": 720,  # 12:00
    }

    weights = SmartPickWeights(
        vote=0.0,
        distance=0.0,
        opening_hours=0.9,
        budget=0.0,
        category_diversity=0.0,
        internal_review=0.1,
    )
    scorer = SmartPickScorer(weights=weights)
    ctx = SmartPickContext(target_minute=1080)
    picks = scorer.rank([c_closed, c_open], ctx)

    assert picks[0].place_id == id_open
    assert picks[0].score > picks[1].score
    assert any("18:00" in r for r in picks[0].reasons)


def test_smart_pick_opening_hours_raw_osm():
    """Hỗ trợ phân tích cú pháp chuỗi opening_hours_raw theo định dạng OSM."""
    id_osm = uuid4()
    candidate = {
        "id": id_osm,
        "name": "Cafe OSM",
        "category": "DRINK",
        "opening_hours_raw": "Mo-Fr 07:00-22:00; Sa,Su 08:00-23:00",
    }
    scorer = SmartPickScorer()
    # Thứ Hai (weekday 0), 14:00 (840 phút) -> mở cửa
    ctx = SmartPickContext(target_minute=840, target_date=date(2026, 10, 19))
    picks = scorer.rank([candidate], ctx)

    assert picks[0].place_id == id_osm
    assert any("14:00" in r for r in picks[0].reasons)


def test_smart_pick_ranking_by_budget():
    """Quán vừa ngân sách hoặc rẻ hơn được ưu tiên khi cấu hình trần ngân sách."""
    id_cheap, id_expensive = uuid4(), uuid4()
    c_cheap = {
        "id": id_cheap,
        "name": "Quán bình dân",
        "category": "FOOD",
        "estimated_cost": 40000,
    }
    c_expensive = {
        "id": id_expensive,
        "name": "Nhà hàng cao cấp",
        "category": "FOOD",
        "estimated_cost": 500000,
    }

    weights = SmartPickWeights(
        vote=0.0,
        distance=0.0,
        opening_hours=0.0,
        budget=0.9,
        category_diversity=0.0,
        internal_review=0.1,
    )
    scorer = SmartPickScorer(weights=weights)
    ctx = SmartPickContext(budget_limit=100000)
    picks = scorer.rank([c_expensive, c_cheap], ctx)

    assert picks[0].place_id == id_cheap
    assert picks[0].score > picks[1].score
    # Lý do có số tiền và ngân sách trần
    assert any("40,000" in r or "40000" in r for r in picks[0].reasons)


def test_smart_pick_ranking_by_category_diversity():
    """Địa điểm thuộc category mà nhóm chưa có được cộng điểm đa dạng trải nghiệm."""
    id_drink, id_food = uuid4(), uuid4()
    c_drink = {"id": id_drink, "name": "Trà sữa", "category": "DRINK"}
    c_food = {"id": id_food, "name": "Cơm tấm", "category": "FOOD"}

    weights = SmartPickWeights(
        vote=0.0,
        distance=0.0,
        opening_hours=0.0,
        budget=0.0,
        category_diversity=0.9,
        internal_review=0.1,
    )
    scorer = SmartPickScorer(weights=weights)
    # Nhóm đã chốt FOOD, cần DRINK
    ctx = SmartPickContext(already_accepted_categories=[PlaceCategory.FOOD])
    picks = scorer.rank([c_food, c_drink], ctx)

    assert picks[0].place_id == id_drink
    assert any("Đa dạng trải nghiệm" in r or "quán nước" in r for r in picks[0].reasons)


def test_smart_pick_ranking_by_internal_reviews():
    """Đánh giá nội bộ cao được cộng điểm và hiển thị số sao ⭐ trong lý do."""
    id1, id2 = uuid4(), uuid4()
    c1 = {"id": id1, "name": "Quán ngon được khen", "category": "FOOD"}
    c2 = {"id": id2, "name": "Quán ít đánh giá", "category": "FOOD"}

    weights = SmartPickWeights(
        vote=0.0,
        distance=0.0,
        opening_hours=0.0,
        budget=0.0,
        category_diversity=0.0,
        internal_review=1.0,
    )
    scorer = SmartPickScorer(weights=weights)
    ctx = SmartPickContext(internal_ratings={str(id1): 4.8, str(id2): 2.0})
    picks = scorer.rank([c2, c1], ctx)

    assert picks[0].place_id == id1
    assert any("4.8⭐" in r for r in picks[0].reasons)


def test_reasons_contain_concrete_numbers():
    """Tiêu chí hoàn thành: Mọi lý do sinh ra đều chứa số liệu cụ thể (km, giờ, đ, ⭐, điểm)."""
    pid = uuid4()
    candidate = {
        "id": pid,
        "name": "Quán Chuẩn Số Liệu",
        "category": "FOOD",
        "latitude": 10.7712,
        "longitude": 106.6934,
        "score": 5,
        "upvotes": 5,
        "open_minute": 480,
        "close_minute": 1320,
        "estimated_cost": 50000,
    }
    scorer = SmartPickScorer()
    ctx = SmartPickContext(
        origin_lat=10.7750,
        origin_lng=106.6950,
        target_minute=720,
        budget_limit=100000,
        internal_ratings={str(pid): 4.5},
    )
    picks = scorer.rank([candidate], ctx)

    assert len(picks) == 1
    assert len(picks[0].reasons) >= 2
    for r in picks[0].reasons:
        # Kiểm tra xem có chứa chữ số nào không
        assert re.search(r"\d", r), f"Lý do '{r}' không chứa số liệu cụ thể!"


def test_smart_pick_deterministic_with_same_input():
    """Chạy nhiều lần với cùng dữ liệu đầu vào luôn cho ra cùng thứ tự và điểm số."""
    candidates = [
        {"id": uuid4(), "name": f"Quán {i}", "score": i, "estimated_cost": i * 10000}
        for i in range(5)
    ]
    scorer = SmartPickScorer()
    res1 = scorer.rank(candidates)
    res2 = scorer.rank(candidates)

    assert [p.place_id for p in res1] == [p.place_id for p in res2]
    assert [p.score for p in res1] == [p.score for p in res2]
    assert [p.reasons for p in res1] == [p.reasons for p in res2]


def test_smart_pick_safe_with_none_fields():
    """Xử lý an toàn khi các trường tọa độ, giờ giấc, ngân sách bị None."""
    candidate = {
        "id": uuid4(),
        "name": "Quán Không Đủ Thông Tin",
        "category": None,
        "latitude": None,
        "longitude": None,
        "score": None,
        "open_minute": None,
        "close_minute": None,
        "estimated_cost": None,
    }
    scorer = SmartPickScorer()
    picks = scorer.rank([candidate])
    assert len(picks) == 1
    assert picks[0].score >= 0.0
    assert len(picks[0].reasons) >= 1


def test_cr06_smart_pick_reason_codes():
    """Kiểm tra CR-06: reason_codes có độ dài bằng reasons và đúng mã cho các trường hợp."""
    pid1 = uuid4()
    candidate1 = {
        "id": pid1,
        "name": "Quán A",
        "category": "FOOD",
        "latitude": 10.7751,
        "longitude": 106.6951,  # Rất gần origin (~0.1 km)
        "score": 10,
        "upvotes": 8,
        "open_minute": 480,
        "close_minute": 1320,  # Mở cửa lúc 720
        "estimated_cost": 45000,
    }
    pid2 = uuid4()
    candidate2 = {
        "id": pid2,
        "name": "Quán B",
        "category": "DRINK",
        "latitude": 10.8200,
        "longitude": 106.6200,  # Xa hơn
        "score": 3,
        "upvotes": 2,
        "open_minute": 0,
        "close_minute": 1439,
        "estimated_cost": 0,  # FREE
    }

    scorer = SmartPickScorer()
    ctx = SmartPickContext(
        origin_lat=10.7750,
        origin_lng=106.6950,
        target_minute=720,
        budget_limit=100000,
    )
    picks = scorer.rank([candidate1, candidate2], ctx)

    # 1. Độ dài reason_codes phải bằng reasons cho tất cả các picks
    for p in picks:
        assert len(p.reason_codes) == len(p.reasons)

    # 2. Quán A: được vote cao nhất, gần nhất, đang mở
    top_pick = picks[0]
    assert top_pick.place_id == pid1
    codes = [rc["code"] for rc in top_pick.reason_codes]
    assert "TOP_VOTED" in codes
    assert "NEAREST" in codes or "NEAR" in codes
    assert "OPEN_AT" in codes

    # Quán C: chỉ có vote vừa phải và vừa ngân sách -> có WITHIN_BUDGET
    pid3 = uuid4()
    candidate3 = {
        "id": pid3,
        "name": "Quán C",
        "category": "FOOD",
        "score": 1,
        "estimated_cost": 30000,
    }
    picks3 = scorer.rank([candidate3], ctx)
    codes3 = [rc["code"] for rc in picks3[0].reason_codes]
    assert "WITHIN_BUDGET" in codes3

    # Kiểm tra tham số của từng mã
    for rc in top_pick.reason_codes:
        if rc["code"] == "TOP_VOTED":
            assert rc["params"]["score"] == 10
            assert rc["params"]["upvotes"] == 8
        elif rc["code"] in ("NEAREST", "NEAR"):
            assert "distance_km" in rc["params"]
        elif rc["code"] == "OPEN_AT":
            assert rc["params"]["minute"] == 720

    for rc in picks3[0].reason_codes:
        if rc["code"] == "WITHIN_BUDGET":
            assert rc["params"]["cost"] == 30000
            assert rc["params"]["budget_limit"] == 100000

    # 3. Quán B có FREE
    pick_b = next(p for p in picks if p.place_id == pid2)
    codes_b = [rc["code"] for rc in pick_b.reason_codes]
    assert "FREE" in codes_b or "SUPPORTED" in codes_b

