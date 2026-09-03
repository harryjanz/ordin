"""ORD-157 (addendum): granularidade por produto componente — cada item do
combo passa a ter seu próprio toggle de sugestão de upsell, em camada com o
`combos.upsell_enabled` (chave mestra) já existente. `server_default="1"`
garante que itens de combo já existentes continuem disparando sugestão
normalmente, sem UPDATE manual.

Revision ID: 20260903_1600
Revises: 20260903_1500
Create Date: 2026-09-03 16:00:00

"""
from alembic import op
import sqlalchemy as sa

revision = "20260903_1600"
down_revision = "20260903_1500"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "combo_items",
        sa.Column("triggers_upsell", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column("combo_items", "triggers_upsell")
