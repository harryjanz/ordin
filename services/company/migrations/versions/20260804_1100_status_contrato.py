"""add contract_status e campos relacionados a companies (ORD-059)

Revision ID: 20260804_1100
Revises: 20260804_0900
Create Date: 2026-08-04 11:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "20260804_1100"
down_revision = "20260804_0900"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("companies", sa.Column(
        "contract_status", sa.String(20), nullable=False, server_default="pendente"))
    op.add_column("companies", sa.Column("contract_sent_at", sa.DateTime, nullable=True))
    op.add_column("companies", sa.Column("contract_signed_at", sa.DateTime, nullable=True))
    op.add_column("companies", sa.Column("contract_document_url", sa.String(255), nullable=True))


def downgrade():
    op.drop_column("companies", "contract_document_url")
    op.drop_column("companies", "contract_signed_at")
    op.drop_column("companies", "contract_sent_at")
    op.drop_column("companies", "contract_status")
