# ORD-043 — Admin: menu sanduíche + tela dedicada de pareamento mobile-friendly

**Status:** Ready  
**Pontos:** 5  
**Sprint:** Correções / UX

---

## Contexto

Durante o QA da ORD-042 (pareamento de totem), identificou-se que:

1. O pareamento por QR abre o admin no **celular do operador** — mas a tela de Configurações é densa e desktop-first, tornando o fluxo ruim no mobile.
2. O menu lateral fixo ocupa espaço horizontal valioso em telas pequenas.
3. O pareamento misturado com outras configurações (PIN, aparência) cria confusão de contexto.

---

## Explorer

### Objetivo
Criar uma tela dedicada de pareamento acessível por item de menu e otimizada para mobile, e converter o sidebar fixo em menu sanduíche recolhível.

### Fluxo atual
```
QR scan → /pair?code=XXX → SettingsScreen (card "Parear totem" misturado com PIN e Aparência)
```

### Fluxo proposto
```
QR scan → /pair?code=XXX → PairScreen (tela dedicada, mobile-first)
Menu admin → "Dispositivos" (ícone) → PairScreen
```

### Decisões de design

**Menu sanduíche:**
- Hamburger (☰) sempre visível no topo esquerdo
- Click abre sidebar com animação slide-in da esquerda (largura 220px)
- Click fora ou no mesmo botão fecha
- Quando fechado: apenas hamburger visível, conteúdo ocupa 100% da largura
- Quando aberto: overlay semitransparente no mobile fecha ao clicar

**Tela de pareamento (PairScreen):**
- Layout centralizado, max-width 440px, padding generoso
- Input de código: fonte grande (28px+), teclado uppercase no mobile (`autocapitalize="characters"`, `inputmode="text"`)
- Select de terminal: altura mínima 48px (touch target)
- Botão de aprovar: largura total no mobile
- Deep link `/pair?code=XXXXXX` pré-preenche o código (comportamento mantido)
- Feedback de sucesso/erro inline

**Remoção:**
- Card "Parear totem" removido do `SettingsScreen`
- Rota `/pair` passa a apontar para `PairScreen` (não mais `SettingsScreen`)

---

## QA Explorer

### Cenário 1 — Menu sanduíche abre e fecha
```gherkin
Dado que o admin está logado em qualquer tela
Quando clico no ícone ☰
Então o sidebar desliza da esquerda (animação ≤ 200ms)
E os itens de menu ficam visíveis
Quando clico novamente no ☰ ou fora do menu
Então o sidebar recolhe
```

### Cenário 2 — Menu sanduíche em mobile
```gherkin
Dado que o admin está aberto em viewport 390px (iPhone)
Quando o menu está fechado
Então o conteúdo ocupa 100% da largura
Quando abro o menu
Então um overlay escuro aparece atrás do sidebar
E clicar no overlay fecha o menu
```

### Cenário 3 — Novo item "Dispositivos" no menu
```gherkin
Dado que o menu está aberto
Então existe item "Dispositivos" na lista de navegação
Quando clico em "Dispositivos"
Então navego para /pair
E o menu fecha automaticamente
```

### Cenário 4 — PairScreen abre vazia
```gherkin
Dado que navego para /pair sem query string
Então a tela exibe título "Parear totem"
E o campo de código está vazio
E o select de terminal está populado com os terminais da empresa
E o botão "Aprovar" está desabilitado (código vazio)
```

### Cenário 5 — Deep link pré-preenche código
```gherkin
Dado que o totem exibe código "ABC123"
Quando escaneio o QR com o celular (abre /pair?code=ABC123)
Então o campo de código está pré-preenchido com "ABC123"
E o botão "Aprovar" está habilitado
```

### Cenário 6 — Aprovação com sucesso
```gherkin
Dado que o campo está preenchido com código válido e terminal selecionado
Quando clico "Aprovar pareamento"
Então feedback verde "Totem pareado com sucesso!" aparece
E o campo é limpo
```

### Cenário 7 — Código inválido/expirado
```gherkin
Dado que o campo está preenchido com código expirado
Quando clico "Aprovar pareamento"
Então feedback vermelho com a mensagem de erro do backend aparece
E o campo não é limpo (para permitir correção)
```

### Cenário 8 — UX mobile (touch targets)
```gherkin
Dado que a PairScreen está aberta em viewport 390px
Então o input de código tem fonte ≥ 28px
E o select de terminal tem altura ≥ 48px
E o botão "Aprovar" tem largura 100%
E não há scroll horizontal
```

---

## Tech Explorer

### Arquivos alterados

| Arquivo | Operação |
|---------|----------|
| `frontend/admin/src/components/Sidebar.tsx` | Refatorar: adicionar estado `open`, hamburger button, slide animation, overlay mobile, novo item "Dispositivos" |
| `frontend/admin/src/screens/PairScreen.tsx` | Criar: extrai lógica de pareamento do SettingsScreen, layout mobile-first |
| `frontend/admin/src/screens/SettingsScreen.tsx` | Remover card "Parear totem" |
| `frontend/admin/src/App.tsx` | Rota `/pair` → `PairScreen` (não mais `SettingsScreen`) |

### Sidebar — estrutura de estado
```tsx
const [open, setOpen] = useState(false);
// Fecha ao navegar
const location = useLocation();
useEffect(() => setOpen(false), [location.pathname]);
```

### Sidebar — animação CSS
```css
/* sidebar container */
transform: translateX(open ? 0 : -100%);
transition: transform 200ms ease;
position: fixed; /* mobile: overlay */
/* ou */
width: open ? 220 : 0;
transition: width 200ms ease;
overflow: hidden;
```

### PairScreen — comportamento
- `useSearchParams` para ler `?code=`
- `useEffect` para carregar terminais da empresa (`GET /companies/{id}/terminals`)
- `approveDevice()`: `POST /companies/{id}/devices/approve`
- Lógica idêntica ao que está em `SettingsScreen`, apenas layout diferente

### Rota `/pair` em App.tsx
```tsx
// antes:
<Route path="/pair" element={<ProtectedRoute path="/settings" element={<SettingsScreen />} />} />
// depois:
<Route path="/pair" element={<ProtectedRoute path="/pair" element={<PairScreen />} />} />
```

### ROLE_ROUTES — acesso ao /pair
```tsx
const ROLE_ROUTES = {
  admin:   [..., "/pair"],
  owner:   [..., "/pair"],
  manager: [..., "/pair"],  // operador pode parear totem
  cashier: [...],           // caixa não precisa
};
```

---

## Critérios de aceite

- [ ] Menu sanduíche: abre/fecha com animação suave em desktop e mobile
- [ ] Overlay fecha o menu ao clicar fora (mobile)
- [ ] Item "Dispositivos" no menu navega para `/pair` e fecha o menu
- [ ] PairScreen acessível via menu e via deep link `/pair?code=XXX`
- [ ] Deep link pré-preenche o código
- [ ] Input uppercase com inputmode adequado para mobile
- [ ] Touch targets ≥ 48px
- [ ] Botão "Aprovar" full-width em mobile
- [ ] Feedback inline de sucesso e erro
- [ ] Card "Parear totem" removido do SettingsScreen
- [ ] Sem scroll horizontal em viewport 390px
