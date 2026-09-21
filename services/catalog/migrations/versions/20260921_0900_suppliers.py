"""ORD-182 (A6): cadastro de fornecedor — nome, CNPJ (obrigatório, único
por empresa), contato. Escopo estreito, sem FK de ninguém ainda (B1/C1
vêm depois).

Revision ID: 20260921_0900
Revises: 20260918_0905
Create Date: 2026-09-21 09:00:00

"""
import sqlalchemy as sa
from alembic import op

revision = "20260921_0900"
down_revision = "20260918_0905"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "suppliers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("nome", sa.String(120), nullable=False),
        sa.Column("cnpj", sa.String(14), nullable=False),
        sa.Column("telefone", sa.String(20), nullable=True),
        sa.Column("email", sa.String(120), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("company_id", "cnpj", name="uq_suppliers_company_cnpj"),
    )
    op.create_index("ix_suppliers_company_id", "suppliers", ["company_id"])


def downgrade() -> None:
    op.drop_index("ix_suppliers_company_id", table_name="suppliers")
    op.drop_table("suppliers")
