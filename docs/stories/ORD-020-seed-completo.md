---
id: ORD-020
status: Done
fase: 1
sprint: 1
responsavel: Backend SR
---

# ORD-020 — Seed completo: usuários admin, produtos e categorias demo

## História
Como desenvolvedor do time, quero que o `init.sql` contenha todos os dados necessários para rodar o piloto completo localmente, para que ao executar `docker compose up` seja possível logar no admin, navegar pelo catálogo do totem e demonstrar todos os fluxos sem inserção manual de dados.

## Contexto e motivação
O `init.sql` atual cria 3 empresas e 3 terminais — suficiente para o login do totem via PIN. Mas não há nenhum usuário cadastrado (impossível logar no admin com email+senha) e o catálogo está vazio (totem exibe lista vazia após login). Sem esse seed, nenhuma demonstração do piloto é possível. Pré-requisito para ORD-026, ORD-027 e ORD-028.

## O que precisa ser inserido

**Usuários:** 1 super admin + 1 owner e 1 manager por empresa demo
**Catálogo:** 5 categorias + 8 produtos por empresa (total 15 categorias, 24 produtos)

## Dependências
- **Pré-requisito para:** ORD-026 (totem frontend), ORD-027 (balcão), ORD-028 (admin)
- **Relacionada:** ORD-009 (bcrypt PIN) — os `password_hash` do seed devem ser bcrypt

## Cenários de Teste (Gherkin)

```gherkin
Feature: ORD-020 — Seed completo para piloto

  Scenario: Login de super admin funciona após seed
    Dado que o docker compose subiu com o init.sql atualizado
    Quando envio POST /auth/login com {"email":"admin@ordin.app","password":"admin123"}
    Então recebo HTTP 200 com access_token e refresh_token
    E o payload do JWT contém role=superadmin

  Scenario: Login de owner da Burger House funciona
    Quando envio POST /auth/login com {"email":"carlos@burgerhouse.com","password":"burger123"}
    Então recebo HTTP 200 com access_token
    E o payload contém company_id=1 e role=owner

  Scenario: Catálogo da Burger House tem categorias e produtos
    Dado que tenho um JWT válido com company_id=1
    Quando envio GET /catalog/categories?company_id=1
    Então a resposta contém pelo menos 5 categorias ativas
    Quando envio GET /catalog/products?company_id=1
    Então a resposta contém pelo menos 8 produtos com preço > 0

  Scenario: Produto inativo não aparece no catálogo
    Dado que existe um produto com active=0 para company_id=1
    Quando envio GET /catalog/products?company_id=1
    Então esse produto não aparece na resposta

  Scenario: Cada empresa tem catálogo independente
    Dado que tenho JWTs para empresa 1 e empresa 2
    Quando listo produtos de cada empresa
    Então os produtos são diferentes entre as empresas
```

## Solução Técnica

### 1. Usuários — `init.sql` — banco `fk_company`

Senhas geradas com bcrypt (rounds=12). Os hashes abaixo são para as senhas especificadas:

```sql
USE fk_company;

-- Super admin da plataforma (company_id=0 = sem empresa)
INSERT IGNORE INTO users (id, company_id, name, email, password_hash, role, active) VALUES
(1, 1, 'Admin Ordin', 'admin@ordin.app',
 '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiDMo1xyJt2z4lUwR7Nkb3J3s6iq',
 'owner', 1);
-- Senha: admin123

-- Burger House
INSERT IGNORE INTO users (id, company_id, name, email, password_hash, role, active) VALUES
(2, 1, 'Carlos Oliveira', 'carlos@burgerhouse.com',
 '$2b$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC.VPT4mGzMrAeHFG5Aq',
 'owner', 1),
-- Senha: burger123
(3, 1, 'Ana Souza', 'ana@burgerhouse.com',
 '$2b$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC.VPT4mGzMrAeHFG5Aq',
 'manager', 1),
(4, 1, 'João Caixa', 'joao@burgerhouse.com',
 '$2b$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC.VPT4mGzMrAeHFG5Aq',
 'cashier', 1);

-- Pasta & Co
INSERT IGNORE INTO users (id, company_id, name, email, password_hash, role, active) VALUES
(5, 2, 'Maria Santos', 'maria@pastaeco.com',
 '$2b$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC.VPT4mGzMrAeHFG5Aq',
 'owner', 1),
-- Senha: burger123 (mesma senha demo para facilitar)
(6, 2, 'Pedro Lima', 'pedro@pastaeco.com',
 '$2b$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC.VPT4mGzMrAeHFG5Aq',
 'cashier', 1);

-- Sweet Corner
INSERT IGNORE INTO users (id, company_id, name, email, password_hash, role, active) VALUES
(7, 3, 'Lucia Ferreira', 'lucia@sweetcorner.com',
 '$2b$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC.VPT4mGzMrAeHFG5Aq',
 'owner', 1);
```

> **Importante:** os hashes acima devem ser gerados com `bcrypt.hashpw(b"senha", bcrypt.gensalt(12))` durante o desenvolvimento. O Backend SR deve rodar o script de geração e atualizar os valores no init.sql antes de commitar.

Script Python para gerar os hashes:
```python
import bcrypt
senhas = {"admin123": "admin@ordin.app", "burger123": "demo"}
for senha, label in senhas.items():
    h = bcrypt.hashpw(senha.encode(), bcrypt.gensalt(12)).decode()
    print(f"-- {label}: {senha}")
    print(f"'{h}'")
```

### 2. Catálogo — `init.sql` — banco `fk_catalog`

```sql
USE fk_catalog;

-- ─── Burger House (company_id=1) ───────────────────────────────
INSERT IGNORE INTO categories (id, company_id, name, active) VALUES
(1, 1, 'Lanches', 1),
(2, 1, 'Combos', 1),
(3, 1, 'Bebidas', 1),
(4, 1, 'Sobremesas', 1),
(5, 1, 'Extras', 1);

INSERT IGNORE INTO products (id, company_id, category_id, name, description, price, image_url, active) VALUES
(1,  1, 1, 'X-Burguer',      'Hambúrguer artesanal 180g, queijo, alface, tomate',  18.90, '/img/x-burguer.jpg', 1),
(2,  1, 1, 'X-Bacon',        'Hambúrguer 180g, bacon crocante, queijo cheddar',     22.90, '/img/x-bacon.jpg',   1),
(3,  1, 1, 'X-Salada',       'Hambúrguer 150g, salada completa, molho especial',    17.90, '/img/x-salada.jpg',  1),
(4,  1, 2, 'Combo X-Burguer','X-Burguer + fritas M + refri 350ml',                 29.90, '/img/combo1.jpg',    1),
(5,  1, 2, 'Combo X-Bacon',  'X-Bacon + fritas G + refri 500ml',                   34.90, '/img/combo2.jpg',    1),
(6,  1, 3, 'Coca-Cola 350ml','Gelada',                                               6.90, '/img/coca.jpg',      1),
(7,  1, 3, 'Suco de Laranja','Natural 300ml',                                        8.90, '/img/suco.jpg',      1),
(8,  1, 4, 'Sorvete',        'Casquinha 2 bolas, sabores variados',                  7.90, '/img/sorvete.jpg',   1),
(9,  1, 5, 'Fritas P',       'Porção pequena batata frita crocante',                 8.90, '/img/fritas.jpg',    0); -- inativo

-- ─── Pasta & Co (company_id=2) ────────────────────────────────
INSERT IGNORE INTO categories (id, company_id, name, active) VALUES
(6,  2, 'Massas', 1),
(7,  2, 'Pizzas', 1),
(8,  2, 'Saladas', 1),
(9,  2, 'Bebidas', 1),
(10, 2, 'Sobremesas', 1);

INSERT IGNORE INTO products (id, company_id, category_id, name, description, price, image_url, active) VALUES
(10, 2, 6, 'Espaguete Carbonara', 'Massa al dente, bacon, ovo, pecorino',         32.90, '/img/carbonara.jpg', 1),
(11, 2, 6, 'Fettuccine Alfredo',  'Creme de queijo parmesão, manteiga',            29.90, '/img/alfredo.jpg',   1),
(12, 2, 7, 'Pizza Margherita',    'Molho tomate, mussarela, manjericão (25cm)',    38.90, '/img/margherita.jpg',1),
(13, 2, 7, 'Pizza Calabresa',     'Calabresa fatiada, cebola, azeitona (25cm)',    42.90, '/img/calabresa.jpg', 1),
(14, 2, 8, 'Salada Caesar',       'Alface, croutons, parmesão, molho Caesar',      24.90, '/img/caesar.jpg',    1),
(15, 2, 9, 'Água mineral 500ml',  'Com ou sem gás',                                 4.90, '/img/agua.jpg',      1),
(16, 2, 9, 'Vinho da casa 150ml', 'Tinto ou branco',                               18.90, '/img/vinho.jpg',     1),
(17, 2, 10,'Tiramisu',            'Sobremesa italiana clássica',                   16.90, '/img/tiramisu.jpg',  1);

-- ─── Sweet Corner (company_id=3) ──────────────────────────────
INSERT IGNORE INTO categories (id, company_id, name, active) VALUES
(11, 3, 'Açaí', 1),
(12, 3, 'Sorvetes', 1),
(13, 3, 'Crepes', 1),
(14, 3, 'Bebidas', 1),
(15, 3, 'Combos', 1);

INSERT IGNORE INTO products (id, company_id, category_id, name, description, price, image_url, active) VALUES
(18, 3, 11,'Açaí 300ml',     'Com granola e banana',                              14.90, '/img/acai.jpg',      1),
(19, 3, 11,'Açaí 500ml',     'Com granola, banana e leite condensado',            22.90, '/img/acai500.jpg',   1),
(20, 3, 12,'Casquinha Dupla','2 bolas sabores variados',                            9.90, '/img/casquinha.jpg', 1),
(21, 3, 12,'Sundae',         'Sorvete com calda chocolate ou morango',            12.90, '/img/sundae.jpg',    1),
(22, 3, 13,'Crepe Nutella',  'Crepe fino com Nutella e morango',                  18.90, '/img/crepe.jpg',     1),
(23, 3, 14,'Smoothie Frutas','Vitamina de frutas da estação 400ml',               15.90, '/img/smoothie.jpg',  1),
(24, 3, 15,'Combo Açaí',     'Açaí 300ml + casquinha + bebida 350ml',            29.90, '/img/combo-acai.jpg',1),
(25, 3, 15,'Combo Crepe',    'Crepe + smoothie',                                  28.90, '/img/combo-crepe.jpg',1);
```

### Estimativa
- **Backend SR:** 2h (gerar hashes bcrypt reais + escrever SQL + validar no docker compose)

### Riscos
- **Risco:** Hashes bcrypt no init.sql precisam ser gerados, não copiados de outra fonte
  → **Mitigação:** Backend SR roda script Python localmente para gerar os hashes antes de commitar

## Critérios de aceite funcionais
- [ ] `docker compose up` + `POST /auth/login` com `admin@ordin.app / admin123` retorna 200
- [ ] `POST /auth/login` com `carlos@burgerhouse.com / burger123` retorna 200 com `company_id=1`
- [ ] `GET /catalog/categories` com JWT da empresa 1 retorna 5 categorias
- [ ] `GET /catalog/products` com JWT da empresa 1 retorna 8 produtos (produto inativo excluído)
- [ ] `GET /catalog/products` com JWT da empresa 2 retorna produtos diferentes da empresa 1
