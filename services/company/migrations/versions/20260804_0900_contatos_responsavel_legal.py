"""add company_contacts e company_legal_representatives (ORD-058)

Revision ID: 20260804_0900
Revises: 20260803_1000
Create Date: 2026-08-04 09:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "20260804_0900"
down_revision = "20260803_1000"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "company_contacts",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("company_id", sa.Integer, nullable=False),
        sa.Column("contact_type", sa.String(20), nullable=False),
        sa.Column("name_enc", sa.String(500), nullable=False),
        sa.Column("role_title", sa.String(80), nullable=True),
        sa.Column("email_enc", sa.String(500), nullable=False),
        sa.Column("phone_enc", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_company_contacts_company_id", "company_contacts", ["company_id"])

    op.create_table(
        "company_legal_representatives",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("company_id", sa.Integer, nullable=False, unique=True),
        sa.Column("name_enc", sa.String(500), nullable=False),
        sa.Column("cpf_enc", sa.String(500), nullable=False),
        sa.Column("role_title", sa.String(80), nullable=True),
        sa.Column("email_enc", sa.String(500), nullable=False),
        sa.Column("phone_enc", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )


def downgrade():
    op.drop_table("company_legal_representatives")
    op.drop_index("ix_company_contacts_company_id", table_name="company_contacts")
    op.drop_table("company_contacts")
