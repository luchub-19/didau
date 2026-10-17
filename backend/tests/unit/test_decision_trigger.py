from datetime import UTC, datetime, timedelta
from uuid import uuid4

from app.domain.enums import PlaceCategory, PlaceStatus, TriggerHint
from app.domain.patterns.decision import DeciderTrigger
from app.domain.patterns.tie_break.strategy import PlaceVoteSummary


class MockMember:
    def __init__(self, member_id=None, nickname="Member"):
        self.id = member_id or uuid4()
        self.nickname = nickname


class MockVote:
    def __init__(self, place_id, member_id, vote_value=1, created_at=None):
        self.place_id = place_id
        self.member_id = member_id
        self.vote_value = vote_value
        self.created_at = created_at or datetime.now(UTC)


def test_empty_hint_on_empty_room():
    """Phòng chưa có quán nào thì kích hoạt gợi ý EMPTY cho cả FOOD và DRINK."""
    now = datetime(2026, 10, 17, 12, 0, tzinfo=UTC)
    hints = DeciderTrigger.evaluate(places=[], votes=[], members=[], now=now)

    empty_hints = [h for h in hints if h.type == TriggerHint.EMPTY]
    assert len(empty_hints) == 2
    cats = {h.category for h in empty_hints}
    assert PlaceCategory.FOOD.value in cats
    assert PlaceCategory.DRINK.value in cats
    for h in empty_hints:
        assert h.candidate_place_ids == []


def test_empty_hint_custom_target_categories():
    """Gợi ý EMPTY chỉ xét các category được cấu hình."""
    now = datetime(2026, 10, 17, 12, 0, tzinfo=UTC)
    hints = DeciderTrigger.evaluate(
        places=[],
        votes=[],
        members=[],
        now=now,
        target_categories=[PlaceCategory.ENTERTAINMENT],
    )
    assert len(hints) == 1
    assert hints[0].type == TriggerHint.EMPTY
    assert hints[0].category == PlaceCategory.ENTERTAINMENT.value


def test_empty_hint_cleared_when_place_exists():
    """Khi đã có quán FOOD thì không còn gợi ý EMPTY cho FOOD."""
    p_id = uuid4()
    p1 = {
        "id": p_id,
        "name": "Phở Hòa",
        "category": PlaceCategory.FOOD.value,
        "status": PlaceStatus.PROPOSED.value,
        "created_at": datetime.now(UTC),
    }
    hints = DeciderTrigger.evaluate(places=[p1], votes=[], members=[])
    empty_cats = [h.category for h in hints if h.type == TriggerHint.EMPTY]
    assert PlaceCategory.FOOD.value not in empty_cats
    assert PlaceCategory.DRINK.value in empty_cats


def test_tie_at_top_two_places():
    """Hai quán cùng category hoà điểm cao nhất kích hoạt TIE_AT_TOP."""
    id1, id2, id3 = uuid4(), uuid4(), uuid4()
    p1 = {"id": id1, "name": "Quán A", "category": "FOOD", "status": "PROPOSED"}
    p2 = {"id": id2, "name": "Quán B", "category": "FOOD", "status": "PROPOSED"}
    p3 = {"id": id3, "name": "Quán C", "category": "FOOD", "status": "PROPOSED"}

    m1, m2 = MockMember(), MockMember()
    votes = [
        MockVote(place_id=id1, member_id=m1.id, vote_value=1),
        MockVote(place_id=id2, member_id=m2.id, vote_value=1),
    ]

    hints = DeciderTrigger.evaluate(
        places=[p1, p2, p3],
        votes=votes,
        members=[m1, m2],
        target_categories=[],
    )

    tie_hints = [h for h in hints if h.type == TriggerHint.TIE_AT_TOP]
    assert len(tie_hints) == 1
    assert tie_hints[0].category == "FOOD"
    assert set(tie_hints[0].candidate_place_ids) == {id1, id2}
    assert id3 not in tie_hints[0].candidate_place_ids


def test_tie_at_top_three_places():
    """Ba quán cùng category có điểm cao nhất bằng nhau đều vào candidate_place_ids."""
    id1, id2, id3 = uuid4(), uuid4(), uuid4()
    p1 = {"id": id1, "name": "Cafe 1", "category": "DRINK", "status": "PROPOSED"}
    p2 = {"id": id2, "name": "Cafe 2", "category": "DRINK", "status": "PROPOSED"}
    p3 = {"id": id3, "name": "Cafe 3", "category": "DRINK", "status": "PROPOSED"}

    m1, m2, m3 = MockMember(), MockMember(), MockMember()
    votes = [
        MockVote(place_id=id1, member_id=m1.id, vote_value=1),
        MockVote(place_id=id2, member_id=m2.id, vote_value=1),
        MockVote(place_id=id3, member_id=m3.id, vote_value=1),
    ]

    hints = DeciderTrigger.evaluate(
        places=[p1, p2, p3],
        votes=votes,
        members=[m1, m2, m3],
        target_categories=[],
    )

    tie_hints = [h for h in hints if h.type == TriggerHint.TIE_AT_TOP]
    assert len(tie_hints) == 1
    assert set(tie_hints[0].candidate_place_ids) == {id1, id2, id3}


def test_tie_at_top_distinct_categories():
    """Mỗi category có thể có TIE_AT_TOP độc lập."""
    f1, f2 = uuid4(), uuid4()
    d1, d2 = uuid4(), uuid4()
    places = [
        {"id": f1, "category": "FOOD", "status": "PROPOSED"},
        {"id": f2, "category": "FOOD", "status": "PROPOSED"},
        {"id": d1, "category": "DRINK", "status": "PROPOSED"},
        {"id": d2, "category": "DRINK", "status": "PROPOSED"},
    ]
    m1 = MockMember()
    votes = [
        MockVote(place_id=f1, member_id=m1.id, vote_value=1),
        MockVote(place_id=f2, member_id=m1.id, vote_value=1),
        MockVote(place_id=d1, member_id=m1.id, vote_value=1),
        MockVote(place_id=d2, member_id=m1.id, vote_value=1),
    ]

    hints = DeciderTrigger.evaluate(
        places=places,
        votes=votes,
        members=[m1],
        target_categories=[],
    )

    tie_hints = [h for h in hints if h.type == TriggerHint.TIE_AT_TOP]
    assert len(tie_hints) == 2
    cats = {h.category for h in tie_hints}
    assert cats == {"FOOD", "DRINK"}


def test_tie_at_top_requires_voting_activity():
    """Nếu hoàn toàn chưa có vote nào và score=0 thì không kích hoạt TIE_AT_TOP."""
    p1 = {"id": uuid4(), "name": "Quán 1", "category": "FOOD", "status": "PROPOSED", "score": 0}
    p2 = {"id": uuid4(), "name": "Quán 2", "category": "FOOD", "status": "PROPOSED", "score": 0}

    hints = DeciderTrigger.evaluate(
        places=[p1, p2],
        votes=[],
        members=[MockMember()],
        target_categories=[],
    )
    tie_hints = [h for h in hints if h.type == TriggerHint.TIE_AT_TOP]
    assert len(tie_hints) == 0


def test_tie_at_top_excludes_rejected_places():
    """Địa điểm REJECTED không được tính vào TIE_AT_TOP."""
    id1, id2 = uuid4(), uuid4()
    p1 = {"id": id1, "category": "FOOD", "status": "PROPOSED"}
    p2 = {"id": id2, "category": "FOOD", "status": "REJECTED"}
    m = MockMember()
    votes = [
        MockVote(place_id=id1, member_id=m.id, vote_value=1),
        MockVote(place_id=id2, member_id=m.id, vote_value=1),
    ]
    hints = DeciderTrigger.evaluate(places=[p1, p2], votes=votes, members=[m], target_categories=[])
    tie_hints = [h for h in hints if h.type == TriggerHint.TIE_AT_TOP]
    assert len(tie_hints) == 0


def test_near_tie_triggered_when_diff_is_one_and_majority_voted():
    """Top-1 và top-2 chênh 1 điểm và >= 50% thành viên đã vote kích hoạt NEAR_TIE."""
    id1, id2, id3 = uuid4(), uuid4(), uuid4()
    p1 = {"id": id1, "category": "FOOD", "status": "PROPOSED"}
    p2 = {"id": id2, "category": "FOOD", "status": "PROPOSED"}
    p3 = {"id": id3, "category": "FOOD", "status": "PROPOSED"}

    m1, m2 = MockMember(), MockMember()
    # p1 được 2 vote, p2 được 1 vote (chênh 1 điểm). Cả 2 member đều đã vote (100% >= 50%)
    votes = [
        MockVote(place_id=id1, member_id=m1.id, vote_value=1),
        MockVote(place_id=id1, member_id=m2.id, vote_value=1),
        MockVote(place_id=id2, member_id=m1.id, vote_value=1),
    ]

    hints = DeciderTrigger.evaluate(
        places=[p1, p2, p3],
        votes=votes,
        members=[m1, m2],
        target_categories=[],
    )

    near_hints = [h for h in hints if h.type == TriggerHint.NEAR_TIE]
    assert len(near_hints) == 1
    assert near_hints[0].category == "FOOD"
    assert set(near_hints[0].candidate_place_ids) == {id1, id2}


def test_near_tie_not_triggered_if_low_participation():
    """Chênh 1 điểm nhưng < 50% thành viên tham gia thì không kích hoạt NEAR_TIE."""
    id1, id2 = uuid4(), uuid4()
    p1 = {"id": id1, "category": "FOOD", "status": "PROPOSED"}
    p2 = {"id": id2, "category": "FOOD", "status": "PROPOSED"}

    # 4 members, chỉ m1 vote (1/4 = 25% < 50%)
    members = [MockMember() for _ in range(4)]
    votes = [
        MockVote(place_id=id1, member_id=members[0].id, vote_value=1),
    ]

    hints = DeciderTrigger.evaluate(
        places=[p1, p2],
        votes=votes,
        members=members,
        target_categories=[],
    )
    near_hints = [h for h in hints if h.type == TriggerHint.NEAR_TIE]
    assert len(near_hints) == 0


def test_near_tie_not_triggered_if_diff_greater_than_one():
    """Top-1 hơn top-2 >= 2 điểm thì không coi là NEAR_TIE vì người thắng rõ ràng."""
    id1, id2 = uuid4(), uuid4()
    p1 = {"id": id1, "category": "FOOD", "status": "PROPOSED"}
    p2 = {"id": id2, "category": "FOOD", "status": "PROPOSED"}

    m1, m2, m3 = MockMember(), MockMember(), MockMember()
    votes = [
        MockVote(place_id=id1, member_id=m1.id, vote_value=1),
        MockVote(place_id=id1, member_id=m2.id, vote_value=1),
        MockVote(place_id=id1, member_id=m3.id, vote_value=1),
        MockVote(place_id=id2, member_id=m1.id, vote_value=1),
    ]

    hints = DeciderTrigger.evaluate(
        places=[p1, p2],
        votes=votes,
        members=[m1, m2, m3],
        target_categories=[],
    )
    near_hints = [h for h in hints if h.type == TriggerHint.NEAR_TIE]
    assert len(near_hints) == 0


def test_too_many_places_low_votes():
    """> 5 quán PROPOSED cùng category mà mỗi quán < 2 vote kích hoạt TOO_MANY."""
    places = [
        {"id": uuid4(), "name": f"Quán {i}", "category": "FOOD", "status": "PROPOSED"}
        for i in range(6)
    ]
    # Chỉ 1 quán có 1 vote, các quán khác 0 vote (mỗi quán đều < 2 vote)
    m = MockMember()
    votes = [MockVote(place_id=places[0]["id"], member_id=m.id, vote_value=1)]

    hints = DeciderTrigger.evaluate(
        places=places,
        votes=votes,
        members=[m],
        target_categories=[],
    )

    too_many = [h for h in hints if h.type == TriggerHint.TOO_MANY]
    assert len(too_many) == 1
    assert too_many[0].category == "FOOD"
    assert len(too_many[0].candidate_place_ids) == 6


def test_too_many_not_triggered_if_five_or_fewer_places():
    """5 quán (không quá 5) thì không kích hoạt TOO_MANY."""
    places = [
        {"id": uuid4(), "category": "FOOD", "status": "PROPOSED"}
        for _ in range(5)
    ]
    hints = DeciderTrigger.evaluate(places=places, votes=[], members=[], target_categories=[])
    too_many = [h for h in hints if h.type == TriggerHint.TOO_MANY]
    assert len(too_many) == 0


def test_too_many_not_triggered_if_any_place_has_two_or_more_votes():
    """Nếu có quán đã nhận >= 2 vote thì nhóm không bị choice overload hoàn toàn."""
    places = [
        {"id": uuid4(), "category": "FOOD", "status": "PROPOSED"}
        for _ in range(6)
    ]
    m1, m2 = MockMember(), MockMember()
    votes = [
        MockVote(place_id=places[0]["id"], member_id=m1.id, vote_value=1),
        MockVote(place_id=places[0]["id"], member_id=m2.id, vote_value=1),
    ]

    hints = DeciderTrigger.evaluate(
        places=places,
        votes=votes,
        members=[m1, m2],
        target_categories=[],
    )
    too_many = [h for h in hints if h.type == TriggerHint.TOO_MANY]
    assert len(too_many) == 0


def test_stalled_triggered_when_no_votes_for_ten_minutes():
    """Không có vote mới trong 10 phút và chưa có quán ACCEPTED thì kích hoạt STALLED."""
    p_id = uuid4()
    t0 = datetime(2026, 10, 17, 12, 0, tzinfo=UTC)
    p = {
        "id": p_id,
        "category": "FOOD",
        "status": "PROPOSED",
        "created_at": t0,
    }
    m = MockMember()
    v = MockVote(place_id=p_id, member_id=m.id, created_at=t0)

    # Đã qua 11 phút kể từ lá vote cuối cùng
    t_check = t0 + timedelta(minutes=11)
    hints = DeciderTrigger.evaluate(
        places=[p],
        votes=[v],
        members=[m],
        now=t_check,
        target_categories=[],
    )

    stalled = [h for h in hints if h.type == TriggerHint.STALLED]
    assert len(stalled) == 1
    assert stalled[0].category is None
    assert p_id in stalled[0].candidate_place_ids


def test_stalled_not_triggered_if_vote_is_recent():
    """Có vote mới trong vòng 10 phút thì không bị STALLED."""
    p_id = uuid4()
    t0 = datetime(2026, 10, 17, 12, 0, tzinfo=UTC)
    p = {"id": p_id, "category": "FOOD", "status": "PROPOSED", "created_at": t0}
    m = MockMember()
    v = MockVote(place_id=p_id, member_id=m.id, created_at=t0)

    # Mới qua 5 phút
    t_check = t0 + timedelta(minutes=5)
    hints = DeciderTrigger.evaluate(
        places=[p],
        votes=[v],
        members=[m],
        now=t_check,
        target_categories=[],
    )

    stalled = [h for h in hints if h.type == TriggerHint.STALLED]
    assert len(stalled) == 0


def test_stalled_not_triggered_if_already_accepted_place():
    """Nếu phòng đã chốt được ít nhất 1 quán ACCEPTED thì không còn bị STALLED."""
    p_id = uuid4()
    t0 = datetime(2026, 10, 17, 12, 0, tzinfo=UTC)
    p = {"id": p_id, "category": "FOOD", "status": "ACCEPTED", "created_at": t0}
    m = MockMember()
    v = MockVote(place_id=p_id, member_id=m.id, created_at=t0)

    t_check = t0 + timedelta(minutes=20)
    hints = DeciderTrigger.evaluate(
        places=[p],
        votes=[v],
        members=[m],
        now=t_check,
        target_categories=[],
    )
    stalled = [h for h in hints if h.type == TriggerHint.STALLED]
    assert len(stalled) == 0


def test_works_with_place_vote_summary_dto():
    """DeciderTrigger tương thích trực tiếp với PlaceVoteSummary DTO."""
    id1, id2 = uuid4(), uuid4()
    now = datetime(2026, 10, 17, 12, 0, tzinfo=UTC)
    dto1 = PlaceVoteSummary(
        place_id=id1,
        name="Quán X",
        category=PlaceCategory.FOOD,
        status=PlaceStatus.PROPOSED,
        submitted_by_id=uuid4(),
        created_at=now,
        upvotes=3,
        score=3,
    )
    dto2 = PlaceVoteSummary(
        place_id=id2,
        name="Quán Y",
        category=PlaceCategory.FOOD,
        status=PlaceStatus.PROPOSED,
        submitted_by_id=uuid4(),
        created_at=now,
        upvotes=3,
        score=3,
    )

    hints = DeciderTrigger.evaluate(
        places=[dto1, dto2],
        votes=[],
        members=[MockMember()],
        target_categories=[],
    )
    tie_hints = [h for h in hints if h.type == TriggerHint.TIE_AT_TOP]
    assert len(tie_hints) == 1
    assert set(tie_hints[0].candidate_place_ids) == {id1, id2}


def test_trigger_instance_method():
    """DeciderTrigger có thể khởi tạo instance và gọi evaluate."""
    trigger = DeciderTrigger(stalled_threshold_minutes=5)
    hints = trigger.evaluate(places=[], votes=[], members=[], target_categories=[])
    assert hints == []
