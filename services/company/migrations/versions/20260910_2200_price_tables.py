"""tabelas de preço comercial da plataforma, versionadas (ORD-162)

price_tables (sem company_id — dado de plataforma, não de tenant): status
draft/active/historical, preço do 1º totem + multiplicadores de totens
adicionais. price_table_transaction_tiers: faixas de taxa transacional por
volume mensal, filha de price_tables (sem ForeignKey real — mesmo padrão de
integridade referencial em nível de aplicação já usado no resto do
company-service).

Revision ID: 20260910_2200
Revises: 20260903_1700
Create Date: 2026-09-10 22:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "20260910_2200"
down_revision = "20260903_1700"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if "price_tables" not in existing_tables:
        op.create_table(
            "price_tables",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(120), nullable=False),
            sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
            sa.Column("totem_price_1", sa.Numeric(10, 2), nullable=False),
            sa.Column("totem_multiplier_2", sa.Numeric(4, 2), nullable=False),
            sa.Column("totem_multiplier_3_5", sa.Numeric(4, 2), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("activated_at", sa.DateTime(), nullable=True),
            sa.Column("archived_at", sa.DateTime(), nullable=True),
            sa.Column("created_by_user_id", sa.Integer(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_price_tables_status", "price_tables", ["status"])

    if "price_table_transaction_tiers" not in existing_tables:
        op.create_table(
            "price_table_transaction_tiers",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("price_table_id", sa.Integer(), nullable=False),
            sa.Column("min_transactions", sa.Integer(), nullable=False),
            sa.Column("max_transactions", sa.Integer(), nullable=True),
            sa.Column("price_per_transaction", sa.Numeric(6, 4), nullable=False),
            sa.Column("sort_order", sa.Integer(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("price_table_id", "sort_order", name="uq_price_table_tier_sort"),
        )
        op.create_index(
            "ix_price_table_transaction_tiers_price_table_id",
            "price_table_transaction_tiers",
            ["price_table_id"],
        )


def downgrade() -> None:
    op.drop_table("price_table_transaction_tiers")
    op.drop_table("price_tables")
