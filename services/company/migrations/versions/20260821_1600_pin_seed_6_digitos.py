"""fix: PINs da seed dev viram 6 dígitos (ORD-109)

A tela de PIN do totem estava travada em 4 dígitos, mas create_company e
regenerate_pin sempre geraram PIN de 6 (secrets.randbelow(900000) + 100000,
já coberto por teste — len(pin) == 6). O fix real é na UI do totem
(SetupScreen.tsx); esta migration só realinha os PINs de 4 dígitos gravados
direto no seed inicial (bbb002, anterior à existência de regenerate-pin),
que ficariam inutilizáveis numa instalação nova depois do fix da UI.

Revision ID: 20260821_1600
Revises: 20260821_1500
Create Date: 2026-08-21 16:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "20260821_1600"
down_revision = "20260821_1500"
branch_labels = None
depends_on = None

# PINs (dev/local apenas): Burger House=184623, Pasta & Co=507219,
# Sweet Corner=936845 (bcrypt rounds=12) — mesmo padrão do comentário
# original em bbb002 (seed_initial), que documentava os PINs de 4 dígitos.
_PINS = {
    1: "$2b$12$2YEsy90zuhoXLBajocP//u6TYgON4sWuIwO6L3oTzUX2aVJOq/g8O",
    2: "$2b$12$C0UwrdWzcGNhG6d8G0OmH.XJ4hYKthKOAmU9FfFfaEZmiPNNvM.bK",
    3: "$2b$12$Uf1Id/XOQTihpmujPcHxZOHCOR7S1rT2swjVRFba1TYtmov8M0v9.",
}


def upgrade() -> None:
    conn = op.get_bind()
    for company_id, pin_hash in _PINS.items():
        conn.execute(
            sa.text("UPDATE companies SET pin_hash = :pin_hash WHERE id = :id"),
            {"pin_hash": pin_hash, "id": company_id},
        )


def downgrade() -> None:
    # Não reverte pros PINs de 4 dígitos antigos — com o fix da UI do totem
    # aplicado (ORD-109), esses PINs voltariam a ficar inutilizáveis. Rodar
    # regenerate-pin manualmente se precisar de um PIN novo pós-downgrade.
    pass
