---
id: ORD-084
status: Ready
fase: 6
sprint: null
responsavel: Backend + Frontend
estimativa: 5 pontos
---

# ORD-084 — Empresas: mesmo padrão visual/UX de listagem que Transações e Pedidos

## Descrição
Pedido direto do usuário: `/companies` (`CompanyListScreen.tsx`) é a **primeira** tela de listagem do admin (existe desde o ORD-062, bem antes da Fase 6) e nunca foi revisitada com o padrão que Transações ([[ORD-077]]–[[ORD-080]]) e Pedidos ([[ORD-081]]) estabeleceram nesta semana. O usuário quer padronizar **todas** as telas de listagem do admin nesse mesmo formato — tabela, filtros, inputs e paginação — e pediu para começar por `/companies`.

Diferente do ORD-081 (Pedidos), aqui não há endpoint quebrado nem bypass de RBAC faltando — `list_companies` já é `_require_platform_admin`-only (só superadmin/admin acessam a tela, não existe caso multi-tenant a corrigir). O gap é puramente de **UI/UX**: componentes certos (`Table` sem `variant="compact"`, paginação manual em vez do `Pagination` do design system) e ausência dos filtros/recursos que Transações e Pedidos já ganharam.

## Persona
**Superadmin/admin** (únicos que acessam `/companies` — `owner`/`manager`/`cashier` não têm essa rota no menu, ver matriz de RBAC desta sessão). É a tela onde a Ordin gerencia a carteira de clientes da plataforma: localizar um cliente específico, acompanhar status de contrato, e (com o crescimento da base) entender a distribuição de clientes por situação cadastral/contratual.

## Contexto

### Achado 1 — tabela não usa `variant="compact"`
`CompanyListScreen.tsx:170-191` usa `<Table columns={columns} rows={companies} ... />` sem o `variant="compact"` que Transações e Pedidos usam. Mesmo componente compartilhado (`components/Table.tsx`), só falta a prop — risco de implementação baixíssimo.

### Achado 2 — paginação manual, não o componente `Pagination` do design system
`CompanyListScreen.tsx:192-199` reimplementa Anterior/Próxima com dois `Button` e texto "Página X de Y" cru. Transações e Pedidos usam `<Pagination activePage={page} itemsPerPage={LIMIT} totalItemsCount={total} onChange={...} />` do design system desde o ORD-077 (pedido explícito do usuário na época: "para a paginação sempre usar o componente pagination do design system").

### Achado 3 — grid do filtro em proporções fixas, não o padrão `minmax` já corrigido em Pedidos
`CompanyListScreen.module.scss:31` usa `grid-template-columns: 2fr 1.3fr 1fr auto` — Transações usa `1.3fr 1fr 1fr 1fr 1fr 1fr auto`, Pedidos usa `repeat(auto-fill, minmax(180px, 1fr))` (ajustado nesta sessão depois de um bug relatado ao vivo de texto de data cortado). Só 3 campos hoje em Empresas, então o problema visual concreto do Pedidos (8 campos espremidos) não se repete ainda — mas com o filtro de período novo (Achado 5) o grid fixo `2fr 1.3fr 1fr` não escala bem. Direção: migrar para `repeat(auto-fill, minmax(180px, 1fr))`, mesmo padrão de Pedidos, já preparado para o campo novo.

### Achado 4 — coluna "Situação Receita" existe mas não é filtrável
A tabela mostra a tag "Ativa"/"Não verificada" (`cadastral_status`), mas não há filtro para esse campo — só dá pra ver, não pra segmentar. Confirmei ao vivo (query direta no MySQL, `company-service`) que hoje só existem dois valores em uso: `NULL`/`NAO_VERIFICADA` (2 empresas) e nenhuma com `ATIVA` ainda no seed atual, `assinado` (1) e `pendente` (2) para `contract_status`. O backend só grava dois valores possíveis nesse campo (`ATIVA` ou `NAO_VERIFICADA` — `services/company/main.py:737-754`, confirmado lendo `create_company`), então o filtro seria simples (2 opções + "Todas"), sem necessidade de suportar um enum maior (`BAIXADA`/`SUSPENSA`/etc. que a Receita Federal pode retornar não chegam a ser persistidos hoje — o cadastro é bloqueado com 422 antes disso).

### Achado 5 — sem filtro de período de cadastro
"Cadastrado em" é uma coluna da tabela, mas não é filtrável — Transações e Pedidos têm filtro De/Até. Útil para responder "quantos clientes entraram este mês", um comportamento comum de gestão de carteira.

### Achado 6 — `created_at` nulo nas 3 empresas seed atuais
Confirmado ao vivo: as 3 empresas de desenvolvimento (Burger House, Pasta & Co, Sweet Corner) têm `created_at = NULL` — foram inseridas via `init.sql` (SQL direto), que não passa pelo `default=datetime.utcnow` do SQLAlchemy (`services/company/main.py:91`). Não é um bug do código de criação — qualquer empresa criada via `POST /companies` (fluxo real) recebe `created_at` normalmente. É só uma característica do seed de dev que faz o filtro de período não ter dado nenhum pra testar localmente sem criar uma empresa nova primeiro. Documentado aqui para não ser confundido com bug durante o QA.

### Achado 7 — sem `ORDER BY` explícito em `list_companies`
`services/company/main.py:698-721` monta a query sem `.order_by()` — a ordem de retorno depende da ordem física/índice do MySQL, não é garantida. Comparado a Transações/Pedidos, que também não ordenam explicitamente hoje (mesma lacuna, não é regressão desta história) — mas como esta história já mexe no endpoint para adicionar filtros, vale corrigir aqui: `order_by(Company.created_at.desc())` (mais recente primeiro, mesma expectativa intuitiva de qualquer listagem administrativa). Baixo risco, decisão técnica direta — não depende de aprovação de produto.

### Por que não apareceu antes
`/companies` foi a primeira tela de listagem construída no projeto (ORD-062, antes da Fase 6 existir como conceito) e nunca foi comparada lado a lado com o padrão que amadureceu depois. Cada história subsequente (Transações, Pedidos) comparou contra a mais recente, mas ninguém "olhou pra trás" para a mais antiga até este pedido explícito do usuário.

---

## Explorer

### História
Como **superadmin/admin**, quero que a tela de Empresas tenha a mesma aparência e comportamento que Transações e Pedidos (tabela compacta, paginação do design system, filtros consistentes), para não ter que reaprender um padrão de interação diferente ao trocar de tela — e, com o filtro novo de período e os cards de resumo, localizar e acompanhar a carteira de clientes com mais facilidade.

### Fluxo principal
1. Superadmin/admin abre `/companies`
2. Vê os cards de resumo por status do contrato (**novo**) e a barra de filtros no mesmo grid responsivo de Pedidos: nome/razão social (busca já existente), CNPJ (busca já existente, prefixo), status do contrato (já existente), período de cadastro De/Até (**novo**)
3. Aplica um ou mais filtros — lista atualiza, contador "N clientes encontrados" (já existe)
4. Tabela no padrão `Table` compact — mesma altura de linha, cabeçalho e hover de Transações/Pedidos
5. Clica numa linha → navega para `/companies/{id}/contract` (comportamento já existente, mantido)
6. Paginação via componente `Pagination` do design system
7. "Limpar" volta ao estado padrão (já existe, passa a limpar o filtro de período também)

### Critérios de aceite
- [ ] Tabela usa `Table` `variant="compact"` (mesma altura de linha, cabeçalho e hover de Transações/Pedidos)
- [ ] Paginação usa o componente `Pagination` do design system, substituindo os botões Anterior/Próxima manuais
- [ ] Grid do filtro migra para `repeat(auto-fill, minmax(180px, 1fr))`, mesmo padrão de Pedidos
- [ ] Filtros existentes (nome/razão social, CNPJ, status do contrato) continuam funcionando sem regressão
- [ ] Filtro de período de cadastro (De/Até), mesma validação Até ≥ De e Até desabilitado até De ser preenchido — **aprovado com o usuário (2026-08-11)**
- [ ] Cards de resumo por status do contrato (Pendente/Enviado/Assinado) — **aprovado com o usuário (2026-08-11)**
- [x] `list_companies` passa a ordenar por `created_at DESC` (Achado 7 — decisão técnica, não depende de aprovação de produto)
- [x] **Recusado (2026-08-11):** filtro de situação Receita (Todas/Ativa/Não verificada) — fora do escopo desta história
- [ ] Nenhuma mudança de comportamento no clique da linha (continua navegando para `/companies/{id}/contract`)
- [ ] Nenhuma mudança de comportamento pro botão "+ Novo cliente"

### Wireframe / Mockup
Não desenho protótipo novo — mesma diretriz do ORD-081: clonar a estrutura visual/CSS já aprovada de `PaymentsScreen.tsx`/`OrdersScreen.tsx` (filter-bar em grid `minmax`, tabela compact, `Pagination`), trocando os campos pelos específicos de Empresas.

---

## Sugestões de PM/UX — decididas com o usuário (2026-08-11)

Mesmo formato usado no ORD-081 (faixa de horário, CPF, cards de resumo, filtro de terminal foram decididos um a um antes do Ready).

1. **Filtro de situação Receita** (Todas / Ativa / Não verificada) — **recusado.** Fora do escopo desta história.
2. **Filtro de período de cadastro (De/Até)** — **aprovado.** Mesmo componente `DateInput` com a validação já padronizada (Até ≥ De, Até desabilitado até De). Útil para "quantos clientes entraram este mês/trimestre".
3. **Cards de resumo por status do contrato** (Pendente/Enviado/Assinado) — **aprovado.** Mesmo padrão visual do `ORD-078` em Transações. Com só 3 empresas no ambiente de dev hoje o ganho visual é pequeno, mas a carteira de clientes reais tende a crescer — é a métrica mais natural de acompanhar numa tela de gestão de clientes da plataforma.

---

## QA Explorer

```gherkin
Feature: Padrão visual e filtros da listagem de Empresas

  Scenario: Tabela usa o mesmo padrão compacto de Transações/Pedidos
    Dado que o usuário abre /companies
    Então a tabela usa a variante compacta (mesma altura de linha e cabeçalho de Transações/Pedidos)

  Scenario: Paginação usa o componente do design system
    Dado que existem mais clientes do que o limite de uma página
    Quando o usuário navega pela paginação
    Então o componente Pagination do design system é usado (não botões Anterior/Próxima manuais)
    E a página correspondente carrega

  Scenario: Filtros existentes continuam funcionando
    Dado que o usuário busca por nome, razão social, CNPJ (prefixo) ou status do contrato
    Então o comportamento é idêntico ao que já existe hoje (sem regressão)

  Scenario: Clique na linha mantém navegação para o contrato
    Dado que o usuário clica numa linha da tabela
    Então é redirecionado para /companies/{id}/contract, mesmo comportamento atual

  Scenario: Ordenação padrão por mais recente
    Dado que existem empresas cadastradas em datas diferentes
    Quando o usuário abre /companies sem nenhum filtro
    Então as empresas aparecem ordenadas da mais recente para a mais antiga

  Scenario: Filtro de período de cadastro
    Dado que existem empresas cadastradas em datas diferentes
    Quando o usuário define De e Até
    Então só empresas cadastradas dentro do intervalo aparecem
    E Até não aceita data anterior a De
    E Até fica desabilitado até De ser preenchido

  Scenario: Cards de resumo por status do contrato
    Dado que existem empresas com status de contrato variados
    Quando o usuário abre /companies
    Então vê um card por status (Pendente/Enviado/Assinado) com contagem, independente do filtro de status aplicado na tabela

  Scenario: Sem filtro de situação Receita
    Dado que o usuário olha a barra de filtros
    Então não existe nenhum campo de filtro por situação Receita (recusado nesta história)
    E a coluna "Situação Receita" continua aparecendo na tabela, só não é filtrável
```

---

## Tech Explorer

### Serviços impactados
- `services/company/` — `main.py` (`list_companies`): `order_by` (Achado 7), `date_from`/`date_to`, resumo por `contract_status`
- `frontend/admin/` — `CompanyListScreen.tsx`, `CompanyListScreen.module.scss`, `api/companies.ts` (`buildCompanyListQuery`)

### Diagnóstico técnico (confirmado no código e ao vivo)
| Achado | Evidência |
|---|---|
| Sem `variant="compact"` | `CompanyListScreen.tsx:170,185` |
| Paginação manual | `CompanyListScreen.tsx:192-199` — dois `Button` + texto cru, vs. `Pagination` do DS em Transações/Pedidos |
| Grid fixo, não `minmax` | `CompanyListScreen.module.scss:31` |
| Situação Receita não filtrável | Coluna existe (`CompanyListScreen.tsx:97-103`), sem filtro correspondente |
| Sem filtro de período | Coluna "Cadastrado em" existe, sem filtro |
| `created_at` nulo no seed | Query direta: 3/3 empresas com `created_at IS NULL` — inserido via `init.sql`, não via ORM |
| Sem `order_by` | `services/company/main.py:708-721` — query sem ordenação explícita |
| Backend já é platform-admin-only | `_require_platform_admin(current_user)` em `list_companies` (`main.py:707`) — sem gap de RBAC a corrigir, diferente do ORD-081 |

### Direção técnica proposta

**Backend (`list_companies`) — incondicional:**
```python
stmt = select(Company).where(Company.active == True)
...
stmt = stmt.order_by(Company.created_at.desc())
```

**Backend — período de cadastro (aprovado):**
```python
async def list_companies(
    ...,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    ...
):
    ...
    if date_from:
        stmt = stmt.where(Company.created_at >= date_from)
    if date_to:
        stmt = stmt.where(Company.created_at <= date_to)
```
Mesmo padrão de `date_from`/`date_to` que `list_orders`/`list_payments` já usam — sem novidade técnica, só replicação do padrão estabelecido. Sem filtro de `cadastral_status` (recusado).

**Backend — cards de resumo por status do contrato (aprovado):**
Resumo por `contract_status`, mesmo padrão do `ORD-078` (`list_payments`/`list_orders`): agregação sobre os filtros de busca/período já aplicados, ignorando o filtro de `contract_status` de propósito (mostra a distribuição completa mesmo com a tabela filtrada por um status só).

**Frontend:**
- `Table` ganha `variant="compact"` — mudança de uma linha
- Substituir bloco `.pager` manual por `<Pagination activePage={page} itemsPerPage={LIMIT} totalItemsCount={total} onChange={(p) => setSkip((p - 1) * LIMIT)} />`, mantendo o texto "Mostrando X–Y de Z" ao lado (mesmo layout de Transações/Pedidos)
- `.filterBar` migra para `grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))`
- Dois `DateInput` novos (De/Até), mesmos componentes e validação já usados em `PaymentsScreen.tsx`/`OrdersScreen.tsx` — nenhum componente novo
- Bloco de cards reaproveitando a estrutura CSS de `.grid`/`.card`/`.cardLabel`/`.cardValue` já existente em `PaymentsScreen.module.scss` (copiar, não reinventar) — sem valor monetário (cards de Transações têm `amount`, aqui é só contagem)
- `buildCompanyListQuery` em `api/companies.ts` ganha `dateFrom`/`dateTo`

### Riscos
- Risco geral baixo — mesma classificação do ORD-081: reuso de componentes e padrões já validados em produção (Transações, Pedidos), não é construção de UI nova.
- `list_companies` hoje não tem teste cobrindo ordenação — ao adicionar `order_by`, vale um teste novo garantindo a ordem (mais recente primeiro), já que é uma mudança de comportamento observável (embora não quebre nenhum critério existente, já que a ordem nunca foi garantida).
- Cards de resumo com só 3 empresas no seed atual têm baixo valor demonstrativo em dev/QA local — recomendação de QA: criar 1-2 empresas extras durante os testes pra validar a contagem variando.

### Estimativa
5 pontos — menor que o ORD-081 (8): reuso direto de `Table` compact, `Pagination`, `DateInput` e cards já validados, sem trabalho de descoberta de bug nem endpoint com RBAC faltando (backend já é platform-admin-only).

---

## Ready

**Explorer:** [x] fluxo, persona e critérios de aceite definidos · **QA Explorer:** [x] cenários Gherkin cobrindo padrão visual, filtros (existentes e novos), ordenação e resumo · **Tech Explorer:** [x] diagnóstico confirmado ao vivo (query direta no MySQL), direção técnica com assinatura de endpoint, riscos e estimativa · **Aprovação final:** [x] aprovado no chat pelo usuário (2026-08-11) — filtro de período e cards de resumo aprovados, filtro de situação Receita recusado

**Status: Ready** — pode começar a implementação.

---

## Downstream

Fluxo simplificado de dev único, sem revisor formal nem branch protection (ver `docs/WORKFLOW.md` — Code Review "hoje, o próprio autor").

- **To Do → In Progress:** branch `feature/ord-084-empresas-mesmo-padrao-listagem` criada a partir de `main`.
- **Backend (`services/company/main.py`, `list_companies`):** `order_by(Company.created_at.desc())` incondicional (Achado 7); `date_from`/`date_to` (`Company.created_at >= / <=`); resumo por `contract_status` (`summary`) calculado sobre os filtros de busca/período, ignorando o filtro de `contract_status` de propósito (mesmo padrão do ORD-078). `CompanyListOut` ganhou o campo `summary: dict[str, int]`.
- **Frontend (`CompanyListScreen.tsx`):** `Table` migrada para `variant="compact"`; paginação manual (`Anterior`/`Próxima`) substituída pelo componente `Pagination` do design system; filtro de período (`DateInput` De/Até, mesma validação Até ≥ De e Até desabilitado até De de Transações/Pedidos); cards de resumo por status do contrato (`STATUS_CARDS`, clicáveis, mesmo padrão visual de `PaymentsScreen`, só sem valor monetário). `.filterBar` migrado para `grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))`.
- **`api/companies.ts`:** `CompanyListFilters` ganhou `dateFrom`/`dateTo`; `buildCompanyListQuery` mapeia pra `date_from`/`date_to`; `listCompanies` retorna `summary` além de `companies`/`total`.
- **`types.ts`:** novo tipo `CompanyStatusSummary = Record<string, number>` (mesmo padrão do `PaymentStatusSummary`/`OrderStatusSummary`, mas só contagem, sem valor monetário).
- **Testes backend:** novo arquivo `test_ord084_padrao_listagem_empresas.py` (7 testes: resumo reflete distribuição, resumo ignora filtro de status, período inclui/exclui/vazio, ordenação padrão). Suíte completa do company-service: **187 passed**, 1 falha pré-existente e não relacionada (`test_require_superadmin_raises_for_owner` referencia uma função removida num commit anterior a esta história, não fazia parte do escopo). Ajuste colateral: `test_ord061_filtros_edicao_cadastro.py` tinha uma asserção de igualdade exata do payload (`r.json() == {"companies": [...], "total": 0}`) que quebrava com o campo `summary` novo — trocada por asserção nos campos específicos.
- **Testes frontend:** `companies.test.ts` ganhou 2 testes novos pra `date_from`/`date_to` em `buildCompanyListQuery`. Suíte completa do frontend admin: **48 passed** (6 arquivos). `tsc --noEmit` limpo.
- **Achado colateral corrigido no mesmo ciclo:** 6 empresas órfãs (`__cov_co__`, todas com o mesmo PIN de teste fixo `"2468"`) ficaram no banco compartilhado de dev por rodadas de teste anteriores desta sessão que falharam antes de rodar a limpeza (`_cleanup_seed`) — causavam falha intermitente em `test_dir_validate_pin_valido`/`test_dir_verify_pin_valido` (`next()` pegando a empresa errada por ordem de id, não a da rodada atual). Mesma classe de problema do incidente dos alérgenos (ORD-075, banco de teste compartilhado com o de dev) — limpo manualmente, não é uma mudança de código desta história.
- Verificado ao vivo via `curl` autenticado contra o gateway (não só teste automatizado): `GET /companies` sem filtro retorna as 3 empresas do seed com `summary: {"pendente": 2, "enviado": 0, "assinado": 1}` correto; `GET /companies?date_from=2020-01-01` retorna `total: 0` — comportamento esperado e já documentado (Achado 6: as 3 empresas seed têm `created_at` nulo, inseridas via `init.sql` fora do ORM).
- Verificação visual no navegador **não realizada** — usuário optou por confiar nos testes automatizados (pytest/vitest/tsc) e na verificação via `curl` desta vez, sem abrir o Chrome MCP.

**Status: In Progress** — PR ainda não aberta.
