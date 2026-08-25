"""ORD-125: cardápios por horário — modelo de dados (menus, menu_categories,
menu_products). Só o CRUD nesta história — regra de visibilidade condicional
por horário é ORD-127, ainda não aplicada.

Revision ID: 20260824_2300
Revises: 20260824_2200
Create Date: 2026-08-24 23:00:00

"""
from alembic import op
import sqlalchemy as sa

revision = "20260824_2300"
down_revision = "20260824_2200"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "menus",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), nullable=False, index=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("weekdays", sa.JSON(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_table(
        "menu_categories",
        sa.Column("menu_id", sa.Integer(), sa.ForeignKey("menus.id"), primary_key=True),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id"), primary_key=True),
    )
    op.create_table(
        "menu_products",
        sa.Column("menu_id", sa.Integer(), sa.ForeignKey("menus.id"), primary_key=True),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), primary_key=True),
    )


def downgrade() -> None:
    op.drop_table("menu_products")
    op.drop_table("menu_categories")
    op.drop_table("menus")
