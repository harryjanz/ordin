---
id: ORD-076
status: Done
fase: 5
sprint: null
responsavel: Frontend
estimativa: 3 pontos
---

# ORD-076 — Sidebar e login do admin: contraste do logout, ícone de tema e alinhamento fora de conformidade com o design system

## Descrição
Auditoria de UX no menu lateral (`Sidebar.tsx`) do admin, pedida pelo usuário após notar que "os ícones e texto para modo escuro e claro estão ruins, não casam com o design system" e que "o botão de sair/logout não está alinhado". Inspecionei o componente ao vivo no navegador (`localhost:3001`, dark e light) e medi os elementos via DOM/computed style — os três problemas abaixo são reais e um deles é mais grave do que a descrição inicial sugeria.

**Achado crítico não reportado pelo usuário:** o botão **"Sair" fica completamente invisível no modo claro** — não é só um problema de alinhamento. `LinkButton` está com `variant="inverse"` fixo, que renderiza ícone e texto em `rgb(255,255,255)` (branco). Isso é correto sobre o fundo roxo-escuro do modo dark, mas no modo light o fundo do sidebar (`var(--a-surface)`) é branco — resultado: texto branco sobre fundo branco, contraste zero. Confirmei isso via `getComputedStyle` no console (não é suposição visual): `color: rgb(255, 255, 255)` tanto no ícone quanto no label, em `data-theme="light"`. O botão continua no DOM e é alcançável via teclado/leitor de tela (a árvore de acessibilidade encontra `button "Sair"` normalmente) — o problema é 100% visual, mas isso não o torna menos grave: qualquer usuário no modo claro (o padrão pra quem nunca alternou) precisa adivinhar onde clicar pra sair.

## Persona
**Qualquer usuário do admin** (superadmin, owner, manager) — o menu lateral é o único ponto de logout da aplicação. Especialmente crítico pra quem usa o admin no modo claro (tema padrão da aplicação — `adminThemeMode` inicia como `"dark"` no store, mas o modo claro é alcançável em um clique e, uma vez lá, o usuário fica sem uma saída visível).

## Contexto

### Achado 1 (crítico) — botão "Sair" invisível no modo claro
`Sidebar.tsx` linha 111:
```tsx
<LinkButton onClick={handleLogout} variant="inverse" icon="log-out" label={open ? "Sair" : ""} />
```
`variant="inverse"` do `LinkButton` do design system é pensado pra fundos escuros/coloridos (texto e ícone brancos fixos via as classes `_ds-link-button__icon--inverse_`/`_ds-link-button__label--inverse_`) — não existe um variant que se adapte automaticamente ao tema claro/escuro do admin. Como o fundo do sidebar muda de cor com o tema (`var(--a-surface)`, escuro no dark, branco no light) mas o `LinkButton` não, o resultado é branco-sobre-branco no modo claro.

### Achado 2 — ícone de troca de tema não é do design system
`Sidebar.tsx` linhas 96–108, comentário já reconhece o problema:
```tsx
{/* Botão customizado (não LinkButton) porque o DS não tem ícone de
    sol/lua no icon-font. */}
<button onClick={toggleAdminThemeMode} ...>
  <span className={styles.navIcon}>{adminThemeMode === "dark" ? "☀️" : "🌙"}</span>
  ...
```
Confirmei: **o icon-font do design system realmente não tem nenhum ícone de sol/lua/tema/contraste** (busquei todos os ~150 tokens em `icons.css` — nenhum resultado pra `sun|moon|dark|light|theme|contrast`). O problema não é a ausência do ícone certo — é que a solução adotada (emoji nativo colorido, ☀️/🌙) foge completamente da linguagem visual do resto do produto: todo o resto do sidebar usa o icon-font monocromático de traço fino (`icon-home`, `icon-package` etc.), e o emoji é um glifo colorido, com peso visual e proporções muito diferentes — é isso que "não casa com o design system" na prática.

O design system **tem** um componente `Toggle` (switch on/off com label, sem necessidade de ícone) que é semanticamente o componente certo pra um estado de dois valores como tema claro/escuro — e evita o problema do ícone ausente por completo, em vez de tentar contorná-lo com emoji. Hoje `Toggle` não é usado em nenhuma tela do admin (verificado); seria a primeira vez, mas é um componente already-published do DS, não algo novo a construir.

### Achado 3 — desalinhamento horizontal confirmado (medido em pixels)
Medi a posição `left` (viewport, `getBoundingClientRect()`) do ícone em três pontos do sidebar aberto:

| Elemento | `left` do ícone |
|---|---|
| Ícone de item de navegação (ex.: Dashboard) | **19px** |
| Ícone de tema (emoji) | 17px |
| Ícone do botão Sair (`LinkButton`) | **8px** |

O botão "Sair" começa **9–11px mais à esquerda** que tudo acima dele — visível a olho nu, e exatamente o que o usuário reportou. Causa raiz: os itens de navegação e o botão de tema são elementos custom estilizados por `Sidebar.module.scss` (`.navItem`, `.themeToggle`) com o mesmo box-model; o botão "Sair" é um `LinkButton` do DS, um componente com padding/box-model internos próprios, nunca pensado pra se encaixar nessa coluna de ícones bespoke — só está visualmente próximo por acidente.

### Por que isso não apareceu antes
O sidebar nunca teve um QA visual dedicado nos dois temas — `ORD-070` (tema claro/escuro do admin) focou em criar o mecanismo de troca de tema e nas telas de conteúdo, não em auditar o próprio sidebar nos dois modos. O bug do botão invisível é fácil de não notar: quem desenvolveu provavelmente testou no modo dark (padrão do store) e nunca voltou a olhar o sidebar depois de alternar pra light.

### Achado 4 — mesmo bug do emoji também na tela de Login
`LoginScreen.tsx` (linha ~41) tem exatamente o mesmo padrão de emoji ☀️/🌙 pra troca de tema, fora do sidebar:
```tsx
<button onClick={toggleAdminThemeMode} ... className={styles.themeToggle}>
  {adminThemeMode === "dark" ? "☀️" : "🌙"}
</button>
```
Mesma causa raiz do Achado 2 — **incluído no escopo desta história** por decisão do usuário (2026-08-10), já que é o mesmo bug, mesma correção (`Toggle`), risco baixo.

---

## Explorer

### História
Como **usuário do admin (qualquer role)**, quero que o menu lateral tenha ícones, cores e alinhamento consistentes com o design system nos dois temas, para que eu consiga encontrar e usar o botão de sair mesmo no modo claro, e para que o produto pareça coerente visualmente.

### Fluxo principal
1. Usuário abre o admin em qualquer tema (claro ou escuro)
2. Usuário expande o menu lateral (clique no hambúrguer)
3. Vê os itens de navegação, o switch de tema e o botão "Sair" alinhados na mesma coluna, com o mesmo tratamento visual de ícone monocromático
4. Alterna entre modo claro/escuro — o switch de tema muda de estado com um controle nativo do DS (não emoji), e todo o resto do sidebar (incluindo "Sair") permanece legível e no mesmo alinhamento nos dois temas

### Critérios de aceite
- [ ] Botão "Sair" no sidebar reestilizado seguindo o mesmo padrão visual dos itens de navegação (mesma marcação/classe de ícone, mesma cor base `rgba(var(--a-text-rgb), 0.7)`) — não usa mais `LinkButton`
- [ ] Botão "Sair" tem contraste suficiente (texto e ícone) tanto no modo claro quanto no escuro — verificado visualmente nos dois temas, não só no dark
- [ ] Troca de tema no sidebar usa o componente `Toggle` do design system — sem emoji nativo
- [ ] Troca de tema na tela de Login (`LoginScreen.tsx`) também usa `Toggle` do design system — sem emoji nativo
- [ ] Ícone do botão "Sair" alinhado horizontalmente com os ícones dos itens de navegação (mesmo `left` em px, ou diferença imperceptível/proposital documentada)
- [ ] Nenhuma mudança de comportamento: logout continua chamando `POST /auth/logout` e limpando o estado; troca de tema continua persistindo em `adminThemeMode`
- [ ] Testado nos dois temas, aberto e fechado (colapsado), em pelo menos uma tela do admin autenticado e na tela de Login

### Wireframe / Mockup
Não desenhei um mockup novo — a recomendação é alinhar o "Sair" e o switch de tema ao padrão visual que **já existe** nos itens de navegação do próprio sidebar (mesma coluna de ícone, mesmo tamanho, mesma cor base `rgba(var(--a-text-rgb), 0.7)` usada em `.navItem`), em vez de introduzir um componente novo com aparência própria.

---

## QA Explorer

```gherkin
Feature: Conformidade visual do sidebar do admin nos dois temas

  Scenario: Botão Sair é legível no modo claro
    Dado que o admin está no modo claro
    E o menu lateral está aberto
    Quando o usuário olha pro rodapé do menu
    Então o texto "Sair" e seu ícone têm contraste visível contra o fundo do sidebar
    E o usuário consegue identificar e clicar no botão sem precisar adivinhar a posição

  Scenario: Botão Sair é legível no modo escuro
    Dado que o admin está no modo escuro
    E o menu lateral está aberto
    Então o texto "Sair" e seu ícone continuam com contraste visível (sem regressão)

  Scenario: Troca de tema não usa emoji
    Dado que o menu lateral está aberto, em qualquer tema
    Quando o usuário olha pro controle de troca de tema
    Então não há nenhum emoji nativo (☀️/🌙) renderizado
    E o controle usa um componente do design system (ex.: Toggle)

  Scenario: Ícones do rodapé alinhados com os itens de navegação
    Dado que o menu lateral está aberto
    Então o ícone do botão "Sair" está alinhado horizontalmente com os ícones dos itens de navegação acima (mesma posição de borda esquerda, tolerância de poucos pixels)

  Scenario: Logout continua funcional
    Dado que o usuário está autenticado
    Quando clica em "Sair"
    Então POST /auth/logout é chamado
    E o usuário é redirecionado pra tela de login

  Scenario: Menu colapsado (fechado) não regride
    Dado que o menu lateral está fechado (modo ícone-only)
    Então o botão de tema e o botão "Sair" continuam exibindo só o ícone, sem quebrar layout, nos dois temas

  Scenario: Sem regressão em outras telas
    Dado que o usuário navega pra Catálogo, Pedidos, Transações etc.
    Então o sidebar mantém o mesmo comportamento e aparência em todas as telas (o sidebar é compartilhado)

  Scenario: Troca de tema na tela de Login também sem emoji
    Dado que o usuário está na tela de Login, em qualquer tema
    Quando olha pro controle de troca de tema
    Então não há nenhum emoji nativo (☀️/🌙) renderizado
    E o controle usa o componente Toggle do design system
    E a troca de tema na tela de Login continua funcional (persiste em adminThemeMode)
```

---

## Tech Explorer

### Serviços impactados
- `frontend/admin/` apenas — `src/components/Sidebar.tsx`, `src/components/Sidebar.module.scss`, `src/screens/LoginScreen.tsx` e seu `.module.scss`. Zero mudança de backend, API ou schema.

### Diagnóstico técnico (confirmado ao vivo)

| Achado | Evidência medida |
|---|---|
| "Sair" invisível no light | `getComputedStyle` do ícone e do label do `LinkButton` retornam `rgb(255, 255, 255)` em `data-theme="light"` — mesmo branco do fundo do sidebar nesse tema |
| Ícone de tema foge do DS | Nenhum token `sun`/`moon`/`theme`/`contrast`/`dark`/`light` existe em `icons.css` do design system — emoji foi um workaround, não há ícone "certo" faltando, é o approach que está errado |
| Desalinhamento | `left` do ícone: nav item **19px**, tema **17px**, Sair **8px** — diferença de 9–11px, mensurável e visível |

### Direção técnica (decidida pelo usuário, 2026-08-10)

**Tema (Achados 2 e 4, sidebar + login):** substituir os dois `<button>` custom com emoji pelo componente `Toggle` do DS (`design-system` — props: `name`, `label`, `labelPosition`, `checked`, `onChange`). Não precisa de ícone — resolve o problema por completo ao trocar de estratégia, não por encontrar um ícone que não existe. `LoginScreen.tsx` e `Sidebar.tsx` cada um mantém sua própria instância de `Toggle` (não há um componente de tema compartilhado hoje — criar um seria refatoração além do escopo pedido).

**Logout (Achados 1 e 3):** parar de usar `LinkButton` e estilizar o botão "Sair" com a mesma marcação/classes que os itens de navegação já usam (`icon-log-out` do icon-font + o mesmo padrão de `.navItem`), garantindo o mesmo box-model, mesma cor base (`rgba(var(--a-text-rgb), 0.7)`, já theme-aware via a custom property `--a-text-rgb`) e o mesmo alinhamento — resolve contraste E alinhamento na mesma mudança, porque passa a herdar as mesmas regras que já funcionam corretamente nos dois temas. Mantém o estado ativo/hover consistente com o resto do menu (reaproveitar `.navItem` como base, sem o `border-left` de item ativo já que "Sair" não é uma rota).

### Riscos
- Nenhum — mudança isolada de CSS/markup em componentes compartilhados (o sidebar aparece em toda tela autenticada; o toggle do login só na tela de Login) — testar nos dois temas em pelo menos 2-3 telas do admin + a tela de Login antes de considerar concluído.
- `Toggle` nunca foi usado no admin antes — primeira adoção, vale conferir visualmente que o estilo default do componente combina com o restante do sidebar e do card de login (padding, altura) antes de finalizar.

### Estimativa
3 pontos — troca de componente de tema em 2 lugares (sidebar + login) + reestilização do botão de logout, sem mudança de lógica, escopo restrito a 4 arquivos (2 `.tsx` + 2 `.module.scss`).

---

## Ready

**Explorer:** [x] fluxo e critérios de aceite definidos, com achado crítico (contraste) documentado além do que foi originalmente pedido · **QA Explorer:** [x] cenários Gherkin cobrindo os dois temas, aberto/fechado, sidebar + login, e não-regressão de logout · **Tech Explorer:** [x] diagnóstico medido ao vivo (não suposição), direção técnica decidida, riscos e estimativa · **Aprovação final:** [x] aprovado no chat pelo usuário (2026-08-10) — escopo estendido pra incluir `LoginScreen.tsx`, direção técnica do logout confirmada (reestilizar como item de navegação).

**Status: Ready** — pode começar a implementação.
