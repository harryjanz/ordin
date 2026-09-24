"""ORD-204: fluxo de pendência de cadastro na importação automática de NF.

cadastro_pendente marca fornecedor criado automaticamente via NF (só
nome+cnpj, sem contato) até alguém revisar e salvar pela tela de edição.
NOT NULL com server_default False — fornecedor legado (criado antes desta
história) nunca é "pendente" por definição, mesmo tendo campos vazios.

Revision ID: 20260924_1100
Revises: 20260924_1000
Create Date: 2026-09-24 11:00:00

"""
import sqlalchemy as sa
from alembic import op

revision = "20260924_1100"
down_revision = "20260924_1000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "suppliers",
        sa.Column("cadastro_pendente", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("suppliers", "cadastro_pendente")
