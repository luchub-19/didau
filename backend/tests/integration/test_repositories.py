from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import get_settings
from app.domain.enums import (
    ConflictLevel,
    MemberRole,
    PlaceCategory,
    PlaceStatus,
    RoomStatus,
    TieBreakStrategyName,
)
from app.domain.models import Conflict, Member, ScheduleItem, Vote
from app.domain.patterns.conflict_rule.rule import ConflictResult
from app.repositories import (
    ConflictRepository,
    MemberRepository,
    PlaceRepository,
    RoomRepository,
    ScheduleRepository,
    VoteRepository,
)

settings = get_settings()

test_engine = create_async_engine(
    settings.DATABASE_URL,
    poolclass=NullPool,
    echo=False,
)

TestSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


@pytest.fixture
async def session():
    """Fixture cung cấp AsyncSession độc lập cho từng test case và rollback tự động."""
    async with TestSessionLocal() as sess:
        yield sess
        await sess.rollback()



@pytest.fixture
def room_repo(session):
    return RoomRepository(session)


@pytest.fixture
def member_repo(session):
    return MemberRepository(session)


@pytest.fixture
def place_repo(session):
    return PlaceRepository(session)


@pytest.fixture
def vote_repo(session):
    return VoteRepository(session)


@pytest.fixture
def schedule_repo(session):
    return ScheduleRepository(session)


@pytest.fixture
def conflict_repo(session):
    return ConflictRepository(session)


# ==========================================
# 1. ROOM REPOSITORY TESTS
# ==========================================


async def test_room_repo_create_and_get_by_id(room_repo):
    """Kiểm tra tạo phòng và truy vấn theo ID."""
    created = await room_repo.create({
        "title": "Chuyến đi Vũng Tàu",
        "description": "Ăn hải sản và tắm biển",
        "event_date": "2026-10-30",
        "budget_limit": 1000000,
        "tie_break_strategy": TieBreakStrategyName.MOST_UPVOTES.value,
    })

    assert created.id is not None
    assert len(created.code) == 6
    assert created.title == "Chuyến đi Vũng Tàu"
    assert created.status == RoomStatus.PLANNING.value
    assert created.event_date == date(2026, 10, 30)
    assert created.budget_limit == 1000000
    assert created.created_at is not None

    fetched = await room_repo.get_by_id(created.id)
    assert fetched is not None
    assert fetched.id == created.id
    assert fetched.title == created.title


async def test_room_repo_get_by_code(room_repo):
    """Kiểm tra tìm phòng theo mã code (không phân biệt chữ hoa/thường, khoảng trắng)."""
    created = await room_repo.create({
        "title": "Cà phê cuối tuần",
        "event_date": date(2026, 11, 1),
    })

    found = await room_repo.get_by_code(created.code)
    assert found is not None
    assert found.id == created.id

    # Test case-insensitive và whitespace trim
    found_lower = await room_repo.get_by_code(f"  {created.code.lower()}  ")
    assert found_lower is not None
    assert found_lower.id == created.id

    not_found = await room_repo.get_by_code("NONEXIST99")
    assert not_found is None


async def test_room_repo_update(room_repo):
    """Kiểm tra cập nhật thông tin phòng."""
    created = await room_repo.create({
        "title": "Tiêu đề cũ",
        "event_date": "2026-10-25",
    })

    updated = await room_repo.update(created.id, {
        "title": "Tiêu đề mới đã đổi",
        "status": RoomStatus.VOTING.value,
        "budget_limit": 750000,
    })

    assert updated is not None
    assert updated.title == "Tiêu đề mới đã đổi"
    assert updated.status == RoomStatus.VOTING.value
    assert updated.budget_limit == 750000

    # Cập nhật phòng không tồn tại
    non_existent = await room_repo.update(uuid4(), {"title": "Test"})
    assert non_existent is None


# ==========================================
# 2. MEMBER REPOSITORY TESTS
# ==========================================


async def test_member_repo_create_and_get_by_token(room_repo, member_repo):
    """Kiểm tra tạo thành viên và tìm theo token."""
    room = await room_repo.create({
        "title": "Phòng thử nghiệm member",
        "event_date": "2026-11-05",
    })

    member = await member_repo.create({
        "room_id": room.id,
        "nickname": "HoangNam",
        "avatar_url": "https://example.com/avatar1.png",
        "role": MemberRole.HOST.value,
    })

    assert member.id is not None
    assert member.room_id == room.id
    assert member.nickname == "HoangNam"
    assert member.role == MemberRole.HOST.value
    assert len(member.token) > 20
    assert member.is_active is True

    fetched = await member_repo.get_by_token(member.token)
    assert fetched is not None
    assert fetched.id == member.id
    assert fetched.nickname == "HoangNam"

    not_found = await member_repo.get_by_token("invalid_token_123")
    assert not_found is None


async def test_member_repo_get_by_room_and_nickname(room_repo, member_repo):
    """Kiểm tra tìm thành viên theo room_id và nickname."""
    room = await room_repo.create({
        "title": "Phòng ăn uống",
        "event_date": "2026-11-10",
    })

    await member_repo.create({
        "room_id": room.id,
        "nickname": "ThuTrang",
        "role": MemberRole.MEMBER.value,
    })

    found = await member_repo.get_by_room_and_nickname(room.id, "ThuTrang")
    assert found is not None
    assert found.nickname == "ThuTrang"

    not_found = await member_repo.get_by_room_and_nickname(room.id, "KhongCoAi")
    assert not_found is None


async def test_member_repo_list_by_room_order(room_repo, member_repo):
    """Kiểm tra danh sách thành viên trong phòng sắp xếp theo thứ tự tham gia."""
    room = await room_repo.create({
        "title": "Phòng nhiều người",
        "event_date": "2026-11-15",
    })

    m1 = await member_repo.create({
        "room_id": room.id,
        "nickname": "NguoiDauTien",
        "role": MemberRole.HOST.value,
    })
    m2 = await member_repo.create({
        "room_id": room.id,
        "nickname": "NguoiThuHai",
        "role": MemberRole.MEMBER.value,
    })

    members = await member_repo.list_by_room(room.id)
    assert len(members) == 2
    assert members[0].id == m1.id
    assert members[1].id == m2.id


async def test_member_repo_unique_nickname_per_room(room_repo, member_repo, session):
    """Kiểm tra ràng buộc unique nickname trong cùng 1 phòng."""
    room = await room_repo.create({
        "title": "Phòng test unique",
        "event_date": "2026-11-20",
    })

    await member_repo.create({
        "room_id": room.id,
        "nickname": "TrungTen",
    })

    with pytest.raises(IntegrityError):
        await member_repo.create({
            "room_id": room.id,
            "nickname": "TrungTen",
        })
    await session.rollback()


async def test_member_repo_update_last_active(room_repo, member_repo):
    """Kiểm tra cập nhật thời điểm last_active_at."""
    room = await room_repo.create({
        "title": "Test last active",
        "event_date": "2026-11-22",
    })
    member = await member_repo.create({
        "room_id": room.id,
        "nickname": "MinhAnh",
    })

    old_time = member.last_active_at
    await member_repo.update_last_active(member.id)

    fetched = await member_repo.get_by_token(member.token)
    assert fetched is not None
    assert fetched.last_active_at >= old_time


# ==========================================
# 3. PLACE REPOSITORY TESTS
# ==========================================


async def test_place_repo_crud(room_repo, member_repo, place_repo):
    """Kiểm tra toàn bộ chu trình Create, Read, Update, Delete của Place."""
    room = await room_repo.create({
        "title": "Phòng test place",
        "event_date": "2026-11-25",
    })
    member = await member_repo.create({
        "room_id": room.id,
        "nickname": "GoiYQuan",
    })

    # 1. Create
    place = await place_repo.create({
        "room_id": room.id,
        "submitted_by_id": member.id,
        "name": "Cà Phê Trứng 3T",
        "address": "1A Tôn Đức Thắng, Q1",
        "latitude": 10.7769,
        "longitude": 106.7058,
        "category": PlaceCategory.DRINK.value,
        "status": PlaceStatus.PROPOSED.value,
        "estimated_cost": 55000,
        "open_minute": 420,
        "close_minute": 1380,
        "notes": "View sông đẹp",
    })

    assert place.id is not None
    assert place.name == "Cà Phê Trứng 3T"
    assert place.category == PlaceCategory.DRINK.value
    assert place.submitted_by is not None
    assert place.submitted_by.nickname == "GoiYQuan"

    # 2. Get by ID
    fetched = await place_repo.get_by_id(place.id)
    assert fetched is not None
    assert fetched.id == place.id
    assert fetched.submitted_by.id == member.id

    # 3. List by Room
    places = await place_repo.list_by_room(room.id)
    assert len(places) == 1
    assert places[0].id == place.id

    # 4. Update
    updated = await place_repo.update(place.id, {
        "status": PlaceStatus.ACCEPTED.value,
        "estimated_cost": 65000,
    })
    assert updated is not None
    assert updated.status == PlaceStatus.ACCEPTED.value
    assert updated.estimated_cost == 65000

    # 5. Delete
    deleted = await place_repo.delete(place.id)
    assert deleted is True

    # Kiểm tra sau khi xóa
    after_delete = await place_repo.get_by_id(place.id)
    assert after_delete is None

    # Xóa lần 2 trả về False
    assert await place_repo.delete(place.id) is False


# ==========================================
# 4. VOTE REPOSITORY & AGGREGATION TESTS
# ==========================================


async def test_vote_repo_upsert_and_get(room_repo, member_repo, place_repo, vote_repo):
    """Kiểm tra bỏ phiếu, cập nhật phiếu và xóa phiếu."""
    room = await room_repo.create({
        "title": "Phòng vote",
        "event_date": "2026-11-28",
    })
    member = await member_repo.create({
        "room_id": room.id,
        "nickname": "Voter1",
    })
    place = await place_repo.create({
        "room_id": room.id,
        "submitted_by_id": member.id,
        "name": "Quán Bún Bò",
    })

    # 1. Cast UPVOTE (+1)
    vote1 = await vote_repo.upsert_vote(place.id, member.id, 1)
    assert vote1.id is not None
    assert vote1.vote_value == 1

    fetched = await vote_repo.get_vote(place.id, member.id)
    assert fetched is not None
    assert fetched.vote_value == 1

    # 2. Update to DOWNVOTE (-1)
    vote2 = await vote_repo.upsert_vote(place.id, member.id, -1)
    assert vote2.id == vote1.id
    assert vote2.vote_value == -1

    # 3. Delete vote
    deleted = await vote_repo.delete_vote(place.id, member.id)
    assert deleted is True
    assert await vote_repo.get_vote(place.id, member.id) is None
    assert await vote_repo.delete_vote(place.id, member.id) is False


async def test_vote_repo_aggregation_summary(room_repo, member_repo, place_repo, vote_repo):
    """Kiểm tra tính toán tổng điểm vote bằng SQL aggregation (upvotes, downvotes, score)."""
    room = await room_repo.create({
        "title": "Phòng tính điểm vote",
        "event_date": "2026-11-30",
    })
    m1 = await member_repo.create({"room_id": room.id, "nickname": "User1"})
    m2 = await member_repo.create({"room_id": room.id, "nickname": "User2"})
    m3 = await member_repo.create({"room_id": room.id, "nickname": "User3"})

    p1 = await place_repo.create({
        "room_id": room.id,
        "submitted_by_id": m1.id,
        "name": "Địa điểm 1",
    })
    p2 = await place_repo.create({
        "room_id": room.id,
        "submitted_by_id": m1.id,
        "name": "Địa điểm 2",
    })
    p3 = await place_repo.create({
        "room_id": room.id,
        "submitted_by_id": m1.id,
        "name": "Địa điểm 3 (Chưa ai vote)",
    })

    # p1: m1 UPVOTE (+1), m2 UPVOTE (+1), m3 DOWNVOTE (-1) -> up=2, down=1, score=1
    await vote_repo.upsert_vote(p1.id, m1.id, 1)
    await vote_repo.upsert_vote(p1.id, m2.id, 1)
    await vote_repo.upsert_vote(p1.id, m3.id, -1)

    # p2: m1 DOWNVOTE (-1), m2 NEUTRAL (0) -> up=0, down=1, score=-1
    await vote_repo.upsert_vote(p2.id, m1.id, -1)
    await vote_repo.upsert_vote(p2.id, m2.id, 0)

    # p3: Không có vote nào -> up=0, down=0, score=0

    summary = await vote_repo.get_vote_summary_by_room(room.id)

    assert p1.id in summary
    assert summary[p1.id] == {"upvotes": 2, "downvotes": 1, "score": 1}

    assert p2.id in summary
    assert summary[p2.id] == {"upvotes": 0, "downvotes": 1, "score": -1}

    assert p3.id in summary
    assert summary[p3.id] == {"upvotes": 0, "downvotes": 0, "score": 0}


# ==========================================
# 5. SCHEDULE REPOSITORY TESTS
# ==========================================


async def test_schedule_repo_crud_and_bulk_update(
    room_repo,
    member_repo,
    place_repo,
    schedule_repo,
):
    """Kiểm tra tạo, lấy danh sách, bulk update và xóa schedule_items."""
    room = await room_repo.create({
        "title": "Phòng lịch trình",
        "event_date": "2026-12-01",
    })
    member = await member_repo.create({
        "room_id": room.id,
        "nickname": "HostLich",
    })
    p1 = await place_repo.create({
        "room_id": room.id,
        "submitted_by_id": member.id,
        "name": "Điểm ăn sáng",
    })
    p2 = await place_repo.create({
        "room_id": room.id,
        "submitted_by_id": member.id,
        "name": "Điểm cà phê",
    })

    # 1. Create items
    s1 = await schedule_repo.create({
        "room_id": room.id,
        "place_id": p1.id,
        "day_offset": 0,
        "start_minute": 480,  # 08:00
        "end_minute": 540,    # 09:00
        "order_index": 0,
        "note": "Ăn phở",
    })
    s2 = await schedule_repo.create({
        "room_id": room.id,
        "place_id": p2.id,
        "day_offset": 0,
        "start_minute": 570,  # 09:30
        "end_minute": 660,    # 11:00
        "order_index": 1,
        "note": "Uống cà phê",
    })

    assert s1.id is not None
    assert s1.place is not None
    assert s1.place.name == "Điểm ăn sáng"

    # 2. List items
    items = await schedule_repo.list_by_room(room.id)
    assert len(items) == 2
    assert items[0].id == s1.id
    assert items[1].id == s2.id

    # 3. Bulk update (Đổi giờ và thứ tự)
    updated_items = await schedule_repo.bulk_update(room.id, [
        {
            "id": s1.id,
            "start_minute": 500,
            "end_minute": 560,
            "order_index": 1,
        },
        {
            "id": s2.id,
            "start_minute": 420,
            "end_minute": 480,
            "order_index": 0,
        },
    ])

    assert len(updated_items) == 2
    # Đã sắp xếp lại theo start_minute: s2 (420) trước s1 (500)
    assert updated_items[0].id == s2.id
    assert updated_items[0].start_minute == 420
    assert updated_items[1].id == s1.id
    assert updated_items[1].start_minute == 500

    # 4. Delete item
    deleted = await schedule_repo.delete(s1.id)
    assert deleted is True
    assert await schedule_repo.delete(s1.id) is False

    remaining = await schedule_repo.list_by_room(room.id)
    assert len(remaining) == 1
    assert remaining[0].id == s2.id


# ==========================================
# 6. CONFLICT REPOSITORY TESTS
# ==========================================


async def test_conflict_repo_replace_and_list(room_repo, conflict_repo):
    """Kiểm tra thay thế và truy vấn danh sách xung đột."""
    room = await room_repo.create({
        "title": "Phòng kiểm tra xung đột",
        "event_date": "2026-12-05",
    })

    item_id_1 = uuid4()
    item_id_2 = uuid4()

    cr1 = ConflictResult(
        rule_code="TIME_OVERLAP",
        level=ConflictLevel.CRITICAL,
        message="Trùng giờ ăn sáng và cà phê",
        entity_type="SCHEDULE",
        entity_ids=[item_id_1, item_id_2],
    )
    cr2 = ConflictResult(
        rule_code="BUDGET_EXCEEDED",
        level=ConflictLevel.WARNING,
        message="Vượt quá ngân sách 100k",
        entity_type="ROOM",
        entity_ids=[room.id],
    )

    # 1. First replace
    saved = await conflict_repo.replace_conflicts(room.id, [cr1, cr2])
    assert len(saved) == 2
    assert saved[0].rule_code == "TIME_OVERLAP"
    assert saved[0].level == "CRITICAL"
    assert saved[0].resolved is False
    assert str(item_id_1) in saved[0].entity_ids

    # 2. List conflicts
    listed = await conflict_repo.list_by_room(room.id)
    assert len(listed) == 2

    # 3. Second replace (Chỉ còn 1 cảnh báo, xóa hết cảnh báo cũ)
    cr3 = ConflictResult(
        rule_code="OPENING_HOURS",
        level=ConflictLevel.ERROR,
        message="Quán chưa mở cửa",
        entity_type="PLACE",
        entity_ids=[item_id_1],
    )
    new_saved = await conflict_repo.replace_conflicts(room.id, [cr3])
    assert len(new_saved) == 1
    assert new_saved[0].rule_code == "OPENING_HOURS"

    after_replace = await conflict_repo.list_by_room(room.id)
    assert len(after_replace) == 1
    assert after_replace[0].rule_code == "OPENING_HOURS"


# ==========================================
# 7. FOREIGN KEY CASCADE DELETION TESTS
# ==========================================


async def test_foreign_key_cascade_deletion(
    session,
    room_repo,
    member_repo,
    place_repo,
    vote_repo,
    schedule_repo,
    conflict_repo,
):
    """Kiểm tra toàn bộ quan hệ khóa ngoại ON DELETE CASCADE khi xóa Room và Place."""
    # 1. Tạo phòng hoàn chỉnh gồm đầy đủ: Member, Place, Vote, Schedule, Conflict
    room = await room_repo.create({
        "title": "Phòng kiểm tra cascade",
        "event_date": "2026-12-10",
    })
    member = await member_repo.create({
        "room_id": room.id,
        "nickname": "MemberCascade",
    })
    place = await place_repo.create({
        "room_id": room.id,
        "submitted_by_id": member.id,
        "name": "Địa điểm cascade",
    })
    vote = await vote_repo.upsert_vote(place.id, member.id, 1)
    sched = await schedule_repo.create({
        "room_id": room.id,
        "place_id": place.id,
        "day_offset": 0,
        "start_minute": 600,
        "end_minute": 700,
    })
    cr = ConflictResult(
        rule_code="TEST_RULE",
        level=ConflictLevel.INFO,
        message="Thông tin test",
        entity_type="ROOM",
        entity_ids=[room.id],
    )
    await conflict_repo.replace_conflicts(room.id, [cr])

    # Xác nhận các thực thể đều đã tồn tại trong DB
    assert await member_repo.get_by_token(member.token) is not None
    assert await place_repo.get_by_id(place.id) is not None
    assert await vote_repo.get_vote(place.id, member.id) is not None
    assert len(await schedule_repo.list_by_room(room.id)) == 1
    assert len(await conflict_repo.list_by_room(room.id)) == 1

    # 2. Xóa Place trước: kiểm tra vote và schedule_item của place đó bị cascade xóa
    place_deleted = await place_repo.delete(place.id)
    assert place_deleted is True

    # Vote của place bị xóa
    v_res = await session.execute(select(Vote).where(Vote.id == vote.id))
    assert v_res.scalar_one_or_none() is None

    # ScheduleItem của place bị xóa
    s_res = await session.execute(select(ScheduleItem).where(ScheduleItem.id == sched.id))
    assert s_res.scalar_one_or_none() is None

    # Nhưng Room, Member, Conflict của phòng vẫn tồn tại
    assert await room_repo.get_by_id(room.id) is not None
    assert await member_repo.get_by_token(member.token) is not None
    assert len(await conflict_repo.list_by_room(room.id)) == 1

    # 3. Xóa Room: toàn bộ Member và Conflict còn lại phải bị xóa theo cascade
    room_obj = await room_repo.get_by_id(room.id)
    assert room_obj is not None
    await session.delete(room_obj)
    await session.flush()

    m_res = await session.execute(select(Member).where(Member.id == member.id))
    assert m_res.scalar_one_or_none() is None

    c_res = await session.execute(select(Conflict).where(Conflict.room_id == room.id))
    assert c_res.scalar_one_or_none() is None


# ==========================================
# 8. EDGE CASES & BOUNDARY TESTS
# ==========================================


async def test_empty_room_queries(
    room_repo,
    member_repo,
    place_repo,
    schedule_repo,
    conflict_repo,
    vote_repo,
):
    """Kiểm tra truy vấn trên phòng chưa có dữ liệu hoặc ID không tồn tại."""
    fake_room_id = uuid4()

    assert await member_repo.list_by_room(fake_room_id) == []
    assert await place_repo.list_by_room(fake_room_id) == []
    assert await schedule_repo.list_by_room(fake_room_id) == []
    assert await conflict_repo.list_by_room(fake_room_id) == []
    assert await vote_repo.get_vote_summary_by_room(fake_room_id) == {}


async def test_schedule_repo_multi_day_ordering(room_repo, member_repo, place_repo, schedule_repo):
    """Kiểm tra thứ tự sắp xếp lịch trình trên nhiều ngày (day_offset)."""
    room = await room_repo.create({"title": "Tour 2 ngày 1 đêm", "event_date": "2026-12-20"})
    member = await member_repo.create({"room_id": room.id, "nickname": "HDV"})
    place = await place_repo.create({
        "room_id": room.id,
        "submitted_by_id": member.id,
        "name": "Địa điểm chung",
    })

    # Tạo ngày 1 chiều (day_offset=1, 14:00)
    await schedule_repo.create({
        "room_id": room.id,
        "place_id": place.id,
        "day_offset": 1,
        "start_minute": 840,
        "end_minute": 900,
    })
    # Tạo ngày 0 tối (day_offset=0, 19:00)
    await schedule_repo.create({
        "room_id": room.id,
        "place_id": place.id,
        "day_offset": 0,
        "start_minute": 1140,
        "end_minute": 1260,
    })
    # Tạo ngày 0 sáng (day_offset=0, 08:00)
    await schedule_repo.create({
        "room_id": room.id,
        "place_id": place.id,
        "day_offset": 0,
        "start_minute": 480,
        "end_minute": 540,
    })

    items = await schedule_repo.list_by_room(room.id)
    assert len(items) == 3
    # Thứ tự phải là: ngày 0 sáng -> ngày 0 tối -> ngày 1 chiều
    assert items[0].day_offset == 0 and items[0].start_minute == 480
    assert items[1].day_offset == 0 and items[1].start_minute == 1140
    assert items[2].day_offset == 1 and items[2].start_minute == 840


async def test_conflict_repo_clear_conflicts(room_repo, conflict_repo):
    """Kiểm tra replace_conflicts với danh sách rỗng để xóa sạch cảnh báo khi đã giải quyết xong."""
    room = await room_repo.create({"title": "Phòng clear conflict", "event_date": "2026-12-25"})
    cr = ConflictResult(
        rule_code="WARN",
        level=ConflictLevel.WARNING,
        message="Cảnh báo tạm",
        entity_type="ROOM",
        entity_ids=[room.id],
    )
    await conflict_repo.replace_conflicts(room.id, [cr])
    assert len(await conflict_repo.list_by_room(room.id)) == 1

    cleared = await conflict_repo.replace_conflicts(room.id, [])
    assert len(cleared) == 0
    assert len(await conflict_repo.list_by_room(room.id)) == 0


async def test_place_repo_not_found_handling(place_repo):
    """Kiểm tra PlaceRepository xử lý id không tồn tại an toàn."""
    fake_id = uuid4()
    assert await place_repo.get_by_id(fake_id) is None
    assert await place_repo.update(fake_id, {"name": "Mới"}) is None
    assert await place_repo.delete(fake_id) is False

