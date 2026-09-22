"""ORD-197: fator de conversão por fornecedor. supplier_product_code (nível
3, código do fornecedor) ganha quantidade_por_unidade nullable — mesma
semântica de product_gtin_alt.quantidade_por_unidade (nível 2), mas nullable
porque a maioria das linhas de nível 3 nunca tem fator, é opcional de
verdade, diferente do nível 2 onde a linha só existe quando há conversão.

Revision ID: 20260922_1500
Revises: 20260922_1400
Create Date: 2026-09-22 15:00:00

"""
import sqlalchemy as sa
from alembic import op

revision = "20260922_1500"
down_revision = "20260922_1400"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "supplier_product_code",
        sa.Column("quantidade_por_unidade", sa.Numeric(12, 3), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("supplier_product_code", "quantidade_por_unidade")
