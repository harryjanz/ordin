"""G3 (ORD-190): estoque mínimo e conversão de unidade também em Option —
mesmos 3 campos que Product ganha aqui de propósito (estoque_minimo,
unidade_compra, fator_conversao), mesmo A3/A5 ainda não expondo isso na
API/UI de Product — _get_stock_state/_create_stock_movement (revisão G2/G4,
generalizadas nesta história) leem owner.estoque_minimo pros dois tipos de
dono sem `if` nenhum, então os dois precisam ter as mesmas colunas. Também
adiciona quantidade_original/unidade_original em stock_movements, pro
histórico preservar o valor bruto digitado quando a movimentação foi
registrada na unidade de compra. Sem backfill — defaults cobrem os dados já
existentes (estoque_minimo=0, conversão NULL = não configurada).

Revision ID: 20260918_0905
Revises: 20260918_0904
Create Date: 2026-09-18 09:05:00

"""
import sqlalchemy as sa
from alembic import op

revision = "20260918_0905"
down_revision = "20260918_0904"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("products", sa.Column("estoque_minimo", sa.Numeric(12, 3), nullable=False, server_default="0"))
    op.add_column("products", sa.Column("unidade_compra", sa.String(30), nullable=True))
    op.add_column("products", sa.Column("fator_conversao", sa.Numeric(12, 3), nullable=True))
    op.create_check_constraint(
        "ck_products_conversao_junta", "products",
        "(unidade_compra IS NULL) = (fator_conversao IS NULL)",
    )

    op.add_column("options", sa.Column("estoque_minimo", sa.Numeric(12, 3), nullable=False, server_default="0"))
    op.add_column("options", sa.Column("unidade_compra", sa.String(30), nullable=True))
    op.add_column("options", sa.Column("fator_conversao", sa.Numeric(12, 3), nullable=True))
    op.create_check_constraint(
        "ck_options_conversao_junta", "options",
        "(unidade_compra IS NULL) = (fator_conversao IS NULL)",
    )

    op.add_column("stock_movements", sa.Column("quantidade_original", sa.Numeric(12, 3), nullable=True))
    op.add_column("stock_movements", sa.Column("unidade_original", sa.String(30), nullable=True))


def downgrade() -> None:
    op.drop_column("stock_movements", "unidade_original")
    op.drop_column("stock_movements", "quantidade_original")

    op.drop_constraint("ck_options_conversao_junta", "options", type_="check")
    op.drop_column("options", "fator_conversao")
    op.drop_column("options", "unidade_compra")
    op.drop_column("options", "estoque_minimo")

    op.drop_constraint("ck_products_conversao_junta", "products", type_="check")
    op.drop_column("products", "fator_conversao")
    op.drop_column("products", "unidade_compra")
    op.drop_column("products", "estoque_minimo")
