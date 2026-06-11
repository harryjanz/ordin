"""seed_initial

Revision ID: bbb002
Revises: bbb001
Create Date: 2026-06-11 09:01:00.000000

"""
from alembic import op

revision = "bbb002"
down_revision = "bbb001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PINs: Burger House=1234, Pasta & Co=5678, Sweet Corner=9999 (bcrypt rounds=12)
    op.execute("""
        INSERT IGNORE INTO companies (id, name, document, pin_hash, plan, active) VALUES
        (1, 'Burger House',  '12.345.678/0001-99',
         '$2b$12$P36sH8rfVxTfCf9MNrD/IOakrEdGWON.OfkXFEnaej.7c4xQmQxia', 'pro',     1),
        (2, 'Pasta & Co',    '98.765.432/0001-11',
         '$2b$12$GmaN8ep8RD66P99QDoZprOuXNPMXUibxKdngFpeXBIMgDq7/5U0bG',  'starter', 1),
        (3, 'Sweet Corner',  '11.222.333/0001-44',
         '$2b$12$JDi/WkNftympM5hSFAj19e4XXmekiVtogwwI7huBUNZsJyn.6SJ2O',  'free',    1)
    """)
    op.execute("""
        INSERT IGNORE INTO terminals (id, company_id, label, terminal_code, tef_number, tef_serial, active) VALUES
        (1, 1, 'Totem 1 - Entrada', 'T01', 'TEF-001-A', 'SN123456', 1),
        (2, 1, 'Totem 2 - Caixa',   'T02', 'TEF-001-B', 'SN123457', 1),
        (3, 2, 'Totem 1 - Salão',   'T01', 'TEF-002-A', 'SN789012', 1)
    """)
    # Senhas: admin@ordin.app=admin123 | demais=burger123 (bcrypt rounds=12)
    op.execute("""
        INSERT IGNORE INTO users (id, company_id, name, email, password_hash, role, active) VALUES
        (1, 1, 'Admin Ordin',     'admin@ordin.app',
         '$2b$12$vZCr38rdlPgWXSsZWcdAtuPZW0RHZ4d1QWWyJNyHXSeo9jaq5m1dy', 'superadmin', 1),
        (2, 1, 'Carlos Oliveira', 'carlos@burgerhouse.com',
         '$2b$12$9BlDlQZTxG7Nlemzdqt0SOmP0OIC0BMfNUwyOFNuF9UO5xg3LgV8e', 'owner',      1),
        (3, 1, 'Ana Souza',       'ana@burgerhouse.com',
         '$2b$12$9BlDlQZTxG7Nlemzdqt0SOmP0OIC0BMfNUwyOFNuF9UO5xg3LgV8e', 'manager',    1),
        (4, 1, 'João Caixa',      'joao@burgerhouse.com',
         '$2b$12$9BlDlQZTxG7Nlemzdqt0SOmP0OIC0BMfNUwyOFNuF9UO5xg3LgV8e', 'cashier',    1),
        (5, 2, 'Maria Santos',    'maria@pastaeco.com',
         '$2b$12$9BlDlQZTxG7Nlemzdqt0SOmP0OIC0BMfNUwyOFNuF9UO5xg3LgV8e', 'owner',      1),
        (6, 2, 'Pedro Lima',      'pedro@pastaeco.com',
         '$2b$12$9BlDlQZTxG7Nlemzdqt0SOmP0OIC0BMfNUwyOFNuF9UO5xg3LgV8e', 'cashier',    1),
        (7, 3, 'Lucia Ferreira',  'lucia@sweetcorner.com',
         '$2b$12$9BlDlQZTxG7Nlemzdqt0SOmP0OIC0BMfNUwyOFNuF9UO5xg3LgV8e', 'owner',      1)
    """)


def downgrade() -> None:
    op.execute("DELETE FROM users     WHERE id <= 7")
    op.execute("DELETE FROM terminals WHERE id <= 3")
    op.execute("DELETE FROM companies WHERE id <= 3")
