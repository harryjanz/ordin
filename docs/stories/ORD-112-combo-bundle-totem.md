---
id: ORD-112
status: Done
fase: 6
sprint: null
responsavel: Backend SR + Frontend
estimativa: 10 pontos (5 backend + 5 frontend admin)
tipo: feature
---

# ORD-112 — Cadastro de combo/bundle no admin

> **Desmembrada em 2026-09-01** a partir da história original "Combo/bundle no totem", que
> misturava cadastro (admin) e consumo (totem) — decisão do usuário pra permitir entregas
> menores e independentes. O backend inteiro fica aqui, já que é pré-requisito de qualquer
> consumo. A exibição do combo pro cliente final, o upsell e a explosão no pedido viraram
> **[[ORD-150]]**, que depende desta história estar pronta.

## User story
**Como** dono/gestor do estabelecimento cliente do Ordin,
**quero** cadastrar combos no catálogo (produtos existentes agrupados, com preço próprio),
**para** aumentar o ticket médio das vendas no totem — a mesma alavanca que concorrentes de mercado já usam.

## Contexto e motivação
Levantamento de PM/UX de 2026-08-21/22 (`docs/analise-dashboard-concorrentes-mercado.md`, `docs/estudo-design-system-totem.md`, `docs/analise-priorizacao-combo-modificadores.md`) identificou que combo/bundle é tratado por concorrentes (Goomer, entre outros) como alavanca central de receita no totem.

Este item já existia no backlog do Ordin desde 2026-08-07, adiado explicitamente pelo usuário junto com "modificadores/complementos" e "variantes de tamanho". Na reavaliação de 2026-08-22, combo/bundle subiu de prioridade por bater direto com o achado de concorrência.

**Por que esta história cobre só o cadastro:** dá pra entregar e validar o CRUD de combo no admin de forma independente, sem esperar o consumo no totem estar pronto — reduz o tamanho de cada entrega e permite QA/deploy incremental. Nenhum produto/valor muda de comportamento no totem enquanto só esta história estiver em produção; combos cadastrados aqui simplesmente não aparecem em lugar nenhum até [[ORD-150]] ser implementada.

## Fluxo principal
1. **Admin (Owner/Manager)** acessa Catálogo > Combos > Novo combo.
2. Busca produtos existentes por nome e/ou categoria, adiciona os que farão parte do combo
   (mínimo 2) — cada um sai da busca e entra numa lista separada "Produtos no combo", com opção
   de remover individualmente. Protótipo validado com o usuário em 2026-09-01 (ver Wireframe).
3. Define o preço do conjunto — o sistema calcula e exibe a soma dos itens avulsos e a economia
   automaticamente, sem o admin precisar calcular à mão.
4. Salva o combo — validação impede preço sem economia real (combo mais caro ou igual à soma
   dos avulsos).
5. Combo criado fica disponível para consulta via `GET /catalog/combos` — consumo real (totem)
   é responsabilidade de [[ORD-150]].

## Fluxos alternativos / exceções
- **Preço do combo maior ou igual à soma dos itens avulsos:** bloqueado no cadastro — achado da
  prototipagem, fechado como regra real nesta história (validado tanto no client quanto no
  backend).
- **Menos de 2 produtos selecionados:** bloqueado — um "combo" de 1 produto não é combo.
- Admin ativa/desativa um combo existente (mesmo padrão de Ativar/Desativar já usado em
  Category/Product/OptionGroup) — não afeta pedidos já feitos.
- Admin exclui definitivamente um combo — pedidos históricos não são afetados, porque já guardam
  nome/preço de cada produto congelados no momento da compra (nunca referenciam o combo).

## Critérios de aceite funcionais
- [ ] Admin consegue criar um combo escolhendo produtos existentes já cadastrados (busca por
      nome/categoria, não uma lista integral pra marcar) e definindo o preço do conjunto, com a
      economia calculada e exibida automaticamente
- [ ] Cadastro de combo impede salvar um combo com menos de 2 produtos componentes
- [ ] Cadastro de combo impede salvar um preço que resulte em economia zero ou negativa frente
      à soma dos itens avulsos
- [ ] Admin consegue editar um combo existente (nome, descrição, preço, produtos componentes)
- [ ] Admin consegue ativar/desativar um combo sem precisar reeditar o resto dos dados
- [ ] Admin consegue excluir definitivamente um combo, sem afetar nenhum pedido histórico
- [ ] Um produto de outra empresa nunca pode ser incluído num combo (isolamento multi-tenant)
- [ ] Admin de uma empresa não enxerga nem edita combo de outra empresa

## Dependências / impacto em outros serviços
- **catalog-service:** modelo de dado novo (`combos`, `combo_items`) e 5 endpoints novos —
  praticamente todo o trabalho de dado desta história fica aqui.
- **frontend/admin:** nova aba "Combos" em Catálogo + tela de formulário dedicada.
- Sem dependência de história em andamento. **[[ORD-150]] depende desta** (precisa do
  `GET /catalog/combos` existir e de combos reais cadastrados pra ter o que exibir/testar).

## Fora de escopo desta história
- Exibição do combo no catálogo do totem, oferta de upsell ao adicionar item avulso, e explosão
  do combo em itens do pedido — tudo isso é **[[ORD-150]]**.
- Modificadores/complementos e variantes de tamanho — sequenciados separadamente (ver
  `docs/analise-priorizacao-combo-modificadores.md`).
- Upload de imagem própria para o combo — nem o Explorer nem o protótipo pediram isso; se
  aparecer necessidade real, é uma extensão aditiva simples (`image_url` já existe como padrão
  em `Product`/`Category`), não retrabalho.

## Wireframe / Mockup
Protótipo clicável validado com o usuário em 2026-09-01 — parte de **cadastro do combo (admin)**:
busca de produtos componentes por nome/categoria, lista separada dos já adicionados com remoção
individual, preço do conjunto e economia calculada automaticamente, com aviso quando a economia
fica zerada/negativa. (A parte de fluxo do totem, também prototipada na mesma sessão, pertence
ao Wireframe de [[ORD-150]].)

Sem link permanente no repositório — protótipo vive como Artifact da sessão; screenshots podem
ser anexados aqui se necessário para referência futura.

---

## QA Explorer

```gherkin
Feature: Cadastro de combo/bundle no admin
  Como dono/gestor do estabelecimento
  Quero cadastrar combos agrupando produtos existentes com um preço próprio
  Para aumentar o ticket médio das vendas no totem

  Background:
    Dado que sou admin da empresa 1 (Burger House), autenticado com role "owner"
    E a empresa 1 tem os produtos "Cheeseburger Clássico" (R$ 24,90), "Batata Frita" (R$ 10,90)
      e "Refrigerante Lata" (R$ 6,90) cadastrados e ativos

  # ── Happy path ────────────────────────────────────────────────────────────

  Scenario: Criar um combo com economia calculada automaticamente
    Dado que estou em Catálogo > Combos > Novo combo
    Quando busco e adiciono "Cheeseburger Clássico", "Batata Frita" e "Refrigerante Lata" como
      componentes e defino o preço do combo em R$ 34,90
    Então o formulário exibe a soma dos itens avulsos (R$ 42,70) e a economia (R$ 7,80)
      calculadas automaticamente, sem eu precisar informar nenhum dos dois valores
    E consigo salvar o combo com sucesso

  Scenario: Buscar produto por nome mostra só resultados filtrados, não a lista inteira
    Dado que estou em Catálogo > Combos > Novo combo, sem nenhum produto adicionado ainda
    Quando digito "bacon" no campo de busca
    Então vejo só os produtos cujo nome contém "bacon"
    E não vejo a lista completa do catálogo

  Scenario: Produto já adicionado ao combo some da busca
    Dado que já adicionei "Cheeseburger Clássico" ao combo
    Quando busco por "cheeseburger" de novo
    Então "Cheeseburger Clássico" não aparece nos resultados
    E ele continua visível na lista separada "Produtos no combo"

  Scenario: Editar um combo existente
    Dado um combo "Combo Clássico" já cadastrado com 3 produtos e preço R$ 34,90
    Quando removo "Refrigerante Lata" e adiciono "Suco Natural" em seu lugar
    E salvo
    Então o combo passa a ter "Cheeseburger Clássico", "Batata Frita" e "Suco Natural"
    E a soma/economia exibidas refletem os novos componentes

  Scenario: Ativar e desativar um combo sem reeditar o resto
    Dado um combo "Combo Clássico" ativo
    Quando clico em "Desativar"
    Então o combo passa a aparecer como inativo na listagem
    E os dados (nome, preço, produtos) permanecem intactos
    Quando clico em "Ativar"
    Então o combo volta a ficar ativo

  Scenario: Excluir definitivamente um combo não afeta pedidos já feitos
    Dado um combo "Combo Clássico" que já foi vendido em pedidos anteriores
    Quando excluo definitivamente esse combo
    E consulto um pedido antigo que incluiu esse combo
    Então o pedido antigo continua mostrando os produtos e preços normalmente,
      sem nenhuma referência quebrada ao combo excluído

  # ── Bordas ────────────────────────────────────────────────────────────────

  Scenario: Cadastro trava quando o preço do combo não gera economia real
    Dado que estou criando um combo com "Cheeseburger Clássico", "Batata Frita" e
      "Refrigerante Lata" selecionados (soma R$ 42,70)
    Quando defino o preço do combo em R$ 42,70 ou mais
    Então o formulário mostra que não há economia (ou economia negativa)
    E o botão de salvar fica desabilitado até eu corrigir o preço

  Scenario: Cadastro trava com menos de 2 produtos componentes
    Dado que estou em Catálogo > Combos > Novo combo
    Quando adiciono só "Cheeseburger Clássico" e tento salvar
    Então vejo um erro exigindo pelo menos 2 produtos componentes
    E o combo não é criado

  # ── Erros ─────────────────────────────────────────────────────────────────

  Scenario: Não é possível salvar um combo sem nenhum produto componente selecionado
    Dado que estou em Catálogo > Combos > Novo combo, sem nenhum produto selecionado
    Quando tento salvar
    Então vejo um erro de validação exigindo produtos componentes
    E o combo não é criado

  Scenario: Não é possível incluir num combo um produto de outra empresa
    Dado um produto pertencente à empresa 2
    Quando um admin da empresa 1 tenta incluir esse produto num combo via chamada direta à API
    Então a resposta é 403 ou 404 (mesma semântica já usada em endpoints de catálogo)
    E o combo não é criado com esse componente

  # ── Isolamento multi-tenant ──────────────────────────────────────────────

  Scenario: Admin de uma empresa não enxerga combo de outra empresa
    Dado um combo pertencente à empresa 1
    Quando um admin da empresa 2 lista os combos
    Então esse combo não aparece na listagem

  Scenario: Admin de uma empresa não edita nem remove combo de outra empresa
    Dado um combo pertencente à empresa 1
    E um token de admin autenticado na empresa 2
    Quando esse token chama o endpoint de edição/remoção desse combo
    Então a resposta é 403 ou 404
    E o combo da empresa 1 permanece inalterado

  # ── Regressão ────────────────────────────────────────────────────────────

  Scenario: Catálogo de produtos e categorias continua funcionando normalmente
    Dado que a empresa 1 tem combos cadastrados
    Quando listo produtos e categorias normalmente (endpoints já existentes)
    Então o comportamento é exatamente o mesmo de antes desta história
```

**Cenários revisados e aprovados pelo PM.**

---

## Tech Explorer

### Correção de suposição do protótipo de UX
O protótipo validado com o usuário incluía um campo "Categoria de exibição" no cadastro do
combo — era cosmético, não corresponde a um requisito confirmado no Explorer/QA Explorer.
**Cortado do escopo real**: combos não têm `category_id` próprio. Onde e como o combo aparece
no catálogo do totem é responsabilidade de [[ORD-150]], não desta história.

**Segunda correção, feita ao desmembrar a história:** o modelo original desta Tech Explorer
incluía `image_url`/`thumbnail_url` em `Combo`, por paridade com `Product`/`Category` — mas nem
o Explorer, nem a QA Explorer, nem o protótipo pediram imagem própria para o combo. Campo
cortado do schema desta v1 (é uma extensão aditiva simples se aparecer necessidade real depois,
não retrabalho).

### Serviços impactados
- **catalog-service**: tabelas novas (`combos`, `combo_items`), 5 endpoints novos
- **frontend/admin**: nova aba "Combos" em `CatalogScreen.tsx`, novo `ComboFormScreen.tsx`
- **Nenhum impacto em order-service, payment-service ou frontend/totem** — esses só entram em
  [[ORD-150]]

### Modelo de dado (catalog-service)
Mesmo padrão de `OptionGroup`/`Option` já usado neste serviço: entidade-pai com `company_id`
direto+index, entidade de junção sem `company_id` próprio (isolamento via `JOIN`), `Column`
clássico (não `Mapped`/`mapped_column`, consistente com o resto do serviço).

```python
class Combo(Base):
    __tablename__ = "combos"
    id            = Column(Integer, primary_key=True)
    company_id    = Column(Integer, nullable=False, index=True)
    name          = Column(String(120), nullable=False)
    description   = Column(String(500))
    price         = Column(Numeric(10, 2), nullable=False)
    active        = Column(Boolean, nullable=False, default=True)
    deleted       = Column(Boolean, nullable=False, default=False)   # mesmo soft-delete duplo de Product/Category
    created_at    = Column(DateTime, default=datetime.utcnow)

class ComboItem(Base):
    __tablename__ = "combo_items"
    combo_id   = Column(Integer, ForeignKey("combos.id"), primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id"), primary_key=True)
```
Sem `sort_order` em `combo_items` nesta v1 — ordem de exibição segue a ordem de inserção; se
aparecer necessidade real de reordenar, entra depois como PATCH dedicado (mesmo padrão de
reorder já usado em outras listas do catálogo). Sem `quantity` em `combo_items` — 1 unidade de
cada componente por combo (nenhum cenário pediu "2x batata dentro do combo"; se aparecer, é
mudança de schema aditiva).

**Decisão que fecha um ponto em aberto do Explorer**: `deleted` (soft-delete irreversível, como
`Product`/`Category`) some o combo de toda consulta, mas mantém a linha no banco. Como pedidos
já feitos guardam `product_name`/`unit_price` congelados por componente (nunca referenciam
`combo_id` — ver achado técnico em [[ORD-150]]), **apagar um combo não afeta nenhum pedido
histórico**.

### Validações de cadastro (fecham pontos em aberto do Explorer)
- **Mínimo de 2 produtos componentes por combo.**
- **Preço do combo estritamente menor que a soma dos preços avulsos dos componentes** —
  validado no client (feedback imediato) e replicado no backend como fonte de verdade (400 se
  violar).
- **Todo `product_id` enviado precisa pertencer à empresa do usuário autenticado, estar `active`
  e não `deleted`** — 400/404 caso contrário, mesma semântica de erro já usada em vínculos N:N
  existentes (`_set_product_option_groups`).

### Endpoints (catalog-service)

#### GET /catalog/combos
**Auth:** JWT obrigatório, qualquer role (kiosk inclusive — [[ORD-150]] é quem mais vai chamar)
**Query:** `include_inactive: bool = false` — só tem efeito se o role for admin/owner/manager;
kiosk sempre recebe só `active=True, deleted=False`, mesma lógica já usada em
`/catalog/products`.

Response 200:
```json
{
  "combos": [
    {
      "id": 5,
      "name": "Combo Clássico",
      "description": "Cheeseburger Clássico, Batata Frita e Refrigerante Lata por um preço só.",
      "price": 34.90,
      "active": true,
      "items": [
        {"product_id": 12, "name": "Cheeseburger Clássico", "price": 24.90},
        {"product_id": 15, "name": "Batata Frita", "price": 10.90},
        {"product_id": 20, "name": "Refrigerante Lata", "price": 6.90}
      ]
    }
  ]
}
```
`items` vem denormalizado (nome/preço do produto no momento da consulta, via `JOIN` com
`products`) — mesmo padrão já usado pra `option_groups` aninhado dentro de `ProductOut`. Formato
pensado para [[ORD-150]] conseguir renderizar o card do combo e checar sobreposição sem
nenhuma chamada extra.

#### POST /catalog/combos — criar
**Auth:** admin/owner/manager
Request:
```json
{ "name": "Combo Clássico", "description": "...", "price": 34.90, "product_ids": [12, 15, 20] }
```
Response 201: mesmo formato de item de `GET /catalog/combos`.
Erros: `400` (menos de 2 produtos, preço sem economia real, produto duplicado na lista), `404`
(algum `product_id` não existe/não é da empresa)

#### PUT /catalog/combos/{combo_id} — editar (replace completo)
Mesmo request/validações do POST — substitui nome/descrição/preço e a lista inteira de
`product_ids`, mesmo padrão de replace completo já usado em `_set_product_option_groups`.

#### PATCH /catalog/combos/{combo_id} — ativar/desativar
Request: `{"active": bool}` — mesma ação rápida já existente pra Category/Product/OptionGroup.

#### DELETE /catalog/combos/{combo_id} — exclusão definitiva
Marca `deleted=true` (soft-delete, nunca reaparece em nenhuma consulta) — mesmo padrão de
"Exclusão definitiva" já usado em `Product`/`Category`.

Erros comuns aos 4 endpoints de escrita: `403` (role insuficiente), `404` (combo de outra
empresa ou inexistente — mesma semântica de não vazar existência já usada no resto do catálogo)

### Migration
```python
"""ORD-112: cadastro de combo/bundle no admin — modelo de dados (combos,
combo_items). Só o CRUD nesta história — consumo no totem (exibição,
upsell, explosão em OrderItem/discount no pedido) é ORD-150.
"""
def upgrade() -> None:
    op.create_table("combos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), nullable=False, index=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("price", sa.Numeric(10, 2), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_table("combo_items",
        sa.Column("combo_id", sa.Integer(), sa.ForeignKey("combos.id"), primary_key=True),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), primary_key=True),
    )

def downgrade() -> None:
    op.drop_table("combo_items")
    op.drop_table("combos")
```

### Eventos de fila
Não aplicável — mesmo raciocínio do ORD-146 (CRUD de catálogo, sem consumidor assíncrono).

### Frontend (`frontend/admin`)
Mesmo padrão de rota/tela dedicada já usado por `OptionGroupFormScreen`/`MenuFormScreen`: nova
aba "Combos" em `CatalogScreen.tsx` (`Table` com colunas Nome/Produtos/Preço/Economia/Status/
Ações, botão "+ Novo combo"), rotas `/catalog/combos/new` e `/catalog/combos/:id/edit`
apontando pro novo `ComboFormScreen.tsx`.

`ComboFormScreen.tsx` implementa a UX validada no protótipo desta sessão — busca por nome +
categoria (`InputBase` + `Dropdown`, componentes do design system já usados no resto do admin),
resultados filtrados excluindo produtos já adicionados, lista separada "Produtos no combo" com
remoção individual, e resumo com soma/economia recalculado a cada mudança, bloqueando "Salvar"
quando a economia fica zero ou negativa (mesma validação do backend, replicada no client pra
feedback imediato). Save dispara `POST`/`PUT /catalog/combos` com a lista completa de
`product_ids` (replace completo, mesmo padrão do resto do catalog-service).

### Impacto em outros serviços
Nenhum — `order-service`, `payment-service` e `frontend/totem` não são tocados por esta
história. `catalog-service` ganha 2 tabelas e 5 endpoints novos, isolados dos demais.

### Estimativa
- Backend (catalog-service): 5 pontos (2 tabelas, migration, 5 endpoints, validações de
  negócio: mínimo de componentes, economia real, isolamento multi-tenant dos `product_ids`)
- Frontend admin: 5 pontos (aba nova + `ComboFormScreen` com busca/adicionar/remover e
  validação ao vivo, replicando a UX já validada no protótipo)
- **Total: 10 pontos**

### Riscos
- Sem riscos técnicos relevantes além dos já mitigados nas validações acima — escopo é CRUD
  isolado, seguindo padrões já estabelecidos no catalog-service (`OptionGroup`/`Option`).
- Sem conflito com `docs/ARQUITETURA.md` — `company_id` sempre do JWT, nenhuma credencial nova,
  Clean Architecture não se aplica ainda ao catalog-service (ainda é `main.py` monolítico,
  mesmo estado do resto do serviço hoje).

---

## Próximos passos
Tech Explorer fechado em 2026-09-01 — aguardando revisão do usuário antes de avançar pro
**Ready**. [[ORD-150]] segue em paralelo, com Tech Explorer próprio já escrito, mas bloqueada
por esta história até o `GET /catalog/combos` existir de verdade.

---

## Ready

### Checklist de entrada

**Explorer (PM + Produto)**
- [x] História no formato Como/Quero/Para
- [x] Contexto e motivação documentados (concorrência + desmembramento de escopo do totem)
- [x] Fluxo principal passo a passo
- [x] Dependências identificadas (nenhuma bloqueante; [[ORD-150]] depende desta)
- [x] Wireframe descrito (protótipo validado, parte de cadastro no admin)
- [x] Critérios de aceite funcionais escritos

**QA Explorer (QA)**
- [x] Happy path em Gherkin (criar combo, buscar produto, editar, ativar/desativar, excluir)
- [x] Cenários de borda (preço sem economia, menos de 2 produtos)
- [x] Cenários de erro (sem produto selecionado, produto de outra empresa)
- [x] Cenário de isolamento multi-tenant incluído
- [x] Cenário de regressão (catálogo de produtos/categorias inalterado)
- [x] Cenários aprovados pelo PM

**Tech Explorer (Backend + Frontend)**
- [x] Serviços impactados documentados (catalog-service, frontend/admin)
- [x] Endpoints documentados (5, request/response/erros)
- [x] Migration descrita (`combos`, `combo_items`)
- [x] Eventos de fila: N/A
- [x] Estimativa definida (10 pontos: 5 backend + 5 admin)
- [x] Riscos identificados (nenhum relevante além das validações já mitigadas)
- [x] Duas correções de escopo feitas ao desmembrar (cortado "Categoria de exibição" cosmético
      e `image_url`/`thumbnail_url` sem requisito confirmado)

**Aprovação final**
- [x] Time (usuário) aprovou avançar pra implementação — "implemente a 112" (2026-09-01)
- [x] Estimativa acordada (10 pontos)
- [x] Sem bloqueios não resolvidos
- [x] Priorização aprovada para implementação imediata

**Status: Ready** — apta para implementação.

---

## Done

Implementado em `feature/ord-112-combo-cadastro-admin` (catalog-service: modelos `Combo`/
`ComboItem`, migrations `20260902_1300_combos` e `20260902_1400_combo_category`, 5 endpoints;
frontend/admin: aba "Combos" em `CatalogScreen.tsx` + `ComboFormScreen.tsx` com busca por nome/
categoria). Suíte de testes: 147/147 passando (19 testes novos cobrindo o QA Explorer; 4 falhas
pré-existentes confirmadas idênticas ao baseline de `main` via comparação por `git stash`).

**Correção pós-implementação (2026-09-02):** `category_id` foi adicionado ao combo depois do QA
manual — usuário apontou que vincular o combo a uma categoria já estava planejado e tinha sido
cortado por engano na Tech Explorer original (confundido com o campo cosmético "Categoria de
exibição" do protótipo). Adicionado como campo opcional (`Optional[int]`, mesmo padrão de
`Product.category_id`), com validação de pertencimento à empresa, migration própria, dropdown
no formulário e coluna na listagem.

**QA manual em ambiente real, ciclo completo testado no navegador (2026-09-02):** criar combo
(busca por nome funcionando, produto some da busca ao ser adicionado, economia calculada ao
vivo), salvar, desativar, ativar, excluir definitivamente — todos os passos confirmados
funcionando contra o banco de dev real.

**Bug encontrado e corrigido durante o teste manual:** o layout de busca (`InputBase` ao lado de
`Dropdown` em flexbox `flex: 1`) colapsava o campo de texto a quase zero de largura, porque
`Dropdown`/`InputBase` têm `width: 100%` no próprio root — isso faz o flex-basis efetivo virar
100% do container, engolindo o espaço do irmão. Corrigido trocando pra `display: grid` (mesmo
padrão já usado em `.filterBar` no resto do catálogo), que não sofre desse problema.

**Status: Done.**
