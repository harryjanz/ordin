"""ORD-160: produtos correlacionados (cross-sell sem combo) — modelo de
dados (related_products). Unidirecional, sem company_id próprio —
isolamento via join com products nos dois lados, mesmo padrão de
combo_items/product_allergens.

Revision ID: 20260908_1000
Revises: 20260903_1600
Create Date: 2026-09-08 10:00:00

"""
import sqlalchemy as sa
from alembic import op

revision = "20260908_1000"
down_revision = "20260903_1600"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "related_products",
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), primary_key=True),
        sa.Column("related_product_id", sa.Integer(), sa.ForeignKey("products.id"), primary_key=True),
        sa.Column("sort_order", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("related_products")
