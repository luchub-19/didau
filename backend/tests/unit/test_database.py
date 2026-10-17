import importlib.util
from datetime import datetime
from uuid import uuid4

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session

from app.core.database import Base, normalize_database_url
from app.domain.enums import (
    CityCode,
    DecisionMode,
    DecisionStatus,
    PlaceCategory,
    PlaceSource,
    PlaceStatus,
    TieBreakStrategyName,
    TriggerHint,
)
from app.domain.models import (
    DecisionSession,
    DecisionSwipe,
    ExternalPlaceLink,
    Member,
    Place,
    PlaceReview,
    Room,
)


def test_normalize_database_url_local() -> None:
    """Trường hợp 1: URL local chuẩn postgresql+asyncpg không có sslmode."""
    local_url = "postgresql+asyncpg://postgres:postgres@localhost:5432/didau"
    url, connect_args = normalize_database_url(local_url)
    assert url == "postgresql+asyncpg://postgres:postgres@localhost:5432/didau"
    assert connect_args == {}


def test_normalize_database_url_neon_direct() -> None:
    """Trường hợp 2: URL Neon direct có sslmode=require và domain neon.tech."""
    neon_url = "postgresql://user:pass@ep-cool-123.ap-southeast-1.neon.tech/didau?sslmode=require"
    url, connect_args = normalize_database_url(neon_url)
    assert url == "postgresql+asyncpg://user:pass@ep-cool-123.ap-southeast-1.neon.tech/didau"
    assert "sslmode" not in url
    assert connect_args == {"ssl": True}


def test_normalize_database_url_neon_pooler() -> None:
    """Trường hợp 3: URL Neon pooler có -pooler và channel_binding/sslmode."""
    pooler_url = (
        "postgresql://user:pass@ep-cool-123-pooler.ap-southeast-1.neon.tech/didau"
        "?sslmode=require&channel_binding=prefer"
    )
    url, connect_args = normalize_database_url(pooler_url)
    assert url == "postgresql+asyncpg://user:pass@ep-cool-123-pooler.ap-southeast-1.neon.tech/didau"
    assert "sslmode" not in url
    assert "channel_binding" not in url
    assert connect_args == {"ssl": True, "statement_cache_size": 0}


def test_normalize_database_url_postgres_prefix() -> None:
    """Trường hợp 4: URL dạng postgres:// thay vì postgresql://."""
    legacy_url = "postgres://user:pass@localhost:5432/didau"
    url, connect_args = normalize_database_url(legacy_url)
    assert url == "postgresql+asyncpg://user:pass@localhost:5432/didau"
    assert connect_args == {}


def _load_migration_module(file_path: str, mod_name: str):
    spec = importlib.util.spec_from_file_location(mod_name, file_path)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_alembic_migration_002_sqlite_lifecycle() -> None:
    """Kiểm thử vòng đời migration 002: Upgrade head -> Downgrade -1 -> Re-upgrade head trên SQLite."""
    m1 = _load_migration_module("alembic/versions/001_initial_schema.py", "rev_001_test")
    m2 = _load_migration_module("alembic/versions/002_map_decide_autoplan.py", "rev_002_test")

    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        ctx = MigrationContext.configure(conn)
        with Operations.context(ctx):
            # 1. Chạy 001 và 002
            m1.upgrade()
            m2.upgrade()

            insp = inspect(conn)
            tables_after_upgrade = sorted(insp.get_table_names())
            assert "rooms" in tables_after_upgrade
            assert "places" in tables_after_upgrade
            assert "external_place_links" in tables_after_upgrade
            assert "place_reviews" in tables_after_upgrade
            assert "decision_sessions" in tables_after_upgrade
            assert "decision_swipes" in tables_after_upgrade

            room_cols = {c["name"] for c in insp.get_columns("rooms")}
            assert {"city", "origin_lat", "origin_lng", "start_minute", "end_minute"}.issubset(
                room_cols
            )

            place_cols = {c["name"] for c in insp.get_columns("places")}
            assert {
                "source",
                "external_id",
                "google_place_id",
                "cuisine",
                "opening_hours_raw",
                "coords_source",
                "coords_fetched_at",
            }.issubset(place_cols)

            # 2. Downgrade 002 -> 001
            m2.downgrade()
            insp_after_down = inspect(conn)
            tables_after_down = set(insp_after_down.get_table_names())
            assert "decision_sessions" not in tables_after_down
            assert "decision_swipes" not in tables_after_down
            assert "place_reviews" not in tables_after_down
            assert "external_place_links" not in tables_after_down

            room_cols_down = {c["name"] for c in insp_after_down.get_columns("rooms")}
            assert "city" not in room_cols_down
            assert "start_minute" not in room_cols_down

            place_cols_down = {c["name"] for c in insp_after_down.get_columns("places")}
            assert "source" not in place_cols_down
            assert "external_id" not in place_cols_down

            # 3. Re-upgrade 001 -> 002
            m2.upgrade()
            insp_reup = inspect(conn)
            assert "decision_sessions" in insp_reup.get_table_names()
            room_cols_reup = {c["name"] for c in insp_reup.get_columns("rooms")}
            assert "city" in room_cols_reup


def test_phase2_models_and_enums_orm_mapping() -> None:
    """Kiểm thử mapping SQLAlchemy ORM cho các Models và Enums mới trong Phase 2 CR-02."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        # 1. Tạo Room với các trường mới
        room = Room(
            id=uuid4(),
            code="DIDAU9",
            title="Đi dạo Phố Đi Bộ & Ăn tối",
            event_date=datetime.now().date(),
            city=CityCode.HCM.value,
            origin_lat=10.7769,
            origin_lng=106.7009,
            start_minute=1020,
            end_minute=1380,
            tie_break_strategy=TieBreakStrategyName.GROUP_DECISION.value,
        )
        session.add(room)

        # 2. Tạo Member
        member = Member(
            id=uuid4(),
            room_id=room.id,
            nickname="HostTester",
            token="token-host-test-123456",
        )
        session.add(member)

        # 3. Tạo Place với nguồn OSM / GOOGLE
        place = Place(
            id=uuid4(),
            room_id=room.id,
            submitted_by_id=member.id,
            name="Quán Cơm Tấm Ba Ghiền",
            category=PlaceCategory.FOOD.value,
            status=PlaceStatus.PROPOSED.value,
            source=PlaceSource.OSM.value,
            external_id="osm:node/123456",
            google_place_id="ChIJN1t_tDeuEmsRUsoyG83frY4",
            cuisine="vietnamese",
            opening_hours_raw="Mo-Su 06:00-22:00",
            coords_source=PlaceSource.OSM.value,
            latitude=10.7933,
            longitude=106.6664,
        )
        session.add(place)

        # 4. Tạo ExternalPlaceLink
        link = ExternalPlaceLink(
            osm_external_id="osm:node/123456",
            google_place_id="ChIJN1t_tDeuEmsRUsoyG83frY4",
            rejected_count=0,
        )
        session.add(link)

        # 5. Tạo PlaceReview
        review = PlaceReview(
            id=uuid4(),
            external_key="osm:node/123456",
            room_id=room.id,
            member_id=member.id,
            nickname=member.nickname,
            rating=5,
            comment="Sườn nướng rất mềm và thơm!",
            tags=["ngon", "đáng_tiền"],
        )
        session.add(review)

        # 6. Tạo DecisionSession & DecisionSwipe
        decision = DecisionSession(
            id=uuid4(),
            room_id=room.id,
            mode=DecisionMode.WHEEL.value,
            status=DecisionStatus.OPEN.value,
            category=PlaceCategory.FOOD.value,
            candidate_place_ids=[str(place.id)],
            seed=42,
            result_place_id=place.id,
            result_payload={"stop_angle_deg": 180.0},
            created_by_id=member.id,
        )
        session.add(decision)

        swipe = DecisionSwipe(
            session_id=decision.id,
            member_id=member.id,
            place_id=place.id,
            liked=True,
        )
        session.add(swipe)
        session.commit()

        # Query kiểm tra dữ liệu
        saved_room = session.query(Room).filter_by(code="DIDAU9").first()
        assert saved_room is not None
        assert saved_room.city == "HCM"
        assert saved_room.start_minute == 1020
        assert saved_room.end_minute == 1380
        assert len(saved_room.decision_sessions) == 1

        saved_decision = session.query(DecisionSession).filter_by(id=decision.id).first()
        assert saved_decision is not None
        assert saved_decision.mode == DecisionMode.WHEEL.value
        assert len(saved_decision.swipes) == 1
        assert saved_decision.swipes[0].liked is True

        saved_review = session.query(PlaceReview).filter_by(external_key="osm:node/123456").first()
        assert saved_review is not None
        assert saved_review.rating == 5
        assert saved_review.tags == ["ngon", "đáng_tiền"]

        # Kiểm tra enum TriggerHint
        assert TriggerHint.TIE_AT_TOP.value == "TIE_AT_TOP"
        assert TriggerHint.NEAR_TIE.value == "NEAR_TIE"
