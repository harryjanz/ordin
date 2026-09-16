"""cadastro manual de tokens já existentes na Focus NFe (ORD-178)

company_fiscal_configs ganha focus_nfe_cadastro_manual (bool, default false) —
distingue tokens colados manualmente (empresa já existia na Focus NFe) dos
gerados via POST /empresas (ORD-170).

Revision ID: 20260916_1200
Revises: 20260916_1000
Create Date: 2026-09-16 12:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "20260916_1200"
down_revision = "20260916_1000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "company_fiscal_configs",
        sa.Column("focus_nfe_cadastro_manual", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("company_fiscal_configs", "focus_nfe_cadastro_manual")
