"""custo do módulo fiscal na tabela de preços comercial (ORD-174)

fiscal_addon_plans: catálogo de planos de add-on fiscal da plataforma
(nome, preço fixo/mês, preço por nota emitida) — dimensão SEPARADA de
price_tables (que mede transações do totem, não notas fiscais). Sem tabela
de histórico dedicada (volume baixo esperado, decisão deliberada da ORD-174).
company_fiscal_configs ganha fiscal_addon_plan_id (sem ForeignKey real —
mesmo padrão de integridade referencial em nível de aplicação do resto do
company-service) — ativar a emissão (ativo=true) exige esse campo
preenchido, validado no endpoint, não aqui.

Revision ID: 20260917_1400
Revises: 20260916_1200
Create Date: 2026-09-17 14:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "20260917_1400"
down_revision = "20260916_1200"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if "fiscal_addon_plans" not in existing_tables:
        op.create_table(
            "fiscal_addon_plans",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(120), nullable=False),
            sa.Column("monthly_price", sa.Numeric(10, 2), nullable=False),
            sa.Column("price_per_document", sa.Numeric(10, 4), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.PrimaryKeyConstraint("id"),
        )

    existing_columns = [c["name"] for c in inspector.get_columns("company_fiscal_configs")]
    if "fiscal_addon_plan_id" not in existing_columns:
        op.add_column(
            "company_fiscal_configs",
            sa.Column("fiscal_addon_plan_id", sa.Integer(), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("company_fiscal_configs", "fiscal_addon_plan_id")
    op.drop_table("fiscal_addon_plans")
