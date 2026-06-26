# ORD-054 — Layout em duas colunas no ticket impresso do totem

## Status
`Ready`

## Descrição
O ticket HTML gerado pelo totem exibe QR Code e informações do produto em coluna única centralizada, obrigando o operador do balcão a ler linha por linha para identificar produto e escanear o QR. Queremos redesenhar cada bloco de ticket com o título do produto em fonte grande ocupando a largura total no topo, e abaixo duas colunas — 40% à esquerda para o QR Code e 60% à direita para unidade e código. A mudança afeta apenas `buildPrintHtml` em `SuccessScreen.tsx`.

## Persona
**Operador de balcão** — recebe o ticket físico e precisa identificar o produto e escanear o QR Code o mais rápido possível durante o pico de atendimento.

## Contexto
Com o novo layout, o operador vê o nome do produto em destaque imediatamente ao pegar o ticket, e consegue identificar o item e escanear o QR em uma única olhada lateral — reduzindo tempo de atendimento e erros de coleta.

---

## História
Como **operador de balcão**, quero que o ticket impresso exiba o nome do produto em destaque no topo e o QR Code ao lado das informações, para identificar e coletar pedidos mais rapidamente durante o pico de atendimento.

## Fluxo principal
1. Pagamento aprovado → `SuccessScreen` dispara `buildPrintHtml`
2. Cada ticket renderiza:
   - **Topo (100% largura):** nome do produto em fonte grande + bold
   - **Corpo (2 colunas):** QR Code (40% esq.) | unidade X/Y + código (60% dir.)
3. HTML abre em nova aba (mock) ou é enviado via QZ Tray (produção)

## Dependências
- ORD-052 / ORD-053 (já implementadas) — `buildPrintHtml` e fluxo de impressão

## Critérios de aceite funcionais
- [ ] Nome do produto ocupa largura total, fonte ≥ 14px bold
- [ ] QR Code fica na coluna esquerda (40%), centralizado verticalmente
- [ ] Unidade e código ficam na coluna direita (60%)
- [ ] Layout funciona em largura 80mm (sem overflow horizontal)
- [ ] QR Code permanece escaneável (mínimo 28mm / ~106px)
- [ ] `tsc --noEmit` sem erros

---

## Explorer

### Contexto visual
```
┌────────────────────────────────────────┐
│  HEADER: empresa, data, ref, total     │
├────────────────────────────────────────┤
│  - - - - - - - ✂ - - - - - - -        │
├────────────────────────────────────────┤
│  NOME DO PRODUTO (bold, grande)        │
│  ┌────────────┐  Unidade 1 de 3       │
│  │            │                        │
│  │  QR CODE   │  Cód: XXXX-XXXX-XX   │
│  │  (40%)     │                        │
│  └────────────┘  (60%)                │
├────────────────────────────────────────┤
│  - - - - - - - ✂ - - - - - - -        │
│  (próximo ticket...)                   │
└────────────────────────────────────────┘
```

---

## QA Explorer

```gherkin
Feature: Layout em duas colunas no ticket impresso
  Como operador de balcão
  Quero ver o produto em destaque e o QR ao lado das infos
  Para coletar pedidos com mais agilidade

  Background:
    Dado que o pagamento foi aprovado com 2 tickets de produtos diferentes

  Scenario: Produto em destaque no topo do ticket
    Quando o HTML de impressão é gerado
    Então cada bloco de ticket tem o nome do produto em largura total
    E a fonte do nome é bold com tamanho ≥ 14px

  Scenario: QR Code na coluna esquerda (40%)
    Quando o HTML de impressão é gerado
    Então o QR Code ocupa aproximadamente 40% da largura do ticket
    E está posicionado à esquerda
    E tem tamanho mínimo de 106px (≈28mm) para ser escaneável

  Scenario: Informações na coluna direita (60%)
    Quando o HTML de impressão é gerado
    Então "Unidade X de Y" aparece na coluna direita
    E o código do ticket aparece na coluna direita
    E ambos estão alinhados à esquerda

  Scenario: Sem overflow em papel 80mm
    Quando o HTML é renderizado com largura 80mm
    Então não há scroll horizontal
    E nenhum elemento ultrapassa a largura da página

  Scenario: Múltiplos tickets mantêm separação visual
    Dado que o pedido tem 3 tickets
    Quando o HTML é gerado
    Então cada ticket tem a linha de corte "✂" antes e depois
    E o layout de 2 colunas se repete para cada ticket
```

---

## Tech Explorer

### Serviços impactados
- `frontend/totem/src/screens/SuccessScreen.tsx` — apenas função `buildPrintHtml`

### Mudança técnica
Substituir o bloco `.ticket` (coluna única) por estrutura com tabela CSS ou `display: flex`:

```html
<!-- Estrutura por ticket -->
<div class="ticket-name">NOME DO PRODUTO</div>
<div class="ticket-body">
  <div class="ticket-qr"><!-- SVG QR Code 110px --></div>
  <div class="ticket-info">
    <div>Unidade X de Y</div>
    <div>Cód: XXXX</div>
  </div>
</div>
```

**Decisão: `display: table` em vez de `flexbox`**
CSS tables têm compatibilidade superior em renderers de impressão (Chromium print engine e QZ Tray HTML renderer). Evita quebras de layout ao paginar.

### QR Code size
- Papel 80mm, margens 3mm cada lado → área útil ≈ 74mm
- 40% de 74mm ≈ 29.6mm → usar `width: 110px` no SVG (≈29mm a 96dpi)
- Escanável: mínimo recomendado 25mm ✓

### Estimativa
- Frontend: 30min

### Riscos
Nenhum significativo — mudança isolada na função `buildPrintHtml`, sem impacto em outros fluxos.
