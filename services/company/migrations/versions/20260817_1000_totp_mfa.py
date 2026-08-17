"""duplo fator TOTP: mfa_policy, totp_secret/totp_enabled_at, user_backup_codes (ORD-088)

Revision ID: 20260817_1000
Revises: 20260814_0900
Create Date: 2026-08-17 10:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "20260817_1000"
down_revision = "20260814_0900"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("companies", sa.Column(
        "mfa_policy", sa.String(10), nullable=False, server_default="disabled"))
    op.add_column("users", sa.Column("totp_secret", sa.String(32), nullable=True))
    op.add_column("users", sa.Column("totp_enabled_at", sa.DateTime(), nullable=True))

    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if "user_backup_codes" not in inspector.get_table_names():
        op.create_table(
            "user_backup_codes",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("code_hash", sa.String(64), nullable=False),
            sa.Column("used_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True,
                      server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_user_backup_codes_user_id", "user_backup_codes", ["user_id"])


def downgrade() -> None:
    op.drop_table("user_backup_codes")
    op.drop_column("users", "totp_enabled_at")
    op.drop_column("users", "totp_secret")
    op.drop_column("companies", "mfa_policy")
