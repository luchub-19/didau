"""002_map_decide_autoplan: Cập nhật schema cho Giai đoạn 2 theo CR-02

Revision ID: 002
Revises: 001
Create Date: 2026-10-17 18:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "002"
down_revision: str | None = "001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()

    # 1. CẬP NHẬT BẢNG ROOMS
    with op.batch_alter_table("rooms", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("city", sa.String(length=10), server_default="HCM", nullable=False)
        )
        batch_op.add_column(sa.Column("origin_lat", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("origin_lng", sa.Float(), nullable=True))
        batch_op.add_column(
            sa.Column("start_minute", sa.Integer(), server_default="1020", nullable=False)
        )
        batch_op.add_column(
            sa.Column("end_minute", sa.Integer(), server_default="1380", nullable=False)
        )
        batch_op.create_check_constraint(
            "chk_rooms_start_minute",
            "start_minute >= 0 AND start_minute <= 1439",
        )
        batch_op.create_check_constraint(
            "chk_rooms_end_minute",
            "end_minute >= 0 AND end_minute <= 1439",
        )

    # 2. CẬP NHẬT BẢNG PLACES
    with op.batch_alter_table("places", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("source", sa.String(length=20), server_default="MANUAL", nullable=False)
        )
        batch_op.add_column(sa.Column("external_id", sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column("google_place_id", sa.String(length=300), nullable=True))
        batch_op.add_column(sa.Column("cuisine", sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column("opening_hours_raw", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("coords_source", sa.String(length=20), nullable=True))
        batch_op.add_column(
            sa.Column("coords_fetched_at", sa.DateTime(timezone=True), nullable=True)
        )

    # Partial index cho places (room_id, external_id)
    if bind.dialect.name == "postgresql":
        op.create_index(
            "uq_places_room_external",
            "places",
            ["room_id", "external_id"],
            unique=True,
            postgresql_where=sa.text("external_id IS NOT NULL"),
        )
    elif bind.dialect.name == "sqlite":
        op.execute(
            sa.text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_places_room_external "
                "ON places(room_id, external_id) WHERE external_id IS NOT NULL"
            )
        )
    else:
        op.create_index(
            "uq_places_room_external",
            "places",
            ["room_id", "external_id"],
            unique=True,
        )

    # 3. TẠO BẢNG EXTERNAL_PLACE_LINKS
    op.create_table(
        "external_place_links",
        sa.Column("osm_external_id", sa.String(length=100), primary_key=True, nullable=False),
        sa.Column("google_place_id", sa.String(length=300), nullable=True),
        sa.Column(
            "matched_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("rejected_count", sa.Integer(), server_default="0", nullable=False),
    )

    # 4. TẠO BẢNG PLACE_REVIEWS
    op.create_table(
        "place_reviews",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("external_key", sa.String(length=320), nullable=False),
        sa.Column(
            "room_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("rooms.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "member_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("members.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("nickname", sa.String(length=50), nullable=False),
        sa.Column("rating", sa.SmallInteger(), nullable=False),
        sa.Column("comment", sa.String(length=280), nullable=True),
        sa.Column("tags", sa.JSON(), server_default="[]", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "member_id", "external_key", name="uq_place_reviews_member_external_key"
        ),
        sa.CheckConstraint("rating >= 1 AND rating <= 5", name="chk_place_reviews_rating"),
    )
    op.create_index("idx_reviews_external_key", "place_reviews", ["external_key"])

    # 5. TẠO BẢNG DECISION_SESSIONS
    op.create_table(
        "decision_sessions",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "room_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("rooms.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("mode", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="OPEN", nullable=False),
        sa.Column("category", sa.String(length=50), nullable=True),
        sa.Column("candidate_place_ids", sa.JSON(), nullable=False),
        sa.Column("seed", sa.BigInteger(), nullable=False),
        sa.Column(
            "result_place_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("places.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("result_payload", sa.JSON(), nullable=True),
        sa.Column(
            "created_by_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("members.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("closes_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("idx_decision_sessions_room_id", "decision_sessions", ["room_id"])
    op.create_index("idx_decision_sessions_status", "decision_sessions", ["status"])

    # Partial index cho decision_sessions (status = 'OPEN')
    if bind.dialect.name == "postgresql":
        op.create_index(
            "uq_decision_open_per_room",
            "decision_sessions",
            ["room_id"],
            unique=True,
            postgresql_where=sa.text("status = 'OPEN'"),
        )
    elif bind.dialect.name == "sqlite":
        op.execute(
            sa.text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_decision_open_per_room "
                "ON decision_sessions(room_id) WHERE status = 'OPEN'"
            )
        )
    else:
        op.create_index(
            "uq_decision_open_per_room",
            "decision_sessions",
            ["room_id"],
            unique=True,
        )

    # 6. TẠO BẢNG DECISION_SWIPES
    op.create_table(
        "decision_swipes",
        sa.Column(
            "session_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("decision_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "member_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("members.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "place_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("places.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("liked", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("session_id", "member_id", "place_id", name="pk_decision_swipes"),
    )


def downgrade() -> None:
    # 6. XÓA BẢNG DECISION_SWIPES
    op.drop_table("decision_swipes")

    # 5. XÓA BẢNG DECISION_SESSIONS
    op.drop_index("uq_decision_open_per_room", table_name="decision_sessions")
    op.drop_index("idx_decision_sessions_status", table_name="decision_sessions")
    op.drop_index("idx_decision_sessions_room_id", table_name="decision_sessions")
    op.drop_table("decision_sessions")

    # 4. XÓA BẢNG PLACE_REVIEWS
    op.drop_index("idx_reviews_external_key", table_name="place_reviews")
    op.drop_table("place_reviews")

    # 3. XÓA BẢNG EXTERNAL_PLACE_LINKS
    op.drop_table("external_place_links")

    # 2. ROLLBACK BẢNG PLACES
    op.drop_index("uq_places_room_external", table_name="places")
    with op.batch_alter_table("places", schema=None) as batch_op:
        batch_op.drop_column("coords_fetched_at")
        batch_op.drop_column("coords_source")
        batch_op.drop_column("opening_hours_raw")
        batch_op.drop_column("cuisine")
        batch_op.drop_column("google_place_id")
        batch_op.drop_column("external_id")
        batch_op.drop_column("source")

    # 1. ROLLBACK BẢNG ROOMS
    with op.batch_alter_table("rooms", schema=None) as batch_op:
        batch_op.drop_constraint("chk_rooms_end_minute", type_="check")
        batch_op.drop_constraint("chk_rooms_start_minute", type_="check")
        batch_op.drop_column("end_minute")
        batch_op.drop_column("start_minute")
        batch_op.drop_column("origin_lng")
        batch_op.drop_column("origin_lat")
        batch_op.drop_column("city")
