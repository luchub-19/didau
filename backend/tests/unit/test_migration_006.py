"""Migration 006 (T-102): bảng pois + poi_snapshots — lên → xuống → lên trên SQLite (bỏ qua pg_trgm/GIN), một dòng
poi_snapshots. Bản Postgres (extension + chỉ mục trigram) kiểm ở tests/integration/test_pois_db.py."""

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


def test_migration_006_up_down_up() -> None:
    chain = [
        _load(f"alembic/versions/{name}.py", f"rev_{name}_t102")
        for name in (
            "001_initial_schema",
            "002_map_decide_autoplan",
            "003_reason_codes",
            "004_phase6_members_origin_state_version",
            "005_travel_legs",
        )
    ]
    m6 = _load("alembic/versions/006_pois_search.py", "rev_006_t102")
    assert (m6.revision, m6.down_revision) == ("006", "005")

    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        ctx = MigrationContext.configure(conn)
        with Operations.context(ctx):
            for mod in chain:
                mod.upgrade()
            m6.upgrade()
            insp = inspect(conn)
            assert {c["name"] for c in insp.get_columns("pois")} == {
                "external_id", "name", "norm_name", "norm_text", "brand_key", "brand", "norm_brand",
                "kind", "category", "lat", "lng", "score",
            }
            assert {i["name"] for i in insp.get_indexes("pois")} == {"ix_pois_brand_key", "ix_pois_lat_lng"}
            conn.execute(text(
                "INSERT INTO poi_snapshots (id, fingerprint, poi_count) VALUES (1, 'abc', 3)"
            ))
            assert conn.execute(text("SELECT loaded_at FROM poi_snapshots")).scalar_one() is not None
            with pytest.raises(IntegrityError), conn.begin_nested():
                conn.execute(text(
                    "INSERT INTO poi_snapshots (id, fingerprint, poi_count) VALUES (2, 'x', 1)"
                ))

            m6.downgrade()
            names = inspect(conn).get_table_names()
            assert "pois" not in names and "poi_snapshots" not in names
            m6.upgrade()
            assert {"pois", "poi_snapshots"} <= set(inspect(conn).get_table_names())
