"""fiscal_documents — resultado da emissão de NFC-e pós-pagamento (ORD-171)

order_ref é referência, não FK — cross-service, mesmo padrão já usado pra
ligar Transaction a um pedido do order-service.

Revision ID: 20260916_1100
Revises: 20260901_1400
Create Date: 2026-09-16 11:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "20260916_1100"
down_revision = "20260901_1400"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "fiscal_documents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("order_ref", sa.String(length=64), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("chave_nfe", sa.String(length=44), nullable=True),
        sa.Column("caminho_danfe", sa.String(length=255), nullable=True),
        sa.Column("qrcode_url", sa.String(length=255), nullable=True),
        sa.Column("erro_mensagem", sa.Text(), nullable=True),
        sa.Column("ambiente", sa.String(length=12), nullable=False),
        sa.Column("criado_em", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_fiscal_documents_order_ref", "fiscal_documents", ["order_ref"])
    op.create_index("ix_fiscal_documents_company_id", "fiscal_documents", ["company_id"])


def downgrade() -> None:
    op.drop_table("fiscal_documents")
