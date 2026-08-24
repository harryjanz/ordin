"""modelo de atendimento — por_item/retirada_unica (ORD-118)

Revision ID: 20260824_1100
Revises: 20260824_0900
Create Date: 2026-08-24 11:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "20260824_1100"
down_revision = "20260824_0900"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {c["name"] for c in inspector.get_columns("companies")}
    if "fulfillment_mode" not in columns:
        op.add_column(
            "companies",
            sa.Column("fulfillment_mode", sa.String(20), nullable=False, server_default="por_item"),
        )


def downgrade() -> None:
    op.drop_column("companies", "fulfillment_mode")
