"""user_invite_tokens (ORD-087)

Revision ID: 20260814_0900
Revises: 20260806_1800
Create Date: 2026-08-14 09:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "20260814_0900"
down_revision = "20260806_1800"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if "user_invite_tokens" not in inspector.get_table_names():
        op.create_table(
            "user_invite_tokens",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("token_hash", sa.String(64), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("used_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True,
                      server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("token_hash", name="uq_user_invite_tokens_token_hash"),
        )
        op.create_index("ix_user_invite_tokens_user_id", "user_invite_tokens", ["user_id"])


def downgrade() -> None:
    op.drop_table("user_invite_tokens")
