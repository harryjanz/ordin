"""Corrige cadastro_pendente para fornecedor legado sem contato.

Achado ao vivo (2026-09-25): a migration 20260924_1100 assumiu que todo
fornecedor legado (criado antes de cadastro_pendente existir) nunca deveria
ser "pendente", mesmo com campos opcionais vazios — regra correta pra
endereço/razão social, mas não pra contato, que já é obrigatório em toda
tela de cadastro (ORD-202) desde antes dessa migration. Com o back-fill
padrão False, fornecedor sem NENHUM contato ficava marcado "Cadastro
completo" na listagem (coluna nova do ORD-205) — o oposto do que a tag
deveria mostrar.

Backfill único: marca cadastro_pendente=True pra todo fornecedor que não
tem linha em supplier_contacts. Dali em diante, o fluxo normal já cobre —
salvar pela tela de edição (PUT, exige contato) zera a pendência de novo.

Revision ID: 20260925_0900
Revises: 20260924_1100
Create Date: 2026-09-25 09:00:00

"""
import sqlalchemy as sa
from alembic import op

revision = "20260925_0900"
down_revision = "20260924_1100"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE suppliers
        SET cadastro_pendente = TRUE
        WHERE id NOT IN (SELECT supplier_id FROM supplier_contacts)
        """
    )


def downgrade() -> None:
    # Backfill de dado não é reversível com segurança (não dá pra saber quais
    # linhas foram tocadas por este UPDATE vs já eram True por outro motivo)
    # — mesmo padrão já aceito em outras migrations de dado deste serviço.
    pass
