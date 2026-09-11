"""histórico de troca de tabela de preço no plano comercial (ORD-165)

company_plan_history: registro append-only de toda troca de price_table_id de
um CompanyPlan (via renovação ou aplicação direta) — não referencia
CompanyPlan.id de propósito, sobrevive mesmo se o CompanyPlan for recriado.
Alimenta a consulta de histórico por empresa e o critério "tabela já
utilizada nunca mais é editável" (_price_table_ever_linked).
Ver docs/stories/ORD-165-auditoria-guardrails-tabela-preco.md.

Revision ID: 20260911_1900
Revises: 20260911_1000
Create Date: 2026-09-11 19:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "20260911_1900"
down_revision = "20260911_1000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if "company_plan_history" not in inspector.get_table_names():
        op.create_table(
            "company_plan_history",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("company_id", sa.Integer(), nullable=False),
            sa.Column("from_price_table_id", sa.Integer(), nullable=False),
            sa.Column("to_price_table_id", sa.Integer(), nullable=False),
            sa.Column("action", sa.String(length=20), nullable=False),
            sa.Column("actor_user_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_company_plan_history_company_id", "company_plan_history", ["company_id"])
        op.create_index("ix_company_plan_history_from_price_table_id", "company_plan_history", ["from_price_table_id"])
        op.create_index("ix_company_plan_history_to_price_table_id", "company_plan_history", ["to_price_table_id"])


def downgrade() -> None:
    op.drop_table("company_plan_history")
