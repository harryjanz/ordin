"""C2 (ORD-196): fila de pendência com resolução manual — só índices, nenhuma
tabela/coluna nova (product_gtin_alt/supplier_product_code já existem, criadas
por C1; link_source ganha os valores "manual"/"ignorado" sem mudança de schema,
é String(20) sem CHECK de banco). Índices compostos (link_source, c_ean) e
(link_source, c_prod) cobrem as 3 queries novas desta história — busca de
candidatos retroativos e listagem da tela "Pendências" — melhor que 3 índices
de coluna única (achado do repasse de Backend, ver docs/stories/ORD-196).

Revision ID: 20260922_1400
Revises: 20260922_0900
Create Date: 2026-09-22 14:00:00

"""
from alembic import op

revision = "20260922_1400"
down_revision = "20260922_0900"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_supplier_invoice_items_link_source_ean", "supplier_invoice_items",
        ["link_source", "c_ean"],
    )
    op.create_index(
        "ix_supplier_invoice_items_link_source_prod", "supplier_invoice_items",
        ["link_source", "c_prod"],
    )


def downgrade() -> None:
    op.drop_index("ix_supplier_invoice_items_link_source_prod", table_name="supplier_invoice_items")
    op.drop_index("ix_supplier_invoice_items_link_source_ean", table_name="supplier_invoice_items")
