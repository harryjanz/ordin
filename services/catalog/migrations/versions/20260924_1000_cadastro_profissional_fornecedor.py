"""ORD-202: cadastro profissional de fornecedor.

Supplier ganha dados cadastrais (razão social, nome fantasia, inscrições),
endereço completo e situação cadastral — tudo nullable, migration aditiva
sobre tabela já em produção desde ORD-182, sem backfill. Duas tabelas novas,
1:1 com Supplier (supplier_id único): supplier_contacts (contato comercial,
sempre obrigatório na aplicação, texto plano) e
supplier_legal_representatives (responsável legal, opcional na aplicação,
dados sensíveis criptografados — cpf_enc nullable, diverge de propósito do
padrão de company_legal_representatives, onde CPF é obrigatório).

Revision ID: 20260924_1000
Revises: 20260923_0900
Create Date: 2026-09-24 10:00:00

"""
import sqlalchemy as sa
from alembic import op

revision = "20260924_1000"
down_revision = "20260923_0900"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("suppliers", sa.Column("razao_social", sa.String(150), nullable=True))
    op.add_column("suppliers", sa.Column("nome_fantasia", sa.String(150), nullable=True))
    op.add_column("suppliers", sa.Column("inscricao_estadual", sa.String(20), nullable=True))
    op.add_column("suppliers", sa.Column("inscricao_municipal", sa.String(20), nullable=True))
    op.add_column("suppliers", sa.Column("cadastral_status", sa.String(20), nullable=True))
    op.add_column("suppliers", sa.Column("zip_code", sa.String(9), nullable=True))
    op.add_column("suppliers", sa.Column("street", sa.String(150), nullable=True))
    op.add_column("suppliers", sa.Column("address_number", sa.String(20), nullable=True))
    op.add_column("suppliers", sa.Column("complement", sa.String(100), nullable=True))
    op.add_column("suppliers", sa.Column("neighborhood", sa.String(100), nullable=True))
    op.add_column("suppliers", sa.Column("city", sa.String(100), nullable=True))
    op.add_column("suppliers", sa.Column("state", sa.String(2), nullable=True))

    # ondelete="CASCADE" — Supplier/SupplierContact/SupplierLegalRepresentative
    # são 1:1 sem relationship() do SQLAlchemy configurada (mesmo estilo do
    # resto deste arquivo, sem ORM relationships); sem CASCADE no banco,
    # excluir um Supplier com filhos falha com IntegrityError, porque o
    # unit-of-work não tem grafo de dependência pra ordenar os DELETEs
    # corretamente (achado ao vivo contra o MySQL real, não pego pela
    # suíte SQLite dos testes).
    op.create_table(
        "supplier_contacts",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("supplier_id", sa.Integer, sa.ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("company_id", sa.Integer, nullable=False, index=True),
        sa.Column("nome", sa.String(120), nullable=False),
        sa.Column("telefone", sa.String(20), nullable=False),
        sa.Column("email", sa.String(120), nullable=False),
    )
    op.create_table(
        "supplier_legal_representatives",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("supplier_id", sa.Integer, sa.ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("company_id", sa.Integer, nullable=False, index=True),
        sa.Column("name_enc", sa.String(500), nullable=False),
        sa.Column("cpf_enc", sa.String(500), nullable=True),
        sa.Column("phone_enc", sa.String(500), nullable=False),
        sa.Column("email_enc", sa.String(500), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("supplier_legal_representatives")
    op.drop_table("supplier_contacts")
    for col in ("razao_social", "nome_fantasia", "inscricao_estadual", "inscricao_municipal",
                "cadastral_status", "zip_code", "street", "address_number", "complement",
                "neighborhood", "city", "state"):
        op.drop_column("suppliers", col)
