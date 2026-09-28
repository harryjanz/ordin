"""cadastro de parceiro comercial (ORD-207)

partners (sem company_id — dado de plataforma, não de tenant): PF/PJ, documento
único, vínculo a uma commission_tables (ORD-206) via commission_table_id (sem
ForeignKey real, mesmo padrão de integridade referencial em nível de aplicação
já usado no resto do company-service). partner_commission_history: log
append-only de toda TROCA de tabela de comissão vinculada a um parceiro
(from/to), filha de partners (sem ForeignKey real).

Revision ID: 20260925_1600
Revises: 20260925_1500
Create Date: 2026-09-25 16:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "20260925_1600"
down_revision = "20260925_1500"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if "partners" not in existing_tables:
        op.create_table(
            "partners",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(120), nullable=False),
            sa.Column("partner_type", sa.String(2), nullable=False),
            sa.Column("document", sa.String(20), nullable=False),
            sa.Column("email", sa.String(255), nullable=False),
            sa.Column("phone", sa.String(20), nullable=False),
            sa.Column("acceptance_reference", sa.String(500), nullable=False),
            sa.Column("commission_table_id", sa.Integer(), nullable=False),
            sa.Column("accepted_term_version", sa.String(10), nullable=False),
            sa.Column("accepted_at", sa.DateTime(), nullable=False),
            sa.Column("registered_by_user_id", sa.Integer(), nullable=True),
            sa.Column("deactivated_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("document", name="uq_partners_document"),
        )
        op.create_index("ix_partners_commission_table_id", "partners", ["commission_table_id"])

    if "partner_commission_history" not in existing_tables:
        op.create_table(
            "partner_commission_history",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("partner_id", sa.Integer(), nullable=False),
            sa.Column("from_commission_table_id", sa.Integer(), nullable=False),
            sa.Column("to_commission_table_id", sa.Integer(), nullable=False),
            sa.Column("changed_by_user_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "ix_partner_commission_history_partner_id",
            "partner_commission_history",
            ["partner_id"],
        )


def downgrade() -> None:
    op.drop_table("partner_commission_history")
    op.drop_table("partners")
