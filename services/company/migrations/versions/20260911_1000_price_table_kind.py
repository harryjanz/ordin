"""kind (alternativa/promocional) em price_tables (ORD-164)

Campo independente do status (draft/active/historical) — qualquer tabela já
ativada (active ou historical) pode receber kind, marcando-a como disponível
para uso manual em contratos específicos, sem afetar qual tabela é a vigente
padrão. Ver docs/stories/ORD-164-tabelas-preco-alternativas.md.

Revision ID: 20260911_1000
Revises: 20260911_0100
Create Date: 2026-09-11 10:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "20260911_1000"
down_revision = "20260911_0100"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    columns = {c["name"] for c in inspector.get_columns("price_tables")}
    if "kind" not in columns:
        op.add_column("price_tables", sa.Column("kind", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("price_tables", "kind")
