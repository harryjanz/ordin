"""dispositivo confiável para duplo fator (ORD-092)

Revision ID: 20260817_1400
Revises: 20260817_1000
Create Date: 2026-08-17 14:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "20260817_1400"
down_revision = "20260817_1000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if "trusted_devices" not in inspector.get_table_names():
        op.create_table(
            "trusted_devices",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("token_hash", sa.String(64), nullable=False),
            sa.Column("device_label", sa.String(200), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True,
                      server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("last_used_at", sa.DateTime(), nullable=True),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("revoked_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("token_hash", name="uq_trusted_devices_token_hash"),
        )
        op.create_index("ix_trusted_devices_user_id", "trusted_devices", ["user_id"])


def downgrade() -> None:
    op.drop_table("trusted_devices")
