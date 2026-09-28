"""vínculo Company→Partner (ORD-208)

companies ganha referred_by_partner_id (nullable, sem FK real — mesmo padrão
de integridade referencial em nível de aplicação do resto do serviço). Não
precisa de backfill: empresas existentes ficam NULL = "sem parceiro", estado
já válido por design. company_partner_history: log append-only de toda troca
de vínculo (from/to nullable nas duas pontas, "null" representa "sem
parceiro"), filha de companies (sem ForeignKey real).

Revision ID: 20260928_1300
Revises: 20260925_1600
Create Date: 2026-09-28 13:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "20260928_1300"
down_revision = "20260925_1600"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    existing_columns = [c["name"] for c in inspector.get_columns("companies")]
    if "referred_by_partner_id" not in existing_columns:
        op.add_column("companies", sa.Column("referred_by_partner_id", sa.Integer(), nullable=True))
        op.create_index("ix_companies_referred_by_partner_id", "companies", ["referred_by_partner_id"])

    existing_tables = inspector.get_table_names()
    if "company_partner_history" not in existing_tables:
        op.create_table(
            "company_partner_history",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("company_id", sa.Integer(), nullable=False),
            sa.Column("from_partner_id", sa.Integer(), nullable=True),
            sa.Column("to_partner_id", sa.Integer(), nullable=True),
            sa.Column("changed_by_user_id", sa.Integer(), nullable=True),
            sa.Column("note", sa.String(500), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "ix_company_partner_history_company_id",
            "company_partner_history",
            ["company_id"],
        )


def downgrade() -> None:
    op.drop_table("company_partner_history")
    op.drop_index("ix_companies_referred_by_partner_id", table_name="companies")
    op.drop_column("companies", "referred_by_partner_id")
