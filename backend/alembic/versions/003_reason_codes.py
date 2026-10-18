"""003_reason_codes: Bổ sung cột params cho bảng conflicts theo CR-06

Revision ID: 003
Revises: 002
Create Date: 2026-10-18 18:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "003"
down_revision: str | None = "002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("conflicts", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "params",
                sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
                server_default=sa.text("'{}'"),
                nullable=False,
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("conflicts", schema=None) as batch_op:
        batch_op.drop_column("params")
