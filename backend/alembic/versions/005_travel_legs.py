"""005_travel_legs: cache km/đường xe máy theo cặp toạ độ (gđ7, CR-15 phần B)

Revision ID: 005
Revises: 004
Create Date: 2026-11-15 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "005"
down_revision: str | None = "004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "travel_legs",
        sa.Column("from_key", sa.String(length=40), nullable=False),
        sa.Column("to_key", sa.String(length=40), nullable=False),
        sa.Column("profile", sa.String(length=32), nullable=False),
        sa.Column("distance_km", sa.Float(), nullable=False),
        sa.Column("minutes", sa.Integer(), nullable=False),
        sa.Column("shape", sa.Text(), nullable=True),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column(
            "fetched_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("distance_km >= 0", name="chk_travel_legs_distance"),
        sa.CheckConstraint("minutes >= 0", name="chk_travel_legs_minutes"),
        sa.PrimaryKeyConstraint("from_key", "to_key", "profile"),
    )


def downgrade() -> None:
    op.drop_table("travel_legs")
