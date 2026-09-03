"""expand_city_uf_enum

Revision ID: 20260806_1400
Revises: 20260806_1300
Create Date: 2026-08-06 14:00:00.000000

city: VARCHAR(80) -> VARCHAR(255) (havia nomes de cidade maiores que o limite antigo).
state: VARCHAR(2) -> ENUM das 27 UFs, NOT NULL. As 3 empresas seed não tinham
endereço cadastrado (state NULL) — backfill para 'SP' (dado fictício de demo)
antes de aplicar a constraint, senão o ALTER falha com NULL existente.
"""
import sqlalchemy as sa
from alembic import op

revision = "20260806_1400"
down_revision = "20260806_1300"
branch_labels = None
depends_on = None

_UF_VALUES = (
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO",
    "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI",
    "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
)


def upgrade() -> None:
    op.alter_column(
        "companies", "city",
        existing_type=sa.String(80),
        type_=sa.String(255),
        existing_nullable=True,
    )
    op.execute("UPDATE companies SET state = 'SP' WHERE state IS NULL")
    op.alter_column(
        "companies", "state",
        existing_type=sa.String(2),
        type_=sa.Enum(*_UF_VALUES, name="uf_enum"),
        nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "companies", "state",
        existing_type=sa.Enum(*_UF_VALUES, name="uf_enum"),
        type_=sa.String(2),
        nullable=True,
    )
    op.alter_column(
        "companies", "city",
        existing_type=sa.String(255),
        type_=sa.String(80),
        existing_nullable=True,
    )
