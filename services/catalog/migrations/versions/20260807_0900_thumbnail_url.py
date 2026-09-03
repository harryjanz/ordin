"""add thumbnail_url a products (upload de imagem de produto)

Revision ID: 20260807_0900
Revises: ccc002
Create Date: 2026-08-07 09:00:00

"""
import sqlalchemy as sa
from alembic import op

revision = "20260807_0900"
down_revision = "ccc002"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("products", sa.Column("thumbnail_url", sa.String(500), nullable=True))


def downgrade():
    op.drop_column("products", "thumbnail_url")
