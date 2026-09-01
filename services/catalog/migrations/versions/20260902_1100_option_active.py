"""ORD-145: active em options — permite marcar uma opção específica como
indisponível temporariamente (estoque/produção) sem excluí-la nem mexer
no grupo ou no produto inteiro.

Revision ID: 20260902_1100
Revises: 20260902_1000
Create Date: 2026-09-02 11:00:00

"""
from alembic import op
import sqlalchemy as sa

revision = "20260902_1100"
down_revision = "20260902_1000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("options", sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()))


def downgrade() -> None:
    op.drop_column("options", "active")
