"""Migration 004 (T-85): members.origin_*, rooms.state_version, rooms.max_places_per_member."""

import importlib.util
import uuid

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError


def _load(file_path: str, mod_name: str):
    spec = importlib.util.spec_from_file_location(mod_name, file_path)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_migration_004_up_down_up_and_defaults() -> None:
    """Lên → xuống → lên; phòng cũ có max_places_per_member NULL, state_version 0."""
    chain = [
        _load(f"alembic/versions/{name}.py", f"rev_{name}_t85")
        for name in (
            "001_initial_schema",
            "002_map_decide_autoplan",
            "003_reason_codes",
        )
    ]
    m4 = _load("alembic/versions/004_phase6_members_origin_state_version.py", "rev_004_t85")

    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        ctx = MigrationContext.configure(conn)
        with Operations.context(ctx):
            for mod in chain:
                mod.upgrade()

            # Phòng + thành viên có từ trước migration 004
            room_id = uuid.uuid4().hex
            conn.execute(
                text(
                    "INSERT INTO rooms (id, code, title, event_date, status, tie_break_strategy,"
                    " created_at, updated_at) VALUES (:id, 'OLDROM', 'Cũ', '2026-11-01',"
                    " 'PLANNING', 'EARLIEST_SUBMISSION', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
                ),
                {"id": room_id},
            )

            m4.upgrade()
            insp = inspect(conn)
            member_cols = {c["name"] for c in insp.get_columns("members")}
            assert {"origin_lat", "origin_lng"} <= member_cols
            room_cols = {c["name"]: c for c in insp.get_columns("rooms")}
            assert "state_version" in room_cols and "max_places_per_member" in room_cols
            row = conn.execute(
                text("SELECT state_version, max_places_per_member FROM rooms WHERE id = :id"),
                {"id": room_id},
            ).one()
            assert row == (0, None)  # phòng cũ: không giới hạn

            # Ràng buộc cặp toạ độ và biên giới hạn
            with pytest.raises(IntegrityError), conn.begin_nested():
                conn.execute(
                    text("UPDATE rooms SET max_places_per_member = 11 WHERE id = :id"),
                    {"id": room_id},
                )

            m4.downgrade()
            insp = inspect(conn)
            assert "origin_lat" not in {c["name"] for c in insp.get_columns("members")}
            down_cols = {c["name"] for c in insp.get_columns("rooms")}
            assert "state_version" not in down_cols and "max_places_per_member" not in down_cols

            m4.upgrade()
            assert "state_version" in {c["name"] for c in inspect(conn).get_columns("rooms")}
