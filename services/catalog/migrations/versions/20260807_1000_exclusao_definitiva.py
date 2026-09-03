"""add deleted flag a categories/products (exclusão definitiva)

Revision ID: 20260807_1000
Revises: 20260807_0900
Create Date: 2026-08-07 10:00:00

"""
import sqlalchemy as sa
from alembic import op

revision = "20260807_1000"
down_revision = "20260807_0900"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "categories",
        sa.Column("deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "products",
        sa.Column("deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade():
    op.drop_column("products", "deleted")
    op.drop_column("categories", "deleted")
