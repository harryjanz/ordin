"""sort_order em categorias, pra refletir ordem de apresentação no totem
(pedido direto do usuário — drag-and-drop de categorias no admin)

Revision ID: 20260824_2200
Revises: 20260824_0930
Create Date: 2026-08-24 22:00:00

"""
from alembic import op
import sqlalchemy as sa

revision = "20260824_2200"
down_revision = "20260824_0930"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("categories", sa.Column("sort_order", sa.Integer(), nullable=True))

    # Backfill: categorias existentes recebem sort_order sequencial por
    # empresa, na ordem atual (por id) — mesmo racional já usado pro
    # sort_order de produtos (20260807_1400_ord075_campos_catalogo.py).
    op.execute("""
        UPDATE categories c
        JOIN (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY id) - 1 AS rn
            FROM categories
            WHERE deleted = 0
        ) ranked ON ranked.id = c.id
        SET c.sort_order = ranked.rn
    """)


def downgrade() -> None:
    op.drop_column("categories", "sort_order")
