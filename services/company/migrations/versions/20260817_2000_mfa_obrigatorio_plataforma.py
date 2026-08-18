"""duplo fator obrigatório e permanente pra empresa da plataforma (ORD-096)

Revision ID: 20260817_2000
Revises: 20260817_1600
Create Date: 2026-08-17 20:00:00
"""
from alembic import op

revision = "20260817_2000"
down_revision = "20260817_1600"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE companies SET mfa_policy = 'required' WHERE is_platform = 1")


def downgrade() -> None:
    # Não reverte pra "disabled" — arriscado demais reintroduzir uma conta
    # de plataforma sem 2FA obrigatório silenciosamente num rollback.
    # Decisão consciente, mesmo padrão de downgrade não-reversível do ORD-093.
    pass
