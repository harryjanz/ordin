"""ORD-153: imagem do combo (image_url/thumbnail_url) — combo não tinha
imagem própria (decisão deliberada do Explorer original do ORD-112), mas na
prática, ao lado de produtos com foto, ficou visualmente ruim no totem.

Revision ID: 20260903_0900
Revises: 20260902_1400
Create Date: 2026-09-03 09:00:00

"""
from alembic import op
import sqlalchemy as sa

revision = "20260903_0900"
down_revision = "20260902_1400"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("combos", sa.Column("image_url", sa.String(255), nullable=True))
    op.add_column("combos", sa.Column("thumbnail_url", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("combos", "thumbnail_url")
    op.drop_column("combos", "image_url")
