"""menu de categorias horizontal/vertical do totem (ORD-116)

Revision ID: 20260823_1000
Revises: 20260822_1800
Create Date: 2026-08-23 10:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "20260823_1000"
down_revision = "20260822_1800"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {c["name"] for c in inspector.get_columns("companies")}
    if "catalog_menu_layout" not in columns:
        op.add_column(
            "companies",
            sa.Column("catalog_menu_layout", sa.String(10), nullable=False, server_default="horizontal"),
        )


def downgrade() -> None:
    op.drop_column("companies", "catalog_menu_layout")
