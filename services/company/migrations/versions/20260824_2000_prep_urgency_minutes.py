"""Minutos até urgência no preparo — configurável por empresa (ORD-119)

Revision ID: 20260824_2000
Revises: 20260824_1100
Create Date: 2026-08-24 20:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "20260824_2000"
down_revision = "20260824_1100"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {c["name"] for c in inspector.get_columns("companies")}
    if "prep_urgency_minutes" not in columns:
        op.add_column(
            "companies",
            sa.Column("prep_urgency_minutes", sa.Integer(), nullable=False, server_default="10"),
        )


def downgrade() -> None:
    op.drop_column("companies", "prep_urgency_minutes")
