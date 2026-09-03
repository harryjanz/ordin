"""Webhook secret por empresa em company_payment_configs (ORD-131)

Revision ID: 20260827_0100
Revises: 20260824_2000
Create Date: 2026-08-27 01:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "20260827_0100"
down_revision = "20260824_2000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {c["name"] for c in inspector.get_columns("company_payment_configs")}
    if "webhook_secret" not in columns:
        op.add_column(
            "company_payment_configs",
            sa.Column("webhook_secret", sa.String(500), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("company_payment_configs", "webhook_secret")
