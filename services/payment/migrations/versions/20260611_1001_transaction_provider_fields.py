"""transaction_provider_fields

Revision ID: pay002
Revises: pay001
Create Date: 2026-06-11 10:01:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "pay002"
down_revision = "eee001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    cols = {c["name"] for c in sa.inspect(conn).get_columns("transactions")}

    if "provider" not in cols:
        op.add_column("transactions", sa.Column("provider", sa.String(20), server_default="mock"))
    if "provider_transaction_id" not in cols:
        op.add_column("transactions", sa.Column("provider_transaction_id", sa.String(80), nullable=True))
    if "paygo_terminal_id" not in cols:
        op.add_column("transactions", sa.Column("paygo_terminal_id", sa.String(40), nullable=True))
    if "environment" not in cols:
        op.add_column("transactions", sa.Column("environment", sa.String(10), nullable=True))

    # tef_number era NOT NULL — torna nullable (campo legado)
    op.alter_column("transactions", "tef_number", nullable=True, existing_type=sa.String(40))


def downgrade() -> None:
    op.drop_column("transactions", "environment")
    op.drop_column("transactions", "paygo_terminal_id")
    op.drop_column("transactions", "provider_transaction_id")
    op.drop_column("transactions", "provider")
    op.alter_column("transactions", "tef_number", nullable=False, existing_type=sa.String(40))
