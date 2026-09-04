"""order_items ganha combo_instance_key/combo_name (ORD-159)

Revision ID: 20260904_1200
Revises: 20260903_1900
Create Date: 2026-09-04 12:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "20260904_1200"
down_revision = "20260903_1900"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {c["name"] for c in inspector.get_columns("order_items")}
    if "combo_instance_key" not in columns:
        op.add_column("order_items", sa.Column("combo_instance_key", sa.String(40), nullable=True))
        op.create_index(
            "ix_order_items_combo_instance_key", "order_items", ["combo_instance_key"]
        )
    if "combo_name" not in columns:
        op.add_column("order_items", sa.Column("combo_name", sa.String(120), nullable=True))


def downgrade() -> None:
    op.drop_column("order_items", "combo_name")
    op.drop_index("ix_order_items_combo_instance_key", table_name="order_items")
    op.drop_column("order_items", "combo_instance_key")
