---
id: ORD-167
status: Tech Explorer
fase: 6
sprint: null
responsavel: Backend SR + Frontend
---

# ORD-167 — Visualizar tabela de preço não editável (dados + empresas vinculadas)

## Descrição
Na tela de Tabelas de Preço do admin (`PriceTableListScreen.tsx`), quando uma tabela já foi
usada por alguma empresa (`editable=false`, regra fechada na ORD-165) o botão "Editar" some da
linha — e não existe nenhuma alternativa pra consultar a configuração daquela tabela. Hoje é
impossível ver preço do 1º/2º/3º-5º totem, faixas de transação ou quais empresas estão
vinculadas a uma tabela não editável, mesmo sem querer alterá-la. A proposta é dar uma forma de
**visualização somente-leitura** (o formato exato — modal ou reaproveitar a tela dedicada em modo
leitura — fica pro Explorer/Tech Explorer decidirem), mostrando tanto a configuração completa da
tabela quanto a lista de empresas vinculadas a ela (hoje só existe a contagem
`linked_companies_count`, não os nomes).

## Persona
**Admin / Super Admin** — administram o catálogo comercial de tabelas de preço e precisam
conferir a configuração de uma tabela já em uso (ex.: pra decidir se duplicam antes de editar, ou
pra saber quais empresas seriam afetadas por uma mudança).

## Contexto
Levantado pelo próprio usuário usando a tela: a regra de "tabela usada não é editável" (ORD-165)
já está correta e não deve mudar, mas o efeito colateral de esconder o botão "Editar" também
escondeu qualquer jeito de **ver** os dados — usuário explicitamente não quer poder editar,
só visualizar. Achado técnico já confirmado nesta sessão: `PriceTableFormScreen.tsx` já tem um
estado `readOnly` (usado hoje só quando alguém chega direto por link/engano, sem essa proteção
vir da lista) — parte da solução pode já existir, faltando só o ponto de entrada. O backend
(`PriceTableOut`/`PriceTableSummaryOut` em `services/company/main.py`) só expõe
`linked_companies_count: int`, não a lista de nomes — precisa de dado novo.

## Explorer

### História
Como **Admin/Super Admin**, quero visualizar a configuração completa de uma tabela de preço já
em uso e a lista de empresas vinculadas a ela, para conferir os dados e avaliar impacto antes de
decidir duplicar ou trocar a tabela de uma empresa — sem precisar (nem poder) editá-la.

### Decisão de UI: reaproveitar `PriceTableFormScreen`, não criar modal novo
O usuário deixou o formato em aberto ("pode ser até modal... o importante é ter uma forma de
visualizar"). Decisão do Explorer: **reaproveitar a tela dedicada já existente**
(`/commercial/price-tables/{id}/edit`), não construir um modal do zero. Motivos:
- `PriceTableFormScreen.tsx` **já tem** um estado `readOnly` (`!t.editable`) que desabilita todos
  os campos e esconde o botão "Salvar" — construído na ORD-162, hoje só alcançável se alguém
  navegar pra lá manualmente (ex.: digitando a URL), nunca pela lista. Falta só o ponto de
  entrada, não o comportamento.
- É o mesmo padrão já validado nesta sessão pra `PromotionFormScreen.tsx` (ORD-166): tela única
  que alterna entre editável/somente-leitura, título muda ("Editar promoção" → com tag de
  status), sem duplicar layout em dois lugares.
- Um modal novo precisaria replicar toda a estrutura visual da tabela (nome, 3 preços de totem,
  N faixas de transação) só pra virar uma segunda fonte de manutenção do mesmo layout.

Mudança mínima na lista: quando `!t.editable`, mostrar um botão **"Ver"** no lugar de "Editar"
(mesma posição, mesma rota, mesmo componente — só o texto/verbo muda). Na tela dedicada, quando
`readOnly`, o `<h1>` passa a ser "Ver tabela de preço" em vez de "Editar tabela de preço"
(paralelo ao "Editar promoção — *Ativa*" já implementado na ORD-166).

### Fluxo principal
1. Admin abre `/commercial/price-tables` — tabela com `editable=false` mostra botão **"Ver"** no
   lugar de "Editar".
2. Admin clica "Ver" → navega pra `/commercial/price-tables/{id}/edit` (mesma rota de sempre).
3. Tela carrega em modo somente-leitura (`readOnly=true`, já existente): nome, preços de totem,
   faixas de transação, tudo desabilitado, sem botão "Salvar".
4. Nova seção **"Empresas vinculadas"** lista o nome de cada empresa usando essa tabela agora
   (não só a contagem que já existia).
5. Admin sai pelo botão "Voltar" (já existente) — nenhuma escrita acontece em nenhum momento
   desse fluxo.

### Fluxos alternativos / exceções
- **Tabela sem nenhuma empresa vinculada, mas ainda não editável** (já usada no passado, ver
  regra "editable grudento" da ORD-165) — seção "Empresas vinculadas" mostra estado vazio
  explicando isso ("Nenhuma empresa usa esta tabela agora, mas ela já foi usada — por isso
  continua bloqueada pra edição"), não trata como erro.
- **Tabela com `editable=true`** — comportamento não muda em nada: continua mostrando "Editar",
  formulário editável, sem a seção de empresas vinculadas (ela só faz sentido pra justificar o
  bloqueio de edição).

### Dependências
- **company-service**: `PriceTableOut` (endpoint de detalhe, usado pelo `PriceTableFormScreen`)
  precisa passar a incluir a lista de empresas vinculadas (id + nome), não só a contagem. Join
  simples `CompanyPlan.company_id` → `Company.id`/`Company.name`, mesmo serviço, sem chamada
  externa.
- **frontend/admin**: `PriceTableListScreen.tsx` (trocar "Editar" por "Ver" condicional) e
  `PriceTableFormScreen.tsx` (título dinâmico + nova seção de empresas vinculadas).
- **Histórias bloqueantes**: nenhuma — depende só de dado já existente (`CompanyPlan`), sem
  mudança de schema.

### Critérios de aceite funcionais
- [ ] Tabela com `editable=false` mostra botão "Ver" (não "Editar") na listagem
- [ ] Clicar em "Ver" abre a mesma tela de edição, em modo somente-leitura (campos desabilitados,
      sem botão "Salvar") — comportamento que já existe, só faltava o link
- [ ] Título da tela reflete o modo somente-leitura (ex.: "Ver tabela de preço")
- [ ] Tela mostra a lista de nomes das empresas vinculadas àquela tabela, não só a contagem
- [ ] Tabela sem empresa vinculada agora (mas não editável por já ter sido usada) mostra estado
      vazio explicativo, não erro
- [ ] Tabela com `editable=true` continua com o comportamento atual, sem nenhuma mudança visível

### Wireframe / Mockup
**Faltando** — é mudança de UI (botão novo na lista + seção nova na tela dedicada), mesmo sendo
pequena. Recomendo produzir um wireframe simples no QA Explorer ou logo antes dele, focado só na
nova seção "Empresas vinculadas" (o resto da tela já existe e não muda visualmente).

## QA Explorer

### Sobre isolamento multi-tenant nesta história
`PriceTable` **não é dado de empresa cliente** — é o catálogo comercial da própria plataforma
Ordin (o que o Ordin cobra da empresa), administrado só por `superadmin`/`admin`. Não existe
"empresa A vê tabela de empresa B" porque tabela não pertence a empresa nenhuma. O equivalente
de isolamento aqui é **por role da plataforma**: `owner`/`manager` (equipe da empresa cliente)
não deveriam nunca acessar esse endpoint — e isso **já está implementado** hoje
(`_require_platform_admin` no backend, rota ausente do array de role no frontend). Registrado
abaixo como cenário de regressão (confirmar que a mudança desta história não afrouxa esse
controle), não como requisito novo.

### Cenários Gherkin

```gherkin
Feature: Visualizar tabela de preço não editável
  Como Admin/Super Admin
  Quero visualizar a configuração e as empresas vinculadas de uma tabela já em uso
  Para conferir os dados e avaliar impacto sem poder editá-la

  Background:
    Dado que o admin está autenticado com role "superadmin" ou "admin"

  # --- Happy path ---

  Scenario: Ver tabela não editável com empresas vinculadas
    Dado uma tabela de preço "Tabela 2026-Q4" com editable=false
    E as empresas "Burger House" e "Pasta & Co" vinculadas a ela agora
    Quando o admin abre a listagem de tabelas de preço
    Então a linha da "Tabela 2026-Q4" mostra o botão "Ver" (não "Editar")
    Quando o admin clica em "Ver"
    Então a tela abre em `/commercial/price-tables/{id}/edit` no modo somente-leitura
    E o título é "Ver tabela de preço"
    E todos os campos (nome, preços de totem, faixas de transação) aparecem preenchidos e desabilitados
    E não há botão "Salvar"
    E a seção "Empresas vinculadas" lista "Burger House" e "Pasta & Co"

  # --- Bordas ---

  Scenario: Tabela não editável sem nenhuma empresa vinculada agora
    Dado uma tabela de preço "Tabela Antiga" com editable=false
    E nenhuma empresa vinculada a ela no momento (foi usada no passado, "editable grudento" da ORD-165)
    Quando o admin abre a tela de visualização dessa tabela
    Então a seção "Empresas vinculadas" mostra um estado vazio explicativo
    E não é tratado como erro

  Scenario: Tabela editável continua com o comportamento atual, sem mudança
    Dado uma tabela de preço "Tabela Rascunho" com editable=true
    Quando o admin abre a listagem de tabelas de preço
    Então a linha da "Tabela Rascunho" mostra o botão "Editar" (não "Ver")
    Quando o admin clica em "Editar"
    Então a tela abre em modo de edição normal, com botão "Salvar" disponível
    E a seção "Empresas vinculadas" não aparece

  Scenario: Tabela não editável com muitas empresas vinculadas
    Dado uma tabela de preço "Tabela Padrão" com editable=false
    E 15 empresas vinculadas a ela agora
    Quando o admin abre a tela de visualização dessa tabela
    Então as 15 empresas aparecem listadas de forma legível, sem quebrar o layout da tela

  # --- Erros / regressão de controle de acesso já existente ---

  Scenario: Owner/manager não acessa o detalhe de uma tabela de preço
    Dado um usuário autenticado com role "owner" ou "manager"
    Quando esse usuário tenta acessar `GET /commercial/price-tables/{id}` diretamente
    Então o sistema retorna 403
    E nenhum dado da tabela (preços, faixas, empresas vinculadas) é exposto

  Scenario: Tentativa de salvar uma tabela não editável continua bloqueada
    Dado uma tabela de preço com editable=false
    Quando alguém tenta `PUT /commercial/price-tables/{id}` mesmo assim (fora da UI, ex. via API direta)
    Então o sistema rejeita a alteração (comportamento já existente da ORD-162, não regride com esta história)
```

### Critérios de aceite testáveis
- [ ] Listagem mostra "Ver" quando `editable=false` e "Editar" quando `editable=true`, nunca os dois
- [ ] Botão "Ver" navega pra mesma rota de edição, renderizada em modo somente-leitura
- [ ] Título da tela muda pra "Ver tabela de preço" no modo somente-leitura
- [ ] Todos os campos existentes (nome, preços, faixas) aparecem preenchidos e desabilitados no modo somente-leitura
- [ ] Nenhum botão "Salvar" aparece no modo somente-leitura
- [ ] Seção "Empresas vinculadas" lista os nomes reais das empresas com `CompanyPlan` apontando pra essa tabela agora
- [ ] Tabela sem empresa vinculada agora (mas não editável) mostra estado vazio, não erro
- [ ] Seção "Empresas vinculadas" não aparece quando a tabela é editável
- [ ] `owner`/`manager` continuam recebendo 403 ao tentar acessar o detalhe de uma tabela de preço (regressão, controle já existente)
- [ ] `PUT` numa tabela não editável continua rejeitado (regressão, controle já existente da ORD-162)

### O que ainda impede o avanço pro Tech Explorer
Nada bloqueante pros cenários de comportamento — todos foram derivados de regras já decididas no
Explorer. Segue pendente, carregado do Explorer: **falta o wireframe** da nova seção "Empresas
vinculadas" (layout exato — lista simples, tabela, chips — ainda não definido). Não impede
escrever os testes de dado/comportamento acima, mas impede fechar 100% a especificação visual
antes do Tech Explorer.

## Tech Explorer

### Serviços impactados
- **company-service**: `_serialize_price_table` passa a incluir a lista de empresas vinculadas
  (não só a contagem) via join simples com `Company`, sem chamada externa. Nenhum schema de
  banco muda.
- **frontend/admin**: `PriceTableListScreen.tsx` (botão único "Editar"/"Ver" condicional) e
  `PriceTableFormScreen.tsx` (título dinâmico + seção nova de empresas vinculadas).

### Endpoint alterado (aditivo, sem quebrar contrato existente)

#### `GET /commercial/price-tables/{price_table_id}` (já existe)
**Serviço:** company-service · **Auth:** JWT · role `superadmin`/`admin` (`_require_platform_admin`, já implementado)

Response 200 (campo novo em negrito):
```json
{
  "id": 3,
  "name": "Tabela 2026-Q4",
  "status": "active",
  "editable": false,
  "linked_companies_count": 2,
  "linked_companies": [
    { "id": 1, "name": "Burger House" },
    { "id": 7, "name": "Pasta & Co" }
  ]
}
```
`linked_companies_count` continua existindo (usado hoje pela listagem) — `linked_companies` é
aditivo. `GET /commercial/price-tables` (listagem) **não muda** — a lista de nomes só é
necessária na tela de detalhe/visualização, manter a listagem só com a contagem evita N+1 joins
numa tela que já lista várias tabelas de uma vez.

Como `_serialize_price_table` é reaproveitada por `POST`/`PUT`/`activate`/`kind` também, todos
esses endpoints passam a devolver `linked_companies` de brinde — inofensivo (lista vazia pra
tabela recém-criada/editável), não exige tratamento especial.

### Mudança no backend

```python
async def _get_price_table_linked_companies(db: AsyncSession, price_table_id: int) -> list[dict]:
    """Nomes das empresas com CompanyPlan apontando pra essa tabela agora —
    complementa _count_price_table_companies (que já existe e continua sendo
    usado pela listagem, sem esta query extra)."""
    result = await db.execute(
        select(Company.id, Company.name)
        .join(CompanyPlan, CompanyPlan.company_id == Company.id)
        .where(CompanyPlan.price_table_id == price_table_id)
        .order_by(Company.name)
    )
    return [{"id": cid, "name": name} for cid, name in result.all()]
```
Chamada dentro de `_serialize_price_table`, adicionando `"linked_companies": await
_get_price_table_linked_companies(db, pt.id)` ao dict retornado. Schema `PriceTableOut` ganha
`linked_companies: list[LinkedCompanyOut] = []` (novo `LinkedCompanyOut(BaseModel): id: int;
name: str`). `PriceTableSummaryOut` (usado só pela listagem) **não muda**.

### Mudança no frontend

**`PriceTableListScreen.tsx`** — substitui o bloco condicional `{t.editable && <Button>Editar</Button>}`
por um botão único, sempre visível, com rótulo condicional:
```tsx
<Button size="small" variant="secondary" onClick={(e) => { e.stopPropagation(); navigate(`/commercial/price-tables/${t.id}/edit`); }}>
  {t.editable ? "Editar" : "Ver"}
</Button>
```
O botão "Excluir" (linha 189-193 hoje) continua gated só por `t.editable`, sem mudança — excluir
uma tabela em uso continua impossível, só a visualização muda.

**`PriceTableFormScreen.tsx`**:
- Título: `editingId === null ? "Nova tabela de preço" : readOnly ? "Ver tabela de preço" : "Editar tabela de preço"`.
- Novo estado `linkedCompanies` (setado em `load()` a partir de `t.linked_companies`).
- Nova seção, renderizada só quando `readOnly`, reaproveitando as mesmas classes genéricas de
  "lista de itens" já usadas em `ComboFormScreen.module.scss`/`PromotionFormScreen.tsx`
  (`comboItemsBox`/`comboItemRow`) — sem CSS novo: uma linha por empresa, só o nome (sem ação,
  é somente leitura). Lista vazia mostra o texto explicativo definido no QA Explorer ("Nenhuma
  empresa usa esta tabela agora, mas ela já foi usada — por isso continua bloqueada pra edição").

**`types.ts`**: `PriceTable`/`PriceTableSummary` ganham `linked_companies: { id: number; name: string }[]`.

### Migrations
Nenhuma — `Company` e `CompanyPlan` já existem, join simples dentro do mesmo serviço.

### Eventos de fila
Nenhum.

### Impacto em outros serviços
Nenhum — tudo dentro do company-service, sem chamada a outro serviço.

### Estimativa
- Backend: **~0,5 ponto** — uma função nova + um campo de schema.
- Frontend: **~1 ponto** — consolidar botão Editar/Ver, título dinâmico, seção nova reaproveitando
  classes existentes.
- **Total: ~1,5 ponto.**

### Riscos
1. **Sem wireframe da seção nova** (pendência carregada do QA Explorer) — mitigado reaproveitando
   um componente visual já existente (`comboItemsBox`/`comboItemRow`) em vez de desenhar algo do
   zero; risco baixo porque é só leitura, sem interação a acertar. Vale testar no navegador antes
   de considerar pronto (mesma lição da ORD-166: bug de texto só apareceu no teste visual).
2. **Consolidar o botão Editar/Ver** é uma mudança na mesma linha de código que hoje tem
   `stopPropagation` — atenção pra não perder esse detalhe (evita que o clique no botão também
   dispare o clique da linha, se houver).

### O que ainda impede o avanço pro Ready
Nada bloqueante. Todos os itens do critério de saída do Tech Explorer estão cobertos. Wireframe
segue como débito de UI de baixo risco, não como bloqueio — decisão do usuário de seguir o fluxo.
