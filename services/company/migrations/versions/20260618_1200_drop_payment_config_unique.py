"""drop unique constraint on company_payment_configs to allow multiple configs per provider

Revision ID: 20260618_1200
Revises: 20260618_1000
Create Date: 2026-06-18 12:00:00
"""
from alembic import op

revision = "20260618_1200"
down_revision = "20260618_1000"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint("uq_company_provider_env", "company_payment_configs", type_="unique")


def downgrade():
    op.create_unique_constraint(
        "uq_company_provider_env",
        "company_payment_configs",
        ["company_id", "provider", "environment"],
    )
