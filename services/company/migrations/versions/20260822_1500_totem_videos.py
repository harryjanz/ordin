"""vídeos de modo espera (attract mode) do totem (ORD-115)

Revision ID: 20260822_1500
Revises: 20260821_1600
Create Date: 2026-08-22 15:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "20260822_1500"
down_revision = "20260821_1600"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if "totem_videos" not in inspector.get_table_names():
        op.create_table(
            "totem_videos",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("company_id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("video_key", sa.String(500), nullable=False),
            sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
            sa.Column("created_at", sa.DateTime(), nullable=True,
                      server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_totem_videos_company_id", "totem_videos", ["company_id"])


def downgrade() -> None:
    op.drop_table("totem_videos")
