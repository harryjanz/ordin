"""ORD-180: código de barras (EAN/GTIN) do produto — distinto do sku
(identificador interno de livre escolha). Opcional, único por empresa.
Base pro vínculo automático com XML de nota fiscal de compra (histórias
futuras B1/C1 do épico de estoque/ERP). Sem backfill — produto existente
fica com ean=NULL até a empresa preencher.

Revision ID: 20260918_0900
Revises: 20260915_0901
Create Date: 2026-09-18 09:00:00

"""
import sqlalchemy as sa
from alembic import op

revision = "20260918_0900"
down_revision = "20260915_0901"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("products", sa.Column("ean", sa.String(14), nullable=True))
    op.create_unique_constraint("uq_products_company_ean", "products", ["company_id", "ean"])


def downgrade() -> None:
    op.drop_constraint("uq_products_company_ean", "products", type_="unique")
    op.drop_column("products", "ean")
