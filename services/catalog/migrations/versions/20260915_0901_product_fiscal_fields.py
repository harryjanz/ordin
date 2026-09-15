"""ORD-169: classificação fiscal do produto — ncm/cfop/cest, todos opcionais
(produto vende sem, só não pode emitir NFC-e sem — checagem é de outra
história do épico). ncm com FK pra ncm_codes evita dado fiscal inconsistente
desde o cadastro; cfop/cest são texto simples, validados só na aplicação.

Revision ID: 20260915_0901
Revises: 20260915_0900
Create Date: 2026-09-15 09:01:00

"""
import sqlalchemy as sa
from alembic import op

revision = "20260915_0901"
down_revision = "20260915_0900"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("products", sa.Column("ncm", sa.String(8), nullable=True))
    op.add_column("products", sa.Column("cfop", sa.String(4), nullable=True))
    op.add_column("products", sa.Column("cest", sa.String(7), nullable=True))
    op.create_foreign_key(
        "fk_products_ncm", "products", "ncm_codes", ["ncm"], ["codigo"]
    )


def downgrade() -> None:
    op.drop_constraint("fk_products_ncm", "products", type_="foreignkey")
    op.drop_column("products", "cest")
    op.drop_column("products", "cfop")
    op.drop_column("products", "ncm")
