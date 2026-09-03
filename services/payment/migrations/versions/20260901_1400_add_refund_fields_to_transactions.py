"""add refunded_at/refund_reason to transactions (ORD-147)

Revision ID: 20260901_1400
Revises: 20260811_0200
Create Date: 2026-09-01 14:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "20260901_1400"
down_revision = "20260811_0200"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    cols = {c["name"] for c in inspector.get_columns("transactions")}
    if "refunded_at" not in cols:
        op.add_column("transactions", sa.Column("refunded_at", sa.DateTime(), nullable=True))
    if "refund_reason" not in cols:
        op.add_column("transactions", sa.Column("refund_reason", sa.String(255), nullable=True))


def downgrade():
    op.drop_column("transactions", "refund_reason")
    op.drop_column("transactions", "refunded_at")
