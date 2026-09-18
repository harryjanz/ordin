"""ORD-181 (A2+G2): registro e ajuste manual de estoque — stock_items e
stock_movements, com dono polimórfico desde o nascimento (product_id OU
option_id, nunca os dois, CheckConstraint no banco). Option não tem
company_id direto (join com OptionGroup), então company_id é denormalizado
em stock_items pra evitar esse join em toda leitura. Sem backfill — nenhum
produto/opção tem estoque até a primeira movimentação ser registrada.

Revision ID: 20260918_0903
Revises: 20260918_0901
Create Date: 2026-09-18 09:03:00

"""
import sqlalchemy as sa
from alembic import op

revision = "20260918_0903"
down_revision = "20260918_0901"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "stock_items",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("company_id", sa.Integer, nullable=False),
        sa.Column("product_id", sa.Integer, sa.ForeignKey("products.id"), nullable=True),
        sa.Column("option_id", sa.Integer, sa.ForeignKey("options.id"), nullable=True),
        sa.Column("quantidade_atual", sa.Numeric(12, 3), nullable=False, server_default="0"),
        sa.Column("unidade", sa.String(2), nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=True),
        sa.Column("updated_at", sa.DateTime, nullable=True),
        sa.UniqueConstraint("product_id", name="uq_stock_items_product"),
        sa.UniqueConstraint("option_id", name="uq_stock_items_option"),
        sa.CheckConstraint(
            "(product_id IS NOT NULL AND option_id IS NULL) OR (product_id IS NULL AND option_id IS NOT NULL)",
            name="ck_stock_items_owner_xor",
        ),
    )
    op.create_index("ix_stock_items_company_id", "stock_items", ["company_id"])
    op.create_table(
        "stock_movements",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("stock_item_id", sa.Integer, sa.ForeignKey("stock_items.id"), nullable=False),
        sa.Column("tipo", sa.String(10), nullable=False),
        sa.Column("quantidade", sa.Numeric(12, 3), nullable=False),
        sa.Column("motivo", sa.String(255), nullable=True),
        sa.Column("criado_por", sa.Integer, nullable=False),
        sa.Column("criado_em", sa.DateTime, nullable=True),
    )
    op.create_index("ix_stock_movements_stock_item_id", "stock_movements", ["stock_item_id"])


def downgrade() -> None:
    op.drop_table("stock_movements")
    op.drop_table("stock_items")
