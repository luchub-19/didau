"""006_pois_search: bảng `pois` để tìm quán trong Postgres (gđ7, CR-17 phần B, T-102)

Bảng chỉ là CHỈ MỤC TÌM KIẾM nạp lại từ snapshot `places_*.json.gz` (lệnh `python -m app.repositories.poi_repo`,
chạy ở `start.sh` sau migration) — dữ liệu đầy đủ của quán vẫn đọc từ snapshot trong RAM. `poi_snapshots` giữ dấu
vân tay của snapshot đã nạp để lệnh nạp bỏ qua khi không đổi (idempotent).

Chữ đã bỏ dấu (`norm_*`) tính bằng `fold_text` ở Python — cùng một hàm cho cả lúc nạp lẫn lúc truy vấn, nên không
dùng `unaccent` (chỉ mục trên `unaccent()` còn cần hàm bọc IMMUTABLE). Trigram (`pg_trgm`) phục vụ cả `LIKE '%x%'`
lẫn khớp gần đúng `<%` (gõ sai: "vincon" → "vincom").

Revision ID: 006
Revises: 005
Create Date: 2026-11-15 20:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "006"
down_revision: str | None = "005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _is_postgres() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    if _is_postgres():
        op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.create_table(
        "pois",
        sa.Column("external_id", sa.String(length=80), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("norm_name", sa.Text(), nullable=False),
        sa.Column("norm_text", sa.Text(), nullable=False),
        sa.Column("brand_key", sa.String(length=120), nullable=True),
        sa.Column("brand", sa.Text(), nullable=True),
        sa.Column("norm_brand", sa.Text(), nullable=True),
        sa.Column("kind", sa.String(length=20), nullable=True),
        sa.Column("category", sa.String(length=20), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lng", sa.Float(), nullable=False),
        sa.Column("score", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("external_id"),
    )
    op.create_index("ix_pois_brand_key", "pois", ["brand_key"])
    op.create_index("ix_pois_lat_lng", "pois", ["lat", "lng"])
    if _is_postgres():
        op.execute("CREATE INDEX ix_pois_norm_text_trgm ON pois USING gin (norm_text gin_trgm_ops)")
        op.execute("CREATE INDEX ix_pois_norm_brand_trgm ON pois USING gin (norm_brand gin_trgm_ops)")
    op.create_table(
        "poi_snapshots",
        sa.Column("id", sa.SmallInteger(), nullable=False),
        sa.Column("fingerprint", sa.String(length=80), nullable=False),
        sa.Column("poi_count", sa.Integer(), nullable=False),
        sa.Column(
            "loaded_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("id = 1", name="chk_poi_snapshots_single"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("poi_snapshots")
    if _is_postgres():
        op.execute("DROP INDEX IF EXISTS ix_pois_norm_brand_trgm")
        op.execute("DROP INDEX IF EXISTS ix_pois_norm_text_trgm")
    op.drop_index("ix_pois_lat_lng", table_name="pois")
    op.drop_index("ix_pois_brand_key", table_name="pois")
    op.drop_table("pois")
    # pg_trgm giữ lại: extension dùng chung cả database, gỡ có thể làm hỏng chỗ khác
