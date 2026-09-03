"""Tabela order_item_options — opção de grupo de opção escolhida por item (ORD-142)

Revision ID: 20260903_1900
Revises: 20260824_2100
Create Date: 2026-09-03 19:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "20260903_1900"
down_revision = "20260824_2100"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if "order_item_options" not in inspector.get_table_names():
        op.create_table(
            "order_item_options",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("order_item_id", sa.Integer(), sa.ForeignKey("order_items.id"), nullable=False),
            sa.Column("group_name", sa.String(80), nullable=False),
            sa.Column("option_label", sa.String(80), nullable=False),
            sa.Column("price_delta", sa.Numeric(10, 2), nullable=False, server_default="0"),
        )
        op.create_index(
            "ix_order_item_options_order_item_id", "order_item_options", ["order_item_id"]
        )


def downgrade() -> None:
    op.drop_index("ix_order_item_options_order_item_id", table_name="order_item_options")
    op.drop_table("order_item_options")
