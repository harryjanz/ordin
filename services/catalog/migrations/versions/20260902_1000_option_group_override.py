"""ORD-144: min/max_selections_override por vínculo produto-grupo — permite
que o mesmo grupo de opção (ex.: "Sabores") seja vinculado a produtos
diferentes com um limite de seleção diferente por produto (ex.: pizza
Broto até 1 sabor, Big até 4), sem duplicar o grupo.

Revision ID: 20260902_1000
Revises: 20260901_0900
Create Date: 2026-09-02 10:00:00

"""
from alembic import op
import sqlalchemy as sa

revision = "20260902_1000"
down_revision = "20260901_0900"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("product_option_groups", sa.Column("min_selections_override", sa.Integer(), nullable=True))
    op.add_column("product_option_groups", sa.Column("max_selections_override", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("product_option_groups", "max_selections_override")
    op.drop_column("product_option_groups", "min_selections_override")
