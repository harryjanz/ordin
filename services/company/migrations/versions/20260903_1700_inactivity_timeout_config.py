"""Timeout de inatividade do totem configurável por empresa (ORD-158) —
antes era constante fixa em App.tsx (ver ORD-155). inactivity_timeout_min:
minutos sem toque até limpar o carrinho e voltar pra tela de boas-vindas.
inactivity_warn_sec: segundos finais desse período em que o totem mostra o
aviso "Ainda está aí?" (janela dentro do próprio timeout, não tempo extra).
Defaults (5 min / 30s) substituem os 3min/20s fixos do ORD-155.

Revision ID: 20260903_1700
Revises: 20260827_0100
Create Date: 2026-09-03 17:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "20260903_1700"
down_revision = "20260827_0100"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {c["name"] for c in inspector.get_columns("companies")}
    if "inactivity_timeout_min" not in columns:
        op.add_column(
            "companies",
            sa.Column("inactivity_timeout_min", sa.Integer(), nullable=False, server_default="5"),
        )
    if "inactivity_warn_sec" not in columns:
        op.add_column(
            "companies",
            sa.Column("inactivity_warn_sec", sa.Integer(), nullable=False, server_default="30"),
        )


def downgrade() -> None:
    op.drop_column("companies", "inactivity_warn_sec")
    op.drop_column("companies", "inactivity_timeout_min")
