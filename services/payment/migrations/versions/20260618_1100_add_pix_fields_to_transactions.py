"""add qr_code fields to transactions for PIX

Revision ID: 20260618_1100
Revises: 20260611_1001
Create Date: 2026-06-18 11:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "20260618_1100"
down_revision = "pay002"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    cols = {c["name"] for c in inspector.get_columns("transactions")}
    if "mp_device_id" not in cols:
        op.add_column("transactions", sa.Column("mp_device_id", sa.String(100), nullable=True))
    if "qr_code" not in cols:
        op.add_column("transactions", sa.Column("qr_code", sa.Text, nullable=True))
    if "qr_code_base64" not in cols:
        op.add_column("transactions", sa.Column("qr_code_base64", sa.Text, nullable=True))


def downgrade():
    op.drop_column("transactions", "qr_code_base64")
    op.drop_column("transactions", "qr_code")
    op.drop_column("transactions", "mp_device_id")
