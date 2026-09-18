"""ORD-188 (G1): Option ganha ean/cfop/cest — opções que representam produtos
reais (ex.: sabores de um refrigerante, cada um CFOP 5102 com EAN próprio)
passam a ter identidade fiscal própria, preparando o terreno pro controle de
estoque por opção (G2/G3). Sem UniqueConstraint de banco pro ean: Option não
tem company_id direto, unicidade é validada em aplicação (mesmo padrão já
usado pro sku, ver _set_option_group_options). Sem backfill.

Revision ID: 20260918_0901
Revises: 20260918_0900
Create Date: 2026-09-18 09:01:00

"""
import sqlalchemy as sa
from alembic import op

revision = "20260918_0901"
down_revision = "20260918_0900"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("options", sa.Column("ean", sa.String(14), nullable=True))
    op.add_column("options", sa.Column("cfop", sa.String(4), nullable=True))
    op.add_column("options", sa.Column("cest", sa.String(7), nullable=True))


def downgrade() -> None:
    op.drop_column("options", "cest")
    op.drop_column("options", "cfop")
    op.drop_column("options", "ean")
