"""add refused_reason to transactions (ORD-080)

Revision ID: 20260811_0200
Revises: 20260618_1100
Create Date: 2026-08-11 02:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "20260811_0200"
down_revision = "20260618_1100"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    cols = {c["name"] for c in inspector.get_columns("transactions")}
    if "refused_reason" not in cols:
        op.add_column("transactions", sa.Column("refused_reason", sa.String(255), nullable=True))


def downgrade():
    op.drop_column("transactions", "refused_reason")
