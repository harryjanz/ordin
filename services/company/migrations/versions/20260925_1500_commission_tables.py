"""tabelas de comissão de parceiro (ORD-206)

commission_tables (sem company_id — dado de plataforma, não de tenant):
setup por totem ativado + percentual recorrente mensal, is_default (exatamente
uma por vez, garantido em nível de aplicação — ver set_default_commission_table
em main.py). commission_table_history: log append-only de toda mudança de
valor rastreado (setup_fee_per_totem, recurring_percent, is_default,
vigente_desde), filha de commission_tables (sem ForeignKey real — mesmo
padrão de integridade referencial em nível de aplicação já usado no resto do
company-service, ver company_plan_history).

Revision ID: 20260925_1500
Revises: 20260917_2000
Create Date: 2026-09-25 15:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "20260925_1500"
down_revision = "20260917_2000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if "commission_tables" not in existing_tables:
        op.create_table(
            "commission_tables",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(120), nullable=False),
            sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("setup_fee_per_totem", sa.Numeric(10, 2), nullable=False),
            sa.Column("recurring_percent", sa.Numeric(5, 2), nullable=False),
            sa.Column("note", sa.String(500), nullable=True),
            sa.Column("vigente_desde", sa.DateTime(), nullable=False),
            sa.Column("archived_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("created_by_user_id", sa.Integer(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_commission_tables_is_default", "commission_tables", ["is_default"])

    if "commission_table_history" not in existing_tables:
        op.create_table(
            "commission_table_history",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("commission_table_id", sa.Integer(), nullable=False),
            sa.Column("field_changed", sa.String(30), nullable=False),
            sa.Column("old_value", sa.String(50), nullable=True),
            sa.Column("new_value", sa.String(50), nullable=True),
            sa.Column("changed_by_user_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "ix_commission_table_history_commission_table_id",
            "commission_table_history",
            ["commission_table_id"],
        )


def downgrade() -> None:
    op.drop_table("commission_table_history")
    op.drop_table("commission_tables")
