"""Migration 005 (T-95): bảng travel_legs — lên → xuống → lên, khoá chính có hướng + profile, ràng buộc km ≥ 0."""

import importlib.util

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


INSERT = (
    "INSERT INTO travel_legs (from_key, to_key, profile, distance_km, minutes, shape, source)"
    " VALUES (:f, :t, 'motor_scooter', :km, 3, NULL, 'VALHALLA')"
)


def test_migration_005_up_down_up() -> None:
    chain = [
        _load(f"alembic/versions/{name}.py", f"rev_{name}_t95")
        for name in (
            "001_initial_schema",
            "002_map_decide_autoplan",
            "003_reason_codes",
            "004_phase6_members_origin_state_version",
        )
    ]
    m5 = _load("alembic/versions/005_travel_legs.py", "rev_005_t95")
    assert (m5.revision, m5.down_revision) == ("005", "004")

    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        ctx = MigrationContext.configure(conn)
        with Operations.context(ctx):
            for mod in chain:
                mod.upgrade()
            m5.upgrade()
            insp = inspect(conn)
            cols = {c["name"] for c in insp.get_columns("travel_legs")}
            assert cols == {
                "from_key", "to_key", "profile", "distance_km", "minutes", "shape", "source", "fetched_at",
            }
            assert insp.get_pk_constraint("travel_legs")["constrained_columns"] == [
                "from_key", "to_key", "profile",
            ]
            conn.execute(text(INSERT), {"f": "10.7725,106.6980", "t": "10.7290,106.7180", "km": 6.2})
            # Chiều ngược lại là dòng khác (đường một chiều)
            conn.execute(text(INSERT), {"f": "10.7290,106.7180", "t": "10.7725,106.6980", "km": 6.9})
            row = conn.execute(text("SELECT fetched_at FROM travel_legs LIMIT 1")).one()
            assert row[0] is not None  # server_default
            with pytest.raises(IntegrityError), conn.begin_nested():
                conn.execute(text(INSERT), {"f": "10.7725,106.6980", "t": "10.7290,106.7180", "km": 1.0})
            with pytest.raises(IntegrityError), conn.begin_nested():
                conn.execute(text(INSERT), {"f": "a", "t": "b", "km": -1.0})

            m5.downgrade()
            assert "travel_legs" not in inspect(conn).get_table_names()
            m5.upgrade()
            assert "travel_legs" in inspect(conn).get_table_names()
