"""Momento em que o pedido ficou pronto — Order.ready_at (ORD-119)

Revision ID: 20260824_2100
Revises: 20260824_1900
Create Date: 2026-08-24 21:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "20260824_2100"
down_revision = "20260824_1900"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {c["name"] for c in inspector.get_columns("orders")}
    if "ready_at" not in columns:
        op.add_column("orders", sa.Column("ready_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("orders", "ready_at")
