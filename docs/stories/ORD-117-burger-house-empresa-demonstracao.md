---
id: ORD-117
status: Ready
fase: 6
sprint: null
responsavel: Produto + Backend SR
estimativa: M
tipo: feature
---

# ORD-117 — Burger House como empresa de demonstração do Ordin

## User story
**Como** responsável pelo produto Ordin,
**quero** que a Burger House tenha um catálogo completo e realista (86 produtos em 11 categorias, com fotos) persistido como dado de seed, e seja formalmente identificável na plataforma como "empresa de demonstração",
**para** ter sempre um tenant pronto e visualmente convincente pra demos comerciais, onboarding de novos devs e QA exploratório — sem depender de estado ad-hoc criado manualmente numa sessão de trabalho, que se perde a qualquer reset de ambiente.

## Contexto e motivação
Nesta sessão, populei manualmente (via chamadas diretas à API do catalog-service, fora do fluxo normal de cadastro) o catálogo completo da Burger House a partir de `docs/exemples/categorias-produtos-bh/catalogo_burger_house.md`: 86 produtos em 11 categorias (Lanches, Combos, Sobremesas, Bebidas, Porções, Saladas, Molhos, Promoções, Kids, Vegano, Especiais), cada um com preço, descrição curta/longa, calorias, tags e alérgenos (lista oficial RDC 727/2022), e gerei uma foto realista por produto via IA (Pollinations.ai, gratuito) enviada ao bucket de imagens.

Esse estado hoje só existe no banco/MinIO da instância local rodando — não sobrevive a `docker compose down -v`, a um clone novo do repo, nem está documentado como seed oficial. O usuário pediu explicitamente para "guardar essa carga" e, além de persistir, **marcar formalmente a Burger House como empresa de demonstração**.

## Decisão assumida nesta rodada (confirmar com o usuário antes do deploy)
O usuário pediu para rodar o upstream completo sem travar no ponto em aberto do Explorer inicial ("onde o flag `is_demo` é consumido?"). Assumi o escopo mais conservador pra poder fechar a solução técnica:

> **`is_demo` é, por enquanto, só metadado + indicação visual interna** (badge na listagem de empresas do superadmin, `frontend/admin/src/screens/CompanyListScreen.tsx`). **Não** existe consumidor público (site institucional, link de demo) nesta história — se isso for necessário no futuro, é uma história nova, pois muda escopo (sai do admin, pode envolver `boom-tickets/` ou outra superfície).

Se essa não for a intenção, é só avisar antes do deploy — o campo em si (`Company.is_demo`) não muda, só onde ele aparece.

## Cenários (QA Explorer)

```gherkin
Funcionalidade: Burger House como empresa de demonstração

  Cenário: Ambiente novo já nasce com o catálogo de demonstração
    Dado um ambiente rodando "docker compose up --build" a partir de um banco vazio
    Quando as migrations do company-service e do catalog-service terminam de rodar
    Então a empresa "Burger House" (id=1) tem exatamente 11 categorias ativas
    E tem 88 produtos ativos no total (86 do catálogo de demonstração + 2 do seed original)
    E cada um dos 86 produtos novos tem sku, preço, descrição, calorias, tags e ao menos os alérgenos declarados no catálogo de origem
    E a empresa "Burger House" tem is_demo = true
    E as empresas "Pasta & Co" e "Sweet Corner" têm is_demo = false

  Cenário: Migration é idempotente
    Dado que a migration de seed do catálogo de demonstração já rodou uma vez
    Quando "alembic upgrade head" roda novamente (ex: reinício do container)
    Então nenhuma categoria ou produto duplicado é criado
    E a contagem de produtos da Burger House continua 88

  Cenário: Badge de demonstração visível só pro superadmin
    Dado um usuário com role "superadmin" logado no admin
    Quando ele abre a tela "Clientes" (lista de empresas)
    Então a linha da "Burger House" mostra um indicador "Demo"
    E nenhuma outra empresa mostra esse indicador
    E um usuário com role "owner"/"manager" (sem acesso a essa tela) não é afetado

  Cenário: Catálogo funciona mesmo antes do script de imagens rodar
    Dado que a migration de seed rodou mas o script de upload de imagens de demonstração ainda não rodou
    Quando o catálogo da Burger House é listado no admin ou no totem
    Então os 86 produtos aparecem normalmente, sem imagem (mesmo comportamento já existente pra qualquer produto sem image_url)
    E nenhuma tela quebra ou trava por causa disso

  Cenário: Script de imagens de demonstração é idempotente
    Dado que o script de upload de imagens de demonstração já rodou uma vez com sucesso
    Quando ele roda de novo
    Então as imagens são substituídas (mesmo comportamento do upload manual via admin) sem gerar objetos órfãos no bucket
```

## Solução técnica (Tech Explorer)

### 1. Flag `is_demo` (company-service)
- **Migration nova** (`services/company/migrations/versions/<timestamp>_is_demo_flag.py`, `down_revision = "20260823_1000"`):
  - `ALTER TABLE companies ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT FALSE` (com guarda de idempotência via `inspector.get_columns`, mesmo padrão de `20260823_1000_catalog_menu_layout.py`).
  - `UPDATE companies SET is_demo = TRUE WHERE id = 1` (Burger House).
- **`services/company/main.py`:**
  - `Company.is_demo = Column(Boolean, nullable=False, default=False)`.
  - `CompanyOut.is_demo: bool = False`.
  - **Não** propagar pra `CompanyInfo` (auth-service) nem pros 3 pontos internos (`/internal/validate-pin`, `/internal/verify-pin`, dict de pareamento QR) — não há consumidor no totem/kiosk (ver decisão assumida acima). Se isso mudar no futuro, é o mesmo padrão já documentado no `CLAUDE.md` de propagação cross-service (ver histórico ORD-108/115/116).
- **`frontend/admin/src/screens/CompanyListScreen.tsx`:**
  - Badge simples "Demo" ao lado do nome da empresa (`styles.rowName`, linha ~149) quando `c.is_demo === true`. Tela já é superadmin-only, sem necessidade de guarda de role adicional.

### 2. Seed do catálogo (catalog-service)
- **Migration nova** (`services/catalog/migrations/versions/<timestamp>_seed_burger_house_demo.py`, `down_revision = "20260807_1400"`):
  - Reserva um bloco de IDs fixos que não colide com o seed original (categorias 1–15, produtos 1–25): categorias `100–110`, produtos `1000–1085`, seguindo o mesmo padrão de `INSERT IGNORE ... VALUES (id, ...)` de `20260611_0901_seed_initial.py` — determinístico e idempotente, mesma limitação de colisão teórica com autoincrement orgânico que já existe hoje no seed original (não é um risco novo introduzido por esta história).
  - Os 2 produtos seed originais da Burger House (`X-Burguer` id=1, `Refrigerante`/id na tabela original) **permanecem intocados** — são aditivos, sem colisão de nome/SKU com os 86 novos (nenhum deles tem SKU e não há choque de nome).
  - Conteúdo das 86 linhas de produto (nome, sku, preço, descrição curta/longa, calorias, tags JSON, category_id) gerado diretamente de `docs/exemples/categorias-produtos-bh/catalogo_burger_house.md` — mesmos dados já validados nesta sessão (parse + criação via API deram 86/86 sem erro).
  - `product_allergens`: `INSERT IGNORE` ligando cada produto aos `allergen_id` corretos (tabela `allergens`, IDs 49–67, já existentes desde a ORD-075 — não precisa migration nova pra alérgeno, só o vínculo).
  - `image_url`/`thumbnail_url`: ficam `NULL` na migration (ver item 3 — imagem não é responsabilidade de migration nesta arquitetura).
  - `downgrade()`: `DELETE FROM product_allergens WHERE product_id BETWEEN 1000 AND 1085`, `DELETE FROM products WHERE id BETWEEN 1000 AND 1085`, `DELETE FROM categories WHERE id BETWEEN 100 AND 110`.

### 3. Imagens (decisão de arquitetura)
Migrations do Alembic neste projeto são só DDL/DML — nenhuma faz I/O de rede hoje (`ensure_bucket()` roda no `startup` da app, não em migration). Rodar 86 uploads S3 dentro de uma migration seria uma exceção ao padrão estabelecido e rodaria sem necessidade em **todo boot de todo ambiente** (inclusive produção, onde migrations sobem automaticamente — ver `CLAUDE.md`).

**Decisão:** script separado, manual, não acoplado ao boot:
- Commitar as 86 fotos já geradas (hoje em `/tmp/.../scratchpad/gen_images/*.jpg`) em `services/catalog/seed_assets/burger_house_demo/<SKU>.jpg` (~2.5MB total, aceitável no repo).
- Novo script `services/catalog/scripts/seed_demo_images.py`: para cada arquivo em `seed_assets/burger_house_demo/`, chama `infrastructure.image_storage.upload_product_image()` / `upload_product_thumbnail()` (mesmas funções já usadas pelo endpoint de upload) e faz `UPDATE products SET image_url=..., thumbnail_url=... WHERE sku=...`. Idempotente (mesmo comportamento do endpoint real: sobrescreve, sem órfão).
- Documentar no `CLAUDE.md` do projeto (seção de setup) como um passo opcional de setup: `python services/catalog/scripts/seed_demo_images.py` — não roda sozinho, dev decide quando quer as fotos reais (ex: antes de uma demo comercial).

### Estimativa
**M** — duas migrations pequenas e determinísticas + um script standalone + uma badge simples de UI. Risco principal é só o de digitação/transcrição dos 86 produtos pra SQL (mitigado por gerar o SQL programaticamente a partir do `.md`, não à mão).

### Riscos técnicos identificados
- IDs fixos (100–110 / 1000–1085) podem colidir em bancos que já cresceram organicamente além dessa faixa — mesma limitação pré-existente do seed original, não uma regressão nova.
- Rodar em produção: o seed do catálogo roda automaticamente (é migration); as fotos não (é script manual) — ambiente de prod fica com produtos sem foto até alguém rodar o script lá, o que é aceitável dado que "empresa de demonstração" ainda não tem consumidor público definido.

## Fora de escopo desta história
- Qualquer UI nova que consuma o flag de demo além do badge simples no superadmin.
- Automatizar o upload de imagens no boot do container (decisão explícita de manter manual, ver seção 3).
- Geração de novas imagens/produtos além dos 86 já criados nesta sessão.

## Próximos passos
História **Ready** — solução técnica fechada, cenários definidos, sem bloqueadores. Falta só a confirmação do usuário sobre a decisão assumida (`is_demo` só interno/superadmin, sem consumidor público) antes de puxar pro sprint e implementar.
