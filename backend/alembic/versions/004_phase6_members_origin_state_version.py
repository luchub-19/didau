"""004_phase6_members_origin_state_version: CR-11 (vị trí thành viên), CR-13 (state_version), CR-14 (giới hạn đề xuất)

Revision ID: 004
Revises: 003
Create Date: 2026-11-08 09:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "004"
down_revision: str | None = "003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("members", schema=None) as batch_op:
        batch_op.add_column(sa.Column("origin_lat", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("origin_lng", sa.Float(), nullable=True))
        # Cùng ràng buộc với rooms.origin_*; thêm ràng buộc cặp: hoặc cả hai null hoặc cả hai có.
        batch_op.create_check_constraint(
            "chk_members_origin_range",
            "(origin_lat IS NULL OR (origin_lat >= -90 AND origin_lat <= 90)) AND "
            "(origin_lng IS NULL OR (origin_lng >= -180 AND origin_lng <= 180))",
        )
        batch_op.create_check_constraint(
            "chk_members_origin_pair",
            "(origin_lat IS NULL) = (origin_lng IS NULL)",
        )

    with op.batch_alter_table("rooms", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("state_version", sa.BigInteger(), server_default="0", nullable=False)
        )
        # Phòng cũ: NULL (không giới hạn). Phòng mới: ứng dụng ghi mặc định 2.
        batch_op.add_column(sa.Column("max_places_per_member", sa.Integer(), nullable=True))
        batch_op.create_check_constraint(
            "chk_rooms_max_places_per_member",
            "max_places_per_member IS NULL OR "
            "(max_places_per_member >= 1 AND max_places_per_member <= 10)",
        )


def downgrade() -> None:
    with op.batch_alter_table("rooms", schema=None) as batch_op:
        batch_op.drop_constraint("chk_rooms_max_places_per_member", type_="check")
        batch_op.drop_column("max_places_per_member")
        batch_op.drop_column("state_version")

    with op.batch_alter_table("members", schema=None) as batch_op:
        batch_op.drop_constraint("chk_members_origin_pair", type_="check")
        batch_op.drop_constraint("chk_members_origin_range", type_="check")
        batch_op.drop_column("origin_lng")
        batch_op.drop_column("origin_lat")
