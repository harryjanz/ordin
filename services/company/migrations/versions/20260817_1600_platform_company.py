"""empresa interna da plataforma (ORD-093) — is_platform + migração de dado

Revision ID: 20260817_1600
Revises: 20260817_1400
Create Date: 2026-08-17 16:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "20260817_1600"
down_revision = "20260817_1400"
branch_labels = None
depends_on = None

# Hash bcrypt válido de um valor aleatório de alta entropia — nunca bate
# com um PIN real de 4 dígitos, mas evita que validate_pin/verify_pin
# (que rodam bcrypt.checkpw em toda empresa active=True) quebrem com um
# hash vazio/inválido. A empresa interna nunca faz login de totem por PIN;
# isso é só pra não derrubar a validação de PIN de todo mundo por causa dela.
_UNUSABLE_PIN_HASH = "$2b$12$5ngqEUianO9sv.r7p4bM5.wPoLcYcguidFz/F95.6x3Rkm2eMKGLm"


def upgrade() -> None:
    op.add_column("companies", sa.Column(
        "is_platform", sa.Boolean(), nullable=False, server_default=sa.text("0")))

    conn = op.get_bind()

    # Idempotente — não duplica a empresa interna se a migration rodar mais
    # de uma vez em ambientes diferentes.
    existing = conn.execute(sa.text(
        "SELECT id FROM companies WHERE is_platform = 1 LIMIT 1"
    )).first()
    if existing:
        platform_company_id = existing[0]
    else:
        conn.execute(sa.text("""
            INSERT INTO companies (name, document, pin_hash, plan, active, is_platform, state, country, contract_status)
            VALUES ('Ordin — Plataforma', NULL, :pin_hash, 'internal', 1, 1, 'SP', 'Brasil', 'assinado')
        """), {"pin_hash": _UNUSABLE_PIN_HASH})
        platform_company_id = conn.execute(sa.text("SELECT LAST_INSERT_ID()")).scalar()

    # Migra usuários de plataforma já existentes na mesma migration — nunca
    # existe uma janela onde a empresa interna existe mas ninguém aponta
    # pra ela, nem o inverso (achado do Tech Explorer, ver story ORD-093).
    conn.execute(sa.text(
        "UPDATE users SET company_id = :pid WHERE role IN ('superadmin', 'admin')"
    ), {"pid": platform_company_id})


def downgrade() -> None:
    # Não reverte o dado (para onde os usuários de plataforma voltariam?
    # não há um "company_id anterior" único e correto a restaurar) — só
    # remove a coluna. Documentado como decisão consciente (Tech Explorer).
    op.drop_column("companies", "is_platform")
