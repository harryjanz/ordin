# Análise: meios de pagamento e integrações de maquininha mapeadas

Consolida o que já foi pesquisado sobre opções de processamento de pagamento presencial
para o Ordin, além do que está implementado hoje. Ponto de partida pro roadmap de
providers já registrado em `docs/stories/ORD-025-paygo-tef-integracao.md` (tabela "Fase 2").

## Status atual (implementado)

| Provider | Tipo | Status no Ordin |
|---|---|---|
| **Mock** | Simulação (95% aprovação) | Ativo em dev/CI |
| **PayGo ControlPay** | TEF presencial via PIN-pad dedicado | Ativo (ORD-025), piloto |
| **Mercado Pago** | Gateway online (Pix/cartão via Orders API) + maquininha Point | Ativo (ORD-045/046/129/130/131/132/133) — detalhe abaixo |

## Mercado Pago — detalhe da integração com maquininha (já implementado)

Aplicação real registrada no MP: **ORDIN** (`app_id 4475219303194739`), verificada via MCP
`application_list`. Existe uma segunda aplicação (`BoomTickets`, projeto irmão) na mesma conta.

### O que já está integrado

| Capacidade | Status | Onde |
|---|---|---|
| PIX (QR na tela do totem) | ✅ Ativo | `_pix_payment`, `POST /v1/payments` |
| Cartão via Point (crédito/débito) | ✅ Ativo (API de Orders) | `_card_payment`, `POST /v1/orders` |
| Cancelamento de order não processada | ✅ Ativo | `POST /v1/orders/{id}/cancel` |
| Listar terminais Point da conta | ✅ Ativo | `GET /companies/{id}/mp-terminals` → `GET /terminals/v1/list` (ORD-133) |
| Validação de terminal duplicado entre totens | ✅ Ativo | company-service, nível de aplicação (ORD-133) |
| Webhook com assinatura HMAC validada corretamente | ✅ Ativo | `POST /payments/webhook/mercadopago/{company_id}` (ORD-130) |
| Webhook secret por empresa (multi-tenant) | ✅ Ativo | `company_payment_configs.webhook_secret` (ORD-131) |
| Auditoria completa (requests + webhooks) no Mongo | ✅ Ativo | `ordin_audit.payment_events` (ORD-132) |
| Credenciais centralizadas no backend (nunca no terminal) | ✅ Ativo | `company_payment_configs`, criptografado |
| **Reembolso** (`POST /v1/orders/{id}/refund`) | ❌ Não implementado — [[ORD-147]] aberta (New, prioridade crítica) | endpoint existe na API MP, nunca chamado no código — `grep refund` em `services/payment/` não retorna nada |
| **Troca de modo PDV/STANDALONE** (`PATCH /terminals/update-operation-mode`) | ❌ Não implementado — [[ORD-148]] aberta (New) | `operating_mode` só é **lido** (exibido no select do ORD-133), nunca setado pelo Ordin |
| Alertas de dispositivo (reset, desvinculação, troca de modo) | ❌ Não implementado | tópico de webhook dedicado do MP, não assinado |
| Relatório de liquidação/settlement | ❌ Não implementado | fora do escopo até hoje |

Padrão técnico em uso (`services/company/main.py`, `services/payment/main.py`):
- `Terminal.mp_device_id`, formato `{tipo_terminal}__{serial}`
- Terminais oficialmente suportados: **Point Smart 1/2, Point Pro 2, Point Pro 3**
- Fluxo: pedido é criado no totem → order enviada pra API do MP (`type: "point"`, valor em
  string decimal, não centavos) → maquininha física pareada recebe a cobrança automaticamente
  (modo PDV) → totem não precisa de hardware NFC próprio

### Dificuldades já encontradas e corrigidas (histórico real, não hipotético)

1. **API legada (ORD-129)** — `MPProvider` (ORD-046) foi implementado contra a **API de Payment
   Intents** (`/point/integration-api/...`), que o MP já havia depreciado. Confirmado ao vivo
   contra a API real: `403 PA_UNAUTHORIZED_RESULT_FROM_POLICIES`. Ninguém tinha percebido porque
   nenhuma empresa seed tinha `mp_device_id` real configurado — bug adormecido. Migrado pra API
   de Orders.
2. **Assinatura de webhook sempre inválida (ORD-130)** — `_verify_mp_signature` usava um manifest
   errado (`id:{x-request-id}` em vez de `id:{data.id em minúsculas}`, faltando o campo
   `request-id:`). Resultado: **todo webhook MP deste projeto sempre foi rejeitado com 401**,
   desde a implementação original. Confirmado comparando com uma notificação real capturada via
   ngrok de uma cobrança de R$1,00 aprovada. Corrigido e revalidado com o payload real.
3. **Webhook secret global, não multi-tenant (ORD-131)** — o secret de validação era uma env var
   única (`MP_WEBHOOK_SECRET`), mas cada empresa tem sua própria aplicação/conta MP com secret
   próprio. Quebraria assim que a segunda empresa configurasse MP. Corrigido: secret por empresa
   + URL de webhook por empresa (`/payments/webhook/mercadopago/{company_id}`).
4. **MP Device ID como texto livre (ORD-133)** — causa raiz de uma investigação real de "por que
   a maquininha não recebe pedidos automaticamente": erro de digitação humano no `mp_device_id`,
   sem nenhuma validação de formato nem de duplicidade entre terminais.

### Achado ao vivo desta sessão — saúde real dos webhooks (`notifications_history`, app ORDIN)

Diagnóstico direto da conta MP real, últimos 30 dias: **53,8% de sucesso (7 de 13 notificações)**.

| Erro | Ocorrências | Datas |
|---|---|---|
| `502` (erro no servidor do Ordin) | 4 | 2026-08-29, 2026-08-31 (×3) |
| `404` (rota não encontrada) | 2 | 2026-08-31 01:56 |

Os `404` batem com o período de transição da URL de webhook (ORD-130/131 mudaram a rota de
`/payments/webhook` → `/payments/webhook/mercadopago/{company_id}`, exigindo reconfiguração
manual no painel MP). Os `502` são mais preocupantes — indicam o `payment-service` indisponível
ou retornando erro no momento da entrega, e ainda não foram investigados. **Vale abrir uma
apuração dedicada** (não feita aqui, só o diagnóstico) antes de considerar o webhook MP
totalmente confiável em produção.

### Checklist oficial de qualidade Mercado Pago (via MCP `quality_checklist`) — leitura contra o código atual

Itens **obrigatórios** ("implement") que o Ordin já atende: cobrança via dispositivo Point,
cobrança com integração PDV, `external_reference` (usa `order_ref`), webhooks, credenciais
centralizadas. Não atende (nem precisa, dado o modelo do Ordin): criação de lojas/caixas via API
— o Ordin gerencia "empresas"/"terminais" no próprio domínio, não replica isso como Store/POS do
MP.

Boas práticas ("good_practices") que o Ordin **não** atende hoje, sinalizadas pelo próprio MP:
reembolsos (`refunds_api`), troca de modo do dispositivo (`Switch device mode`), alertas de
dispositivo (`alert_device_system`), relatórios de liquidação/transações (`settlement`/`release`).
Nenhum bloqueia o fluxo atual, mas são os próximos gaps naturais se o volume de produção crescer
— reembolso em especial, já sinalizado desde o ORD-129 como risco em aberto (ORD-079 documenta o
guard que impede cancelamento de cartão MP já aprovado, mas não existe um caminho de estorno real).

### Mercado Pago Tap to Pay (pesquisado 2026-08-31)

Busca exaustiva na documentação oficial de desenvolvedores do MP: **Tap to Pay não aparece
listado entre os terminais integráveis via API** (só Point Smart/Pro). Não há endpoint
documentado equivalente ao `operating_mode`/PDV pra esse modo. Documentação pode estar
atrasada em relação à disponibilidade real do produto — se isso virar prioridade real,
confirmar direto com o time comercial do MP antes de assumir que não dá.

## InfinitePay (pesquisado 2026-09-01)

Dois produtos, nenhum equivalente ao modo PDV do Point Pro 3:

| Produto | O que é | Como funciona |
|---|---|---|
| **InfiniteTap** | Celular do operador vira maquininha (Android 11+, NFC) | **Deeplink**, não API/SDK: "a venda é iniciada no seu sistema de gestão e o cliente é redirecionado para concluir o pagamento no aplicativo da InfinitePay" — quem cobra o cartão é o app da InfinitePay, aberto no **mesmo aparelho** |
| **Checkout Integrado** | Link de pagamento online (`POST api.checkout.infinitepay.io/links`) | API REST real, com webhook — mas é pra venda online (cartão até 12x ou Pix), não cartão presente num terminal físico |

**Não existe** hardware dedicado nem API pra disparar cobrança remotamente numa maquininha
InfinitePay separada, como o Ordin faz hoje com o MP Point. Pra usar InfiniteTap, o próprio
dispositivo que roda o Ordin precisaria ter NFC e rodar o app da InfinitePay.

**Por isso não serve pro totem atual** (arquitetura de terminal físico separado, pareado,
acionado remotamente pelo backend) **mas pode servir pra um cenário futuro diferente**:
app em tablet que o garçom leva até a mesa do cliente e cobra ali mesmo — nesse caso o
tablet *é* o dispositivo NFC, e o modelo de deeplink do InfiniteTap se encaixa naturalmente
(inclusive tem reconciliação automática dos dados de venda depois do pagamento). Vale
reavaliar quando/se esse app de mesa entrar em pauta.

Contato pra dúvidas técnicas não documentadas publicamente: `parcerias@cloudwalk.io`.

## PagBank / Moderninha Pro 2 (pesquisado 2026-09-01 — máquina comprada, chega em 2 dias)

Pesquisa feita direto na documentação oficial (`developer.pagbank.com.br`), logado no portal
do desenvolvedor do usuário.

### Não é API REST — é SDK nativo local via Bluetooth (**PlugPag**)

Diferente de tudo mapeado até agora (MP Orders API, InfinitePay), o PagBank **não oferece uma
API de nuvem que empurra pedido pra uma maquininha pareada remotamente**. O produto se chama
**PlugPag** e funciona assim, confirmado na doc oficial ("Estrutura da aplicação"):

> "A comunicação entre a automação comercial e os terminais é realizada via **bluetooth**, e a
> comunicação com os servidores é realizada via GSM/WIFI."

Fluxo real: **seu app (rodando local, perto da maquininha) ↔ Bluetooth ↔ terminal Moderninha ↔
GSM/WiFi ↔ servidores PagBank**. O terminal é quem fala com o PagBank — seu sistema nunca chama
a nuvem do PagBank diretamente pra processar a transação, só troca comandos com o terminal via
Bluetooth (MAC address do terminal, sem login — a conta já está vinculada ao aparelho).

### Terminais suportados e o que dá pra fazer

| Terminal | Conectividade |
|---|---|
| Minizinha | Bluetooth only |
| Moderninha Plus | Wi-Fi, Bluetooth, NFC |
| **Moderninha Pro** (a comprada — "Pro 2" é a revisão de hardware atual da mesma linha) | GPRS/3G, Wi-Fi, Bluetooth, NFC |

Operações suportadas via PlugPag: **Crédito** (parcelado vendedor/loja), **Débito**,
**Estorno** (total ou parcial), **Cancelamento**, **Reimpressão de comprovante**. Bandeiras:
Mastercard, Visa, Elo, Cabal, Hipercard, Banricompras + vouchers (Sodexo, Ticket, VR, Alelo).

**Regra de prazo de estorno, documentada oficialmente** (mesmo tipo de achado que fizemos pro
MP): com o cartão presente, estorno total só no **mesmo dia** da transação — depois disso só o
cliente resolve pelo IBanking dele. Estorno **parcial**: até **30 dias**, exige saldo disponível
em conta e não pode ter saque automático ativo.

### SDK Android — detalhes técnicos e riscos concretos

```gradle
maven { url 'https://github.com/pagseguromaster/plugpag/raw/master/android' }
implementation 'br.uol.pagseguro.client:btserial:1.1.0'
implementation 'br.uol.pagseguro.client:plugpag:1.1.0'
```

- **Suporte documentado: API level 16 (Jelly Bean) a 26 (Android 8.0 Oreo)** — SDK visivelmente
  antigo (Oreo é de 2017); precisa validar na prática se funciona em Android mais recente antes
  de assumir que sim.
- Repositório Maven hospedado direto no GitHub raw (não é Maven Central nem um registry
  oficial) — funciona, mas é um ponto de fragilidade de build a monitorar.
- **Não funciona com o aparelho rooteado** ("por motivos de segurança") — atenção se o totem
  usar root pra travar o Android em modo kiosk, padrão comum nesse tipo de hardware.
- **Sem ambiente de sandbox** pra esse modo de captura — a doc é explícita: "não há ambiente de
  testes... os terminais já estão conectados diretamente no PagBank". Todo teste é contra o
  terminal real. Mitigado por **apps Demo oficiais** (Moderninha PRO/WIFI, Java) que dá pra
  rodar sem escrever nenhuma linha de código, só pra confirmar que a maquininha em si funciona.

### Por que isso não é só "mais um provider" pro Ordin — é uma peça de arquitetura nova

Confirmado no código: `frontend/totem` é um **app web** (React + Vite, `react-dom`, sem
`react-native`/Expo). O SDK PlugPag é nativo (Android/iOS/Windows/Linux) e precisa de rádio
Bluetooth local — **um navegador não acessa isso**. Isso é fundamentalmente diferente de MP
Point (nuvem empurra pedido pro terminal pareado, o `payment-service` já faz isso hoje) e de
PayGo (também server-to-server via ControlPay Webservice, mesmo padrão do `payment-service`).

Pra integrar a Moderninha via PlugPag, o Ordin precisaria de uma peça nova que **não existe
hoje**: um agente/app nativo rodando fisicamente perto da maquininha (o próprio totem, se ele
puder rodar um app Android nativo em vez de só o navegador web) que fala Bluetooth com o
terminal e expõe uma ponte local (ex.: HTTP localhost) pro totem web chamar — ou substituir o
totem web por um app Android nativo naquele ponto de venda específico. Isso é escopo de
Tech Explorer de verdade, não uma decisão a assumir aqui.

### Duas propostas preliminares de arquitetura (esboço, não decidido — ver 2026-09-01)

Em ambas, o `payment-service` ganharia um `PagBankProvider` novo implementando `IPaymentProvider`
(mesma abstração já usada por `MPProvider`/`PayGoProvider`) — a diferença entre as propostas é
só o que existe do lado físico, na loja, pra esse provider (ou o totem) conseguir alcançar.

**Proposta A — totem em Raspberry Pi 3 (ARM) + bridge dedicado em Android**

```
Totem (web, RPi3) ──LAN──▶ Bridge (Android, SDK PlugPag) ──Bluetooth──▶ Moderninha Pro 2
        │                          │
        │                          └─ reporta resultado ──▶ payment-service (cloud)
```

Motivo: RPi3 é ARM, e o SDK PlugPag pra Windows/Linux é distribuído como lib nativa sem suporte
ARM confirmado — não dá pra rodar o SDK no próprio RPi3. Precisa de um segundo aparelho, barato
e dedicado (Android é o alvo mais maduro do PlugPag), só pra fazer a ponte Bluetooth. Custo:
RPi3 + aparelho Android extra. Complexidade extra: mais um dispositivo físico por totem, chamada
via rede local (LAN) entre totem e bridge.

**Proposta B — totem em mini-PC x86 (Windows ou Linux) rodando o agente localmente**

```
Totem PC x86 (mesma máquina)
  Totem (web, browser kiosk) ──localhost──▶ Agente local (SDK PlugPag) ──Bluetooth──▶ Moderninha Pro 2
                                                    │
                                                    └─ reporta resultado ──▶ payment-service (cloud)
```

Motivo: com x86, o SDK "Windows e Linux" do PlugPag roda na própria máquina do totem — elimina o
segundo dispositivo inteiramente, chamada vira `localhost` em vez de rede local. Mais simples,
menos peças físicas. Custo: mini-PC x86 (ex. Intel N100) custa mais que o RPi3 sozinho, mas
comparável ao total da Proposta A (RPi3 + Android) já que elimina o segundo aparelho. Precisa
verificar na prática qual das duas plataformas (Windows/Linux) o SDK PlugPag tem suporte mais
maduro — a doc trata as duas no mesmo guia, mas TEF no Brasil historicamente é mais testado em
Windows.

Em ambas, quem chama o bridge/agente primeiro é o **totem**, não o `payment-service` — evita o
problema de NAT/túnel reverso que existiria se a nuvem tivesse que alcançar um dispositivo atrás
do roteador da loja do cliente. O totem chama o bridge/agente local, e só depois reporta o
resultado final pro `payment-service` pra manter a auditoria/consistência de sempre.

### Recomendação prática pra quando a máquina chegar (2 dias)

1. **Antes de qualquer código**: rodar o app Demo oficial (Moderninha PRO, Java) só pra validar
   que o terminal físico funciona e entender o fluxo de cobrança/estorno na prática.
2. Só depois disso decidir se vale abrir upstream pra construir a ponte nativa — é
   trabalho de arquitetura novo, não um provider a mais no `IPaymentProvider` existente.

## Ainda no roadmap, não pesquisado em profundidade

| Provider | Tipo | Motivo (do ORD-025) |
|---|---|---|
| **Stone / Pagar.me** | Maquininha própria + gateway | Split nativo, Connect 2.0 |
| **Adyen for Platforms** | Multi-adquirente, omnichannel | Escala internacional |

## Resumo — o que serve pra quê

- **Totem fixo, integração server-to-server (arquitetura atual)**: precisa de maquininha física
  separada, pareada, acionável remotamente pelo backend via API de nuvem → só **PayGo TEF**
  (ativo) e **MP Point Pro 2/3 / Smart 1/2** (ativo) atendem esse requisito hoje.
- **Totem fixo, mas exige app nativo local (peça de arquitetura nova)**: **PagBank Moderninha
  Pro 2 via PlugPag** — Bluetooth local, não API de nuvem; só viável se o totem ganhar um
  componente nativo (Android/Windows/Linux) além do frontend web atual.
- **App de mesa em tablet (cenário futuro)**: dispositivo com NFC cobrando diretamente →
  **InfiniteTap** é candidato natural (deeplink simples, sem SDK); MP Tap to Pay seria o
  equivalente do lado Mercado Pago, mas hoje não tem API pública documentada.
