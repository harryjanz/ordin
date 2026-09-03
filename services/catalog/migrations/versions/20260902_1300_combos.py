"""ORD-112: cadastro de combo/bundle no admin — modelo de dados (combos,
combo_items). Só o CRUD nesta história — consumo no totem (exibição,
upsell, explosão em OrderItem/discount no pedido) é ORD-150.

Revision ID: 20260902_1300
Revises: 20260902_1200
Create Date: 2026-09-02 13:00:00

"""
import sqlalchemy as sa
from alembic import op

revision = "20260902_1300"
down_revision = "20260902_1200"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "combos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), nullable=False, index=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("price", sa.Numeric(10, 2), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_table(
        "combo_items",
        sa.Column("combo_id", sa.Integer(), sa.ForeignKey("combos.id"), primary_key=True),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), primary_key=True),
    )


def downgrade() -> None:
    op.drop_table("combo_items")
    op.drop_table("combos")
