"""clear_local_contract_paths

Revision ID: 20260806_1800
Revises: 20260806_1400
Create Date: 2026-08-06 18:00:00.000000

contract_document_url guardava um path de filesystem local
(/app/uploads/contracts/...) — nunca foi persistente (sem volume Docker) e o
arquivo já não existe mais em nenhum ambiente de dev. A partir desta migration
o campo passa a guardar a key de um objeto S3/MinIO (ex: "contracts/1/x.pdf");
qualquer valor antigo com "/" no início é lixo órfão, apontando pra um arquivo
que não existe — limpo aqui pra não exibir um "contrato assinado" que na
verdade não pode mais ser baixado.
"""
from alembic import op

revision = "20260806_1800"
down_revision = "20260806_1400"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        UPDATE companies
        SET contract_document_url = NULL
        WHERE contract_document_url LIKE '/%'
    """)


def downgrade() -> None:
    pass
