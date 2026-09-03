"""flag is_demo — empresa de demonstração da plataforma (ORD-117)

Revision ID: 20260824_0900
Revises: 20260823_1000
Create Date: 2026-08-24 09:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "20260824_0900"
down_revision = "20260823_1000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {c["name"] for c in inspector.get_columns("companies")}
    if "is_demo" not in columns:
        op.add_column(
            "companies",
            sa.Column("is_demo", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
    op.execute("UPDATE companies SET is_demo = TRUE WHERE id = 1")


def downgrade() -> None:
    op.execute("UPDATE companies SET is_demo = FALSE WHERE id = 1")
    op.drop_column("companies", "is_demo")
