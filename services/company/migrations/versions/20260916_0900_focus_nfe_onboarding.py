"""onboarding da empresa na Focus NFe (ORD-170)

Colunas novas em company_fiscal_configs (mesma tabela da ORD-168): id/client_app_id
e tokens de produção/homologação retornados pelo POST /empresas da Focus NFe
(tokens sempre criptografados), data do cadastro, e validade do certificado
(vem pronta na resposta — extraída do X.509 pela própria Focus NFe, pré-requisito
de dado da ORD-176).

Revision ID: 20260916_0900
Revises: 20260915_1700
Create Date: 2026-09-16 09:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "20260916_0900"
down_revision = "20260915_1700"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("company_fiscal_configs", sa.Column("focus_nfe_empresa_id", sa.Integer(), nullable=True))
    op.add_column("company_fiscal_configs", sa.Column("focus_nfe_client_app_id", sa.Integer(), nullable=True))
    op.add_column("company_fiscal_configs", sa.Column("token_producao_enc", sa.String(length=512), nullable=True))
    op.add_column("company_fiscal_configs", sa.Column("token_homologacao_enc", sa.String(length=512), nullable=True))
    op.add_column("company_fiscal_configs", sa.Column("focus_nfe_cadastrado_em", sa.DateTime(), nullable=True))
    op.add_column("company_fiscal_configs", sa.Column("certificado_valido_de", sa.DateTime(), nullable=True))
    op.add_column("company_fiscal_configs", sa.Column("certificado_valido_ate", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("company_fiscal_configs", "certificado_valido_ate")
    op.drop_column("company_fiscal_configs", "certificado_valido_de")
    op.drop_column("company_fiscal_configs", "focus_nfe_cadastrado_em")
    op.drop_column("company_fiscal_configs", "token_homologacao_enc")
    op.drop_column("company_fiscal_configs", "token_producao_enc")
    op.drop_column("company_fiscal_configs", "focus_nfe_client_app_id")
    op.drop_column("company_fiscal_configs", "focus_nfe_empresa_id")
