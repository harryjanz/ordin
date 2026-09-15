"""ORD-169: tabela de referência global (NÃO por empresa) da NCM oficial —
mesma tabela pra todo mundo, sincronizada mensalmente contra a API pública da
Receita Federal via scripts/sync_ncm.py (rodado manualmente ou por job de
infra, fora do escopo desta migration — ela só cria a tabela vazia).

Revision ID: 20260915_0900
Revises: 20260914_1200
Create Date: 2026-09-15 09:00:00

"""
import sqlalchemy as sa
from alembic import op

revision = "20260915_0900"
down_revision = "20260914_1200"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ncm_codes",
        sa.Column("codigo", sa.String(8), primary_key=True),
        sa.Column("descricao", sa.Text(), nullable=False),
        sa.Column("ato_legal", sa.String(255), nullable=True),
        sa.Column("sincronizado_em", sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("ncm_codes")
