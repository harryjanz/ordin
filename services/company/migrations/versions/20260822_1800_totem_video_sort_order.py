"""ordenação de vídeos de modo espera do totem (ORD-115)

Revision ID: 20260822_1800
Revises: 20260822_1500
Create Date: 2026-08-22 18:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "20260822_1800"
down_revision = "20260822_1500"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {c["name"] for c in inspector.get_columns("totem_videos")}
    if "sort_order" not in columns:
        op.add_column(
            "totem_videos",
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        )
        # Backfill: vídeos já existentes (se houver) ficam ordenados pela
        # ordem de criação, em vez de todos empatados em 0.
        totem_videos = sa.table(
            "totem_videos",
            sa.column("id", sa.Integer),
            sa.column("company_id", sa.Integer),
            sa.column("sort_order", sa.Integer),
            sa.column("created_at", sa.DateTime),
        )
        rows = conn.execute(
            sa.select(totem_videos.c.id, totem_videos.c.company_id)
            .order_by(totem_videos.c.company_id, totem_videos.c.created_at)
        ).fetchall()
        counters: dict[int, int] = {}
        for row in rows:
            idx = counters.get(row.company_id, 0)
            conn.execute(
                totem_videos.update().where(totem_videos.c.id == row.id).values(sort_order=idx)
            )
            counters[row.company_id] = idx + 1


def downgrade() -> None:
    op.drop_column("totem_videos", "sort_order")
