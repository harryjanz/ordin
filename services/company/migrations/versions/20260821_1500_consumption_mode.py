"""consumo no local ou para levar — consumption_mode_enabled (ORD-108)

Revision ID: 20260821_1500
Revises: 20260817_2000
Create Date: 2026-08-21 15:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "20260821_1500"
down_revision = "20260817_2000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("companies", sa.Column(
        "consumption_mode_enabled", sa.Boolean(), nullable=False, server_default=sa.text("0")))


def downgrade() -> None:
    op.drop_column("companies", "consumption_mode_enabled")
