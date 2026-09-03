"""Nome opcional de retirada — Order.pickup_name (ORD-119)

Revision ID: 20260824_1900
Revises: 20260824_1600
Create Date: 2026-08-24 19:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "20260824_1900"
down_revision = "20260824_1600"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {c["name"] for c in inspector.get_columns("orders")}
    if "pickup_name" not in columns:
        op.add_column("orders", sa.Column("pickup_name", sa.String(80), nullable=True))


def downgrade() -> None:
    op.drop_column("orders", "pickup_name")
