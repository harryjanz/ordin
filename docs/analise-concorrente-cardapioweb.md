# Análise comparativa — CardápioWeb (produto/UX)

Concorrente adicionado à lista de referência em 2026-08-21 (ver memória `project_ordin_concorrentes_referencia`). **Sem análise comercial/pricing aqui** — só produto e UX, mesmo critério das rodadas anteriores (`docs/analise-dashboard-concorrentes-mercado.md`).

## Posicionamento do Ordin (contexto que guia as escolhas abaixo)
- Solução **barata pra pequeno/médio estabelecimento**: setup baixo, mensalidade coerente por número de totens.
- **Multi-provedor de pagamento** (Mercado Pago, PayGo, e outros a inserir) — o dono escolhe/troca fornecedor sem lock-in.
- Produto **enxuto e focado em totem de autoatendimento** — não uma suíte corporativa.

## Diferença de porte importante: CardápioWeb não é um concorrente "totem-first"
Diferente de Goomer/Zig/Gototem (nascidos como totem/autoatendimento), o CardápioWeb é uma **plataforma de gestão de delivery e WhatsApp** (17.000+ clientes, chatbot com IA, disparo em massa, recuperação de carrinho, fidelidade, NFe, financeiro via F360, roteirização de entrega) — o totem é **um módulo a mais** dentro de um produto bem mais amplo, cobrado a partir de R$ 169,99/mês em 3 planos (Delivery, Premium, Mesas). Isso muda a leitura: a maior parte da superfície do produto (automação de WhatsApp, recuperação de carrinho, cupom, fidelidade, DRE) é **estrutural e fora de escopo** — não é algo que o Ordin deveria replicar sem virar um produto diferente do que é hoje. O que interessa de fato pra comparação é o módulo de totem em si.

## Baseline: o que o Ordin tem hoje
Fluxo do totem: PIN do terminal → catálogo → carrinho → (desde ORD-108) tela de **consumo no local ou para levar**, se a empresa tiver habilitado em Configurações → Comportamento → CPF opcional → pagamento (PayGo TEF ou Mercado Pago, incluindo PIX com confirmação automática via webhook, `services/payment/main.py`, sem conciliação manual) → tickets com QR por unidade de item.

---

## Leitura do módulo de totem do CardápioWeb, por seção

### 1. Fluxo de pedido (5 etapas declaradas)
"(1) Vitrine na tela (2) Cardápio completo (3) Montagem do pedido (4) Identificação por telefone (5) Pagamento na própria tela." Estrutura equivalente à do Ordin — a única etapa sem paralelo direto é a "vitrine" (tela de destaque/carrossel antes do cardápio completo, tipo tela de espera com produtos em destaque).

### 2. Consumir no local vs. para levar
"O próprio cliente escolhe entre 'comer aqui' e 'para levar' durante o pedido, e o pedido já entra classificado." **Isto é exatamente o que a ORD-108 acabou de implementar** — validação a posteriori de que a decisão de produto (e a classificação do pedido já na criação, consumida pelo balcão via badge) está alinhada com o que um concorrente consolidado (17k clientes) também oferece. Diferença de nomenclatura: eles usam "comer aqui"/"para levar" na tela do cliente; o Ordin decidiu (via pesquisa de mercado no Goomer, que usa "Meios de Consumo") por "Comportamento" no admin e telas próprias no totem — não há motivo pra mudar, é só um ponto de atenção de copy caso a pesquisa de usuário do totem aponte estranhamento com "consumir no local".

### 3. Identificação por telefone
Em vez do CPF opcional que o Ordin usa, o CardápioWeb identifica o cliente por telefone — provavelmente porque isso alimenta o programa de fidelidade e o disparo de WhatsApp deles (recursos que o Ordin não tem e não estão no escopo). Não é uma ideia isolada de melhoria de UX do totem; é consequência de uma feature de CRM/marketing que o Ordin não tem — mesmo racional de "fora de escopo" já aplicado a CRM da Zig na rodada anterior.

### 4. Pagamento no totem
Três formas: dinheiro (finaliza no totem, paga no caixa), cartão (terminal Smart TEF acoplado), Pix/saldo (confirmação automática via gateway próprio deles — "Tuna" —, sem conferência manual). O Ordin já cobre os três: dinheiro não é aceito no totem (n/a — modelo é 100% eletrônico), cartão via PayGo TEF, PIX com confirmação automática via webhook (ver baseline acima). **Nenhuma ideia nova aqui** — o Ordin já está no nível esperado, com a vantagem adicional (diferencial de produto) de não depender de um único gateway próprio como o Tuna do CardápioWeb.

### 5. Impressão por destino
Em totens Windows, "impressão automática do pedido" configurável por destinatário (cozinha, balcão, expedição). Não achei detalhe suficiente pra avaliar se isso é impressão de comanda de cozinha (KDS físico) ou só rota de impressora — precisa mais pesquisa se for perseguir essa ideia; sinalizado como possível item de baixo esforço/alto valor pra revisitar, não avaliado a fundo nesta rodada.

### 6. Restante do produto (fora do módulo de totem)
Chatbot com IA no WhatsApp, PDV dentro do WhatsApp, disparo em massa com filtro, fidelidade por pontos, cupom, recuperação de carrinho, integração com Meta Ads/Google Ads/Analytics, controle de caixa, estoque, NFe, roteirização de entrega, KDS, multi-impressora, controle de fiado, financeiro (F360), iFood — suíte de delivery completa. Tudo isso é **estrutural e fora de escopo**: o Ordin é (e deve continuar sendo) um produto de totem/autoatendimento presencial enxuto, não uma plataforma de delivery/CRM.

---

## Ideias coletadas

### Fora de escopo
- **Toda a camada de delivery/WhatsApp/CRM/fidelidade/financeiro** — produto estruturalmente diferente do Ordin, replicar isso mudaria o posicionamento (deixaria de ser "solução barata e enxuta pra totem").
- **Identificação por telefone no lugar do CPF** — só faz sentido junto de fidelidade/CRM, que não existe no Ordin.

### Já coberto pelo Ordin (validação, não é item novo)
- Fluxo de pedido em 5 etapas — equivalente ao que o Ordin já tem.
- Consumo no local/para levar classificado desde a criação do pedido — **ORD-108**, já em produção.
- PIX com confirmação automática sem conciliação manual — já existe via webhook no payment-service.

### Candidato a investigar depois (baixo esforço, valor incerto)
- **Impressão automática por destino (cozinha/balcão/expedição)** — pesquisar mais a fundo (inclusive olhando concorrentes com KDS, ex. Cplug/Zig, que também citam KDS/impressão) antes de virar ideia formal; não há dado suficiente ainda pra estimar esforço real ou se já é coberto de alguma forma pelo fluxo de tickets/QR do Ordin.

---

## Conclusão desta rodada
Diferente das rodadas anteriores (Goomer, dashboard dos 8 concorrentes), o CardápioWeb **não trouxe uma ideia nova de alto valor pro totem do Ordin** — o principal achado (comer aqui/para levar) já tinha sido implementado de forma independente na ORD-108, o que serve como validação de mercado da decisão. O grosso do produto deles vive fora do escopo do totem (delivery, WhatsApp, CRM), reforçando que CardápioWeb é mais um concorrente de "plataforma de gestão de delivery com totem incluso" do que um concorrente direto de totem como Goomer/Zig/Gototem. Único ponto em aberto pra uma futura rodada: impressão por destino de comanda, que precisa de mais pesquisa antes de virar item de backlog.
