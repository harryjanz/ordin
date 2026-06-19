"""add mp_device_id to terminals

Revision ID: 20260618_1000
Revises: 20260616_1000
Create Date: 2026-06-18 10:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "20260618_1000"
down_revision = "20260616_1000"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    cols = {c["name"] for c in inspector.get_columns("terminals")}
    if "mp_device_id" not in cols:
        op.add_column("terminals", sa.Column("mp_device_id", sa.String(100), nullable=True))


def downgrade():
    op.drop_column("terminals", "mp_device_id")
