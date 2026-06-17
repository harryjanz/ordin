"""add visual_theme and visual_mode to companies

Revision ID: 20260616_1000
Revises: 20260615_1100
Create Date: 2026-06-16 10:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "20260616_1000"
down_revision = "20260615_1100"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("companies", sa.Column("visual_theme", sa.String(32), nullable=False, server_default="ordin"))
    op.add_column("companies", sa.Column("visual_mode",  sa.String(8),  nullable=False, server_default="light"))


def downgrade():
    op.drop_column("companies", "visual_mode")
    op.drop_column("companies", "visual_theme")
