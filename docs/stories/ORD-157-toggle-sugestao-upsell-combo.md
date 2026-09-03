---
id: ORD-157
status: Done
estimativa: 2,5 pontos (1 backend + 1 admin + 0,5 totem)
tipo: feature
fase: 6
sprint: null
responsavel: Backend SR + Frontend
---

# ORD-157 — Ativar/desativar a sugestão de upsell por combo

## Descrição
Hoje (ORD-150), sempre que um produto avulso é adicionado ao carrinho no totem e esse produto é
componente de algum combo ativo, o modal "Leve o Combo X" aparece automaticamente — sem exceção.
Pra combos com itens muito comuns (ex: refrigerante, que costuma ser componente de vários
combos), isso significa que o cliente vê a sugestão de upsell toda vez que tenta comprar aquele
item avulso, mesmo quando não faz sentido pro contexto — comportamento indesejado do ponto de
vista do admin, que hoje não tem como desligar essa sugestão pra um combo específico sem
desativar o combo inteiro. Esta história adiciona um controle no cadastro/edição de combo pra
ativar ou desativar a sugestão de upsell daquele combo especificamente, sem afetar a
visibilidade do combo no catálogo nem sua venda direta.

## Persona
Admin da empresa (dono/gerente) que cadastra e ajusta combos no painel administrativo — ganha
controle fino sobre quando o upsell é oferecido. Indiretamente, cliente no totem — deixa de ver
sugestões de combo irrelevantes/repetitivas pra itens muito comuns.

## Contexto
Levantado pelo usuário em 2026-09-03 ao observar, testando o totem, que adicionar um item comum
como refrigerante sempre aciona o modal de upsell do combo em que ele está incluído — repetitivo
e potencialmente incômodo pro cliente quando o item é componente de um combo "genérico". Não é
bug (o comportamento de sugerir upsell é o esperado, definido no ORD-150), é uma lacuna de
configuração: falta uma forma de o admin mitigar esse efeito colateral sem remover o combo do ar.

## Explorer

### História
Como admin da empresa, quero ativar ou desativar a sugestão automática de upsell de um combo
específico, para evitar que o modal apareça repetidamente quando um dos itens do combo é um
produto muito vendido avulso, sem precisar desativar o combo inteiro.

### Contexto e motivação
O upsell (ORD-150) dispara sempre que QUALQUER produto componente de QUALQUER combo ativo é
adicionado sozinho ao carrinho — não existe hoje uma forma de restringir isso por combo. Um
combo com um item "comum" (refrigerante, batata frita) como componente acaba interrompendo a
compra desse item avulso toda vez, mesmo quando o cliente claramente só queria aquele item. A
única mitigação hoje é desativar o combo inteiro (`active: false`), o que também tira ele da
venda direta e do catálogo — solução desproporcional pro problema. O novo campo separa duas
decisões que hoje estão acopladas: "este combo está à venda" (`active`, já existe) e "este combo
deve ser oferecido como sugestão quando um componente é comprado avulso" (novo campo).

### Fluxo principal
1. Admin cria ou edita um combo no painel (`ComboFormScreen.tsx`).
2. Vê um novo controle (toggle/checkbox) "Sugerir este combo automaticamente" — marcado por
   padrão (mantém o comportamento atual pra combos existentes, sem regressão silenciosa).
3. Admin desmarca pra um combo específico (ex: o que tem refrigerante como componente) e salva.
4. No totem, cliente adiciona o refrigerante avulso ao carrinho — como esse combo tem a
   sugestão desativada, o modal de upsell não aparece mais pra esse item (a menos que o produto
   também seja componente de OUTRO combo com a sugestão ainda ativa).
5. O combo continua aparecendo normalmente no catálogo/categoria e pode ser comprado
   diretamente — só a sugestão automática ao comprar um componente avulso é afetada.

### Fluxos alternativos / exceções
- Produto é componente de múltiplos combos, alguns com sugestão ativa e outros não → só os
  combos com sugestão ativa entram na lista de candidatos a upsell (mantém a regra existente do
  ORD-150 de "oferece só o primeiro, ordenado por id" — mas agora filtrando antes por elegível).
- Produto é componente só de combos com sugestão desativada → nenhum modal de upsell aparece,
  produto é adicionado direto ao carrinho.
- Combo com sugestão desativada mas `active: true` → continua vendável, aparece no catálogo,
  só não é ofertado como upsell.
- Combo novo (criado do zero) → sugestão vem ativada por padrão.

### Dependências
- Serviços envolvidos: `catalog` (novo campo no modelo `Combo` + endpoints de criar/editar
  combo) e `frontend/admin` (`ComboFormScreen.tsx`) e `frontend/totem`
  (`CatalogScreen.tsx`, filtro em `handleAddProduct`).
- Sem histórias bloqueantes — é uma extensão do ORD-150/112, já em produção.

### Critérios de aceite funcionais
- [x] Cadastro de combo tem um controle pra ativar/desativar a sugestão automática de upsell,
      ligado por padrão.
- [x] Edição de combo existente permite alternar esse controle a qualquer momento.
- [x] Com a sugestão desativada, adicionar um produto componente avulso ao carrinho no totem
      NÃO aciona o modal de upsell desse combo.
- [x] Com a sugestão desativada, o combo continua aparecendo no catálogo/categoria normalmente e
      pode ser adicionado ao carrinho diretamente pelo próprio card do combo.
- [x] Produto componente de mais de um combo: só combos com sugestão ativa entram na disputa por
      qual é oferecido (coberto pela filtragem em `handleAddProduct`, revisão de código —
      ambiente de teste só tem 1 combo real hoje, não deu pra reproduzir múltiplos candidatos ao
      vivo).
- [x] Combos existentes (criados antes desta história) continuam se comportando como hoje
      (sugestão ativa) — migration com default `true`, sem regressão silenciosa.

### Wireframe / Mockup
N/A — reaproveita o padrão de toggle/checkbox já usado no formulário de combo (mesmo componente
de design-system usado em outros campos booleanos do admin).

## QA Explorer

```gherkin
Feature: Ativar/desativar sugestão automática de upsell por combo
  Como admin da empresa
  Quero ligar ou desligar a sugestão de upsell de um combo específico
  Para evitar que o modal apareça repetidamente ao comprar um item comum avulso

  Background:
    Dado um combo ativo "Combo Refri" com o produto "Refrigerante Lata" como componente

  Scenario: Combo novo vem com sugestão ativada por padrão
    Quando o admin cria um combo novo sem mexer no controle de sugestão
    Então o combo é salvo com a sugestão de upsell ativada

  Scenario: Admin desativa a sugestão de um combo existente
    Dado "Combo Refri" com sugestão de upsell ativada
    Quando o admin desmarca o controle de sugestão e salva
    Então o combo passa a ter a sugestão de upsell desativada
    E o combo continua com active: true

  Scenario: Upsell não aparece com a sugestão desativada
    Dado "Combo Refri" com sugestão de upsell desativada
    Quando o cliente no totem adiciona "Refrigerante Lata" avulso ao carrinho
    Então o modal de upsell não aparece
    E o produto é adicionado normalmente ao carrinho

  Scenario: Combo com sugestão desativada continua vendável diretamente
    Dado "Combo Refri" com sugestão de upsell desativada
    Quando o cliente navega até a categoria do combo no totem
    Então o card do "Combo Refri" aparece normalmente
    E o cliente consegue adicionar o combo direto ao carrinho pelo card

  Scenario: Upsell continua aparecendo quando a sugestão está ativada
    Dado "Combo Refri" com sugestão de upsell ativada
    Quando o cliente no totem adiciona "Refrigerante Lata" avulso ao carrinho
    Então o modal de upsell do "Combo Refri" aparece — comportamento inalterado do ORD-150

  Scenario: Produto componente de múltiplos combos — só os elegíveis disputam a sugestão
    Dado "Refrigerante Lata" é componente de "Combo Refri" (sugestão desativada) e de
    "Combo Lanche Grande" (sugestão ativada)
    Quando o cliente adiciona "Refrigerante Lata" avulso ao carrinho
    Então o modal de upsell oferece "Combo Lanche Grande"
    E "Combo Refri" não é considerado como candidato

  Scenario: Produto componente só de combos com sugestão desativada
    Dado "Refrigerante Lata" é componente apenas de combos com sugestão de upsell desativada
    Quando o cliente adiciona "Refrigerante Lata" avulso ao carrinho
    Então nenhum modal de upsell aparece
    E o produto é adicionado normalmente

  Scenario: Combos existentes antes da migration continuam sugerindo (sem regressão)
    Dado um combo criado antes desta história, sem o novo campo definido explicitamente
    Quando a migration roda
    Então esse combo passa a ter sugestão de upsell ativada (valor padrão)
    E o comportamento de upsell pra ele continua idêntico ao que era antes desta história

  Scenario: Isolamento multi-tenant
    Dado um combo da empresa A com sugestão de upsell desativada
    Quando a empresa B edita ou consulta seus próprios combos
    Então a configuração da empresa A não é visível nem afetada
```

**Cenários revisados e aprovados pelo PM:** sim — cobrem happy path (criar/editar com o toggle),
o efeito no totem em ambos os estados (ligado/desligado), a borda de múltiplos combos candidatos
(o cenário mais importante pra não regredir o ORD-150), a borda de "nenhum candidato elegível",
a migration não quebrar combos existentes, e isolamento multi-tenant.

## Solução Técnica

### Serviços impactados
- `catalog`: novo campo no modelo `Combo`, migration, `ComboIn`/`ComboOut`. Nenhum endpoint
  novo — reaproveita `POST /catalog/combos` e `PUT /catalog/combos/{id}` já existentes.
- `frontend/admin`: `ComboFormScreen.tsx` ganha o controle de toggle.
- `frontend/totem`: `CatalogScreen.tsx` (`handleAddProduct`) passa a filtrar por
  `upsell_enabled` antes de escolher o combo candidato; `types.ts` (admin e totem) ganham o
  campo no tipo `Combo`.

### Endpoints

Sem endpoint novo. Contrato alterado nos dois já existentes:

#### POST /catalog/combos (alterado)
**Serviço:** catalog-service
**Auth:** JWT obrigatório | role: admin/owner
**company_id:** extraído do JWT

Request (novo campo, opcional, default `true`):
```json
{
  "category_id": 2,
  "name": "Combo Clássico",
  "description": "...",
  "price": 29.9,
  "product_ids": [1000, 1026],
  "upsell_enabled": true
}
```

Response 201 (`ComboOut`, novo campo):
```json
{
  "id": 13,
  "...": "...",
  "upsell_enabled": true
}
```

#### PUT /catalog/combos/{combo_id} (alterado)
Mesma alteração de request/response do POST — `ComboIn` é compartilhado entre criar e editar
(replace completo), sem endpoint/rota nova.

Erros: inalterados (400 validação de produtos/preço, 404 não encontrado) — `upsell_enabled` não
participa de nenhuma validação cruzada, é só um booleano armazenado.

### Migrations
- Tabela `combos`: adicionar coluna `upsell_enabled` (`Boolean NOT NULL DEFAULT true`,
  `server_default="1"` pra combos já existentes virem `true` automaticamente na migration —
  garante o critério de não-regressão do QA Explorer sem precisar de UPDATE manual).

### Mudança de implementação

**Backend (`services/catalog/main.py`):**
```python
# Combo (model)
upsell_enabled = Column(Boolean, nullable=False, default=True)

# ComboIn
upsell_enabled: bool = True

# ComboOut
upsell_enabled: bool

# create_combo / update_combo — passar body.upsell_enabled ao construir/atualizar o Combo

# _serialize_combo — incluir "upsell_enabled": c.upsell_enabled no dict de retorno
```

**Admin (`ComboFormScreen.tsx`):** novo state `upsellEnabled` (default `true` pra combo novo,
carregado do combo existente na edição), um `Checkbox` do design-system perto dos outros campos
do formulário (ex: junto de nome/preço, não dentro do painel de imagem), incluído no payload de
criar/editar.

**Totem (`CatalogScreen.tsx`):**
```ts
function handleAddProduct(p: Product) {
  const combo = getQty(`product:${p.id}`) === 0
    ? combos.find((c) => c.upsell_enabled && c.items.some((i) => i.product_id === p.id))
    : undefined;
  if (combo) setUpsell({ combo, product: p });
  else addProductToCart(p);
}
```
Única mudança: acrescenta `c.upsell_enabled &&` na condição já existente — mantém a regra "só o
primeiro combo candidato, ordenado por id" (ORD-150), agora filtrando os não-candidatos antes.

### Eventos de fila
Nenhum.

### Impacto em outros serviços
Nenhum — `order-service` não lê `upsell_enabled` (o combo já é explodido em itens reais no
momento do pedido, independente desse campo, que só afeta a decisão de UI no totem).

### Estimativa
- Backend: 1 ponto (campo + migration + 2 endpoints já existentes).
- Admin: 1 ponto (1 checkbox + state + payload).
- Totem: 0,5 ponto (1 condição a mais no filtro já existente).

### Riscos
- **Confusão entre `active` e `upsell_enabled`** — dois toggles parecidos no mesmo formulário.
  Mitigado: rótulos claros ("Combo ativo" vs "Sugerir automaticamente ao comprar item avulso"),
  agrupados visualmente mas com texto de apoio explicando a diferença.
- **openapi.json e testes existentes de combo** (`test_combos.py`, `test_combo_imagem.py`)
  fazem POST/PUT com payload fixo — precisam continuar passando com o novo campo opcional
  (default `true`), sem quebrar os testes que não passam `upsell_enabled` explicitamente.

## Validação

- Migration `20260903_1500_combo_upsell_enabled.py` aplicada limpo (`server_default` cobre a
  linha existente sem UPDATE manual).
- Suíte automatizada do `catalog-service` em ambiente limpo (ver
  [[gotcha-teste-s3-endpoint-url-vaza]]): 182 passed, 0 failed — 178 já existentes + 4 novos
  testes do ORD-157 (`test_criar_combo_sem_especificar_upsell_vem_ativado_por_padrao`,
  `test_criar_combo_com_upsell_desativado_explicitamente`,
  `test_editar_combo_desativa_upsell_sem_afetar_active`,
  `test_editar_combo_sem_passar_upsell_volta_pro_default_true`).
- `ruff`/`mypy` em `main.py`: mesma contagem de ruff (130) antes/depois; mypy foi de 90 → 91,
  1 erro novo do mesmo padrão pré-existente (`Column[T]` vs `T` em atribuição), consistente com
  o resto do arquivo — sem dívida de tipo nova.
- Validação manual completa (admin → totem, 2026-09-03): editei "Combo Classic Cheddar" no
  admin, desmarquei "Sugerir este combo automaticamente no totem", salvei — confirmado via API
  que `upsell_enabled: false` persistiu e `active: true` não foi afetado. No totem, adicionar
  "Classic Cheddar Burger" avulso passou a adicionar direto ao carrinho, sem modal de upsell.
  Reverti a marcação (upsell ligado de novo) e confirmei que o modal volta a aparecer
  normalmente — comportamento simétrico nos dois estados, sem regressão do ORD-150.
