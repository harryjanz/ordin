"""ORD-166: promoções no catálogo — desconto percentual por período, com
composição de categorias/produtos/combos e override por item. Status
(rascunho/ativa/expirada/conflito) é sempre computado em runtime, não
persistido — só existe a coluna is_enabled (toggle do admin). Item duplicado
na composição e "exatamente um id preenchido por item_type" são validados na
aplicação (ver _validate_promotion_items em main.py), não via constraint de
banco — MySQL não tem índice único parcial/funcional como o Postgres.

Revision ID: 20260914_1200
Revises: 20260908_1000
Create Date: 2026-09-14 12:00:00

"""
import sqlalchemy as sa
from alembic import op

revision = "20260914_1200"
down_revision = "20260908_1000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "promotions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("starts_at", sa.DateTime(), nullable=False),
        sa.Column("ends_at", sa.DateTime(), nullable=False),
        sa.Column("general_discount_percent", sa.Numeric(5, 2), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_promotions_company_id", "promotions", ["company_id"])
    # usado tanto na listagem (filtro company_id+deleted) quanto na
    # resolução de preço promocional a cada consulta de produto/combo
    # (filtro company_id+is_enabled+deleted, ver _resolve_product_promotion)
    op.create_index(
        "ix_promotions_company_enabled_deleted", "promotions", ["company_id", "is_enabled", "deleted"]
    )

    op.create_table(
        "promotion_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "promotion_id", sa.Integer(),
            sa.ForeignKey("promotions.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("item_type", sa.String(20), nullable=False),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=True),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), nullable=True),
        sa.Column("combo_id", sa.Integer(), sa.ForeignKey("combos.id"), nullable=True),
        sa.Column("discount_percent_override", sa.Numeric(5, 2), nullable=True),
    )
    op.create_index("ix_promotion_items_promotion_id", "promotion_items", ["promotion_id"])


def downgrade() -> None:
    op.drop_table("promotion_items")
    op.drop_table("promotions")
