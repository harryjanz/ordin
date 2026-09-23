"""ORD-198 (D1): baixa automática de estoque na aprovação do pagamento.

stock_movements ganha order_ref (nullable, String(64)) — idempotência do
decremento por venda, MySQL trata múltiplos NULL como não-colidentes, então
"entrada"/"ajuste" (sempre order_ref=NULL) nunca colidem entre si; só duas
"saida" pro mesmo stock_item_id+order_ref colidiriam. criado_por vira
nullable — "saida" gerada pelo sistema (venda) não tem usuário humano no
JWT (chamada via X-Internal-Secret).

Revision ID: 20260923_0900
Revises: 20260922_1500
Create Date: 2026-09-23 09:00:00

"""
import sqlalchemy as sa
from alembic import op

revision = "20260923_0900"
down_revision = "20260922_1500"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "stock_movements",
        sa.Column("order_ref", sa.String(64), nullable=True),
    )
    op.create_unique_constraint(
        "uq_stock_movement_item_order", "stock_movements", ["stock_item_id", "order_ref"],
    )
    op.alter_column("stock_movements", "criado_por", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    op.alter_column("stock_movements", "criado_por", existing_type=sa.Integer(), nullable=False)
    op.drop_constraint("uq_stock_movement_item_order", "stock_movements", type_="unique")
    op.drop_column("stock_movements", "order_ref")
