---
id: ORD-118
status: Done
fase: 7
sprint: null
responsavel: PM + Produto
estimativa: M
tipo: feature
---

# ORD-118 — Modelo de atendimento: retirada única com QR de pedido

## User story
**Como** dono/gestor de um estabelecimento cliente do Ordin cujo modelo de negócio é produção centralizada (cozinha prepara tudo e entrega o pedido completo de uma vez — modelo McDonald's/Burger King, diferente de balcão de retirada item a item),
**quero** configurar meu totem pra imprimir um ticket compacto com um único QR code por pedido (em vez de um ticket por unidade de item),
**para** meu fluxo de produção e entrega bater com a forma como meu negócio realmente opera, sem forçar o cliente final a apresentar/escanear vários tickets separados pra retirar um pedido que já sai pronto de uma vez.

**Como** cliente final fazendo um pedido num totem configurado nesse modelo,
**quero** receber um único comprovante com um único QR, sabendo que todo o pedido vai ser entregue junto,
**para** não precisar lidar com múltiplos papéis/QRs pra retirar itens que na prática já estão todos prontos ao mesmo tempo.

## Contexto e motivação
Hoje o Ordin tem **um único modelo de atendimento**, implícito no código, não configurável: cada unidade de cada item do pedido vira um `Ticket` próprio (`services/order/main.py`, loop em `POST /orders`), cada um com seu próprio QR assinado (HMAC), impresso como um bloco separado com corte parcial de papel (`frontend/totem/src/lib/printService.ts`, `buildEscPosBase64()`) e coletado individualmente (`POST /tickets/{code}/collect`) — o pedido só fecha (`status=completed`) quando **todos** os tickets forem coletados.

Esse modelo faz sentido pra um balcão de retirada onde itens ficam prontos em momentos diferentes (ex: bebida sai na hora, lanche demora 5 min) e o cliente pode retirar em etapas. Mas o usuário identificou que **existe outro modelo de negócio real e comum** — produção centralizada, tipo McDonald's/Burger King: o pedido inteiro vai pra cozinha/produção, fica pronto de uma vez, e o cliente retira tudo junto no balcão. Forçar esse tipo de estabelecimento a usar tickets por unidade gera desperdício de papel, ticket confuso (vários QRs pra um pedido que sai junto) e não reflete a operação real.

**Pesquisa de concorrência (2026-08-24)** — like o usuário pediu explicitamente análise de mercado pra esta funcionalidade, investiguei especificamente esse ângulo (retirada única/produção centralizada), que **nunca tinha sido pesquisado a fundo neste repo** (as rodadas anteriores de Goomer/Zig/Gototem/Consumer focaram em dashboard/analytics, não em fluxo de retirada — ver `docs/analise-dashboard-concorrentes-mercado.md`). Achados diretos (WebFetch nas páginas oficiais, 2026-08-24):

- **Goomer** (https://goomer.com.br/g/totem-autoatendimento): *"O pedido é enviado automaticamente para a cozinha, e o cliente aguarda o chamado ou retira o pedido no balcão."* — confirma que o modelo "aguardar chamado" existe no mercado, sem detalhar o mecanismo.
- **Consumer** (https://consumer.com.br/autoatendimento) — o achado mais forte e mais próximo do que o usuário descreveu: *"Cliente pega senha e aguarda chamada no painel"*, *"Impressora ou KDS recebe o ticket"*, e principalmente: *"Pedidos do totem vão direto ao Consumer PDV — e de lá, para a impressora do balcão, da cozinha e para o monitor (KDS)"* — ou seja, roteamento de impressão por destino (cozinha/balcão/expedição) **é uma feature real de mercado**, não hipotética. Isso fecha o loop em aberto desde a análise do CardápioWeb (ver `docs/analise-concorrente-cardapioweb.md`, seção "Impressão por destino", sinalizado como "candidato a investigar depois" e nunca revisitado até agora).
- **Gototem** (https://www.gototem.com.br/): tem um produto dedicado **"Gototem KDS"** — *"O KDS é um sistema de gerenciamento de pedidos para cozinhas"* — e *"O pedido cai direto na cozinha e no seu PDV, sem ninguém anotar no papel"*. Confirma KDS como categoria de produto estabelecida, mas não detalha o painel de retirada voltado pro cliente.
- **Zig** (https://zig.fun/tipos-negocio/restaurantes/): nenhuma menção específica encontrada a esse fluxo — gap de pesquisa, não confirmação de ausência.
- **Mogo** (achado já registrado em `docs/analise-concorrente-mogo.md`, seção 1): *"retirar o pedido no balcão ou aguardar ser chamado"* — mesmo padrão, sem detalhe do mecanismo de chamada.

**Conclusão da pesquisa:** o modelo "produção centralizada + retirada única com painel/senha" é um padrão de mercado consolidado (pelo menos Consumer o descreve com detalhe operacional real, incluindo KDS e impressão por destino), não uma ideia isolada do usuário — reforça que essa é uma funcionalidade de peso justo pra priorizar, e não um nicho.

## Duas histórias, um mecanismo
Esta funcionalidade foi dividida em duas histórias interdependentes:
- **ORD-118 (esta):** o campo de configuração + a mudança no ticket/QR/impressão — o "modo de atendimento" em si.
- **[[ORD-119]]** (`docs/stories/ORD-119-painel-pedidos-pendentes-prontos.md`): o painel de pedidos pendente/pronto + captura de nome opcional do cliente — depende de ORD-118 existir (só faz sentido no modelo de retirada única).

## Fluxos envolvidos (preliminar — aprofundar no Explorer completo/Tech Explorer)
- **Admin (Configurações → Comportamento):** novo seletor de "Modelo de atendimento" — mesma tela e card style de `consumption_mode_enabled` (ORD-108)/`catalog_menu_layout` (ORD-116), mas como enum de string (não booleano), já que o usuário sinalizou explicitamente "podem surgir mais [modelos]" no futuro — não travar em uma escolha binária. Valores propostos nesta rodada: `"por_item"` (padrão, comportamento atual — ticket unitário por item) e `"retirada_unica"` (novo — QR único por pedido). Nomes exatos de campo/valores a confirmar no Tech Explorer.
- **Totem (impressão):** quando a empresa está em `"retirada_unica"`, o ticket impresso muda de N blocos com QR individual (um por unidade) pra **um ticket compacto**: lista dos itens do pedido (sem necessidade de recorte — não há retirada parcial) + **um único QR** que identifica o pedido inteiro. Reaproveita o padrão de layout de duas colunas já usado no ORD-054 (`docs/stories/ORD-054-totem-ticket-layout-duas-colunas.md`), adaptado pra lista em vez de item único.
- **Balcão (coleta via QR) — confirmado pelo usuário (2026-08-24):** o app `frontend/balcao` existente é **reaproveitado**, não substituído. Hoje ele escaneia o QR de um ticket e chama `POST /tickets/{code}/collect`; no modelo `"retirada_unica"` o QR escaneado é o QR único do pedido, e o app passa a chamar um endpoint de coleta em nível de pedido (ex: `POST /orders/{ref}/collect`) que marca **todos** os tickets daquele pedido como coletados numa única transação — reaproveitando a mesma lógica de `SELECT FOR UPDATE` e fechamento automático (`status=completed`) já existente. Mudança de sistemática de coleta (por pedido, não por item), mas **sem remodelar `Order`/`OrderItem`/`Ticket`** — o app só precisa reconhecer o novo formato de QR (payload de pedido em vez de payload de ticket) e apontar pro endpoint certo. O usuário classificou isso como "totalmente viável com mudanças simples".
- **Admin (coleta manual, alternativa ao QR) — confirmado pelo usuário:** além do scan via app de balcão, o mesmo pedido também pode ser marcado como coletado diretamente por uma ação no admin (sem precisar escanear) — mesmo endpoint de coleta em nível de pedido, só um segundo ponto de entrada na UI. Faz parte da nova tela operacional descrita em [[ORD-119]] (que também cobre a marcação de "pronto").

## Dependências / impacto em outros serviços (preliminar)
- **company-service:** novo campo enum em `Company` (padrão `catalog_menu_layout`, não `consumption_mode_enabled`) + migration + `CompanyOut` + corpo de PATCH (novo ou extensão de `BehaviorIn`) + **atenção à armadilha de propagação cross-service já documentada**: precisa dos 3 pontos internos de montagem de dict no company-service (`/internal/validate-pin`, `/internal/verify-pin`, pareamento QR) **e** de `CompanyInfo` no auth-service (`services/auth/main.py`) — sem isso o totem nunca vê a configuração mesmo que o company-service já mande (ver precedente ORD-108/ORD-116, comentário explícito no código sobre essa armadilha).
- **order-service:** novo endpoint de coleta em nível de pedido; `_make_qr_data()`/`_verify_qr()` precisam de uma variante pra QR de pedido (não de ticket) — a confirmar formato exato no Tech Explorer.
- **frontend/totem:** `printService.ts` precisa de um segundo template de impressão (compacto, QR único) selecionado pelo modelo de atendimento da empresa.
- **[[ORD-119]]:** depende deste (o painel de pedidos só existe pro modelo `"retirada_unica"`).

## Fora de escopo desta história
- O painel de pedidos pendente/pronto e a captura de nome do cliente — isso é [[ORD-119]].
- Impressão roteada por destino física (cozinha/balcão/expedição em impressoras diferentes) — a Consumer faz isso, mas é uma camada adicional (múltiplas impressoras/KDS físico) que não foi pedida pelo usuário nesta rodada; fica registrado como ideia futura, não nesta história.
- Qualquer novo hardware (KDS físico dedicado) — fora do escopo do Ordin como está definido hoje (rodar em totem/admin/balcão via software).

## Decisões confirmadas pelo usuário (2026-08-24)
- Nome do campo: **`fulfillment_mode`** (confirmado, sem alteração).
- Coleta reaproveita o app de balcão existente (scan do QR único do pedido) + ganha uma segunda via de coleta manual pelo admin — ver seção "Balcão/Admin" acima.
- Painel de exibição pro cliente ([[ORD-119]]) roda num **novo frontend enxuto** (link separado, pensado pra TV smart/tela grande) — não é uma tela nova dentro de totem/admin/balcão.
- Quem marca "pronto" é a operação de balcão, mas **através do admin** (não do app de balcão) — nova tela operacional dentro do `frontend/admin`, detalhada em [[ORD-119]].

## Cenários (QA Explorer)

```gherkin
Funcionalidade: Modelo de atendimento — retirada única com QR de pedido

  Cenário: Empresa no modo padrão continua sem mudança nenhuma
    Dado uma empresa com fulfillment_mode = "por_item" (padrão, comportamento atual)
    Quando um pedido é criado no totem
    Então cada unidade de cada item gera um ticket próprio, com QR individual
    E o ticket impresso continua com um bloco por unidade, corte parcial entre blocos
    E a coleta continua sendo por ticket individual (POST /tickets/{code}/collect)

  Cenário: Trocar para o modo de retirada única em Configurações → Comportamento
    Dado um usuário owner/manager/superadmin/admin logado no admin
    Quando ele seleciona "Retirada única" no seletor de modelo de atendimento e salva
    Então a empresa passa a ter fulfillment_mode = "retirada_unica"
    E o totem aplica a mudança no próximo login (mesmo comportamento já documentado pra outras configs de aparência/comportamento)

  Cenário: Ticket compacto com QR único no modo de retirada única
    Dado uma empresa com fulfillment_mode = "retirada_unica"
    Quando um pedido com múltiplos itens (incluindo itens com quantidade > 1) é pago no totem
    Então é impresso um único ticket com a lista de todos os itens (nome e quantidade, sem bloco por unidade)
    E há um único QR no ticket, correspondente ao pedido inteiro (não a nenhum item específico)
    E não há corte parcial entre itens — só o corte final do ticket

  Cenário: Coleta do pedido inteiro via app de balcão (scan do QR único)
    Dado um pedido pago no modo "retirada_unica", ainda não coletado
    Quando o operador de balcão escaneia o QR do ticket no app de balcão
    Então todos os tickets daquele pedido são marcados como coletados numa única operação
    E o pedido muda para status "completed"
    E o app de balcão mostra feedback de sucesso (mesmo padrão sonoro/visual já usado hoje)

  Cenário: Coleta manual do pedido pelo admin, sem escanear QR
    Dado um pedido pago no modo "retirada_unica", ainda não coletado
    Quando um usuário autorizado marca o pedido como coletado pela tela operacional do admin (ver ORD-119)
    Então o mesmo efeito do scan acontece (todos os tickets coletados, pedido completed)
    Sem exigir o QR físico

  Cenário: Tentativa de coletar um pedido já coletado
    Dado um pedido no modo "retirada_unica" já com status "completed"
    Quando o QR do pedido é escaneado de novo (ou a coleta manual é acionada de novo)
    Então a operação é rejeitada com erro claro ("pedido já coletado"), sem duplicar nem quebrar o estado

  Cenário: QR de pedido adulterado ou de outra empresa
    Dado um QR de pedido com assinatura HMAC inválida, ou de um order_ref de outra empresa
    Quando o app de balcão ou o endpoint de coleta processa esse QR
    Então a operação é rejeitada (400), mesmo padrão de segurança já aplicado aos tickets individuais hoje

  Cenário: Pedido criado antes da troca de modelo continua com tickets antigos válidos
    Dado um pedido criado quando a empresa ainda estava em fulfillment_mode = "por_item"
    Quando a empresa muda para "retirada_unica" depois, mas antes desse pedido ser coletado
    Então os tickets já impressos daquele pedido continuam sendo coletados individualmente, no formato antigo
    E a mudança de modelo não afeta retroativamente pedidos/tickets já emitidos
```

## Solução técnica (Tech Explorer)

### 1. Campo de configuração (company-service)
- **Migration nova** (`services/company/migrations/versions/<timestamp>_fulfillment_mode.py`, mesmo padrão idempotente de `20260823_1000_catalog_menu_layout.py`): `ALTER TABLE companies ADD COLUMN fulfillment_mode VARCHAR(20) NOT NULL DEFAULT 'por_item'` com guarda via `inspector.get_columns`.
- **`services/company/main.py`:**
  - `Company.fulfillment_mode = Column(String(20), nullable=False, default="por_item")` (mesmo padrão de `catalog_menu_layout`, string livre validada em Python, não `Enum` de banco — facilita adicionar um terceiro modelo no futuro sem migration de schema).
  - `VALID_FULFILLMENT_MODES = {"por_item", "retirada_unica"}`, validado em `update_behavior` (mesmo padrão de `VALID_MENU_LAYOUTS`).
  - `BehaviorIn` ganha `fulfillment_mode: str = "por_item"` (hoje só tem `consumption_mode_enabled`).
  - `CompanyOut.fulfillment_mode: str = "por_item"`.
  - **Propagação cross-service (armadilha já documentada, 4 pontos a atualizar):** os 3 dicts internos do company-service (`/internal/validate-pin`, `/internal/verify-pin`, dict de pareamento QR) + `CompanyInfo` em `services/auth/main.py` — sem isso o totem não vê o campo mesmo que o company-service já mande.
- **`frontend/admin/src/screens/SettingsScreen.tsx`** (tab "Comportamento"): novo seletor ao lado do card de `consumption_mode_enabled` — como é enum de 2+ valores (não binário), usar `Dropdown` do design system (já usado no mesmo arquivo pra seleção de empresa), não `Toggle`. Estado novo (`fulfillmentMode`), incluído no mesmo `saveBehavior()` que já faz `PATCH /companies/{id}/behavior`.

### 2. QR de pedido único e coleta em bloco (order-service)
- **Sem migration nova nesta história** — `Order`/`OrderItem`/`Ticket` continuam exatamente como hoje; só muda o que é impresso/escaneado.
- **Formato do QR de pedido** — distinto do formato de ticket pra não colidir: `ORDER|{order_ref}|{timestamp}|{HMAC-SHA256(payload, QR_SECRET)}` (prefixo literal `"ORDER"` no primeiro campo, hoje o formato de ticket começa com o `ticket_code` de 8 caracteres — nunca vai ser confundido). Nova função `_make_order_qr_data(order_ref, ts)`, mesmo padrão HMAC de `_make_qr_data()`; `_verify_order_qr()` equivalente a `_verify_qr()`.
- **Novo endpoint `POST /orders/{order_ref}/collect`:**
  - `SELECT ... FOR UPDATE` no `Order` (mesmo padrão de lock já usado no fechamento automático hoje), escopado por `company_id`.
  - Se `qr_data` vier no corpo: verifica HMAC (mesma lógica de `_verify_qr`) — cobre o caminho de scan via app de balcão.
  - Se `qr_data` **não** vier: exige `require_write_role`-equivalente (staff autenticado da empresa) — cobre o caminho de coleta manual pelo admin (ver ORD-119). Mesmo padrão condicional que `POST /tickets/{code}/collect` já tem hoje ("HMAC-verifica `qr_data` se presente").
  - Rejeita com 409 se `order.status == "completed"`.
  - `UPDATE tickets SET status='collected', collected_at=..., collected_by=..., collection_device=... WHERE order_id = :id` (bulk, uma query) — reaproveita as colunas já existentes em `Ticket`.
  - `order.status = "completed"`, commit, `broadcast_order_completed()` (helper já existente em `services/order/websocket.py`, sem mudança).
- **`frontend/balcao/src/screens/OrderDetailScreen.tsx`** (`collectTicket()`): novo branch antes do parsing atual — `if (qrData.startsWith("ORDER|"))`, extrai `order_ref` (2º segmento) e chama `POST /orders/${orderRef}/collect` com `{ qr_data: qrData, collected_by: "balcao", collection_device: "balcao-web" }`, em vez do fluxo de `/tickets/{code}/collect`. Mesmo tratamento de erro (409/400) e mesmo feedback sonoro/visual já existentes — mudança pequena e localizada, confirma a expectativa do usuário ("mudanças simples").
- **`frontend/totem/src/lib/printService.ts`:** novo `buildEscPosBase64Compact()` (ou branch dentro da função existente, selecionado por `fulfillmentMode` vindo de `CompanyInfo`) — um bloco só: cabeçalho, lista de itens (nome × quantidade, sem loop por unidade), um QR (`_make_order_qr_data` do pedido), corte único no fim. Reaproveita o layout de duas colunas do ORD-054 (QR à esquerda, info à direita), adaptado pra lista em vez de item único.

### Estimativa
**M** — campo de config + endpoint novo reaproveitando modelo/lock existente + mudança pequena e localizada no app de balcão + novo template de impressão. Sem migration de dado (só de schema, uma coluna). Risco principal é ficar com um dos 4 pontos de propagação cross-service esquecido (padrão de erro já visto no ORD-108/115/116) — checklist explícito na PR.

## Próximos passos
Upstream completo, sem bloqueadores abertos. **Status: Ready.**
