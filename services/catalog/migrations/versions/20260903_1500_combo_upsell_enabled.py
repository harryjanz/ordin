"""ORD-157: liga/desliga a sugestão automática de upsell por combo, sem
afetar `active` (combo continua vendável mesmo com a sugestão desligada).
`server_default="1"` garante que combos já existentes continuem se
comportando como hoje (sugestão ativa) sem precisar de UPDATE manual.

Revision ID: 20260903_1500
Revises: 20260903_0900
Create Date: 2026-09-03 15:00:00

"""
from alembic import op
import sqlalchemy as sa

revision = "20260903_1500"
down_revision = "20260903_0900"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "combos",
        sa.Column("upsell_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column("combos", "upsell_enabled")
