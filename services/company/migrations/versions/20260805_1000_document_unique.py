"""companies.document UNIQUE (ORD-065)

Revision ID: 20260805_1000
Revises: 20260804_1100
Create Date: 2026-08-05 10:00:00
"""
from alembic import op

revision = "20260805_1000"
down_revision = "20260804_1100"
branch_labels = None
depends_on = None


def upgrade():
    op.create_unique_constraint("uq_companies_document", "companies", ["document"])


def downgrade():
    op.drop_constraint("uq_companies_document", "companies", type_="unique")
