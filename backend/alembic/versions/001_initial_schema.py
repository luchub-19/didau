"""001_initial_schema: Tạo cấu trúc ban đầu cho 6 bảng theo CONTRACTS.md

Revision ID: 001
Revises: None
Create Date: 2026-10-17 08:50:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Kích hoạt extension uuid-ossp nếu chạy trên PostgreSQL
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(sa.text('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'))

    # 1. BẢNG ROOMS
    op.create_table(
        "rooms",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("code", sa.String(length=10), nullable=False, unique=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("event_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=30), server_default="PLANNING", nullable=False),
        sa.Column(
            "tie_break_strategy",
            sa.String(length=50),
            server_default="EARLIEST_SUBMISSION",
            nullable=False,
        ),
        sa.Column("budget_limit", sa.BigInteger(), nullable=True),
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
    )
    op.create_index("idx_rooms_code", "rooms", ["code"])
    op.create_index("idx_rooms_status", "rooms", ["status"])

    # 2. BẢNG MEMBERS
    op.create_table(
        "members",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "room_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("rooms.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("nickname", sa.String(length=100), nullable=False),
        sa.Column("avatar_url", sa.String(length=500), nullable=True),
        sa.Column("role", sa.String(length=20), server_default="MEMBER", nullable=False),
        sa.Column("token", sa.String(length=64), nullable=False, unique=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column(
            "joined_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "last_active_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("room_id", "nickname", name="uq_room_nickname"),
    )
    op.create_index("idx_members_room_id", "members", ["room_id"])
    op.create_index("idx_members_token", "members", ["token"])

    # 3. BẢNG PLACES
    op.create_table(
        "places",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "room_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("rooms.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "submitted_by_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("members.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("address", sa.String(length=500), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("category", sa.String(length=50), server_default="OTHER", nullable=False),
        sa.Column("status", sa.String(length=30), server_default="PROPOSED", nullable=False),
        sa.Column("url", sa.String(length=1000), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("estimated_cost", sa.BigInteger(), server_default="0", nullable=True),
        sa.Column("open_minute", sa.Integer(), nullable=True),
        sa.Column("close_minute", sa.Integer(), nullable=True),
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
        sa.CheckConstraint(
            "open_minute IS NULL OR (open_minute >= 0 AND open_minute <= 1439)",
            name="chk_places_open_minute",
        ),
        sa.CheckConstraint(
            "close_minute IS NULL OR (close_minute >= 0 AND close_minute <= 1439)",
            name="chk_places_close_minute",
        ),
    )
    op.create_index("idx_places_room_id", "places", ["room_id"])
    op.create_index("idx_places_status", "places", ["status"])
    op.create_index("idx_places_category", "places", ["category"])

    # 4. BẢNG VOTES
    op.create_table(
        "votes",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "place_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("places.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "member_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("members.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("vote_value", sa.SmallInteger(), nullable=False),
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
        sa.UniqueConstraint("place_id", "member_id", name="uq_place_member_vote"),
        sa.CheckConstraint("vote_value IN (-1, 0, 1)", name="chk_votes_vote_value"),
    )
    op.create_index("idx_votes_place_id", "votes", ["place_id"])
    op.create_index("idx_votes_member_id", "votes", ["member_id"])

    # 5. BẢNG SCHEDULE_ITEMS
    op.create_table(
        "schedule_items",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "room_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("rooms.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "place_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("places.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("day_offset", sa.Integer(), server_default="0", nullable=False),
        sa.Column("start_minute", sa.Integer(), nullable=False),
        sa.Column("end_minute", sa.Integer(), nullable=False),
        sa.Column("order_index", sa.Integer(), server_default="0", nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
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
        sa.CheckConstraint("day_offset >= 0", name="chk_schedule_day_offset"),
        sa.CheckConstraint(
            "start_minute >= 0 AND start_minute <= 1439",
            name="chk_schedule_start_minute",
        ),
        sa.CheckConstraint(
            "end_minute >= 0 AND end_minute <= 1439",
            name="chk_schedule_end_minute",
        ),
        sa.CheckConstraint("start_minute < end_minute", name="chk_schedule_minutes"),
    )
    op.create_index("idx_schedule_room_id", "schedule_items", ["room_id"])
    op.create_index("idx_schedule_place_id", "schedule_items", ["place_id"])
    op.create_index(
        "idx_schedule_day_order",
        "schedule_items",
        ["room_id", "day_offset", "start_minute"],
    )

    # 6. BẢNG CONFLICTS
    json_type = sa.JSON().with_variant(
        postgresql.JSONB(astext_type=sa.Text()), "postgresql"
    )
    op.create_table(
        "conflicts",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "room_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("rooms.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("rule_code", sa.String(length=100), nullable=False),
        sa.Column("level", sa.String(length=20), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("entity_type", sa.String(length=50), nullable=False),
        sa.Column("entity_ids", json_type, server_default=sa.text("'[]'"), nullable=False),
        sa.Column("resolved", sa.Boolean(), server_default="false", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("idx_conflicts_room_id", "conflicts", ["room_id"])
    op.create_index("idx_conflicts_resolved", "conflicts", ["resolved"])


def downgrade() -> None:
    op.drop_table("conflicts")
    op.drop_table("schedule_items")
    op.drop_table("votes")
    op.drop_table("places")
    op.drop_table("members")
    op.drop_table("rooms")
