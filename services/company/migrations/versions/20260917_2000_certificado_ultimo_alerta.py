"""monitoramento de validade do certificado digital (ORD-176)

company_fiscal_configs ganha certificado_ultimo_alerta_dias (int, nullable) —
controle do último marco de alerta já enviado (30/15/7/1, ou 0 = vencido),
evita duplicar e-mail no mesmo marco. Resetado pra NULL sempre que
certificado_valido_ate é reescrito (onboarding/reenvio de cadastro na Focus
NFe, ORD-170) — certificado novo, contagem do zero.

Revision ID: 20260917_2000
Revises: 20260917_1400
Create Date: 2026-09-17 20:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "20260917_2000"
down_revision = "20260917_1400"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_columns = [c["name"] for c in inspector.get_columns("company_fiscal_configs")]
    if "certificado_ultimo_alerta_dias" not in existing_columns:
        op.add_column(
            "company_fiscal_configs",
            sa.Column("certificado_ultimo_alerta_dias", sa.Integer(), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("company_fiscal_configs", "certificado_ultimo_alerta_dias")
