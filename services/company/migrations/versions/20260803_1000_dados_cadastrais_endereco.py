"""add dados cadastrais e endereco to companies (ORD-056)

Revision ID: 20260803_1000
Revises: 20260618_1200
Create Date: 2026-08-03 10:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "20260803_1000"
down_revision = "20260618_1200"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("companies", sa.Column("legal_name", sa.String(160), nullable=True))
    op.add_column("companies", sa.Column("state_registration", sa.String(20), nullable=True))
    op.add_column("companies", sa.Column("municipal_registration", sa.String(20), nullable=True))
    op.add_column("companies", sa.Column("tax_regime", sa.String(20), nullable=True))
    op.add_column("companies", sa.Column("company_size", sa.String(10), nullable=True))
    op.add_column("companies", sa.Column("cnae_code", sa.String(10), nullable=True))
    op.add_column("companies", sa.Column("cadastral_status", sa.String(20), nullable=True))
    op.add_column("companies", sa.Column("zip_code", sa.String(9), nullable=True))
    op.add_column("companies", sa.Column("street", sa.String(160), nullable=True))
    op.add_column("companies", sa.Column("address_number", sa.String(20), nullable=True))
    op.add_column("companies", sa.Column("complement", sa.String(80), nullable=True))
    op.add_column("companies", sa.Column("neighborhood", sa.String(80), nullable=True))
    op.add_column("companies", sa.Column("city", sa.String(80), nullable=True))
    op.add_column("companies", sa.Column("state", sa.String(2), nullable=True))
    op.add_column("companies", sa.Column("country", sa.String(60), nullable=True, server_default="Brasil"))


def downgrade():
    op.drop_column("companies", "country")
    op.drop_column("companies", "state")
    op.drop_column("companies", "city")
    op.drop_column("companies", "neighborhood")
    op.drop_column("companies", "complement")
    op.drop_column("companies", "address_number")
    op.drop_column("companies", "street")
    op.drop_column("companies", "zip_code")
    op.drop_column("companies", "cadastral_status")
    op.drop_column("companies", "cnae_code")
    op.drop_column("companies", "company_size")
    op.drop_column("companies", "tax_regime")
    op.drop_column("companies", "municipal_registration")
    op.drop_column("companies", "state_registration")
    op.drop_column("companies", "legal_name")
