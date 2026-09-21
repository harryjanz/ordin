"""B1 (ORD-194): nota fiscal de compra importada via XML — cabeçalho
(supplier_invoices) + itens brutos preservados do XML (supplier_invoice_items).
Sem FK pra products/options de propósito — vínculo automático é C1.

Revision ID: 20260921_1600
Revises: 20260921_0900
Create Date: 2026-09-21 16:00:00

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision = "20260921_1600"
down_revision = "20260921_0900"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "supplier_invoices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("supplier_id", sa.Integer(), sa.ForeignKey("suppliers.id"), nullable=False),
        sa.Column("chave_acesso", sa.String(44), nullable=False),
        sa.Column("numero", sa.String(20), nullable=True),
        sa.Column("serie", sa.String(10), nullable=True),
        sa.Column("data_emissao", sa.DateTime(), nullable=True),
        sa.Column("valor_total", sa.Numeric(12, 2), nullable=False),
        # MEDIUMBLOB (16MB), não LargeBinary genérico — vira BLOB (64KB) no MySQL
        # e estoura com notas reais de muitos itens (achado em teste live).
        sa.Column("xml_raw", mysql.MEDIUMBLOB(), nullable=False),
        sa.Column("imported_by", sa.Integer(), nullable=False),
        sa.Column("imported_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("company_id", "chave_acesso", name="uq_supplier_invoices_company_chave"),
    )
    op.create_index("ix_supplier_invoices_company_id", "supplier_invoices", ["company_id"])

    op.create_table(
        "supplier_invoice_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("supplier_invoice_id", sa.Integer(), sa.ForeignKey("supplier_invoices.id"), nullable=False),
        sa.Column("n_item", sa.Integer(), nullable=False),
        sa.Column("c_prod", sa.String(60), nullable=True),
        sa.Column("c_ean", sa.String(14), nullable=True),
        sa.Column("x_prod", sa.String(200), nullable=False),
        sa.Column("ncm", sa.String(8), nullable=True),
        sa.Column("cfop", sa.String(4), nullable=True),
        sa.Column("unidade", sa.String(10), nullable=True),
        sa.Column("quantidade", sa.Numeric(15, 4), nullable=False),
        sa.Column("valor_unitario", sa.Numeric(15, 4), nullable=False),
        sa.Column("valor_total", sa.Numeric(15, 2), nullable=False),
    )
    op.create_index(
        "ix_supplier_invoice_items_supplier_invoice_id", "supplier_invoice_items", ["supplier_invoice_id"]
    )


def downgrade() -> None:
    # drop_table sozinho já cuida do índice e da FK de supplier_invoice_items —
    # dropar o índice antes falha no MySQL (índice sustenta a FK).
    op.drop_table("supplier_invoice_items")
    op.drop_index("ix_supplier_invoices_company_id", table_name="supplier_invoices")
    op.drop_table("supplier_invoices")
