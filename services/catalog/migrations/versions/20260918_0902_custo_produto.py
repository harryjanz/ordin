"""ORD-187 (A7): custo de compra do produto (CFOP 5102) — campo manual,
independente de XML, usado pra calcular margem de lucro ao vivo no
frontend. Sempre persiste, mesmo se o CFOP for trocado depois (a exibição
na UI é condicional, o dado no banco não é apagado). Sem backfill.

Revision ID: 20260918_0902
Revises: 20260915_0901
Create Date: 2026-09-18 09:02:00

"""
import sqlalchemy as sa
from alembic import op

revision = "20260918_0902"
down_revision = "20260915_0901"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("products", sa.Column("custo", sa.Numeric(10, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("products", "custo")
