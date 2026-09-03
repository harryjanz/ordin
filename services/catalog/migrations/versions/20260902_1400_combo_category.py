"""ORD-112: category_id em combos — correção pós-implementação. Vincular o
combo a uma categoria existente estava planejado desde o início e tinha sido
cortado por engano na Tech Explorer original (confundido com um campo
cosmético do protótipo).

Revision ID: 20260902_1400
Revises: 20260902_1300
Create Date: 2026-09-02 14:00:00

"""
from alembic import op
import sqlalchemy as sa

revision = "20260902_1400"
down_revision = "20260902_1300"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("combos", sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=True))


def downgrade() -> None:
    op.drop_column("combos", "category_id")
