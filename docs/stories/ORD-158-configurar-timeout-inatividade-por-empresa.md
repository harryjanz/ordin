---
id: ORD-158
status: Done
estimativa: 3,5 pontos (2 backend + 1 admin + 0,5 totem)
tipo: feature
fase: 6
sprint: null
responsavel: Backend SR + Frontend
---

# ORD-158 — Timeout de inatividade do totem configurável por empresa

## Descrição
O timeout de inatividade do totem (tempo sem toque até limpar o carrinho e voltar pra tela de
boas-vindas, mais o aviso "Ainda está aí?" nos últimos segundos) hoje é fixo em código —
`INACTIVITY_TIMEOUT_MS`/`INACTIVITY_WARN_SEC` em `frontend/totem/src/App.tsx`, ajustado pela
última vez no ORD-155 (2min/10s → 3min/20s). Cada empresa tem um ritmo de atendimento e um perfil
de cliente diferente (fast-food vs. cardápio com mais decisão, por exemplo), então o valor ideal
não é universal. Esta história move esses dois parâmetros pra configuração por empresa, editável
pelo admin na aba "Aparência do totem", com um novo default de 5 minutos de inatividade e 30
segundos de aviso (substituindo os 3min/20s fixos herdados do ORD-155).

## Persona
Admin da empresa (dono/gerente) que configura o totem — ganha autonomia pra ajustar o
comportamento de reset conforme o próprio critério, sem precisar pedir mudança de código. Cliente
no totem é afetado indiretamente pelo valor escolhido.

## Contexto
Pedido do usuário em 2026-09-03, logo depois de confirmar como funcionam as duas constantes do
ORD-155 (timeout total vs. janela de aviso dentro dele) — decidiu que, em vez de continuar
ajustando esse valor globalmente via código a cada mudança de critério, faz mais sentido dar essa
configuração pro admin de cada empresa.

## Explorer

### História
Como admin da empresa, quero configurar o tempo de inatividade do totem e o tempo de aviso antes
do reset, na aba de Aparência do totem, para adaptar esse comportamento ao ritmo de atendimento
do meu negócio sem depender de mudança de código.

### Contexto e motivação
O ORD-155 já mostrou que o valor "certo" de timeout é uma questão de critério de negócio, não uma
constante técnica — e esse critério muda de empresa pra empresa (um totem de fast-food pode
querer um reset mais rápido pra girar fila; um cardápio com mais decisão pode preferir mais
tempo). Hoje qualquer ajuste exige um deploy de código. Empurrar isso pra configuração por empresa
resolve de vez, no mesmo espírito de outros campos que já migraram de "fixo" pra "configurável"
nesta tela (`catalog_menu_layout`, `fulfillment_mode`, `prep_urgency_minutes`).

### Fluxo principal
1. Admin abre Configurações → aba "Aparência do totem".
2. Vê dois campos novos: "Tempo de inatividade até resetar o carrinho" (minutos) e "Tempo de
   aviso antes do reset" (segundos) — pré-preenchidos com o valor atual da empresa (ou o default
   de 5min/30s, se a empresa nunca configurou).
3. Admin ajusta os valores e salva.
4. Da próxima vez que o totem parear/carregar os dados da empresa, os novos valores passam a
   valer — substituem as constantes fixas que existem hoje em `App.tsx`.
5. Comportamento do timer em si (aviso nos últimos N segundos, reset ao fim do prazo) continua
   idêntico ao já implementado no ORD-155 — só a origem dos números muda de constante pra
   configuração.

### Fluxos alternativos / exceções
- Empresa nova, nunca configurou → usa o default (5 min / 30s), sem precisar de migration com
  UPDATE manual (default no schema já cobre).
- Admin tenta configurar um valor de aviso maior que o tempo total de inatividade (ex: 10 min de
  aviso pra um timeout de 5 min) → validação recusa, mensagem clara.
- Totem já pareado quando o admin muda a configuração → só pega o novo valor no próximo
  pareamento/carregamento dos dados da empresa (mesmo comportamento de qualquer outro campo de
  `CompanyInfo` hoje — não é um requisito novo, é como o sistema já funciona).

### Dependências
- Serviços envolvidos: `company` (schema + endpoint), `auth` (schema `CompanyInfo` que filtra o
  que chega no pareamento — armadilha conhecida, precisa atualizar em paralelo) e
  `frontend/admin` (`SettingsScreen.tsx`) e `frontend/totem` (`App.tsx`, `types.ts`).
- Sem histórias bloqueantes — [[ORD-155]] já é a base do comportamento que está sendo
  parametrizado.

### Critérios de aceite funcionais
- [x] Aba "Aparência do totem" tem os dois novos campos, editáveis e salvos junto com o resto da
      aparência.
- [x] Empresa sem configuração explícita usa o default: 5 minutos de inatividade, 30 segundos de
      aviso.
- [x] Valor de aviso maior que o timeout total é rejeitado com mensagem clara (backend e/ou
      frontend) — validado nos dois lados (client-side antes de bater na API, e 422 no backend).
- [x] Totem usa os valores vindos da empresa (via pareamento) em vez das constantes fixas
      `INACTIVITY_TIMEOUT_MS`/`INACTIVITY_WARN_SEC` — comportamento do timer (aviso, reset)
      permanece o mesmo do ORD-155, só a origem do valor muda. Confirmado ao vivo.
- [x] Isolamento multi-tenant: configuração de uma empresa não afeta nem é visível por outra —
      coberto em `test_ord158_timeout_inatividade.py`.

### Wireframe / Mockup
N/A — reaproveita o padrão visual já usado pra `prep_urgency_minutes` na aba "Comportamento do
totem" (campo numérico com `InputBase type="number"`), só que na aba "Aparência".

## QA Explorer

```gherkin
Feature: Timeout de inatividade do totem configurável por empresa
  Como admin da empresa
  Quero configurar o tempo de inatividade e o tempo de aviso do totem
  Para adaptar o comportamento de reset ao ritmo do meu negócio

  Background:
    Dado o admin está autenticado na empresa "Burger House"

  Scenario: Empresa nova usa o default sem configuração explícita
    Dado uma empresa recém-criada, sem ter configurado esses campos ainda
    Quando o admin abre a aba "Aparência do totem"
    Então os campos mostram 5 minutos de inatividade e 30 segundos de aviso

  Scenario: Admin salva um novo valor válido
    Dado o admin está na aba "Aparência do totem"
    Quando ele define 4 minutos de inatividade e 20 segundos de aviso e salva
    Então a configuração é persistida
    E reabrir a tela mostra os novos valores

  Scenario: Aviso maior que o timeout total é rejeitado
    Dado o admin está na aba "Aparência do totem"
    Quando ele tenta salvar 2 minutos de inatividade com 3 minutos (180s) de aviso
    Então o salvamento é recusado
    E uma mensagem clara explica que o aviso não pode ser maior que o tempo total

  Scenario: Totem aplica o valor configurado da empresa
    Dado a empresa configurou 4 minutos de inatividade e 20 segundos de aviso
    Quando o totem pareia e carrega os dados da empresa
    E o cliente fica inativo na tela de catálogo
    Então o modal de aviso aparece a partir de 3min40s de inatividade
    E o reset (limpar carrinho, voltar pra welcome) ocorre aos 4 minutos

  Scenario: Totem não pareado com a configuração nova ainda usa o valor anterior
    Dado o admin muda a configuração da empresa
    E um totem já está pareado e com a tela de catálogo aberta havia mais tempo
    Quando o timer de inatividade desse totem continua rodando
    Então ele usa o valor que tinha no momento do pareamento, não o novo, até
    repareamento ou nova carga dos dados da empresa

  Scenario: Isolamento multi-tenant
    Dado a empresa A configura 2 minutos de inatividade
    Quando o admin da empresa B abre a aba "Aparência do totem" da própria empresa
    Então ele vê a configuração (ou o default) da empresa B, nunca a da empresa A

  Scenario: Valores de borda aceitos
    Dado o admin está na aba "Aparência do totem"
    Quando ele configura o menor valor de inatividade permitido com o menor valor de aviso
    permitido, ambos consistentes entre si
    Então o salvamento é aceito normalmente
```

**Cenários revisados e aprovados pelo PM:** sim — cobrem o default pra empresa nova, o happy path
de salvar/reabrir, a validação cruzada (aviso > timeout), o efeito real no totem (não só a
persistência do dado), a borda de totem já pareado com valor antigo em memória, isolamento
multi-tenant, e valores de borda. Falta decidir no Tech Explorer os limites mínimo/máximo
aceitáveis pros dois campos (mesmo padrão do `prep_urgency_minutes`, que usa range 1-180).

## Solução Técnica

### Serviços impactados
- `company`: novas colunas em `Company`, migration, `AppearanceIn`/`CompanyOut`, validação no
  endpoint `PATCH /companies/{id}/appearance`, e os 2 dicts de pareamento (`approve_device`,
  `approve_panel`) que replicam `CompanyOut` manualmente pro Redis.
- `auth`: schema `CompanyInfo` (`services/auth/main.py`) precisa ganhar os mesmos 2 campos —
  senão eles são descartados na resposta de `GET /auth/device/status`, mesmo que o
  company-service já os envie (armadilha já documentada em comentário no código do auth-service).
- `frontend/admin`: `SettingsScreen.tsx`, aba Aparência — 2 campos numéricos novos, mesmo padrão
  de `saveAppearance`.
- `frontend/totem`: `types.ts` (`CompanyInfo`), `App.tsx` (remove as constantes fixas, usa os
  valores vindos de `company`).

### Endpoints

#### PATCH /companies/{company_id}/appearance (alterado)
**Serviço:** company-service
**Auth:** JWT obrigatório | role: admin/owner
**company_id:** do path, verificado contra o JWT (`resolve_company_id_write` — padrão já usado)

Request (2 campos novos, opcionais com default — mesmo padrão de `menu_layout`/
`fulfillment_mode`, pra não quebrar chamadas antigas do admin durante rollout):
```json
{
  "theme": "bk",
  "mode": "dark",
  "menu_layout": "vertical",
  "inactivity_timeout_min": 5,
  "inactivity_warn_sec": 30
}
```

Response 200 (`CompanyOut`, campos novos inclusos):
```json
{ "...": "...", "inactivity_timeout_min": 5, "inactivity_warn_sec": 30 }
```

Erros:
- 422 se `inactivity_timeout_min` fora de 1–30.
- 422 se `inactivity_warn_sec` fora de 5–120.
- 422 se `inactivity_warn_sec >= inactivity_timeout_min * 60` — aviso não pode ser maior ou
  igual ao próprio tempo total (mensagem: "Tempo de aviso não pode ser maior que o tempo de
  inatividade").

#### GET /auth/device/status (contrato de resposta alterado, endpoint já existe)
`CompanyInfo` embutido na resposta passa a incluir os 2 campos novos — sem mudança de rota, só
de schema (`services/auth/main.py`).

### Migrations
- `company-service`, tabela `companies`: adicionar `inactivity_timeout_min`
  (`Integer NOT NULL DEFAULT 5`) e `inactivity_warn_sec` (`Integer NOT NULL DEFAULT 30`) — mesmo
  padrão de `20260824_2000_prep_urgency_minutes.py` (guard de idempotência via
  `inspector.get_columns`, `server_default` cobrindo empresas já existentes sem UPDATE manual).

### Mudança de implementação

**`Company` (model) + `AppearanceIn` + `CompanyOut`:**
```python
# Company
inactivity_timeout_min = Column(Integer, nullable=False, default=5)
inactivity_warn_sec    = Column(Integer, nullable=False, default=30)

# AppearanceIn
inactivity_timeout_min: int = 5
inactivity_warn_sec: int = 30

# CompanyOut — inclui os 2 campos

# validação em update_appearance (mesmo lugar de VALID_THEMES etc.)
if not (1 <= body.inactivity_timeout_min <= 30):
    raise HTTPException(422, "Tempo de inatividade deve estar entre 1 e 30 minutos")
if not (5 <= body.inactivity_warn_sec <= 120):
    raise HTTPException(422, "Tempo de aviso deve estar entre 5 e 120 segundos")
if body.inactivity_warn_sec >= body.inactivity_timeout_min * 60:
    raise HTTPException(422, "Tempo de aviso não pode ser maior que o tempo de inatividade")
```

**`approve_device`/`approve_panel` (company-service):** adicionar
`"inactivity_timeout_min": co.inactivity_timeout_min, "inactivity_warn_sec": co.inactivity_warn_sec`
nos dois dicts que montam o payload `"company"` gravado no Redis — mesmo padrão de
`prep_urgency_minutes` nas linhas 3212/3268.

**`CompanyInfo` (auth-service):** adicionar os 2 campos `int` ao pydantic model.

**Totem (`App.tsx`):**
```ts
// antes: constantes de módulo fixas
// depois: derivadas da empresa pareada, com fallback pro novo default
const timeoutMs = (company?.inactivity_timeout_min ?? 5) * 60_000;
const warnSec = company?.inactivity_warn_sec ?? 30;
```
Fallback existe só como defesa (ex: dado antigo em cache do zustand persist, de antes desta
história) — depois de um pareamento novo, o valor real da empresa sempre vem preenchido pela
migration com default.

**Admin (`SettingsScreen.tsx`):** 2 `InputBase type="number"` na aba Aparência, mesmo padrão
visual do campo `prep_urgency_minutes` da aba Comportamento (label + clamp client-side antes de
enviar, mensagem de erro do backend exibida se a validação cruzada falhar).

### Eventos de fila
Nenhum.

### Impacto em outros serviços
Nenhum além dos já listados (`auth` só por causa do filtro de schema no pareamento).

### Estimativa
- Backend (`company` + `auth`): 2 pontos (migration, 2 endpoints/schemas, 2 dicts de pareamento,
  validação cruzada).
- Admin: 1 ponto (2 campos numéricos + validação client-side).
- Totem: 0,5 ponto (troca de constantes fixas por valores derivados de `company`, com fallback).

### Riscos
- **Esquecer uma das camadas de contrato** — sintoma seria "salvei no admin mas o totem não
  muda". O risco se confirmou na prática: o company-service tem **4** pontos que constroem o
  dict `"company"` manualmente (não só os 2 mapeados no Tech Explorer original —
  `approve_device`/`approve_panel` — mas também `/internal/validate-pin` e
  `/internal/verify-pin`, os dois usados pelo fluxo de login por PIN do totem, que é o caminho
  mais comum). Só apareceu ao testar o fluxo de PIN de verdade (sintoma: "Nenhum terminal
  disponível" — na real o terminal só estava marcado como "em uso" por heartbeat recente de um
  pareamento anterior, mas ao investigar por que os campos novos não apareciam no
  `localStorage` do totem foi que achei os 2 pontos faltando). Mitigado depois do fato: todos os
  4 pontos corrigidos e confirmados via teste manual ponta a ponta, não só teste de API isolado.
- **Totem já pareado não reflete mudança em tempo real** — comportamento aceito no QA Explorer
  (só atualiza no próximo pareamento/carga), não é bug, mas vale deixar claro pro admin que a
  mudança não é instantânea nos totens já em uso.

## Validação

- Migration `20260903_1700_inactivity_timeout_config.py` aplicada limpo (`server_default`
  cobre empresas já existentes sem UPDATE manual).
- Suíte automatizada do `company-service` em ambiente limpo, conectado à rede real do
  docker-compose pra ter Redis/Mongo/RabbitMQ de verdade (`--network ordin_ordin`, evitando o
  gotcha de [[gotcha-teste-s3-endpoint-url-vaza]] com as env vars corretas): 335 passed — 326
  já existentes + 9 novos testes do ORD-158 (`test_ord158_timeout_inatividade.py`, cobrindo
  default, salvar/reabrir, validação cruzada, valores de borda, isolamento multi-tenant e
  acesso cross-empresa). As mesmas 9 falhas pré-existentes continuam (confirmado que já
  falhavam identicamente antes desta história, não são regressão).
- `ruff`/`mypy`: `company-service` manteve 150/109 (+2 mypy do mesmo padrão pré-existente
  `Column[T]` vs `T`, nas duas linhas de atribuição `co.inactivity_*`); `auth-service` manteve
  24/12 (nenhum novo — só adição de campos num schema pydantic, sem atribuição).
- **Achado importante durante o teste manual**: o Tech Explorer original só tinha mapeado 2
  pontos que replicam o dict `"company"` manualmente (`approve_device`/`approve_panel`) — o
  teste ponta a ponta revelou mais 2 (`/internal/validate-pin` e `/internal/verify-pin`, usados
  pelo fluxo de PIN do totem, o caminho mais comum de login). Sem o teste manual real, a
  história teria sido dada como pronta com o totem nunca recebendo a configuração via PIN login
  — só via os fluxos de pareamento por QR/painel, bem menos usados. Ver nota em Riscos.
- Validação manual completa (admin → totem, 2026-09-03): configurei a Burger House pra 1
  minuto / 50 segundos de aviso na aba Aparência (testei a validação cruzada primeiro,
  confirmando a rejeição com aviso ≥ timeout). Fiz login por PIN no totem do zero (limpando
  `localStorage`) — o `company` persistido já veio com `inactivity_timeout_min: 1,
  inactivity_warn_sec: 50`. No catálogo, sem tocar a tela, o modal "Ainda está aí?" apareceu aos
  ~10s de inatividade (60s − 50s de aviso), com contagem regressiva correta — confirmando que o
  totem usa o valor configurado, não mais os 3min/20s fixos do ORD-155. Restaurei a Burger House
  pro default real (5min/30s) depois do teste.

## Correção pós-lançamento — mousemove/scroll não resetavam o timer (2026-09-03)

Usuário reportou, testando manualmente numa sessão posterior (durante validação do ORD-141),
que o aviso "insistia em aparecer mesmo com atividade no navegador". Investigado com
`console.log` temporário instrumentando `touch()` e o cálculo de `idle` — confirmado que
`touch()` disparava corretamente a cada **clique** real (sem bug nenhum aí). A causa raiz: o
listener de atividade (`App.tsx`) só escuta `click`, `touchstart` e `keydown` — **não**
`scroll`/`wheel`/`mousemove`. Testando no navegador com mouse (não num touchscreen real), rolar
o catálogo ou só mover o cursor por cima dos cards sem clicar em nada não conta como atividade,
então o timer segue contando e o aviso aparece mesmo com o cliente "ali", só sem tocar em nada
clicável.

Corrigido: `scroll`/`wheel` adicionados à mesma lista de `click`/`touchstart`/`keydown`;
`mousemove` adicionado separadamente com throttle de 1s (senão dispara a cada pixel de
movimento, gerando `touch()` — e o re-render de toda a `App` que isso causa, já que `useStore()`
é chamado sem seletor — a uma taxa desnecessária). `mousemove` nunca dispara em touchscreen
real, mas não atrapalha deixar registrado — é só um listener a mais que nunca é acionado lá.

Validado: com timeout curto de teste (1min/50s = 10s de graça), 18s de puro movimento de mouse
sem nenhum clique não disparou mais o aviso (antes da correção, disparava por volta dos 10-13s
mesmo com cliques reais acontecendo, porque o teste original só simulava clique, nunca scroll/
hover — o gap ficou invisível até testar com mouse de verdade). Config revertida pro default
(5min/30s) depois da validação, mesmo ritual da validação original acima.
