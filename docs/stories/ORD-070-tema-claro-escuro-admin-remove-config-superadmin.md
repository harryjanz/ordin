---
id: ORD-070
status: Done
fase: 5
sprint: null
responsavel: Frontend
estimativa: 5 pontos
---

# ORD-070 — Tema claro/escuro da interface do admin (só superadmin) + remove Configurações do superadmin

## Descrição
Duas mudanças pedidas juntas pelo usuário sobre a tela de Configurações do admin:

1. A tela "Configurações" atual (PIN do totem + aparência do totem) é um concern de **cliente** (empresa/owner), não do **superadmin** (staff da plataforma). Removida do menu do superadmin — continua exatamente igual para `admin`/`owner`.
2. O que o superadmin precisa é um tema **claro/escuro pra própria interface do admin** (não confundir com a aparência do totem, que é por empresa via `Company.visual_theme`/`visual_mode`) — item fixo no rodapé da sidebar, visível só pro superadmin.

> **Nota de processo:** história escrita retroativamente, depois da implementação e validação visual no navegador. Não passou pelo fluxo upstream (Explorer → QA Explorer → Tech Explorer → Ready) antes de ser codada.

## Persona
**Superadmin** (staff Ordin) — gerencia empresas clientes pelo admin, sem nenhum PIN de totem ou aparência de quiosque pra configurar sobre si mesmo. Quer poder trocar claro/escuro na própria interface.

## Contexto

### Decisão de escopo (perguntado e confirmado com o usuário)
Três decisões de escopo explicitamente perguntadas antes de implementar:
1. **Interface completa** (não só a casca/sidebar) — todas as ~14 telas do admin respeitam claro/escuro.
2. **Toggle fixo no rodapé da sidebar**, ao lado do botão "Sair".
3. **Configurações some só do menu do superadmin** — sem TODO explícito no código sobre a revisão do PIN pós-QR code (fica só registrado em memória/conversa).

### Por que não existia tema claro/escuro antes
A interface do admin nunca teve nenhum sistema de tema pra si mesma — todas as cores são literais hardcoded (`#0e0b1a`, `#1d1434`, `#DFE8ED`, `rgba(223,232,237,X)`, etc.) espalhadas em objetos de estilo inline por ~14 arquivos. Isso é um concern totalmente separado de `src/themes.ts`/`THEME_REGISTRY`, que já existe mas é exclusivamente a identidade visual do **totem por empresa** (não tocado nesta história).

### Estratégia de implementação (cobertura pragmática, não 100% dos literais)
Levantamento da paleta atual mostrou ~70 valores de cor distintos (`rgba(255,255,255,0.05)`, `0.07`, `0.08`, `0.09`... dezenas de opacidades ad-hoc). Mapear cada um manualmente seria um esforço enorme e arriscado sem QA visual automatizada. Estratégia adotada: tokens semânticos via CSS custom properties com uma técnica de "RGB triplet variável" — `--a-text-rgb` e `--a-neutral-rgb` guardam só o triplete R,G,B (não a opacidade), permitindo que `rgba(223,232,237,0.35)` vire `rgba(var(--a-text-rgb),0.35)` **preservando a opacidade original de cada uso**, sem precisar inventar um novo valor por ocorrência. Cores de marca/semânticas (roxo `#9900ff`, vermelho de erro, verde de sucesso, âmbar de aviso, teal) foram mantidas constantes entre os dois modos — decisão consciente, é prática comum manter cores de marca/semânticas estáveis e só variar neutros (fundo/superfície/texto/borda) entre claro e escuro.

Isso cobriu a maioria esmagadora das ~300 ocorrências de cor nos arquivos (fundo, superfície de card, texto principal, texto atenuado, bordas neutras) — os elementos visuais dominantes de qualquer tela.

## Explorer

### Fluxo principal
1. Superadmin loga → interface renderiza em modo escuro por padrão (preserva o visual histórico pra quem nunca trocou)
2. Superadmin abre a sidebar → vê "Modo claro" no rodapé, acima de "Sair"
3. Clica → toda a interface (sidebar, cards, inputs, texto) vira clara instantaneamente; botão passa a dizer "Modo escuro"
4. Preferência persiste (localStorage) entre sessões
5. `admin`/`owner`/`manager`/`cashier` nunca veem o toggle e sempre renderizam em escuro, independente do que estiver persistido no navegador (protege contra um resíduo de preferência de uma sessão anterior de superadmin no mesmo browser)

### Critérios de aceite
- [x] Menu do superadmin não mostra mais "Config." — `admin`/`owner` continuam vendo exatamente como antes
- [x] Toggle claro/escuro aparece só pro superadmin, no rodapé da sidebar
- [x] Alternar o modo re-tema a interface inteira (testado: Dashboard e wizard de cadastro, incluindo inputs/select)
- [x] Modo escuro (padrão) é visualmente idêntico ao design original — nenhuma regressão pra quem não mexe no toggle
- [x] `/settings` direto na URL como superadmin redireciona pro dashboard (rota removida de `ROLE_ROUTES.superadmin`), sem crash

## QA Explorer

```gherkin
Feature: Tema claro/escuro da interface do admin

  Scenario: Superadmin não vê mais Configurações no menu
    Dado que faço login como superadmin
    Então o menu lateral não mostra "Config."

  Scenario: Toggle claro/escuro só aparece pro superadmin
    Dado que faço login como admin ou owner
    Então não vejo nenhum controle de tema claro/escuro na sidebar

  Scenario: Alternar tema re-tema a interface inteira
    Dado que estou logado como superadmin em modo escuro
    Quando clico em "Modo claro"
    Então o Dashboard e o wizard de cadastro (inputs, select, cards) ficam claros
    E o botão passa a mostrar "Modo escuro"

  Scenario: Modo escuro é o padrão e é idêntico ao design original
    Dado que nunca troquei de tema
    Então a interface renderiza igual ao visual histórico (cores hardcoded anteriores)
```

Validado manualmente no navegador (localhost:3001): screenshot do Dashboard e do wizard "Novo cliente" em ambos os modos, alternando o toggle. Sem regressão visual perceptível no modo escuro padrão.

## Tech Explorer

### Serviços impactados
- **`frontend/admin/index.html`** — CSS custom properties (`--a-bg`, `--a-surface`, `--a-text`, `--a-text-rgb`, `--a-neutral-rgb`), dark como `:root` padrão, light via `:root[data-theme="light"]`
- **`frontend/admin/src/store.ts`** — `adminThemeMode: "light" | "dark"` (persistido, default `"dark"`) + `toggleAdminThemeMode()`
- **`frontend/admin/src/App.tsx`** — `useEffect` aplica `document.documentElement.dataset.theme` só quando `role === "superadmin"` (outros papéis sempre `"dark"`); remove `/settings` de `ROLE_ROUTES.superadmin`
- **`frontend/admin/src/components/Sidebar.tsx`** — remove `superadmin` de `roles` do item "Config."; novo botão de toggle no rodapé (visível só pra `role === "superadmin"`)
- **14 arquivos de tela/componente** — substituição mecânica de literais por `var()`: `#0e0b1a`→`var(--a-bg)`, `#1d1434`→`var(--a-surface)`, `#DFE8ED`→`var(--a-text)`, `rgba(223,232,237,`→`rgba(var(--a-text-rgb),`, `rgba(255,255,255,`→`rgba(var(--a-neutral-rgb),`

### Testes
- `tsc --noEmit` limpo
- 47/47 testes unitários (`vitest`) passando sem alteração
- Validação visual manual no navegador (Dashboard + wizard de cadastro, os dois modos)

### Riscos / limitações conhecidas
- **Cobertura não é 100% dos literais de cor** — opacidades ad-hoc de baixa frequência (ex: `rgba(255,255,255,0.09)`, ocorrência única) não foram tokenizadas; ficam com o valor original em ambos os modos. Na prática, isso afeta detalhes muito sutis (sombras/realces finos), não elementos estruturais — mas não é uma cobertura pixel-perfect.
- **`themes.ts`/`THEME_REGISTRY`** (aparência do totem por empresa) não foi tocado — concern deliberadamente separado.
- Persistência é por navegador (localStorage), não por usuário — se dois superadmins diferentes usarem o mesmo navegador/perfil, compartilham a última preferência escolhida (comportamento aceito, não tratado como problema nesta história).

### Estimativa
5 pontos — introduzir um sistema de tema onde não existia nenhum, tocando 14+ arquivos, mesmo com a estratégia mecânica de RGB-triplet-variável pra reduzir risco.

---

## Ready

**Explorer:** [x] escopo confirmado com o usuário em 3 perguntas antes de codar · **QA Explorer:** [x] validado visualmente no navegador nos dois modos, telas simples e complexas · **Tech Explorer:** [x] mecanismo de tema, remoção de rota, limitações de cobertura documentadas · **Aprovação final:** aprovado no chat pelo usuário via respostas às perguntas de escopo.

**Status: Done** — aplicado, testado e em produção local. História escrita retroativamente.
