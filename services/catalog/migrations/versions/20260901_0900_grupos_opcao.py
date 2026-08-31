"""ORD-138: grupos de opção — modelo de dados (option_groups, options,
product_option_groups). Só o CRUD nesta história — UI (ORD-139/140),
seleção no totem (ORD-141), precificação no pedido (ORD-142) e impressão
(ORD-143) são histórias-filhas separadas, ainda não aplicadas.

Revision ID: 20260901_0900
Revises: 20260824_2300
Create Date: 2026-09-01 09:00:00

"""
from alembic import op
import sqlalchemy as sa

revision = "20260901_0900"
down_revision = "20260824_2300"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "option_groups",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), nullable=False, index=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("min_selections", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("max_selections", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_table(
        "options",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("option_group_id", sa.Integer(), sa.ForeignKey("option_groups.id"), nullable=False),
        sa.Column("label", sa.String(80), nullable=False),
        sa.Column("price_delta", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("image_url", sa.String(500), nullable=True),
        sa.Column("thumbnail_url", sa.String(500), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=True),
    )
    op.create_table(
        "product_option_groups",
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), primary_key=True),
        sa.Column("option_group_id", sa.Integer(), sa.ForeignKey("option_groups.id"), primary_key=True),
    )


def downgrade() -> None:
    op.drop_table("product_option_groups")
    op.drop_table("options")
    op.drop_table("option_groups")
