"""ORD-146: description e sku em options + tabela option_allergens —
mesmo nível de detalhe que Product já tem (ORD-075), pra opção que
representa uma variante física própria (sabor de bebida, sabor de pizza).

Revision ID: 20260902_1200
Revises: 20260902_1100
Create Date: 2026-09-02 12:00:00

"""
from alembic import op
import sqlalchemy as sa

revision = "20260902_1200"
down_revision = "20260902_1100"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("options", sa.Column("description", sa.String(500), nullable=True))
    op.add_column("options", sa.Column("sku", sa.String(50), nullable=True))
    op.create_table(
        "option_allergens",
        sa.Column("option_id", sa.Integer(), sa.ForeignKey("options.id"), primary_key=True),
        sa.Column("allergen_id", sa.Integer(), sa.ForeignKey("allergens.id"), primary_key=True),
    )


def downgrade() -> None:
    op.drop_table("option_allergens")
    op.drop_column("options", "sku")
    op.drop_column("options", "description")
