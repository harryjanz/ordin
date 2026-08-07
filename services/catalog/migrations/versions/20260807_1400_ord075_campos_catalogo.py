"""ORD-075: campos adicionais de produto (alérgenos, calorias, SKU, tags,
descrição longa, sort_order)

Revision ID: 20260807_1400
Revises: 20260807_1000
Create Date: 2026-08-07 14:00:00

"""
from alembic import op
import sqlalchemy as sa

revision = "20260807_1400"
down_revision = "20260807_1000"
branch_labels = None
depends_on = None

# Lista oficial de declaração obrigatória: RDC nº 727/2022 (consolida a
# antiga RDC 26/2015, sem mudança de mérito) + Lei nº 10.674/2003 (glúten) +
# Lei nº 12.849/2013 (látex natural). Base: Codex Alimentarius, adotada pela
# ANVISA. Fica como dado seedado (não enum de código) porque a norma está em
# revisão (consulta setorial 2025, sobretudo sobre oleaginosas).
_ALLERGENS = [
    ("trigo", "Trigo", None),
    ("centeio", "Centeio", None),
    ("cevada", "Cevada", None),
    ("aveia", "Aveia e estirpes hibridizadas", None),
    ("crustaceos", "Crustáceos", None),
    ("ovos", "Ovos", None),
    ("peixes", "Peixes", None),
    ("amendoim", "Amendoim", None),
    ("soja", "Soja", None),
    ("leite", "Leite de todos os mamíferos", None),
    ("amendoa", "Amêndoa", "oleaginosas"),
    ("avela", "Avelã", "oleaginosas"),
    ("castanha_caju", "Castanha de caju", "oleaginosas"),
    ("castanha_para", "Castanha-do-pará", "oleaginosas"),
    ("macadamia", "Macadâmia", "oleaginosas"),
    ("noz_pecan", "Noz-pecã", "oleaginosas"),
    ("pistache", "Pistache", "oleaginosas"),
    ("nozes", "Nozes", "oleaginosas"),
    ("latex_natural", "Látex natural", None),
]


def upgrade() -> None:
    op.add_column("products", sa.Column("description_long", sa.Text(), nullable=True))
    op.add_column("products", sa.Column("tags", sa.JSON(), nullable=True))
    op.add_column("products", sa.Column("calories", sa.Integer(), nullable=True))
    op.add_column("products", sa.Column("sku", sa.String(50), nullable=True))
    op.add_column("products", sa.Column("sort_order", sa.Integer(), nullable=True))
    op.create_unique_constraint("uq_products_company_sku", "products", ["company_id", "sku"])

    op.create_table(
        "allergens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(50), nullable=False, unique=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("category", sa.String(50), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_table(
        "product_allergens",
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), primary_key=True),
        sa.Column("allergen_id", sa.Integer(), sa.ForeignKey("allergens.id"), primary_key=True),
    )

    # Backfill: produtos existentes recebem sort_order sequencial dentro da
    # própria categoria, na ordem atual (por id) — evita listagem embaralhada
    # no primeiro deploy. Produtos sem categoria ficam com sort_order nulo
    # (não há escopo de reordenação sem categoria).
    op.execute("""
        UPDATE products p
        JOIN (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY category_id ORDER BY id) - 1 AS rn
            FROM products
            WHERE category_id IS NOT NULL AND deleted = 0
        ) ranked ON ranked.id = p.id
        SET p.sort_order = ranked.rn
    """)

    conn = op.get_bind()
    conn.execute(
        sa.text("INSERT INTO allergens (code, name, category, active) VALUES (:code, :name, :category, 1)"),
        [{"code": code, "name": name, "category": category} for code, name, category in _ALLERGENS],
    )


def downgrade() -> None:
    op.drop_table("product_allergens")
    op.drop_table("allergens")
    op.drop_constraint("uq_products_company_sku", "products", type_="unique")
    op.drop_column("products", "sort_order")
    op.drop_column("products", "sku")
    op.drop_column("products", "calories")
    op.drop_column("products", "tags")
    op.drop_column("products", "description_long")
