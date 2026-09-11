"""plano comercial da empresa, vinculado à tabela de preço vigente (ORD-163)

company_plans: 1 por empresa (company_id UNIQUE), criado automaticamente na
criação da empresa, vinculado à price_table "active" no momento. Renovação é
UPDATE in-place (sobrescreve price_table_id/renewed_at/expires_at), sem
histórico de renovações anteriores — decisão consciente de escopo, ver
docs/stories/ORD-163-contrato-empresa-tabela-vigente.md. Nome "Plan", não
"Contract" — já existe contrato jurídico (CompanyContractScreen /
infrastructure/contract_storage), entidade diferente.

Revision ID: 20260911_0100
Revises: 20260910_2200
Create Date: 2026-09-11 01:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "20260911_0100"
down_revision = "20260910_2200"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if "company_plans" not in inspector.get_table_names():
        op.create_table(
            "company_plans",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("company_id", sa.Integer(), nullable=False),
            sa.Column("price_table_id", sa.Integer(), nullable=False),
            sa.Column("started_at", sa.DateTime(), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("renewed_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("company_id", name="uq_company_plans_company_id"),
        )
        op.create_index("ix_company_plans_price_table_id", "company_plans", ["price_table_id"])


def downgrade() -> None:
    op.drop_table("company_plans")
