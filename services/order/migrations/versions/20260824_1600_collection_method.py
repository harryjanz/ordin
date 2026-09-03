"""Método de coleta do ticket — qr | manual (ORD-123)

Revision ID: 20260824_1600
Revises: 20260824_1130
Create Date: 2026-08-24 16:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "20260824_1600"
down_revision = "20260824_1130"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {c["name"] for c in inspector.get_columns("tickets")}
    if "collection_method" not in columns:
        op.add_column(
            "tickets",
            sa.Column("collection_method", sa.String(10), nullable=False, server_default="qr"),
        )


def downgrade() -> None:
    op.drop_column("tickets", "collection_method")
