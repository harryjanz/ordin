# ORD-052 — Impressão térmica silenciosa via QZ Tray + ESC/POS

## Status
`Done`

## Descrição
O totem atualmente imprime tickets via `window.open()` + `window.print()`, o que exibe o diálogo de impressão do navegador e interrompe o fluxo de autoatendimento. Em produção, os terminais utilizam impressoras térmicas 80mm com guilhotina (Epson TM-T20X, Elgin i7 Plus, Bematech MP-4200 HS) compatíveis com o protocolo ESC/POS. A solução é integrar o QZ Tray — um daemon local que atua como ponte entre o navegador e a impressora via WebSocket — para disparar a impressão silenciosamente, sem nenhum popup. Quando o QZ Tray não estiver disponível, o sistema deve cair graciosamente para o `window.print()` atual.

## Persona
**Cliente no totem** — após confirmar o pagamento, espera que os tickets sejam impressos automaticamente, sem precisar interagir com nenhuma tela intermediária do sistema operacional ou navegador.

## Contexto
O totem é um terminal de autoatendimento em ambiente público. Qualquer interrupção no fluxo pós-pagamento — como um diálogo de impressão — gera confusão, abandono do pedido ou necessidade de intervenção do operador. A impressão silenciosa é requisito funcional de produto para que o fluxo seja verdadeiramente autônomo.

---

## História
Como **cliente no totem**, quero que meus tickets sejam impressos automaticamente após o pagamento, para não precisar interagir com popups do navegador e retirar meu pedido no balcão sem fricção.

## Fluxo principal
1. Pagamento aprovado → `SuccessScreen` é exibida
2. Após 300ms (tempo para os QR codes SVG renderizarem), `silentPrint()` é invocado
3. `silentPrint()` tenta conectar ao QZ Tray em `ws://localhost:8181`
4. Se conectado: envia comandos ESC/POS em base64 diretamente para a impressora
5. Impressora imprime header + um bloco por ticket (produto, unidade, QR Code nativo, guilhotina parcial)
6. UI exibe "Ticket impresso! Retire na impressora."

## Fluxos alternativos
- **QZ Tray indisponível** (desenvolvimento, QZ não instalado): cai para `window.open()` → `window.print()` com HTML 80mm
- **`window.open()` bloqueado pelo navegador**: exibe botão "Imprimir tickets" para o operador acionar manualmente

## Dependências
- Frontend: `frontend/totem/` — apenas `SuccessScreen.tsx`
- Biblioteca: `qz-tray` (npm) — cliente JS do QZ Tray daemon
- Infraestrutura: QZ Tray daemon instalado na máquina do kiosk (fora do escopo desta história)
- Sem dependência de backend

## Critérios de aceite funcionais
- [ ] Com QZ Tray rodando: ticket impresso sem nenhum popup ou interação do usuário
- [ ] Sem QZ Tray: `window.print()` é chamado automaticamente (comportamento atual preservado)
- [ ] Com `window.open()` bloqueado: botão manual aparece na tela
- [ ] ESC/POS gera: header da empresa, horário, ref do pedido, valor, e por ticket: nome do produto, unidade X/Y, código, QR Code nativo (GS ( k), guilhotina parcial
- [ ] Funciona com Epson TM-T20X, Elgin i7 Plus, Elgin i8 Full, Bematech MP-4200 HS
- [ ] `tsc --noEmit` sem erros

---

## Explorer

### Contexto e motivação
Impressoras térmicas em ambiente de food service operam 100% via ESC/POS — o protocolo padrão de comandos binários para controle de impressão, corte de papel, alinhamento e geração de QR Code nativo. O QZ Tray é o padrão de mercado brasileiro para impressão web silenciosa: instalado como daemon no PC do kiosk, expõe um WebSocket local (`ws://localhost:8181`) que recebe os bytes ESC/POS e os encaminha diretamente à impressora selecionada. Sistemas como iFood, Goomer e Cardápio Web usam exatamente essa stack.

### Wireframe / Mockup
Não aplicável — sem alteração visual além dos estados já existentes no card de status de impressão da `SuccessScreen` (`pending` → `escpos` / `browser` / `blocked`).

---

## QA Explorer

```gherkin
Feature: Impressão silenciosa de tickets no totem
  Como cliente no totem
  Quero que meus tickets sejam impressos automaticamente após o pagamento
  Para retirar meu pedido no balcão sem interagir com popups

  Background:
    Dado que o pagamento foi aprovado
    E a SuccessScreen está sendo exibida
    E os QR codes SVG foram renderizados

  Scenario: Impressão via QZ Tray com impressora disponível
    Dado que o QZ Tray está rodando em localhost:8181
    E há ao menos uma impressora térmica conectada
    Quando silentPrint() é invocado após 300ms
    Então o ticket é enviado via ESC/POS para a impressora
    E a UI exibe "Ticket impresso! Retire na impressora."
    E nenhum popup ou janela extra é aberta

  Scenario: Fallback para window.print() quando QZ Tray não está disponível
    Dado que o QZ Tray não está rodando
    Quando silentPrint() é invocado
    Então window.open() é chamado com o HTML de impressão
    E window.print() é disparado automaticamente na nova janela
    E a UI exibe "Tickets enviados para impressão!"

  Scenario: Botão manual quando window.open() é bloqueado pelo navegador
    Dado que o QZ Tray não está rodando
    E o navegador bloqueia window.open()
    Quando silentPrint() retorna "blocked"
    Então a UI exibe o botão "Imprimir tickets"
    E ao clicar no botão, window.open() é tentado novamente

  Scenario: ESC/POS contém todos os dados do pedido
    Dado que o pedido tem 2 tickets de produtos diferentes
    Quando o ESC/POS é gerado
    Então o header contém: nome da empresa, horário, order_ref, método de pagamento, NSU, valor total
    E cada ticket contém: nome do produto, "Unidade X de Y", código do ticket, QR Code nativo
    E há corte parcial de papel entre cada ticket

  Scenario: Caracteres com acentos são normalizados
    Dado que o nome da empresa é "Café & Pão"
    Quando o ESC/POS é gerado
    Então o texto enviado é "CAFE & PAO" (sem diacríticos)
    E não há caracteres inválidos no stream de bytes

  Scenario: Compatibilidade com múltiplos modelos de impressora
    Dado que a impressora é uma Epson TM-T20X, Elgin i7 Plus, Elgin i8 Full ou Bematech MP-4200 HS
    Quando o ESC/POS é enviado via QZ Tray
    Então a impressora processa os comandos sem erro
    E o QR Code é gerado nativamente pela impressora (GS ( k, modelo 2, tamanho 5, erro M)
```

---

## Tech Explorer

### Serviços impactados
- `frontend/totem/` — única área de mudança

### Arquivos alterados
| Arquivo | Mudança |
|---------|---------|
| `src/lib/printService.ts` | **Novo** — ESC/POS builder + `silentPrint()` |
| `src/lib/qz-tray.d.ts` | **Novo** — declarações TypeScript para o módulo `qz-tray` |
| `src/screens/SuccessScreen.tsx` | Substituir lógica de `window.open()` por `silentPrint()`; estado `printed/printBlocked` → `printMethod: 'pending' \| 'escpos' \| 'browser' \| 'blocked'` |
| `package.json` | Adicionar `qz-tray` como dependência |

### Decisões técnicas

**ESC/POS vs HTML via QZ Tray**
ESC/POS é preferido: garante layout consistente independente de renderização de browser, permite QR Code nativo da impressora (muito mais rápido e nítido do que bitmap), e suporta guilhotina automática entre tickets.

**Normalização de caracteres**
ESC/POS usa tabelas de código de 8 bits. Para evitar configurar code page por modelo de impressora, os diacríticos são removidos via `String.normalize('NFD')` — trade-off aceitável para tickets funcionais.

**QR Code ESC/POS (GS ( k)**
Sequência: model 2 → tamanho 5 → erro correction M → store data → print. Suportada por todos os modelos recomendados.

**Modo não assinado (bypass de certificado)**
`setCertificatePromise` e `setSignaturePromise` retornam string vazia — adequado para kiosk local onde o QZ Tray é controlado pela empresa. Não abre vetor de ataque externo.

**Seleção de impressora**
`qz.printers.find()` retorna a lista de impressoras do SO. Usa `printers[0]` (primeira disponível). Para ambientes com múltiplas impressoras, configurar a impressora padrão do SO no kiosk.

### Estimativa
- Frontend: 3h (já implementado)
- Sem backend, sem migration, sem fila

### Riscos
| Risco | Mitigação |
|-------|-----------|
| QZ Tray não instalado na máquina do kiosk | Fallback para `window.print()` garante operação sem QZ Tray |
| Modelo de impressora não suporta GS ( k | Todos os 4 modelos recomendados suportam; documentar como requisito de hardware |
| `printers[0]` não é a impressora correta | Configurar impressora padrão no SO; futura melhoria pode expor configuração via admin |
