---
id: ORD-138
status: Done
fase: 6
sprint: null
responsavel: Backend
estimativa: 5 pontos
tipo: feature
---

# ORD-138 — Grupos de opção: modelo de dados e CRUD (catalog-service)

## Descrição
Primeira subtarefa de ORD-137 (guarda-chuva) — só o modelo de dados e os endpoints de CRUD de grupo de opção no `catalog-service`. Sem UI ainda (ORD-139/140) e sem mudança de comportamento visível no totem/pedido (ORD-141/142/143). Entidades novas: `OptionGroup` (nome, `min_selections`, `max_selections` — cobre obrigatório/opcional e seleção única/múltipla com os mesmos dois campos, igual ao schema confirmado da API do iFood) e `Option` (label, `price_delta`, `image_url`/`thumbnail_url`, `sort_order`, vínculo a `OptionGroup`). Vínculo `Product` ↔ `OptionGroup` é N:N — mesmo grupo reutilizável em vários produtos, confirmado como padrão de mercado (Goomer, iFood, Anota AI) em `docs/analise-concorrentes-grupos-opcao-produto.md`.

**Requisito adicional confirmado pelo usuário (31/08):** cada opção dentro do grupo precisa suportar imagem própria (ex.: foto da lata de cada sabor) e ordem reordenável pelo admin — mesmo padrão já existente pra `Product` (`image_url`/`thumbnail_url` via `infrastructure/image_storage.py`, `sort_order` via endpoint de reorder dedicado). Isso reforça a decisão do usuário de manter grupo de opção como aba/tela dedicada (ORD-139), não campo simples embutido em outro formulário — a complexidade de upload de imagem + drag-and-drop de ordenação não cabe bem num modal simples.

## Persona
Owner/manager da empresa (via API, consumida depois por ORD-139/140).

## Contexto
Ver `docs/stories/ORD-137-grupos-opcao-produto.md` e `docs/analise-concorrentes-grupos-opcao-produto.md` pra motivação e decisão de arquitetura completas. Pré-requisito de todas as outras histórias-filhas de ORD-137.

---

## Explorer

## História
Como **owner/manager da empresa**, quero que o catalog-service tenha um conceito de "grupo de opções" reutilizável (com regra de obrigatoriedade e de seleção única/múltipla) que eu possa vincular a mais de um produto, para poder cadastrar variações como sabor ou tamanho sem duplicar produto por variação.

## Contexto e motivação
Hoje `Product` é um registro plano — nome, preço, categoria, sem nenhum conceito de variação (confirmado em `services/catalog/main.py`). Pra representar "Refrigerante lata 350ml com 4 sabores" ou "Batata frita com 3 tamanhos", seria preciso cadastrar um produto por sabor/tamanho — não é o que o usuário quer.

Pesquisa de concorrência (`docs/analise-concorrentes-grupos-opcao-produto.md`) confirmou, com fonte primária (schema real da API do iFood, mais Goomer e Anota AI), que o mercado resolve isso com um único primitivo: grupo de opções com `min`/`max` de seleção (obrigatório = `min ≥ 1`; seleção única = `max = 1`) e cada opção com preço próprio, que pode ser zero (delta zero = a opção herda o preço do produto, sem nenhum rótulo tipo "grátis" — decisão de UX confirmada no protótipo interativo já validado pelo usuário). Grupo é reutilizável entre produtos nos três players pesquisados — não se recria "Sabores de bebida" pra cada produto que usa esse grupo.

Esta história é só a fundação de dado — sem ela, nenhuma das histórias-filhas seguintes (cadastro no admin, vínculo a produto, seleção no totem, precificação no pedido, impressão) tem o que consumir.

**Validação cruzada com o fluxo de pizza (observação do usuário, 31/08):** `max_selections` em seleção múltipla já é estruturalmente o mesmo campo que o Mogo chama de "Quantidade de sabores" no cadastro de tamanho de pizza (`docs/analise-mogo-fluxo-pizza.md`) — ex.: um produto "Pizza G" com grupo "Sabores" (`multi=true`, `max_selections=2`) já expressa "até 2 sabores nessa pizza", sem precisar de nenhum campo ou tabela nova. Isso **não é uma decisão nova desta história**, é confirmação de que o modelo já desenhado cobre o caso — reforça a tese de "um primitivo só" em vez de mecanismo dedicado por caso.

Isso **não resolve**, porém, a regra de cálculo de preço quando mais de uma opção do grupo é escolhida (maior valor entre as opções / soma / média) — a pesquisa do Mogo confirmou que esse ponto não está documentado publicamente em lugar nenhum, e continua em aberto. `max_selections` limita quantas opções podem ser escolhidas, não como o preço da combinação é calculado. Fica registrado como decisão de produto pendente pro **ORD-142** (que já é sobre `OrderItem` carregar a opção escolhida e calcular preço) — não é escopo desta história.

## Fluxo principal
1. Owner/manager (via chamada de API, ainda sem UI — UI é ORD-139) cria um grupo de opção com nome, `min_selections`, `max_selections` e uma lista inicial de opções (label + `price_delta`).
2. Owner/manager consulta a lista de grupos de opção da empresa.
3. Owner/manager edita um grupo existente: renomeia, ajusta `min_selections`/`max_selections`, adiciona/remove/edita opções.
4. Owner/manager envia/remove uma imagem por opção (mesmo fluxo de `POST /catalog/products/{id}/image` / `DELETE /catalog/products/{id}/image`, adaptado pra `Option`).
5. Owner/manager reordena as opções dentro de um grupo (mesmo padrão de `PUT /catalog/products/reorder`, adaptado pra escopo de um `OptionGroup`).
6. Owner/manager vincula um grupo já existente a um produto (endpoint consumido depois por ORD-140) — mesmo padrão de "replace completo" já usado em `allergen_ids` na edição de produto (`_set_product_allergens`).
7. Owner/manager remove um grupo (ver fluxo alternativo sobre grupo em uso).

## Fluxos alternativos / exceções
- **`min_selections > max_selections`**: rejeitado — 422 na criação (validado no schema Pydantic), 400 na edição (checagem manual no endpoint, já que o body de update é parcial e o schema sozinho não sabe o valor final combinado com o que já está salvo).
- **`max_selections < 1`**: rejeitado, mesmo racional acima (422 na criação, 400 na edição) — todo grupo precisa permitir pelo menos 1 seleção.
- **Grupo sem nenhuma opção**: rejeitado — 422 na criação e também no replace completo de opções (`PUT .../options`), ambos validados no schema Pydantic — um grupo vazio não é útil vinculado a um produto (mesma lógica de "adiciona pelo menos uma opção" já validada no protótipo).
- **Excluir um grupo que está vinculado a um ou mais produtos**: bloqueado (409) com mensagem nomeando quantos/quais produtos usam o grupo — mesmo espírito do bloqueio já existente em categoria/produto com dado vinculado, evita quebrar produto publicado sem querer. Owner precisa desvincular do(s) produto(s) primeiro.
- **Excluir uma opção que já foi escolhida em pedidos passados**: fora de escopo desta história (não há histórico de pedido ainda — isso só passa a existir em ORD-142). Registrado aqui como ponto de atenção pro Tech Explorer de ORD-142, não resolvido agora.
- **Vincular grupo a produto de outra empresa**: bloqueado por isolamento multi-tenant, mesmo padrão de todo o catalog-service (`company_id` do JWT, nunca do body).
- **Editar `min_selections`/`max_selections` de um grupo já vinculado a produtos**: permitido — é o mesmo grupo, a mudança de regra vale pra todos os produtos que o usam (comportamento consistente com "grupo reutilizável, edição propaga", confirmado como padrão de mercado na pesquisa).
- **Upload de imagem de opção com formato/tamanho inválido**: mesma validação já existente pra produto (JPG/PNG, até 2MB) — rejeitado com a mesma mensagem de erro, sem inventar regra nova.
- **Reordenar enviando um conjunto de ids que não bate exatamente com as opções do grupo**: rejeitado — mesma validação já existente em `/catalog/products/reorder` e `/catalog/categories/reorder` (o conjunto enviado precisa ser exatamente todas as opções do grupo, não um subconjunto).

## Dependências
- Serviços envolvidos: **catalog-service** apenas.
- Reaproveita `infrastructure/image_storage.py` (já usado por `Product.image_url`/`thumbnail_url`) pro upload de imagem de opção — sem infraestrutura nova.
- Sem dependência de outro serviço (order-service só entra em ORD-142).
- Sem impacto em totem, balcão, admin nesta história — são consumidores futuros (ORD-139/140/141), não pré-requisitos dela.
- Bloqueante de: ORD-139, ORD-140, ORD-141, ORD-142, ORD-143 (todas as histórias-filhas de ORD-137 dependem desta).

## Critérios de aceite funcionais
- [ ] Tabela `option_groups` (`company_id`, `name`, `min_selections`, `max_selections`, `active`)
- [ ] Tabela `options` (`option_group_id`, `label`, `price_delta`, `image_url`, `thumbnail_url`, `sort_order`)
- [ ] Tabela de vínculo `product_option_groups` (`product_id`, `option_group_id`) — N:N, mesmo padrão de `product_allergens`
- [ ] `POST /catalog/option-groups` — cria grupo com sua lista inicial de opções
- [ ] `GET /catalog/option-groups` — lista grupos da empresa, com opções resolvidas (ordenadas por `sort_order`)
- [ ] `PUT /catalog/option-groups/{id}` — edita nome/`min_selections`/`max_selections`
- [ ] `PUT /catalog/option-groups/{id}/options` — substitui a lista de opções inteira (replace completo, mesmo padrão de `allergen_ids`)
- [ ] `PUT /catalog/option-groups/{id}/options/reorder` — reordena as opções do grupo, mesmo padrão de `/catalog/products/reorder` (conjunto enviado precisa bater exatamente com as opções existentes)
- [ ] `POST /catalog/options/{id}/image` — upload de imagem da opção, mesma validação/formato de `/catalog/products/{id}/image` (JPG/PNG, até 2MB)
- [ ] `DELETE /catalog/options/{id}/image` — remove imagem da opção
- [ ] `DELETE /catalog/option-groups/{id}` — remove grupo; bloqueado (409) se vinculado a algum produto
- [ ] `PUT /catalog/products/{id}/option-groups` — substitui os grupos vinculados ao produto (replace completo, mesmo padrão de `allergen_ids`)
- [ ] `GET /catalog/products/{id}` passa a incluir os grupos de opção vinculados (nome + opções resolvidas, com imagem e ordem), mesmo padrão de `allergens` já incluído hoje
- [ ] Validações: `min_selections ≤ max_selections`, `max_selections ≥ 1`, grupo precisa de ao menos 1 opção
- [ ] Multi-tenant: todo endpoint filtra por `company_id` do JWT — teste explícito de isolamento entre empresas
- [ ] `GET /catalog/products` (listagem) e `GET /catalog/products/{id}` (detalhe) ganham o campo `option_groups` — mesmo padrão de `allergens`, que já aparece nos dois hoje via `_serialize_product` compartilhado. Mudança aditiva (campo novo, nada removido/renomeado), sem quebrar cliente existente. `GET /catalog/categories` não é afetado (não passa por `_serialize_product`)

## Wireframe / Mockup
N/A — história 100% backend/catalog-service, sem UI.

---

## QA Explorer

```gherkin
Feature: Grupos de opção — modelo de dados e CRUD (catalog-service)
  Como owner/manager da empresa
  Quero criar e gerenciar grupos de opção reutilizáveis, e vinculá-los a produtos
  Para poder cadastrar variações (sabor, tamanho) sem duplicar produto por variação

  Background:
    Dado que a empresa 1 está autenticada com um usuário owner/manager
    E existe o produto "Refrigerante lata 350ml" (id=501) na empresa 1

  # ── Happy path ──────────────────────────────────────────────────────────

  Scenario: Criar grupo de opção com opções iniciais
    Quando o owner envia POST /catalog/option-groups com name="Sabores de bebida", min_selections=1, max_selections=1 e 4 opções (Coca-Cola, Fanta Laranja, Fanta Uva, Guaraná Antarctica), todas com price_delta=0
    Então a resposta é 201
    E o grupo criado tem as 4 opções, cada uma com price_delta=0

  Scenario: Listar grupos de opção da empresa
    Dado que a empresa 1 tem 2 grupos de opção cadastrados
    Quando o owner envia GET /catalog/option-groups
    Então a resposta é 200 com os 2 grupos, cada um com suas opções resolvidas (não só ids)

  Scenario: Editar nome e regra de seleção de um grupo existente
    Dado um grupo "Tamanho da porção" com min_selections=1, max_selections=1
    Quando o owner envia PUT /catalog/option-groups/{id} alterando o nome e mantendo min/max
    Então a resposta é 200 com o nome atualizado

  Scenario: Substituir a lista de opções de um grupo (replace completo)
    Dado um grupo "Tamanho da porção" com opções [P, M, G]
    Quando o owner envia PUT /catalog/option-groups/{id}/options com [P, M, G, Família]
    Então a resposta é 200
    E o grupo passa a ter exatamente essas 4 opções — nenhuma das antigas sobra se não estiver na nova lista

  Scenario: Vincular grupo de opção a um produto (replace completo)
    Dado o grupo "Sabores de bebida" (id=10) já cadastrado na empresa 1
    Quando o owner envia PUT /catalog/products/501/option-groups com option_group_ids=[10]
    Então a resposta é 200
    E GET /catalog/products/501 passa a incluir o grupo "Sabores de bebida" com suas opções resolvidas

  Scenario: Desvincular todos os grupos de um produto
    Dado que o produto 501 tem o grupo "Sabores de bebida" vinculado
    Quando o owner envia PUT /catalog/products/501/option-groups com option_group_ids=[]
    Então a resposta é 200
    E GET /catalog/products/501 não retorna mais nenhum grupo de opção

  Scenario: Upload de imagem de uma opção
    Dado a opção "Coca-Cola" (id=100) do grupo "Sabores de bebida"
    Quando o owner envia POST /catalog/options/100/image com um JPG de 500KB
    Então a resposta é 200 com image_url e thumbnail_url preenchidos

  Scenario: Remover imagem de uma opção
    Dado que a opção "Coca-Cola" (id=100) já tem imagem cadastrada
    Quando o owner envia DELETE /catalog/options/100/image
    Então a resposta é 200 com image_url e thumbnail_url nulos

  Scenario: Reordenar as opções de um grupo
    Dado um grupo "Sabores de bebida" com opções na ordem [Coca-Cola, Fanta Laranja, Fanta Uva, Guaraná]
    Quando o owner envia PUT /catalog/option-groups/{id}/options/reorder com a nova ordem [Guaraná, Coca-Cola, Fanta Laranja, Fanta Uva]
    Então a resposta é 200
    E GET /catalog/option-groups/{id} retorna as opções na nova ordem

  # ── Bordas / validação ──────────────────────────────────────────────────

  Scenario: min_selections maior que max_selections é rejeitado na criação
    Quando o owner envia POST /catalog/option-groups com min_selections=2, max_selections=1
    Então a resposta é 422 (validação de schema)

  Scenario: min_selections maior que max_selections é rejeitado na edição
    Dado um grupo "Tamanho da porção" com min_selections=1, max_selections=1
    Quando o owner envia PUT /catalog/option-groups/{id} com min_selections=5
    Então a resposta é 400 (checagem manual, combina com o max_selections já salvo)

  Scenario: max_selections menor que 1 é rejeitado
    Quando o owner envia POST /catalog/option-groups com max_selections=0
    Então a resposta é 422

  Scenario: Grupo sem nenhuma opção é rejeitado na criação
    Quando o owner envia POST /catalog/option-groups sem nenhuma opção na lista
    Então a resposta é 422

  Scenario: Substituir opções por uma lista vazia é rejeitado
    Dado um grupo "Tamanho da porção" com opções [P, M, G]
    Quando o owner envia PUT /catalog/option-groups/{id}/options com lista vazia
    Então a resposta é 422 — um grupo vinculável não pode ficar sem nenhuma opção

  Scenario: Upload de imagem com formato inválido é rejeitado
    Quando o owner envia POST /catalog/options/100/image com um arquivo PDF
    Então a resposta é 400 — mesma validação já existente pra imagem de produto

  Scenario: Reordenar com conjunto de ids que não bate com as opções do grupo é rejeitado
    Dado um grupo com as opções [P, M, G]
    Quando o owner envia PUT /catalog/option-groups/{id}/options/reorder com [P, M] (faltando G)
    Então a resposta é 400

  # ── Erro ─────────────────────────────────────────────────────────────────

  Scenario: Excluir grupo vinculado a produto é bloqueado
    Dado que o grupo "Sabores de bebida" (id=10) está vinculado ao produto 501 ("Refrigerante lata 350ml")
    Quando o owner envia DELETE /catalog/option-groups/10
    Então a resposta é 409
    E a mensagem nomeia o produto "Refrigerante lata 350ml" como o vínculo que bloqueia a exclusão

  Scenario: Excluir grupo sem nenhum vínculo funciona normalmente
    Dado um grupo "Molhos extras" sem nenhum produto vinculado
    Quando o owner envia DELETE /catalog/option-groups/{id}
    Então a resposta é 204

  # ── Isolamento multi-tenant ─────────────────────────────────────────────

  Scenario: Empresa B não vê grupos de opção da empresa A
    Dado que a empresa 1 tem o grupo "Sabores de bebida"
    Quando um usuário da empresa 2 envia GET /catalog/option-groups
    Então a resposta não inclui o grupo "Sabores de bebida" da empresa 1

  Scenario: Empresa B não edita grupo de opção da empresa A
    Dado que o grupo "Sabores de bebida" (id=10) pertence à empresa 1
    Quando um usuário da empresa 2 envia PUT /catalog/option-groups/10
    Então a resposta é 403 ou 404 (mesmo padrão de isolamento já usado em categoria/produto)

  Scenario: Empresa B não vincula grupo de outra empresa a produto próprio
    Dado que o grupo "Sabores de bebida" (id=10) pertence à empresa 1
    E a empresa 2 tem um produto próprio (id=999)
    Quando um usuário da empresa 2 envia PUT /catalog/products/999/option-groups com option_group_ids=[10]
    Então a resposta é 400 ou 403 — não é permitido vincular grupo de outra empresa

  # ── Regressão ────────────────────────────────────────────────────────────

  Scenario: Listagem de produtos ganha option_groups de forma aditiva, sem quebrar campos existentes
    Dado que existem produtos com e sem grupo de opção vinculado
    Quando o owner envia GET /catalog/products
    Então todos os campos que já existiam antes desta história continuam presentes e com o mesmo formato
    E cada produto ganha o campo novo option_groups (lista vazia pra quem não tem grupo vinculado) — mesmo padrão de allergens, que já aparece na listagem hoje

  Scenario: Listagem de categorias não é afetada
    Quando o owner envia GET /catalog/categories
    Então a resposta é idêntica ao comportamento anterior a esta história
```

**Cenários revisados e aprovados pelo PM.**

---

## Tech Explorer

### Serviços impactados
- **catalog-service** apenas (`services/catalog/main.py` + migration nova). Sem impacto em order-service, auth-service, company-service, totem/admin/balcão nesta história.

### Modelo de dado (SQLAlchemy)
```python
class OptionGroup(Base):
    __tablename__ = "option_groups"
    id             = Column(Integer, primary_key=True)
    company_id     = Column(Integer, nullable=False, index=True)
    name           = Column(String(80), nullable=False)
    min_selections = Column(Integer, nullable=False, default=1)
    max_selections = Column(Integer, nullable=False, default=1)
    active         = Column(Boolean, nullable=False, default=True)
    created_at     = Column(DateTime, default=datetime.utcnow)

class Option(Base):
    __tablename__ = "options"
    id              = Column(Integer, primary_key=True)
    option_group_id = Column(Integer, ForeignKey("option_groups.id"), nullable=False)
    label           = Column(String(80), nullable=False)
    price_delta     = Column(Numeric(10, 2), nullable=False, default=0)
    image_url       = Column(String(500))       # key no bucket, mesmo padrão de Product.image_url
    thumbnail_url   = Column(String(500))
    sort_order      = Column(Integer)

class ProductOptionGroup(Base):
    __tablename__ = "product_option_groups"
    product_id      = Column(Integer, ForeignKey("products.id"), primary_key=True)
    option_group_id = Column(Integer, ForeignKey("option_groups.id"), primary_key=True)
```
`ProductOptionGroup` é cópia estrutural exata de `ProductAllergen` (`main.py:118-122`) — mesma chave composta, mesmo espírito de tabela de vínculo pura.

### Migration
Nova, `services/catalog/migrations/versions/20260901_HHMM_grupos_opcao.py` (convenção `YYYYMMDD_HHMM_descricao.py` já usada no serviço) — cria as 3 tabelas acima. Sem alteração em tabela existente, 100% aditivo.

### Endpoints novos (`services/catalog/main.py`)
| Método | Rota | Nota |
|---|---|---|
| POST | `/catalog/option-groups` | Cria grupo + opções iniciais numa chamada (mesmo padrão de `create_product`, que já aceita campos aninhados) |
| GET | `/catalog/option-groups` | Lista grupos da empresa, opções ordenadas por `sort_order` |
| PUT | `/catalog/option-groups/{id}` | Edita nome/min/max |
| PUT | `/catalog/option-groups/{id}/options` | Replace completo, mesmo padrão de `_set_product_allergens` |
| PUT | `/catalog/option-groups/{id}/options/reorder` | Mesma implementação de `reorder_products` (`main.py:764`), trocando `category_id` por `option_group_id` como escopo da validação "conjunto bate exatamente" |
| POST | `/catalog/options/{id}/image` | Copia `upload_product_image_endpoint` (`main.py:872`) — mesmos códigos de erro (415/413/422), reaproveita `_make_thumbnail`. Diferença: chave do bucket usa `option_group_id`/`option_id` em vez de `category_id`/`product_id` (`upload_option_image`, função nova espelhando `upload_product_image` em `infrastructure/image_storage.py:64`) |
| DELETE | `/catalog/options/{id}/image` | Cópia de `delete_product_image` (`main.py:917`) |
| DELETE | `/catalog/option-groups/{id}` | Bloqueia com 409 se `ProductOptionGroup` tiver linha pra esse grupo — query de contagem antes do delete, mensagem monta a lista de nomes de produto (join com `Product`) |
| PUT | `/catalog/products/{id}/option-groups` | Replace completo do vínculo N:N, mesmo padrão de `_set_product_allergens` |

### Mudança em endpoint existente
`_serialize_product` (`main.py`) ganha campo novo `option_groups: list[OptionGroupOut]` (nome + opções resolvidas, com imagem e ordem) — mesmo padrão do campo `allergens`. Como esse helper é compartilhado entre `list_products` e `get_product`, o campo aparece **nos dois** (listagem e detalhe), exatamente como `allergens` já aparece nos dois hoje — não é uma mudança nova de comportamento, é consistência com o padrão já existente. `GET /catalog/categories` não usa `_serialize_product`, não é afetado.

### Rota de reorder registrada antes da rota com path param
Mesma pegadinha já resolvida em `reorder_products` (comentário em `main.py:764`): `PUT /catalog/option-groups/{id}/options/reorder` precisa estar registrada **antes** de qualquer rota tipo `/catalog/option-groups/{id}/...` que possa capturar "reorder" como `{id}` — seguir a mesma ordem de declaração já usada pra produto.

### Eventos de fila
Não aplicável.

### Impacto em outros serviços
Nenhum.

### Testes
Cobertura dos 22 cenários Gherkin do QA Explorer, em `services/catalog/tests/`. Reaproveita fixtures existentes de empresa/produto/categoria já usadas nos testes de alérgeno e reorder — sem infraestrutura de teste nova.

### Estimativa
- Backend: 5 pontos (mesmo porte de ORD-125, que teve escopo comparável: 3 tabelas + CRUD + replace completo + reorder + upload de imagem).

### Riscos
- **Baixo** — todo endpoint copia um padrão já em produção (allergen, reorder, upload de imagem de produto); não há mecanismo novo sendo inventado, só recombinado.
- **Baixo** — aditivo em `GET /catalog/products/{id}`, sem mudança em contrato existente; risco de regressão coberto pelos cenários explícitos de regressão no QA Explorer.
- **Médio, mitigado:** upload de imagem por opção multiplica o número de objetos no bucket (um grupo com 8 sabores = até 16 objetos, imagem+thumb) — sem limite de opções por grupo definido nesta história; se necessário, um limite prático pode ser adicionado depois sem quebrar o contrato (campo aditivo).
- Sem conflito com `docs/ARQUITETURA.md`.

---

## Ready

### Checklist de entrada

**Explorer (PM + Produto)**
- [x] História no formato Como/Quero/Para
- [x] Contexto e motivação documentados (pesquisa de concorrência + validação cruzada com fluxo de pizza)
- [x] Fluxo principal descrito passo a passo (inclui imagem e reorder de opção)
- [x] Dependências identificadas (nenhuma — só catalog-service, reaproveita infraestrutura de imagem já existente)
- [x] Wireframe/mockup — N/A (backend puro)
- [x] Critérios de aceite funcionais escritos

**QA Explorer (QA)**
- [x] Happy path em Gherkin (criar, listar, editar, replace de opções, vincular a produto, upload/remoção de imagem, reorder)
- [x] Cenários de borda (min/max inválido, grupo vazio, formato de imagem inválido, reorder incompleto)
- [x] Cenários de erro (excluir grupo vinculado, upload inválido)
- [x] Cenário de isolamento multi-tenant incluído
- [x] Cenários de regressão incluídos (listagem de produtos/categorias inalterada)
- [x] Cenários aprovados pelo PM

**Tech Explorer (Backend)**
- [x] Serviços impactados documentados (catalog-service apenas)
- [x] Mudanças de código com localização exata (referências a `main.py` e `infrastructure/image_storage.py`)
- [x] Migrations necessárias descritas
- [x] Eventos de fila documentados (nenhum aplicável)
- [x] Estimativa de esforço definida (5 pontos)
- [x] Riscos identificados com mitigação

**Aprovação final**
- [x] Time (usuário) revisou e aprovou a solução técnica ("aprovado, vamos em frente")
- [x] Estimativa acordada
- [x] Sem bloqueios não resolvidos
- [x] Priorização no sprint — aprovada para implementação imediata pelo solicitante

**Status: Ready** — apta para implementação.
