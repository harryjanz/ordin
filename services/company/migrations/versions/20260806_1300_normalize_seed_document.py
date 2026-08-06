"""normalize_seed_document

Revision ID: 20260806_1300
Revises: 20260805_1000
Create Date: 2026-08-06 13:00:00.000000

O seed inicial (bbb002) inseriu document com máscara ('12.345.678/0001-99'),
violando a invariante "banco armazena sempre sem máscara" usada pelo filtro
de prefixo em GET /companies (Company.document.like(f"{normalize_cnpj(document)}%")).
Isso fazia o filtro por prefixo (ex: "123") não bater com nada.
"""
from alembic import op

revision = "20260806_1300"
down_revision = "20260805_1000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        UPDATE companies
        SET document = REPLACE(REPLACE(REPLACE(document, '.', ''), '/', ''), '-', '')
        WHERE document IS NOT NULL
          AND (document LIKE '%.%' OR document LIKE '%/%' OR document LIKE '%-%')
    """)


def downgrade() -> None:
    pass
