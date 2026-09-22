"""C1 (ORD-195): vínculo automático de itens de nota de compra por EAN/GTIN
de embalagem/cProd — 2 tabelas novas (product_gtin_alt, supplier_product_code),
colunas novas em supplier_invoice_items (vínculo + dados tributáveis do XML),
índices novos em products.ean/options.ean.

Revision ID: 20260922_0900
Revises: 20260921_1600
Create Date: 2026-09-22 09:00:00

"""
import sqlalchemy as sa
from alembic import op

revision = "20260922_0900"
down_revision = "20260921_1600"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("supplier_invoice_items") as batch_op:
        batch_op.add_column(sa.Column("product_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("option_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("link_source", sa.String(20), nullable=True))
        batch_op.add_column(sa.Column("pendente_motivo", sa.String(30), nullable=True))
        batch_op.add_column(sa.Column("unidade_tributavel", sa.String(10), nullable=True))
        batch_op.add_column(sa.Column("quantidade_tributavel", sa.Numeric(15, 4), nullable=True))
        batch_op.add_column(sa.Column("valor_unitario_tributavel", sa.Numeric(15, 4), nullable=True))
        batch_op.create_foreign_key(
            "fk_supplier_invoice_items_product", "products", ["product_id"], ["id"]
        )
        batch_op.create_foreign_key(
            "fk_supplier_invoice_items_option", "options", ["option_id"], ["id"]
        )

    op.create_index("ix_products_company_ean", "products", ["company_id", "ean"])
    op.create_index("ix_options_ean", "options", ["ean"])

    op.create_table(
        "product_gtin_alt",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("gtin", sa.String(14), nullable=False),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), nullable=True),
        sa.Column("option_id", sa.Integer(), sa.ForeignKey("options.id"), nullable=True),
        sa.Column("quantidade_por_unidade", sa.Numeric(12, 3), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("company_id", "gtin", name="uq_product_gtin_alt_company_gtin"),
        sa.CheckConstraint(
            "(product_id IS NOT NULL AND option_id IS NULL) OR (product_id IS NULL AND option_id IS NOT NULL)",
            name="ck_product_gtin_alt_owner_xor",
        ),
    )
    op.create_index("ix_product_gtin_alt_company_id", "product_gtin_alt", ["company_id"])

    op.create_table(
        "supplier_product_code",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("supplier_id", sa.Integer(), sa.ForeignKey("suppliers.id"), nullable=False),
        sa.Column("c_prod", sa.String(60), nullable=False),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), nullable=True),
        sa.Column("option_id", sa.Integer(), sa.ForeignKey("options.id"), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("company_id", "supplier_id", "c_prod", name="uq_supplier_product_code"),
        sa.CheckConstraint(
            "(product_id IS NOT NULL AND option_id IS NULL) OR (product_id IS NULL AND option_id IS NOT NULL)",
            name="ck_supplier_product_code_owner_xor",
        ),
    )
    op.create_index("ix_supplier_product_code_company_id", "supplier_product_code", ["company_id"])


def downgrade() -> None:
    op.drop_index("ix_supplier_product_code_company_id", table_name="supplier_product_code")
    op.drop_table("supplier_product_code")
    op.drop_index("ix_product_gtin_alt_company_id", table_name="product_gtin_alt")
    op.drop_table("product_gtin_alt")

    op.drop_index("ix_options_ean", table_name="options")
    op.drop_index("ix_products_company_ean", table_name="products")

    with op.batch_alter_table("supplier_invoice_items") as batch_op:
        batch_op.drop_constraint("fk_supplier_invoice_items_option", type_="foreignkey")
        batch_op.drop_constraint("fk_supplier_invoice_items_product", type_="foreignkey")
        batch_op.drop_column("valor_unitario_tributavel")
        batch_op.drop_column("quantidade_tributavel")
        batch_op.drop_column("unidade_tributavel")
        batch_op.drop_column("pendente_motivo")
        batch_op.drop_column("link_source")
        batch_op.drop_column("option_id")
        batch_op.drop_column("product_id")
