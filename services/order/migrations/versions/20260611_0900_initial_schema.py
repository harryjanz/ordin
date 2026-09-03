"""initial_schema

Revision ID: ddd001
Revises:
Create Date: 2026-06-11 09:00:00.000000

"""
import sqlalchemy as sa
from alembic import op

revision = "ddd001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    existing = set(sa.inspect(conn).get_table_names())

    if "orders" not in existing:
        op.create_table(
            "orders",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("company_id", sa.Integer(), nullable=False),
            sa.Column("terminal_id", sa.Integer(), nullable=False),
            sa.Column("order_ref", sa.String(12), nullable=False),
            sa.Column("status", sa.String(20), nullable=True, server_default=sa.text("'pending'")),
            sa.Column("total", sa.Numeric(10, 2), nullable=False),
            sa.Column("discount", sa.Numeric(10, 2), nullable=True, server_default=sa.text("0")),
            sa.Column("cpf", sa.String(14), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True,
                      server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("order_ref"),
        )
        op.create_index("ix_orders_company_id", "orders", ["company_id"])

    if "order_items" not in existing:
        op.create_table(
            "order_items",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id"), nullable=False),
            sa.Column("product_id", sa.Integer(), nullable=False),
            sa.Column("product_name", sa.String(120), nullable=False),
            sa.Column("unit_price", sa.Numeric(10, 2), nullable=False),
            sa.Column("quantity", sa.Integer(), nullable=False, server_default=sa.text("1")),
            sa.Column("subtotal", sa.Numeric(10, 2), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )

    if "tickets" not in existing:
        op.create_table(
            "tickets",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("order_item_id", sa.Integer(), sa.ForeignKey("order_items.id"), nullable=False),
            sa.Column("ticket_code", sa.String(12), nullable=False),
            sa.Column("qr_data", sa.String(500), nullable=False),
            sa.Column("order_ref", sa.String(12), nullable=False),
            sa.Column("unit_number", sa.Integer(), nullable=False),
            sa.Column("total_units", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(20), nullable=True, server_default=sa.text("'printed'")),
            sa.Column("printed_at", sa.DateTime(), nullable=True,
                      server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("collected_at", sa.DateTime(), nullable=True),
            sa.Column("collected_by", sa.String(80), nullable=True),
            sa.Column("collection_device", sa.String(64), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("ticket_code"),
        )
        op.create_index("ix_tickets_order_ref", "tickets", ["order_ref"])


def downgrade() -> None:
    op.drop_index("ix_tickets_order_ref", table_name="tickets")
    op.drop_table("tickets")
    op.drop_table("order_items")
    op.drop_index("ix_orders_company_id", table_name="orders")
    op.drop_table("orders")
