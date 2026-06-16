"""add terminal last_heartbeat

Revision ID: 20260615_1100
Revises: 20260611_1000
Create Date: 2026-06-15 11:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "20260615_1100"
down_revision = "bbb004"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("terminals", sa.Column("last_heartbeat", sa.DateTime(), nullable=True))
    op.create_index("ix_terminals_company_active_heartbeat",
                    "terminals", ["company_id", "active", "last_heartbeat"])


def downgrade():
    op.drop_index("ix_terminals_company_active_heartbeat", table_name="terminals")
    op.drop_column("terminals", "last_heartbeat")
