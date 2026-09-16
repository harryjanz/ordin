"""interruptor de emissão e ambiente (ORD-171)

company_fiscal_configs ganha ativo (bool, default false — nenhuma empresa emite
nota fiscal automaticamente até opt-in explícito) e ambiente (homologacao|
producao, default homologacao — cliente novo nunca emite nota fiscal real por
engano).

Revision ID: 20260916_1000
Revises: 20260916_0900
Create Date: 2026-09-16 10:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "20260916_1000"
down_revision = "20260916_0900"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "company_fiscal_configs",
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "company_fiscal_configs",
        sa.Column("ambiente", sa.String(length=12), nullable=False, server_default="homologacao"),
    )


def downgrade() -> None:
    op.drop_column("company_fiscal_configs", "ambiente")
    op.drop_column("company_fiscal_configs", "ativo")
