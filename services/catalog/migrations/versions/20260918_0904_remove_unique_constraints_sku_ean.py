"""Decisão do usuário (2026-09-18): sku/ean precisam ser únicos por empresa
só quando ATIVOS, e a regra atravessa Product e Option juntos — nenhuma das
duas condições (condicional a active, cruzando duas tabelas) dá pra expressar
como UniqueConstraint simples de uma tabela só. Remove as duas constraints de
banco (uq_products_company_sku, pré-existente desde ORD-075/20260807, e
uq_products_company_ean, da ORD-180) — unicidade passa a ser validada
inteiramente em aplicação (_check_active_code_conflict), mesmo trade-off já
aceito hoje pro sku de Option (sem UniqueConstraint de banco desde sempre,
por não ter company_id direto). Sem alteração de dado, só das constraints.

Revision ID: 20260918_0904
Revises: 20260918_0901
Create Date: 2026-09-18 09:04:00

"""
from alembic import op

revision = "20260918_0904"
down_revision = "20260918_0903"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("uq_products_company_sku", "products", type_="unique")
    op.drop_constraint("uq_products_company_ean", "products", type_="unique")


def downgrade() -> None:
    op.create_unique_constraint("uq_products_company_ean", "products", ["company_id", "ean"])
    op.create_unique_constraint("uq_products_company_sku", "products", ["company_id", "sku"])
