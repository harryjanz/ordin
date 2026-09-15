"""certificado A1 e CSC da empresa para emissão de NFC-e (ORD-168)

company_fiscal_configs: satélite 1:1 com companies, só certificado (arquivo+senha
criptografados) e CSC de produção/homologação (também criptografados) — razão
social/IE/regime/endereço já existem em Company (legal_name/state_registration/
tax_regime/endereço), não duplicados aqui. Ver docs/stories/ORD-168-*.md.

Revision ID: 20260915_1700
Revises: 20260911_1900
Create Date: 2026-09-15 17:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "20260915_1700"
down_revision = "20260911_1900"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if "company_fiscal_configs" not in inspector.get_table_names():
        op.create_table(
            "company_fiscal_configs",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("company_id", sa.Integer(), nullable=False),
            sa.Column("certificado_arquivo_enc", sa.String(length=8000), nullable=True),
            sa.Column("certificado_senha_enc", sa.String(length=500), nullable=True),
            sa.Column("certificado_nome_arquivo", sa.String(length=255), nullable=True),
            sa.Column("certificado_enviado_em", sa.DateTime(), nullable=True),
            sa.Column("csc_producao_enc", sa.String(length=500), nullable=True),
            sa.Column("id_token_producao", sa.String(length=32), nullable=True),
            sa.Column("csc_homologacao_enc", sa.String(length=500), nullable=True),
            sa.Column("id_token_homologacao", sa.String(length=32), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("company_id", name="uq_company_fiscal_configs_company_id"),
        )
        op.create_index("ix_company_fiscal_configs_company_id", "company_fiscal_configs", ["company_id"])


def downgrade() -> None:
    op.drop_table("company_fiscal_configs")
