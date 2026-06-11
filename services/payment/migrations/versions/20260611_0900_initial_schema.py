"""initial_schema

Revision ID: eee001
Revises:
Create Date: 2026-06-11 09:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "eee001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("order_ref", sa.String(12), nullable=False),
        sa.Column("terminal_id", sa.Integer(), nullable=False),
        sa.Column("tef_number", sa.String(40), nullable=False),
        sa.Column("method", sa.String(10), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("status", sa.String(20), nullable=True, server_default=sa.text("'pending'")),
        sa.Column("nsu", sa.String(40), nullable=True),
        sa.Column("authorization", sa.String(40), nullable=True),
        sa.Column("paygo_response", sa.String(2000), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(), nullable=True),
        sa.Column("cancel_reason", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True,
                  server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_transactions_company_id", "transactions", ["company_id"])
    op.create_index("ix_transactions_order_ref", "transactions", ["order_ref"])


def downgrade() -> None:
    op.drop_index("ix_transactions_order_ref", table_name="transactions")
    op.drop_index("ix_transactions_company_id", table_name="transactions")
    op.drop_table("transactions")
