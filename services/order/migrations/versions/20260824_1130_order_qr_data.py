"""QR único de pedido — Order.qr_data (ORD-118)

Revision ID: 20260824_1130
Revises: 20260821_1500
Create Date: 2026-08-24 11:30:00
"""
import sqlalchemy as sa
from alembic import op

revision = "20260824_1130"
down_revision = "20260821_1500"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {c["name"] for c in inspector.get_columns("orders")}
    if "qr_data" not in columns:
        op.add_column("orders", sa.Column("qr_data", sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column("orders", "qr_data")
