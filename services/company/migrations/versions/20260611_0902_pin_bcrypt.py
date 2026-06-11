"""pin_bcrypt

Revision ID: bbb003
Revises: bbb002
Create Date: 2026-06-11 09:02:00.000000

Para instalações novas (Alembic desde o início): pin_hash já existe em 001, esta
migration é no-op. Para instalações legadas com pin plaintext: adiciona pin_hash,
migra dados existentes e remove a coluna pin.

"""
from alembic import op
import sqlalchemy as sa
import bcrypt

revision = "bbb003"
down_revision = "bbb002"
branch_labels = None
depends_on = None


def _column_exists(conn, table, column):
    result = conn.execute(sa.text(
        "SELECT COUNT(*) FROM information_schema.columns "
        "WHERE table_schema = DATABASE() AND table_name = :t AND column_name = :c"
    ), {"t": table, "c": column}).scalar()
    return result > 0


def upgrade() -> None:
    conn = op.get_bind()
    if not _column_exists(conn, "companies", "pin"):
        return  # instalação nova: pin_hash já existe desde migration 001

    op.add_column("companies", sa.Column("pin_hash", sa.String(128), nullable=True))
    rows = conn.execute(sa.text("SELECT id, pin FROM companies WHERE pin IS NOT NULL")).fetchall()
    for row in rows:
        h = bcrypt.hashpw(str(row.pin).encode(), bcrypt.gensalt(12)).decode()
        conn.execute(sa.text("UPDATE companies SET pin_hash = :h WHERE id = :id"),
                     {"h": h, "id": row.id})
    op.alter_column("companies", "pin_hash", nullable=False)
    op.drop_column("companies", "pin")


def downgrade() -> None:
    conn = op.get_bind()
    if not _column_exists(conn, "companies", "pin_hash"):
        return
    op.add_column("companies", sa.Column("pin", sa.String(8), nullable=True))
    op.drop_column("companies", "pin_hash")
