# Análise comparativa — Mogo (produto/UX)

Concorrente adicionado à lista de referência em 2026-08-24 (ver memória `project_ordin_concorrentes_referencia`). **Sem análise comercial/pricing aqui** (o site não divulga valores) — só produto e UX, mesmo critério das rodadas anteriores (`docs/analise-dashboard-concorrentes-mercado.md`, `docs/analise-concorrente-cardapioweb.md`).

## Posicionamento do Ordin (contexto que guia as escolhas abaixo)
- Solução **barata pra pequeno/médio estabelecimento**: setup baixo, mensalidade coerente por número de totens.
- **Multi-provedor de pagamento** (Mercado Pago, PayGo, e outros a inserir) — o dono escolhe/troca fornecedor sem lock-in.
- Produto **enxuto e focado em totem de autoatendimento** — não uma suíte corporativa.

## Diferença de porte: Mogo também não é um concorrente "totem-first"
Igual ao CardápioWeb, a Mogo se apresenta como "Sistema para restaurantes que desejam modernizar do atendimento a gestão" — uma suíte completa: comanda eletrônica, controle de mesas/cartões, KDS, cardápio digital via QR-code, delivery, PDV unificado (mesa/comanda/delivery), controle fiscal (NFC-e/NF-e), controle financeiro (caixa, contas, DRE, CMV), estoque, fichas técnicas, controle de produção, automação de balança, gestão de clientes e fidelidade, dashboards. O totem de autoatendimento é **um módulo entre muitos** — mesma leitura já aplicada ao CardápioWeb: o grosso da superfície do produto é estrutural e fora de escopo pro Ordin.

Segmentos atendidos: pizzarias, buffet, bares/pubs, lanchonetes, cervejarias, sorveteria, casas noturnas, hamburgueria e delivery — sobreposição com o público já mapeado da Zig (bares/cervejarias/eventos) e Gototem.

## Baseline: o que o Ordin tem hoje
Fluxo do totem: PIN do terminal → catálogo → carrinho → (desde ORD-108) tela de **consumo no local ou para levar**, se a empresa tiver habilitado → CPF opcional → pagamento (PayGo TEF ou Mercado Pago, incluindo PIX com confirmação automática via webhook) → tickets com QR por unidade de item (HMAC-SHA256).

---

## Leitura do módulo de totem da Mogo

### 1. Fluxo de pedido (3 etapas declaradas)
"(1) O cliente se dirige ao totem, seleciona o que deseja. (2) Escolhe a forma de pagamento e paga diretamente pelo totem. (3) Depois, é só retirar o pedido no balcão ou aguardar ser chamado." Fluxo mais enxuto que o do Ordin — mas isso não é claramente uma vantagem: não há menção de identificação de pedido nem de granularidade por item (o "retirar no balcão"/"aguardar ser chamado" soa como retirada por senha/número de pedido geral, não por ticket individual de cada item como o QR por unidade do Ordin). Sem dado suficiente pra saber se é simplicidade deliberada ou ausência de recurso.

### 2. Identificação do cliente
**Nenhuma menção a CPF, telefone ou qualquer identificação pessoal** no fluxo do totem. Isso é uma validação a mais (terceiro concorrente, depois de Goomer e agora Mogo) de que **CPF/identificação obrigatória não é padrão de mercado** — reforça a decisão já tomada no Ordin de manter o CPF como campo opcional, e é consistente com o achado equivalente do CardápioWeb (que usa telefone, mas só porque alimenta CRM/fidelidade que a Mogo e o Ordin não colocam nesse fluxo).

### 3. Cardápio personalizável (modificadores)
"Cardápio personalizável" — clientes "ajustam seus pedidos" e personalizam "cada prato ou item de forma simples e intuitiva" com ingredientes e modificações. **Isto é literalmente o item "modificadores/complementos" que já está no backlog futuro do Ordin** (ver [[project_ordin_catalogo_backlog_futuro]], adiado por pedido explícito do usuário em 2026-08-07). Não é uma ideia nova — é mais uma validação de mercado de que esse item, quando for retomado, tem respaldo direto de concorrente (agora 2 sinais de mercado: o achado original que gerou o backlog, e este).

### 4. Formas de pagamento
Cartão de crédito/débito e Pix diretamente no totem. Ordin já cobre isso (PayGo TEF + Mercado Pago com Pix via webhook) — **nenhuma ideia nova aqui**, mesmo patamar.

### 5. Atualização de cardápio
"Atualizações rápidas no cardápio, incluindo preços, novos produtos e promoções" — apresentado como diferencial de marketing, mas é exatamente o que o `CatalogScreen.tsx` do admin já faz (CRUD completo de categoria/produto com reflexo no próximo login do totem). **Já coberto, sem gap.**

### 6. Restante do produto (fora do módulo de totem)
Comanda eletrônica, controle de mesas/cartões, KDS, delivery, PDV unificado, NFC-e/NF-e, financeiro (DRE/CMV), estoque, fichas técnicas, automação de balança, fidelidade, dashboards — suíte de gestão completa de restaurante. Tudo **estrutural e fora de escopo**, mesmo racional já aplicado ao CardápioWeb e à Zig.

---

## Ideias coletadas

### Fora de escopo
- **Toda a camada de gestão de restaurante** (comanda, mesas, KDS, PDV unificado, financeiro, estoque, fidelidade) — produto estruturalmente diferente, replicar mudaria o posicionamento do Ordin.

### Já coberto pelo Ordin (validação, não é item novo)
- CPF/identificação opcional — 3º concorrente (Goomer, CardápioWeb via ausência de motivo equivalente, agora Mogo) sem identificação obrigatória no totem.
- Pagamento cartão + Pix no totem — mesmo patamar, com a vantagem de multi-provedor (PayGo + Mercado Pago) que a Mogo não expõe.
- Atualização de cardápio via admin — já existe, sem gap.

### Reforça item já no backlog (não é novo, mas ganha prioridade relativa)
- **Modificadores/complementos por item** — já estava em `docs/analise-priorizacao-combo-modificadores.md` e no backlog adiado (ver [[project_ordin_catalogo_backlog_futuro]]). Este achado é o segundo concorrente (depois do achado original) a expor essa feature como algo central o suficiente pra virar frase de marketing — vale considerar isso na próxima priorização, sem decidir nada aqui.

### Sem dado suficiente pra avaliar
- **Retirada por "aguardar ser chamado"** — não ficou claro se é retirada por senha geral (menos granular que o ticket por unidade/QR do Ordin) ou algo equivalente. Precisaria de mais pesquisa (ex: vídeo demo, docs de suporte) se isso virar prioridade.

---

## Conclusão desta rodada
Terceira rodada seguida (depois de Goomer/dashboard e CardápioWeb) em que o concorrente **não traz uma ideia nova isolada de alto valor**, mas reforça duas decisões/itens já existentes no Ordin: (1) CPF opcional continua alinhado com o padrão de mercado, agora com 3 sinais; (2) modificadores/complementos por item — já no backlog adiado — ganha um segundo respaldo de mercado. Mogo, como o CardápioWeb, é mais uma "suíte de gestão de restaurante com totem incluso" do que um concorrente direto de totem como Goomer/Zig/Gototem/Consumer. Nenhum item novo de backlog foi criado nesta rodada — os dois achados relevantes já tinham lugar em memórias/documentos existentes.
