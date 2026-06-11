"""seed_initial

Revision ID: ccc002
Revises: ccc001
Create Date: 2026-06-11 09:01:00.000000

"""
from alembic import op

revision = "ccc002"
down_revision = "ccc001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Burger House (company_id=1)
    op.execute("""
        INSERT IGNORE INTO categories (id, company_id, name, active) VALUES
        (1, 1, 'Lanches',    1), (2, 1, 'Combos',     1), (3, 1, 'Bebidas',    1),
        (4, 1, 'Sobremesas', 1), (5, 1, 'Extras',     1)
    """)
    op.execute("""
        INSERT IGNORE INTO products
          (id, company_id, category_id, name, description, price, image_url, active) VALUES
        (1,  1, 1, 'X-Burguer',      'Hambúrguer artesanal 180g, queijo, alface, tomate', 18.90, '/img/x-burguer.jpg', 1),
        (2,  1, 1, 'X-Bacon',        'Hambúrguer 180g, bacon crocante, queijo cheddar',   22.90, '/img/x-bacon.jpg',   1),
        (3,  1, 1, 'X-Salada',       'Hambúrguer 150g, salada completa, molho especial',  17.90, '/img/x-salada.jpg',  1),
        (4,  1, 2, 'Combo X-Burguer','X-Burguer + fritas M + refri 350ml',               29.90, '/img/combo1.jpg',    1),
        (5,  1, 2, 'Combo X-Bacon',  'X-Bacon + fritas G + refri 500ml',                  34.90, '/img/combo2.jpg',    1),
        (6,  1, 3, 'Coca-Cola 350ml','Gelada',                                              6.90, '/img/coca.jpg',      1),
        (7,  1, 3, 'Suco de Laranja','Natural 300ml',                                       8.90, '/img/suco.jpg',      1),
        (8,  1, 4, 'Sorvete',        'Casquinha 2 bolas, sabores variados',                 7.90, '/img/sorvete.jpg',   1),
        (9,  1, 5, 'Fritas P',       'Porção pequena batata frita crocante',                8.90, '/img/fritas.jpg',    0)
    """)
    # Pasta & Co (company_id=2)
    op.execute("""
        INSERT IGNORE INTO categories (id, company_id, name, active) VALUES
        (6, 2, 'Massas',     1), (7, 2, 'Pizzas',     1), (8,  2, 'Saladas',    1),
        (9, 2, 'Bebidas',    1), (10,2, 'Sobremesas',  1)
    """)
    op.execute("""
        INSERT IGNORE INTO products
          (id, company_id, category_id, name, description, price, image_url, active) VALUES
        (10, 2,  6, 'Espaguete Carbonara', 'Massa al dente, bacon, ovo, pecorino',        32.90, '/img/carbonara.jpg',  1),
        (11, 2,  6, 'Fettuccine Alfredo',  'Creme de queijo parmesão, manteiga',           29.90, '/img/alfredo.jpg',    1),
        (12, 2,  7, 'Pizza Margherita',    'Molho tomate, mussarela, manjericão (25cm)',   38.90, '/img/margherita.jpg', 1),
        (13, 2,  7, 'Pizza Calabresa',     'Calabresa fatiada, cebola, azeitona (25cm)',   42.90, '/img/calabresa.jpg',  1),
        (14, 2,  8, 'Salada Caesar',       'Alface, croutons, parmesão, molho Caesar',     24.90, '/img/caesar.jpg',     1),
        (15, 2,  9, 'Água mineral 500ml',  'Com ou sem gás',                                4.90, '/img/agua.jpg',       1),
        (16, 2,  9, 'Vinho da casa 150ml', 'Tinto ou branco',                              18.90, '/img/vinho.jpg',      1),
        (17, 2, 10, 'Tiramisu',            'Sobremesa italiana clássica',                  16.90, '/img/tiramisu.jpg',   1)
    """)
    # Sweet Corner (company_id=3)
    op.execute("""
        INSERT IGNORE INTO categories (id, company_id, name, active) VALUES
        (11, 3, 'Açaí',      1), (12, 3, 'Sorvetes',  1), (13, 3, 'Crepes',     1),
        (14, 3, 'Bebidas',   1), (15, 3, 'Combos',    1)
    """)
    op.execute("""
        INSERT IGNORE INTO products
          (id, company_id, category_id, name, description, price, image_url, active) VALUES
        (18, 3, 11, 'Açaí 300ml',     'Com granola e banana',                             14.90, '/img/acai.jpg',        1),
        (19, 3, 11, 'Açaí 500ml',     'Com granola, banana e leite condensado',           22.90, '/img/acai500.jpg',     1),
        (20, 3, 12, 'Casquinha Dupla', '2 bolas sabores variados',                          9.90, '/img/casquinha.jpg',   1),
        (21, 3, 12, 'Sundae',          'Sorvete com calda chocolate ou morango',            12.90, '/img/sundae.jpg',      1),
        (22, 3, 13, 'Crepe Nutella',   'Crepe fino com Nutella e morango',                  18.90, '/img/crepe.jpg',       1),
        (23, 3, 14, 'Smoothie Frutas', 'Vitamina de frutas da estação 400ml',              15.90, '/img/smoothie.jpg',    1),
        (24, 3, 15, 'Combo Açaí',      'Açaí 300ml + casquinha + bebida 350ml',            29.90, '/img/combo-acai.jpg',  1),
        (25, 3, 15, 'Combo Crepe',     'Crepe + smoothie',                                  28.90, '/img/combo-crepe.jpg', 1)
    """)


def downgrade() -> None:
    op.execute("DELETE FROM products   WHERE id <= 25")
    op.execute("DELETE FROM categories WHERE id <= 15")
