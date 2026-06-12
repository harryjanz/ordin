"""payment_config

Revision ID: bbb004
Revises: bbb003
Create Date: 2026-06-11 10:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "bbb004"
down_revision = "bbb003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = set(inspector.get_table_names())

    # nova coluna em companies
    companies_cols = {c["name"] for c in inspector.get_columns("companies")}
    if "payment_provider" not in companies_cols:
        op.add_column("companies", sa.Column("payment_provider", sa.String(20), server_default="mock"))

    # novas colunas em terminals
    terminal_cols = {c["name"] for c in inspector.get_columns("terminals")}
    if "paygo_terminal_id" not in terminal_cols:
        op.add_column("terminals", sa.Column("paygo_terminal_id", sa.String(40), nullable=True))
    if "environment" not in terminal_cols:
        op.add_column("terminals", sa.Column("environment", sa.String(10), server_default="sandbox"))

    # nova tabela company_payment_configs
    if "company_payment_configs" not in existing_tables:
        op.create_table(
            "company_payment_configs",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("company_id", sa.Integer(), nullable=False),
            sa.Column("provider", sa.String(20), nullable=False),
            sa.Column("environment", sa.String(10), nullable=False),
            sa.Column("api_key", sa.String(500), nullable=True),
            sa.Column("api_secret", sa.String(500), nullable=True),
            sa.Column("extra_config", sa.JSON(), nullable=True),
            sa.Column("active", sa.Boolean(), nullable=True, server_default=sa.text("1")),
            sa.Column("created_at", sa.DateTime(), nullable=True,
                      server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("company_id", "provider", "environment",
                                name="uq_company_provider_env"),
        )
        op.create_index("ix_company_payment_configs_company_id",
                        "company_payment_configs", ["company_id"])


def downgrade() -> None:
    op.drop_table("company_payment_configs")
    op.drop_column("terminals", "environment")
    op.drop_column("terminals", "paygo_terminal_id")
    op.drop_column("companies", "payment_provider")
