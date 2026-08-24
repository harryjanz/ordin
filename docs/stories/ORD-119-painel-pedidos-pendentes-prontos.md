---
id: ORD-119
status: Ready
fase: 7
sprint: null
responsavel: PM + Produto
estimativa: G
tipo: feature
---

# ORD-119 — Painel de pedidos pendentes/prontos para retirada

## User story
**Como** cliente final que fez um pedido num estabelecimento no modelo de retirada única ([[ORD-118]]),
**quero** ver um painel visível (tipo McDonald's/Burger King) mostrando meu pedido em "Em preparo" e depois em "Pronto para retirada", identificado pelo meu nome (se eu quiser informar) ou pelo número do pedido,
**para** saber quando ir até o balcão sem precisar ficar perguntando ou esperando um chamado sonoro que talvez eu não escute.

**Como** dono/gestor do estabelecimento,
**quero** que a equipe de cozinha/balcão consiga marcar um pedido como "pronto" e isso apareça automaticamente no painel,
**para** ter um fluxo de produção→entrega sem gente anotando em papel ou chamando cliente por cima do balcão.

## Contexto e motivação
Depende diretamente da [[ORD-118]] (modelo de atendimento "retirada única") — este painel só faz sentido pra empresas nesse modelo; no modelo atual (ticket por item), a retirada já é individual e não precisa de painel de "pronto".

**Conceito de domínio novo:** hoje um pedido no Ordin vai de `paid` direto pra sendo coletado item a item, sem estado intermediário. Pro modelo de retirada única, existe um terceiro estado real que não existe hoje: **"pronto para retirada"** — diferente de "pago" (ainda em preparo) e diferente de "coletado/completed" (cliente já retirou). Alguém da operação (cozinha/balcão) precisa marcar essa transição — isso é uma ação nova, não coberta por nenhum endpoint hoje.

**Pesquisa de concorrência** (mesma rodada da ORD-118, 2026-08-24): a Consumer (https://consumer.com.br/autoatendimento) descreve exatamente esse modelo — *"Cliente pega senha e aguarda chamada no painel"* — validando que "painel de chamada" é o padrão de mercado esperado pra esse tipo de operação, não uma invenção. Goomer e Mogo confirmam a existência do modelo "aguardar chamado" mas sem detalhar o mecanismo (ver [[ORD-118]] pra citações completas). Nenhum concorrente pesquisado detalhou a opção de **nome do cliente** em vez de só número — esse é um diferencial de UX que o usuário trouxe por conta própria, não copiado de concorrente (McDonald's/BK tradicionalmente usam só número/senha impressa).

## Fluxos envolvidos (preliminar — aprofundar no Explorer completo/Tech Explorer)
- **Totem (captura de nome):** no fim do pedido (momento exato — antes ou depois do pagamento — a definir), se a empresa estiver em `"retirada_unica"`, o totem oferece um campo opcional "Quer receber com seu nome? (opcional)". Se o cliente não preencher, o pedido é identificado só pelo número (ex: "Pedido #42"). Sem validação de unicidade de nome — dois clientes podem digitar o mesmo nome no mesmo período, ambiguidade aceitável nesse tipo de fluxo (mesmo comportamento observado em fast-food físico).
- **Novo estado de pedido:** proposta preliminar — `Order.status` ganha um valor novo (`"ready"`, entre `"paid"` e `"completed"`) só usado quando `fulfillment_mode = "retirada_unica"`.
- **Tela operacional no admin (confirmado pelo usuário, 2026-08-24):** quem marca "pronto" é a operação de balcão, mas **através de uma nova tela dentro do `frontend/admin`** — não do app `frontend/balcao`. O usuário descreveu como "uma tela somente com os status pronto e coletado para serem operados": uma fila de trabalho focada nos pedidos ativos do modelo `retirada_unica` (pagos, ainda não coletados), com duas ações por pedido — **"Marcar pronto"** (`paid`→`ready`) e **"Marcar coletado"** (`ready`→`completed`, ação manual alternativa ao scan de QR pelo app de balcão, ver [[ORD-118]]). Mesmo endpoint de coleta usado pelas duas vias (QR e manual) — só dois pontos de entrada de UI pra mesma ação de backend. Role-gate provável: mesmos papéis que já operam coleta hoje (cashier/manager/owner) — a confirmar no Tech Explorer.
- **Painel público (novo front enxuto, confirmado pelo usuário):** tela separada, pensada pra rodar numa TV smart ou tela grande visível pro salão — **não** é uma tela dentro de totem/admin/balcão, é um **novo frontend próprio**, com link dedicado (ex: algo como `painel.ordin.app/{company_id}` ou padrão equivalente, nome exato a definir no Tech Explorer). Dois blocos — "Em preparo" (pedidos `paid`, ainda não `ready`) e "Pronto para retirada" (`ready`) — cada card mostra nome (se informado) ou número do pedido. Some da lista quando o pedido vira `completed`. Tela passiva, só leitura, sem interação de toque — não se aplicam os requisitos de touch-target/kiosk do `docs/roles/frontend.md` (que valem pro fluxo de compra), mas vale considerar legibilidade a distância (fonte grande, alto contraste) como requisito de UX próprio dessa tela.
- **Tempo real:** reaproveita a infraestrutura de WebSocket já existente (`ws://host:8004/ws/orders?company_id=X`, `services/order/websocket.py`) — já emite `order.created`/`order.paid`/`ticket.collected`/`order.completed` agrupados por empresa. Precisa de um evento novo (`order.ready` ou equivalente) emitido quando a equipe marca o pedido pronto pela tela operacional do admin — o resto da infra (agrupamento por `company_id`, heartbeat, reconexão) já está pronta e é diretamente reaproveitável, sem mudança estrutural. Tanto a tela operacional do admin quanto o painel público consomem o mesmo stream.

## Dependências / impacto em outros serviços (preliminar)
- **[[ORD-118]]:** pré-requisito — o campo de modelo de atendimento e o QR/endpoint de pedido único precisam existir primeiro.
- **order-service:** novo estado `"ready"` em `Order.status`; novo endpoint pra equipe marcar pronto (ex: `PATCH /orders/{ref}/ready`); endpoint de coleta manual (mesmo do ORD-118, chamado agora também pelo admin); novo campo opcional pro nome do cliente (ex: `Order.pickup_name`); novo evento WebSocket `order.ready`.
- **frontend/totem:** campo de nome opcional no fim do fluxo de pedido (só quando `retirada_unica`).
- **frontend/admin:** nova tela operacional (fila pronto/coletado).
- **Novo frontend (a nomear/estruturar no Tech Explorer):** o painel público em si — app novo, enxuto, read-only, consumindo a mesma API/WS do order-service.

## Fora de escopo desta história
- O mecanismo de QR/coleta via app de balcão em si — isso é [[ORD-118]].
- Notificação sonora, SMS, WhatsApp ou qualquer canal fora do painel visual — não foi pedido pelo usuário.
- Autenticação/segurança do painel público (ex: quem pode acessar o link de qual empresa) — a confirmar no Tech Explorer se é um link com token de empresa embutido (dispositivo "confiado" fisicamente no estabelecimento, mais parecido com o totem do que com o admin) ou algo com login.

## Cenários (QA Explorer)

```gherkin
Funcionalidade: Painel de pedidos pendentes/prontos para retirada

  Cenário: Nome opcional capturado no totem
    Dado um cliente fazendo pedido numa empresa com fulfillment_mode = "retirada_unica"
    Quando ele chega no fim do fluxo do totem
    Então é oferecido um campo opcional pra informar o nome
    E se ele deixar em branco, o pedido é identificado só pelo número (ex: "Pedido #42")
    E se ele informar um nome, o pedido é identificado por esse nome no painel e na tela operacional

  Cenário: Pedido pago aparece como "em preparo" na tela operacional e no painel
    Dado um pedido recém-pago numa empresa em "retirada_unica"
    Quando a tela operacional do admin e o painel público são consultados
    Então o pedido aparece na coluna "Em preparo" nos dois, em tempo real (sem precisar recarregar a página)

  Cenário: Marcar pedido como pronto pela tela operacional do admin
    Dado um pedido com status "paid" numa empresa em "retirada_unica"
    Quando um usuário autorizado clica "Marcar pronto" na tela operacional do admin
    Então o status do pedido muda para "ready"
    E o pedido desaparece da coluna "Em preparo" e aparece em "Pronto para retirada" — na tela operacional e no painel público, em tempo real
    E o pedido some da lista "Em preparo" do balcão que usa a fila padrão de coleta

  Cenário: Pedido coletado some do painel e da tela operacional
    Dado um pedido com status "ready"
    Quando ele é coletado (via scan do QR no app de balcão, ou marcado manualmente no admin — ver ORD-118)
    Então o pedido desaparece de ambas as colunas do painel público
    E desaparece da fila da tela operacional do admin

  Cenário: Empresa no modelo padrão não usa nada disso
    Dado uma empresa com fulfillment_mode = "por_item"
    Quando alguém tenta acessar a tela operacional do admin ou o link do painel público dessa empresa
    Então nenhum pedido aparece nas colunas "Em preparo"/"Pronto para retirada" (não existe esse conceito nesse modelo)
    E a navegação do admin não destaca essa tela como relevante pra essa empresa (a confirmar exibição condicional no Tech Explorer)

  Cenário: Painel público se recupera de queda de conexão
    Dado o painel público rodando numa TV/tela grande, conectado via WebSocket
    Quando a conexão cai e volta (rede instável, restart do order-service, etc.)
    Então o painel reconecta automaticamente (mesmo padrão de backoff exponencial já usado no app de balcão)
    E busca o estado atual via REST antes de voltar a confiar só nos eventos, pra não ficar com dado desatualizado

  Cenário: Dois pedidos com o mesmo nome informado
    Dado dois clientes que informaram o mesmo nome no totem, pedidos ativos ao mesmo tempo
    Quando os dois aparecem no painel
    Então ambos aparecem normalmente, sem erro — ambiguidade de nome é aceitável (mesmo comportamento observado em fast-food físico), sem tentativa de desambiguação automática
```

## Solução técnica (Tech Explorer)

### 1. Novo estado e campo de pedido (order-service)
- **Migration nova** (`services/order/migrations/versions/<timestamp>_order_ready_pickup_name.py`): `Order.pickup_name = Column(String(80), nullable=True)` — sem outra mudança de schema; `"ready"` é só um novo valor de string na coluna `status` já existente (`VARCHAR(20)`), mesma convenção de nomenclatura já usada (`pending`, `paid`, `completed` — minúsculo, sem prefixo).
- **`POST /orders`:** corpo aceita `pickup_name: Optional[str]` (sem validação de unicidade, conforme cenário acima); persiste em `Order.pickup_name` se vier.
- **Novo endpoint `POST /orders/{order_ref}/ready`:** carrega o pedido escopado por `company_id`, valida `order.status == "paid"` (409 se não — evita marcar pronto um pedido já completed ou já ready), seta `status = "ready"`, commit, chama novo helper `broadcast_order_ready(company_id, order_ref, pickup_name)`. **Sem checagem de `fulfillment_mode` no order-service** — achado na implementação: order-service já é deliberadamente agnóstico a esse campo (é exclusivo do company-service; o comentário em `Order.qr_data` já documentava essa decisão desde o ORD-118), quem decide exibir a ação "Marcar pronto" é o frontend do admin, com base no `fulfillment_mode` que já vem no `CompanyInfo` do login — mesmo padrão já usado pra decidir mostrar/esconder a coleta manual.
- **`services/order/websocket.py`:** novo helper `broadcast_order_ready` (mesmo padrão de `broadcast_order_paid`/`broadcast_ticket_collected`), evento `{"event": "order.ready", "order_ref": ..., "pickup_name": ...}`.
- **Leitura pra popular as telas:** estender o filtro já usado por `GET /orders?status=paid` (usado hoje pelo `QueueScreen.tsx` do balcão) pra aceitar múltiplos status (`?status=paid,ready`) — mudança pequena na query existente (`WHERE status = :status` → `WHERE status IN (:statuses)`), sem endpoint novo.

### 2. Tela operacional no admin
- **Nova tela** `frontend/admin/src/screens/FulfillmentScreen.tsx`, rota `/fulfillment` (nome exato a validar com o usuário — "Preparo" foi cogitado).
- **Registro:** `App.tsx` — adicionar `/fulfillment` em `ROLE_ROUTES` pra `owner`/`manager`/`cashier`/`admin`/`superadmin`. **Nota:** hoje `cashier` só tem acesso a `/dashboard` e `/settings` — esta seria a primeira tela de pedidos que o cashier passa a acessar no admin, o que faz sentido (é quem opera a coleta hoje via balcão). `Sidebar.tsx` — novo item no array `MENU` com ícone e label, roles equivalentes.
- **Dados em tempo real:** replica o padrão de `frontend/balcao/src/ws.ts` (`WsManager`, reconexão com backoff exponencial, ping/pong, chip de status de conexão) — hoje o admin **não tem nenhum cliente WebSocket**, esta é a primeira tela do admin a precisar de um. Fetch inicial via `GET /orders?status=paid,ready`, depois eventos `order.paid`/`order.ready`/`order.completed`/`ticket.collected` mantêm a lista atualizada (mesmo padrão de `handleWsEvent` do balcão).
- **UI:** duas colunas — "Em preparo" (status `paid`) e "Pronto" (status `ready`) — cada card com nome/número do pedido e um botão de ação (`Marcar pronto` na coluna esquerda → `POST /orders/{ref}/ready`; `Marcar coletado` na coluna direita → `POST /orders/{ref}/collect` sem `qr_data`, do ORD-118). Só aparece/faz sentido quando a empresa selecionada tem `fulfillment_mode = "retirada_unica"` — condicional de exibição a decidir (ocultar do sidebar, ou mostrar estado vazio explicativo).

### 3. Painel público (novo frontend)
- **Novo diretório `frontend/painel`**, estrutura idêntica ao `frontend/balcao` (o mais enxuto dos três hoje): mesmo `package.json` mínimo (react, react-dom, axios, zustand — **sem** `jsqr`, não precisa de câmera), mesmo padrão de `Dockerfile`/`nginx.conf`, mesmo `vite.config.ts` com proxy de dev.
- **Sem tela de login** — diferente dos três frontends existentes, que hoje sempre proxyam `/auth/`. `App.tsx` vai direto pra tela do painel, sem gate de `accessToken`.
- **Autenticação/escopo por empresa — confirmado pelo usuário (2026-08-24): reaproveitar o pareamento por token do ORD-042.** Mecanismo real (verificado no código, não só no doc da história — o doc do ORD-042 tem uma imprecisão: descreve o JWT sendo emitido no company-service, mas na implementação real quem emite é o auth-service):
  1. `POST /auth/device/challenge` (sem auth) gera um código de 6 caracteres (charset sem `I/O/0/1`) + guarda `device_challenge:{code}` no Redis com `status:"pending"`, TTL 300s — **reaproveitado sem mudança**, é genérico o suficiente.
  2. Novo endpoint equivalente ao `POST /companies/{id}/devices/approve`, mas pro painel (ex: `POST /companies/{id}/panels/approve {code}` — sem `terminal_id`, painel não é um terminal de venda) — auth exigida, `company_id` **sempre** derivado do JWT de quem aprova (nunca do body, mesma proteção contra IDOR documentada no ORD-042), sobrescreve a chave Redis com `status:"approved"` + `company_id`, TTL 60s.
  3. `GET /auth/device/status?code=` (reaproveitado, sem auth, já genérico) — ao ler `status:"approved"`, emite um JWT **com role própria** (ex: `role: "painel"`, não `"kiosk"`) contendo só `company_id` (sem `terminal_id`, sem permissão de escrita nenhuma) — token estático de longa duração (mesmo padrão de 12h sem refresh do kiosk, ou maior, a definir; painel troca de token relogando/reparando quando expira, mesmo comportamento do totem hoje) — e deleta a chave Redis (consumo único).
  4. `frontend/admin/src/screens/PairScreen.tsx` ganha um segundo modo/aba ("Parear painel") reaproveitando a mesma UI de código+dropdown, sem campo de terminal.
  5. `frontend/painel` reaproveita a tela de pareamento do totem como referência de UX (código monoespaçado, QR, polling a cada 5s, contagem regressiva) — adaptada pra tela grande/TV em vez de touch kiosk.
- **Autorização nas rotas de leitura do order-service — achado na implementação, mais simples do que o previsto:** `GET /orders` não tem whitelist de role nenhuma (`list_orders`, `services/order/main.py`) — qualquer role autenticado com `company_id` já recebe só os pedidos da própria empresa (`else: base_filters = [Order.company_id == current_user.company_id]`), sem checagem explícita de quais roles são aceitos. E o WebSocket `/ws/orders` (`services/order/websocket.py`, `ws_orders`) **não tem autenticação nenhuma** — só recebe `company_id` via query string, sem token. Ou seja: o token `role: "painel"` já funciona nos dois endpoints sem nenhuma mudança de autorização no order-service — só precisa existir (ser emitido pelo auth-service) pra `GET /orders` funcionar; o WS nem exige token. Continua sem acesso a nenhum endpoint de escrita (criar/editar/coletar pedido), porque o painel nunca chama nenhum deles.
- **`docker-compose.yml`:** novo serviço `painel`, `build: ./frontend/painel`, porta `3003:80`, mesmo `networks`/`depends_on` dos outros três.
- **`nginx.conf`:** só proxy de `/orders` (leitura) e `/ws/` — sem `/auth/`.
- **UI:** duas colunas grandes ("Em preparo" / "Pronto para retirada"), fonte grande e alto contraste (tela vista a distância, tipicamente numa TV), cards com nome ou "Pedido #N", mesma lógica de consumo de WebSocket do item 2 acima (fetch inicial + eventos, reconexão com backoff).
- **Identidade visual — diretriz do usuário (2026-08-24):** o painel é visto pelos clientes acompanhando o próprio pedido, não pela operação — precisa ter a **mesma aparência escolhida pra empresa no totem**, não um visual genérico novo. Reaproveita `frontend/totem/src/themes.ts` (`THEME_REGISTRY`/`resolveTheme`) e `scale.ts` tal como estão, sem reescrever paleta. Resolve o tema a partir do `company.visual_theme`/`company.visual_mode` retornado junto com o token do painel (mesmo padrão do totem, `App.tsx`: `resolveTheme(company.visual_theme ?? "ordin", company.visual_mode ?? "light")`) — é a mesma "funcionalidade de troca de tema" do totem (por empresa, `light`/`dark`, sem toggle de usuário — o totem também não tem toggle em runtime, é config do admin).

### Estimativa
**G** — depende da ORD-118, introduz um frontend inteiro novo (mesmo que enxuto) e a primeira tela WebSocket do admin. Maior peça de esforço desta dupla de histórias.

### Riscos técnicos identificados
- Autenticação do painel público é a decisão mais delicada em aberto — expõe nome/número de pedidos sem login; mitigação natural é o link não ser adivinhável (token de pareamento), não um `company_id` sequencial na URL.
- Cashier ganhando acesso a uma tela de pedidos no admin pela primeira vez — checar se isso não abre superfície indesejada (ex: essa tela não deve expor nada além do necessário pra operação de preparo/coleta).

## Próximos passos
Upstream completo, sem bloqueadores abertos — mecanismo de pareamento do painel confirmado pelo usuário (2026-08-24), reaproveitando ORD-042. **Status: Ready.**
