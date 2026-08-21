"""consumo no local ou para levar — consumption_type (ORD-108)

Revision ID: 20260821_1500
Revises: ddd001
Create Date: 2026-08-21 15:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "20260821_1500"
down_revision = "ddd001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("consumption_type", sa.String(10), nullable=True))


def downgrade() -> None:
    op.drop_column("orders", "consumption_type")
