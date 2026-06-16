# ORD-039 — Revisão de layout e UX do totem

**Status:** New
**Tipo:** UX / Frontend
**Referência:** `docs/guia-layout-totem-autoatendimento.md`

---

## Contexto

Foi adicionado ao repositório o guia `guia-layout-totem-autoatendimento.md`, estudo baseado nos padrões de UX dos totens de Burger King e McDonald's. A análise comparou o guia com a implementação atual do totem e identificou 11 gaps entre o padrão de mercado e o que está implementado.

---

## Problema

O layout atual do totem (`frontend/totem/`) foi construído de forma incremental durante as sprints iniciais e não segue os padrões ergonômicos e de usabilidade estabelecidos para totens de autoatendimento. Os principais problemas identificados são:

1. **Grid de produtos em colunas variáveis** — `auto-fill, minmax(200px,1fr)` gera layouts imprevisíveis. O padrão de mercado é 2 colunas fixas.
2. **Imagem do produto subutilizada** — 100px de altura, quando o guia exige 60–70% da altura do card (~160px). Imagens grandes e apetitosas são fator crítico de conversão.
3. **Tipografia abaixo do mínimo** — Nome do produto em 15px, preço em 18px, descrição em 12px (abaixo do mínimo absoluto de 14px). Tela de 21" touch exige texto maior para leitura de pé e em movimento.
4. **Touch targets insuficientes** — Botão "Adicionar" com ~36px de altura, abas de categoria com ~36px. W3C recomenda ≥20mm (~82px em 21"). CTA do carrinho com ~58px quando o guia exige ≥90px.
5. **Sem tela de boas-vindas (idle/attract screen)** — O totem vai direto do setup para o catálogo. O fluxo padrão exige uma tela "Toque para começar" entre clientes, que serve como estado idle e tela de atração.
6. **Inatividade reseta para PIN** — Quando um cliente abandona o pedido (idle 120s), `resetSession()` é chamado e o totem volta para a tela de PIN, obrigando o operador a redigitar o PIN. Deveria voltar para a tela de boas-vindas (preservando auth).
7. **Sem botão "Início" acessível** — O guia exige que o botão "Início" esteja visível em todas as telas do fluxo do cliente.
8. **Toggle de tema exposto ao cliente** — O seletor de tema (claro/escuro) está no header do catálogo, visível para o cliente. É uma ferramenta de configuração de operador, não do cliente.

---

## Solução proposta

### Nova tela: WelcomeScreen (tela de boas-vindas / idle)
- Exibida após o setup do terminal e ao retornar por inatividade
- Mostra o nome da empresa e "Toque para começar" com animação de pulse
- Qualquer toque inicia o pedido (vai para o catálogo)
- Preserva auth — não exige redigitar PIN

### Alterações no store
- Nova ação `goIdle()`: limpa carrinho/CPF/pedido → `screen = "welcome"` (preserva token/company/terminal)
- Novo estado `"welcome"` no tipo `Screen`
- Heartbeat continua rodando em `"welcome"` (terminal permanece "em uso" mesmo na tela idle)

### Alterações no fluxo (App.tsx)
- Pós-setup: vai para `"welcome"` em vez de `"catalog"` diretamente
- Inatividade (120s): chama `goIdle()` em vez de `resetSession()`
- Texto do modal de inatividade: "O pedido será cancelado em Xs" (não mais "A sessão")

### CatalogScreen — mudanças de layout
| Elemento | Antes | Depois |
|---|---|---|
| Grid de produtos | `auto-fill, minmax(200px,1fr)` | `repeat(2, 1fr)` fixo |
| Imagem do card | 100px | 160px (60–70% do card) |
| Nome do produto | 15px | 20px |
| Preço | 18px | 22px bold |
| Descrição | 12px | 14px (mínimo absoluto) |
| Botão "Adicionar" | ~36px altura | minHeight 56px |
| Controles −/+ | 28px | minWidth 60px × minHeight 56px |
| Abas de categoria | padding 8px 18px | padding 14px 24px (minHeight 52px) |
| CTA do carrinho (rodapé) | ~58px | minHeight 90px |
| Header | Logo + terminal label + theme toggle | Logo + botão "Início" (sem terminal label, sem theme toggle) |

### Outras telas — melhorias de tamanho de botão
- **CpfScreen**: numpad já OK; "Confirmar CPF" e "Pular" com minHeight 56px
- **PaymentScreen**: botões de método com minHeight 100px; "Pagar" com minHeight 80px; "Voltar" com minHeight 56px
- **SuccessScreen**: "Novo pedido" com minHeight 80px
- **RefusedScreen** (inline em App.tsx): botões "Cancelar" e "Tentar novamente" com minHeight 56px

---

## Critérios de aceite

- [ ] Grid do catálogo sempre exibe exatamente 2 colunas de produtos
- [ ] Imagem do produto ocupa ≥60% da altura do card (visualmente)
- [ ] Nenhum texto abaixo de 14px em telas do cliente
- [ ] Preço do produto em destaque (≥22px, bold, cor de destaque)
- [ ] Botão "Adicionar" com área de toque ≥56px de altura
- [ ] CTA do carrinho ("Ver pedido") com ≥90px de altura
- [ ] Abas de categoria com ≥52px de altura
- [ ] WelcomeScreen exibida ao concluir o setup e ao retornar por inatividade
- [ ] Inatividade não volta para PIN (auth é preservada)
- [ ] Botão "Início" visível no header do catálogo
- [ ] Toggle de tema removido da view do cliente
- [ ] Heartbeat continua ativo na WelcomeScreen

---

## Fora do escopo

- Seleção de tipo de pedido (salão/viagem/mesa) — não está no modelo atual do ordin
- Cross-sell screen — não planejado para esta fase
- Mudança de fonte para Lexend — decisão de marca, sprint separada
- Imagens reais dos produtos no seed — dados do catálogo, não UI

---

## Arquivos afetados

- `frontend/totem/src/types.ts` — adicionar `"welcome"` ao tipo Screen
- `frontend/totem/src/store.ts` — adicionar `goIdle()`
- `frontend/totem/index.html` — adicionar animações CSS (pulse, glow)
- `frontend/totem/src/screens/WelcomeScreen.tsx` — novo arquivo
- `frontend/totem/src/screens/CatalogScreen.tsx` — rework de layout
- `frontend/totem/src/screens/CpfScreen.tsx` — ajuste de touch targets
- `frontend/totem/src/screens/PaymentScreen.tsx` — ajuste de touch targets
- `frontend/totem/src/screens/SuccessScreen.tsx` — ajuste de touch targets
- `frontend/totem/src/App.tsx` — integrar WelcomeScreen, goIdle, heartbeat

---

## Explorer

### Análise de viabilidade técnica

Todas as mudanças são frontend puro — sem alterações em backend, banco ou infraestrutura.

**WelcomeScreen**: componente React simples com animação CSS. As animações `pulse` e `glow` precisam ser declaradas em `index.html` (onde vivem as `@keyframes` existentes: `shake`, `spin`, `fadeIn`).

**goIdle no store**: Zustand `set` — idêntico ao padrão do `newOrder()` existente, apenas muda o `screen` de destino.

**Grid 2 colunas fixas**: `gridTemplateColumns: "repeat(2, 1fr)"` — mudança de 1 linha. Em viewport estreito (ex: browser de dev em janela pequena) os cards ficam largos, o que é comportamento esperado para totem portrait.

**Touch targets**: Aumentar `padding` e `minHeight` dos botões não quebra nenhuma lógica de estado. É puramente visual.

**Remoção do theme toggle**: `themeKey` e `onThemeToggle` são removidos das props do `CatalogScreen`. `App.tsx` ainda mantém o estado `themeKey` internamente (para `T = THEMES[themeKey]`), mas não passa mais ao `CatalogScreen`. O toggle pode ser reintroduzido em uma tela de admin/configuração futura.

**Riscos identificados**:
- Nenhum risco técnico — mudanças são aditivas ou de estilo
- Risco de UX: cards de 2 colunas com imagem de 160px podem ficar muito grandes em viewport estreito durante desenvolvimento. Não é problema no hardware alvo (portrait 1080×1920).

**Dependências**: nenhuma nova dependência de pacote necessária.

---

## QA Explorer

### Cenários de teste

**WelcomeScreen**
1. Após setup completo (PIN → terminal → teste de conexão), a tela de boas-vindas é exibida (não o catálogo diretamente)
2. Tocar qualquer área da tela → catálogo carrega
3. Inatividade de 120s no catálogo → WelcomeScreen (não tela de PIN)
4. Inatividade de 120s na tela de CPF → WelcomeScreen
5. Inatividade de 120s na tela de pagamento → WelcomeScreen
6. Após WelcomeScreen → catálogo → heartbeat continua sendo enviado

**Grid e cards**
7. Catálogo sempre exibe 2 colunas independente do número de produtos (1 produto = 1 card ocupando metade da largura)
8. Imagem ocupa visivelmente mais da metade do card
9. Placeholder emoji (🍽️) mantém as proporções quando não há imagem
10. Botão "Adicionar" responde ao toque com área mínima visível

**Fluxo "Início"**
11. Clicar "Início" no catálogo com carrinho vazio → WelcomeScreen
12. Clicar "Início" no catálogo com itens no carrinho → WelcomeScreen (carrinho limpo)
13. Carrinho NÃO é limpo ao clicar "Iniciar" na WelcomeScreen (auth preservada, carrinho já estava limpo)

**Regressão**
14. Pedido completo: catálogo → CPF → pagamento → sucesso → impressão → Novo pedido → catálogo (sem passar por PIN)
15. Payment timeout (60s idle) → catálogo (comportamento existente, não alterado)
16. Heartbeat enviado a cada 120s enquanto em `catalog` OU `welcome`

### Riscos de QA
- `goIdle()` deve preservar `token`, `company` e `terminal` — verificar que não limpa auth
- Verificar que `"welcome"` não está em `watchedScreens` do timeout de inatividade (seria loop infinito)

---

## Tech Explorer

### Arquitetura da solução

**Screen state machine atualizada:**
```
"pin" (setup) → "welcome" → "catalog" → "cpf" → "payment" → "success" → "welcome" (via goIdle/newOrder)
                    ↑                                    ↓
                    └────────── goIdle() ────────────────┘ (inatividade em catalog/cpf/payment)
```

**store.ts — goIdle:**
```typescript
goIdle: () => set({
  cart: [],
  cpf: null,
  completedOrder: null,
  screen: "welcome",
  lastActivity: Date.now(),
}),
```

**App.tsx — heartbeat atualizado:**
```typescript
useEffect(() => {
  if ((screen !== "catalog" && screen !== "welcome") || !company || !terminal) return;
  const iv = setInterval(async () => {
    try { await api.post(`/companies/${company.id}/terminals/${terminal.id}/heartbeat`); }
    catch { /* silencioso */ }
  }, 120_000);
  return () => clearInterval(iv);
}, [screen, company, terminal]);
```

**App.tsx — inatividade:**
```typescript
if (idle >= INACTIVITY_TIMEOUT_MS) {
  setShowInactivityModal(false);
  goIdle(); // era: resetSession()
}
// modal text: "O pedido será cancelado em Xs"
```

**App.tsx — pós-setup:**
```typescript
function handlePinSuccess(co: CompanyInfo, term: TerminalInfo, token: string) {
  setToken(token);
  setCompany(co);
  setTerminal(term);
  setScreen("welcome"); // era: "catalog"
}
```

**CatalogScreen.tsx — interface:**
```typescript
interface Props {
  T: Theme;
  companyName: string;  // terminalLabel removido (não customer-facing)
  cart: CartItem[];
  onAdd: (p: Product) => void;
  onRemove: (id: number) => void;
  onCheckout: () => void;
  onHome: () => void;  // novo: themeKey/onThemeToggle removidos
}
```

**Não há mudanças de API, banco ou infraestrutura.**

---

**Status:** Done
