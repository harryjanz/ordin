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

### 🚧 Bloqueio real (2026-09-01): Bluetooth da unidade recebida não funciona

Máquina chegou e, ao tentar configurar o SDK (setup em Linux x86, ver seção de arquitetura
abaixo), o Bluetooth não ativa. Diagnóstico feito nesta sessão, sintomas reproduzidos e
descartadas as causas mais óbvias, nessa ordem:

1. Firmware confirmado atualizado — não é versão desatualizada.
2. Menu `F1 > 6 (Configurações Gerais)` **não tem opção de Bluetooth** — lista real vista no
   aparelho: Atualização, Ajustes da maquininha, Senha administrativa, Configuração remota,
   Desativação, ID do equipamento, Manual digital.
3. Atalho documentado (tecla "0" na tela inicial, pra tornar o Bluetooth descobrível) não
   produz nenhuma mudança visível.
4. 4 scans via `bluetoothctl` no Linux (~35s cada) — nenhum dispositivo compatível encontrado.
5. Pareamento direto pelo Bluetooth de um celular comum (fora de qualquer SDK) — também não
   encontra a maquininha.
6. Ícone de Bluetooth chegou a aparecer riscado em um momento, depois sumiu de novo — sugere
   instabilidade do rádio, não um simples "desligado por padrão".
7. **USB-C funciona normalmente** — o Linux reconhece a maquininha como dispositivo USB válido
   (`idVendor=1e0e idProduct=902b`, fabricante real **Newland, Incorporated**, expõe porta
   serial `cdc_acm`/`/dev/ttyACM0`). Isso descarta "aparelho morto" — a placa/firmware em geral
   está operante, o problema parece isolado ao rádio Bluetooth.

Achado corroborante: existem reclamações públicas reais com o mesmo sintoma exato —
["Moderninha Pro não conecta por Bluetooth"](https://www.reclameaqui.com.br/pagseguro/moderninha-pro-nao-conecta-por-bluetooth_RZqwE5d9IfpMkfVw/)
e
["Moderninha Pro 2 sem Bluetooth e informações incorretas na página de vendas"](https://www.reclameaqui.com.br/pagseguro/moderninha-pro-2-sem-bluetooth-e-informacoes-incorretas-na-pagina-de-vendas_yIB0nBEdJ5w9PowE/)
— usuários relatando que a máquina anuncia Bluetooth mas a unidade recebida não oferece a opção,
testado com vários celulares/tablets.

#### Atualização (mesma sessão, mais tarde): setup completo, diagnóstico refinado até a camada de protocolo

Depois do achado acima, o usuário conseguiu (via menu `F1 > 6 > Ajustes da maquininha`, não
`F1 > 6 > 4` como um guia desatualizado sugeria) fazer o ícone de Bluetooth aparecer. Com o MAC
real identificado (`40:19:20:5D:B2:2C`), o setup do SDK foi concluído de ponta a ponta:

- `btserial-1.3.3`/`plugpag-1.3.3` (x64) instalados em `/usr/local/lib` + `/usr/local/include`,
  confirmados no `ldconfig`
- `rfcomm bind /dev/rfcomm0 40:19:20:5D:B2:2C 1` — bind correto confirmado (`rfcomm` mostra o MAC
  certo, não mais `00:00:00:00:00:00` de uma tentativa anterior com MAC digitado errado)
- Demo oficial (`CommandPromptTest.c`, do repositório `pagseguro/plugpag`) compilado com sucesso
  contra as libs instaladas
- Teste real disparado (`./CommandPromptTest COM0 1 1 1 100 TESTE01`, R$1,00, sem sandbox)

**Resultado do teste — a instabilidade fica visível em uma camada mais profunda do que
"não pareia" ou "não conecta"**:
1. `hcitool con` chegou a mostrar uma **conexão ACL ativa** com o MAC real da maquininha
   (`state 5 lm CENTRAL`) — o rádio Bluetooth **consegue** subir uma conexão.
2. O processo do teste travou no kernel (`tty_port_block_til_ready`) tentando abrir
   `/dev/rfcomm0` — a conexão ACL subiu, mas o canal RFCOMM (a "porta serial" lógica por cima do
   Bluetooth, é o que o PlugPag usa de fato) nunca terminou de negociar. Tela da maquininha não
   mudou em nenhum momento.
3. Tentativas manuais logo em seguida (`sdptool browse` e `rfcomm connect` direto, fora do
   binário) — ambas retornaram **`Host is down`**, ou seja, a conexão ACL já tinha caído sozinha
   entre uma tentativa e outra.

**Hipótese testada e descartada — coexistência Wi-Fi/Bluetooth**: o usuário notou por conta própria
que o ícone de Bluetooth reaparecia ao desconectar o Wi-Fi do terminal, sugerindo conflito de
coexistência num chip combo (padrão comum em POS baratos). Testado diretamente: com Wi-Fi
desconectado, `rfcomm connect` e `sdptool browse` pro MAC conhecido continuaram retornando
**`Host is down`**, sem nenhuma conexão ACL sequer passageira dessa vez — pior que antes, não
melhor. O ícone continuou aparecendo riscado e sumindo mesmo sem Wi-Fi. **Conclusão: não é
coexistência de rádio** — a instabilidade acontece independente do estado do Wi-Fi.

**Conclusão final desta sessão**: não é falha de configuração, MAC, bind, ou setup do SDK — tudo
isso está confirmado correto. Também não é coexistência com Wi-Fi (testado e descartado acima).
É **instabilidade real do rádio Bluetooth da unidade**: consegue conectar por um instante, mas não
sustenta o suficiente pra completar o handshake do canal de dados nem responder consulta de
serviço (SDP). Coerente com o ícone que já tinha sido visto piscando (riscado → sumido, com e sem
Wi-Fi) e com os relatos públicos citados acima. Provável defeito de hardware/lote nesta unidade
específica. Encaminhado ao suporte PagBank pra avaliação de troca/garantia, agora com evidência
técnica de protocolo (não só "não pareia") — **integração PlugPag bloqueada até resolução do
hardware**, independente de qual arquitetura (RPi/Windows/
Linux) for escolhida depois, já que nenhuma delas contorna um rádio Bluetooth instável.

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

**Proposta A — totem em Raspberry Pi (ARM) rodando o agente nativamente**

```
Totem (web, RPi) ──localhost──▶ Agente local (SDK PlugPag, build ARM) ──Bluetooth──▶ Moderninha Pro 2
        │
        └─ reporta resultado ──▶ payment-service (cloud)
```

**Correção (2026-09-01, sessão de setup do ambiente dev)**: a afirmação original abaixo estava
**errada**. Baixei e inspecionei o conteúdo real dos pacotes do repositório oficial
(`github.com/pagseguro/plugpag`, pasta `1.x/`) — existe sim uma pasta `1.x/raspberry/1.3.3/` com
`btserial-1.3.3.tar.gz` e `plugpag-1.3.3.tar.gz` compilados pra ARM: `file` confirma
`libBTSerial.so` e `libPPPagSeguro.so` como `ELF 32-bit LSB shared object, ARM, EABI5`. Ou seja,
**o SDK PlugPag tem build nativo pra Raspberry Pi** — não precisa de bridge Android nenhum, o
agente local roda direto no RPi, igual à Proposta B, só que em ARM em vez de x86.

~~Motivo (afirmação original, incorreta): RPi3 é ARM, e o SDK PlugPag pra Windows/Linux é
distribuído como lib nativa sem suporte ARM confirmado — não dá pra rodar o SDK no próprio
RPi3.~~ Isso simplifica a Proposta A pro mesmo modelo da Proposta B (agente local, chamada
`localhost`), eliminando o segundo aparelho Android e o salto de rede LAN entre totem e bridge.

**Ressalva real, não resolvida**: os arquivos ARM têm timestamp de **2018** (mesma versão 1.3.3
do build x64, mesma data — pacote não é mantido separadamente há anos) e são **32-bit**. Raspberry
Pi OS atual roda 64-bit por padrão, então usar essa lib exige habilitar suporte a userspace 32-bit
(multiarch/`armhf`) ou usar uma imagem 32-bit — não validado na prática ainda. Antes de comprar
hardware Raspberry Pi assumindo que isso resolve, rodar um teste real de `dlopen`/link contra a
lib num RPi candidato.

**Proposta B — totem em mini-PC x86 (Windows ou Linux) rodando o agente localmente**

```
Totem PC x86 (mesma máquina)
  Totem (web, browser kiosk) ──localhost──▶ Agente local (SDK PlugPag) ──Bluetooth──▶ Moderninha Pro 2
                                                    │
                                                    └─ reporta resultado ──▶ payment-service (cloud)
```

Motivo: com x86, o SDK "Windows e Linux" do PlugPag roda na própria máquina do totem — elimina o
segundo dispositivo inteiramente, chamada vira `localhost` em vez de rede local. Mais simples,
menos peças físicas. Custo: mini-PC x86 (ex. Intel N100) custa mais que um RPi sozinho, mas com a
correção acima a Proposta A também não precisa mais de segundo aparelho — a comparação real entre
A e B passou a ser custo/robustez do hardware (RPi ARM vs mini-PC x86), não mais presença/ausência
de bridge Android.

Confirmado ao vivo (baixei e inspecionei o pacote `1.x/linux/1.3.3/x64/` do repositório oficial):
o build x64 é lib C pura (`libPPPagSeguro.so` + `libBTSerial.so`, `ELF 64-bit x86-64`, sem
dependência além de `libc`), instalada via `install.sh` (copia pra `/usr/local/lib` e
`/usr/local/include`) e pareamento via `rfcomm bind` sobre uma porta Bluetooth mapeada como serial
(`mapbluetostty.sh`). Mesma versão 1.3.3 e mesmo timestamp 2018 do build ARM — não é uma
plataforma mais madura que a outra, é o mesmo pacote represado há anos nas duas arquiteturas.

Em ambas, quem chama o bridge/agente primeiro é o **totem**, não o `payment-service` — evita o
problema de NAT/túnel reverso que existiria se a nuvem tivesse que alcançar um dispositivo atrás
do roteador da loja do cliente. O totem chama o bridge/agente local, e só depois reporta o
resultado final pro `payment-service` pra manter a auditoria/consistência de sempre.

### Decisão para o ambiente de desenvolvimento (2026-09-01)

Terminal físico já chegou. Para o ambiente de dev, o usuário optou por seguir com **Linux x86**
(Proposta B) — mesma arquitetura (agente local, `localhost`) continua válida como opção pra
produção em **Raspberry Pi (ARM)** ou **Windows**, decisão em aberto, não fechada aqui. A escolha
de Linux agora é só pra destravar o setup/validação do SDK no ambiente de desenvolvimento atual.

### Recomendação prática

1. **Antes de qualquer código de integração**: rodar o app Demo oficial (Moderninha PRO, Java) só
   pra validar que o terminal físico funciona e entender o fluxo de cobrança/estorno na prática.
2. Setup do SDK C no Linux x86 (pacotes `1.x/linux/1.3.3/x64/` do repo oficial, `gcc`, `bluez`,
   `rfcomm`) pode ser feito como spike de validação em paralelo — não é código de produção do
   Ordin até existir história `Ready` cobrindo essa arquitetura.
3. Só depois disso decidir se vale abrir upstream pra construir a ponte nativa de produção — é
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
  Pro 2 via PlugPag** — Bluetooth local, não API de nuvem; só viável se o totem ganhar um agente
  nativo local (Raspberry Pi ARM, Windows ou Linux x86 — as três têm build oficial do SDK,
  confirmado por inspeção direta dos pacotes) além do frontend web atual. Ambiente de dev
  (2026-09-01) seguindo com Linux x86; escolha de produção (RPi/Windows/Linux) ainda em aberto.
- **App de mesa em tablet (cenário futuro)**: dispositivo com NFC cobrando diretamente →
  **InfiniteTap** é candidato natural (deeplink simples, sem SDK); MP Tap to Pay seria o
  equivalente do lado Mercado Pago, mas hoje não tem API pública documentada.
