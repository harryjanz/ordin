"""initial_schema

Revision ID: bbb001
Revises:
Create Date: 2026-06-11 09:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "bbb001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    existing = set(sa.inspect(conn).get_table_names())

    if "companies" not in existing:
        op.create_table(
            "companies",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(120), nullable=True),
            sa.Column("document", sa.String(20), nullable=True),
            sa.Column("pin_hash", sa.String(128), nullable=True),
            sa.Column("plan", sa.String(20), nullable=True, server_default=sa.text("'free'")),
            sa.Column("active", sa.Boolean(), nullable=True, server_default=sa.text("1")),
            sa.Column("created_at", sa.DateTime(), nullable=True,
                      server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.PrimaryKeyConstraint("id"),
        )

    if "users" not in existing:
        op.create_table(
            "users",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("company_id", sa.Integer(), nullable=True),
            sa.Column("name", sa.String(80), nullable=True),
            sa.Column("email", sa.String(120), nullable=True),
            sa.Column("password_hash", sa.String(128), nullable=True),
            sa.Column("role", sa.String(20), nullable=True, server_default=sa.text("'cashier'")),
            sa.Column("active", sa.Boolean(), nullable=True, server_default=sa.text("1")),
            sa.Column("created_at", sa.DateTime(), nullable=True,
                      server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.PrimaryKeyConstraint("id"),
        )

    if "terminals" not in existing:
        op.create_table(
            "terminals",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("company_id", sa.Integer(), nullable=True),
            sa.Column("label", sa.String(80), nullable=True),
            sa.Column("terminal_code", sa.String(20), nullable=True),
            sa.Column("tef_number", sa.String(40), nullable=True),
            sa.Column("tef_serial", sa.String(40), nullable=True),
            sa.Column("active", sa.Boolean(), nullable=True, server_default=sa.text("1")),
            sa.Column("created_at", sa.DateTime(), nullable=True,
                      server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.PrimaryKeyConstraint("id"),
        )


def downgrade() -> None:
    op.drop_table("terminals")
    op.drop_table("users")
    op.drop_table("companies")
