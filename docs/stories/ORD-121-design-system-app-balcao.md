---
id: ORD-121
status: Ready
fase: 7
sprint: null
responsavel: Frontend
estimativa: G
tipo: melhoria
---

# ORD-121 — Aplicar o design system no app de balcão

## User story
**Como** operador de balcão usando o app no dia a dia,
**quero** que o app tenha a mesma identidade visual consistente do admin (cores, componentes, tema claro/escuro), em vez do estilo próprio hardcoded que ele usa hoje,
**para** ter uma experiência visual coerente com o resto da plataforma, incluindo a opção de trocar pra modo claro em ambientes bem iluminados (hoje só existe o escuro fixo).

## Contexto e motivação
Achado ao vivo (2026-08-24): o `frontend/balcao` nunca usou o pacote `design-system` vendorizado que o `frontend/admin` já usa desde a ORD-073 — é 100% estilo inline (`style={{...}}`) com paleta roxa/escura hardcoded (`#9900ff`, `#1d1434`, `#0e0b1a`), sem suporte a tema claro/escuro, sem os componentes padronizados (Button, InputBase, Toggle, etc.), sem o icon-font. Curiosamente a paleta hardcoded do balcão já bate com os valores que o admin usa no modo escuro (`--brand-primary: #9900ff`, `--a-surface: #1d1434`, `--a-surface-2: #0e0b1a`) — sinal de que o balcão foi copiado manualmente da mesma paleta antes do admin migrar pro design system, e nunca foi atualizado depois.

Pedido explícito do usuário: aplicar o design system **"desde o login até o interno"** — ou seja, todas as telas do app, não só uma parte.

## Fluxos envolvidos
Escopo é 100% visual/estrutural — nenhuma mudança de comportamento ou de API. Telas afetadas (todas as existentes no app):
- `LoginScreen.tsx` — inclui o fluxo de MFA recém implementado na [[ORD-120]] (setup QR, backup codes, verificação, confiar no dispositivo) — a versão com design system precisa manter esse fluxo, só trocando a camada visual.
- `QueueScreen.tsx` — fila de pedidos pagos aguardando coleta.
- `OrderDetailScreen.tsx` — detalhe do pedido, scanner de QR, coleta.
- `components/QrScanner.tsx` — vídeo da câmera + fallback de entrada manual.
- `App.tsx` — shell (timeout de inatividade), precisa da lógica de aplicar `data-theme` no `<html>`, mesmo padrão do admin.
- Novo: seletor de tema claro/escuro/sistema, mesmo componente `ThemeModeSwitch` do admin (portado, não reinventado).

## Dependências / impacto em outros serviços
Nenhuma — só `frontend/balcao`. Sem mudança de backend.

## Cenários (QA Explorer)

```gherkin
Funcionalidade: Design system no app de balcão

  Cenário: Tela de login usa os componentes do design system
    Dado o app de balcão carregado, deslogado
    Quando a tela de login aparece
    Então os campos de e-mail/senha, botão "Entrar" e mensagens de erro usam os
      componentes do design system (InputBase, Button, Alert), não inputs/botões
      HTML nus com estilo inline
    E o fluxo de MFA (setup QR, backup codes, verificação) mantém o mesmo
      comportamento da ORD-120, só com a aparência do design system

  Cenário: Alternar entre modo claro e escuro
    Dado um usuário logado em qualquer tela do app
    Quando ele troca o modo de tema (claro/escuro/sistema)
    Então as cores de fundo, superfície e texto mudam imediatamente em toda a tela
      atual, usando os tokens --a-* (mesmo mecanismo do admin — atributo
      data-theme no <html>)
    E a preferência persiste entre sessões (mesmo padrão de persistência do
      Zustand já usado pro restante do estado do balcão)

  Cenário: Fila de pedidos e detalhe do pedido com aparência consistente
    Dado um usuário navegando na fila de pedidos e abrindo o detalhe de um pedido
    Então cards, badges de status, botões de ação e o scanner de QR seguem a
      mesma paleta de cores e componentes do design system, coerente com o admin

  Cenário: Nenhuma regressão funcional
    Dado qualquer fluxo já existente (login, MFA, listagem, scan de QR, coleta,
      turbo mode, feedback sonoro)
    Quando a tela é migrada pro design system
    Então o comportamento funcional continua idêntico ao de antes da migração —
      só a camada visual muda
```

## Solução técnica (Tech Explorer)

### 1. Vendorizar o design system no balcão
- Copiar `frontend/admin/vendor/design-system/` inteiro pra `frontend/balcao/vendor/design-system/` (não re-vendorizar do zero do repo fonte) — a cópia do admin já carrega os dois patches locais necessários (fonte Metropolis sem tentativa de rede, e o bug de foco do Modal), documentados em `frontend/admin/vendor/design-system/README.md`. Copiar `README.md` também pro balcão, atualizado pra refletir que é uma cópia da vendorização do admin.

### 2. Config de build/tooling (mirror exato do admin)
- `frontend/balcao/package.json`: adicionar `"design-system": "file:./vendor/design-system"`, `"sass": "^1.77.0"`, `"date-fns": "2.30.0"` (peer dependency do design system).
- `frontend/balcao/vite.config.ts`: adicionar `build.commonjsOptions.include: [/design-system/, /node_modules/]` (sem isso, exports nomeados do pacote não resolvem corretamente via Rollup).
- `frontend/balcao/tsconfig.json`: adicionar o mesmo bloco `baseUrl`/`paths` do admin, forçando resolução de tipos de `react`/`react-dom` pro `node_modules` do próprio balcão (evita ambiguidade com a cópia dentro de `vendor/design-system/node_modules`).

### 3. Tema claro/escuro
- Novo `frontend/balcao/src/styles/theme.scss`, cópia adaptada de `frontend/admin/src/styles/theme.scss` — mesmos tokens `--a-bg`/`--a-surface`/`--a-surface-2`/`--a-text`/`--a-text-rgb`/`--a-border`/`--a-neutral-rgb`, mesmos valores (a paleta já é idêntica à do admin).
- `frontend/balcao/src/store.ts`: novo campo `themeMode: "light" | "dark" | "system"` (default `"dark"`, já que era o único modo existente — muda o padrão do admin, que é `"light"`, de propósito pra não surpreender quem já usa o balcão hoje), persistido (mesmo padrão de persist já usado pros outros campos do store).
- `frontend/balcao/src/App.tsx`: mesmo `useEffect` do admin aplicando `document.documentElement.dataset.theme`.
- `frontend/balcao/src/components/ThemeModeSwitch.tsx`: porta o componente do admin (radiogroup sistema/escuro/claro), incluído no header/shell do app (provavelmente no topo da `QueueScreen`, já que não há um layout compartilhado separado hoje).

### 4. Bootstrap
- `frontend/balcao/src/main.tsx`: adicionar os 3 imports na mesma ordem do admin — `design-system/dist/core/scss/styles.scss` → `design-system/dist/core/icons/icons.css` → `./styles/theme.scss`.

### 5. Migração tela a tela (inline styles → componentes DS + .module.scss)
Ordem sugerida (da mais simples pra mais complexa):
1. `LoginScreen.tsx` — trocar inputs/botão nus por `InputBase`/`Button`/`Alert` do DS, mantendo a máquina de estados de MFA da ORD-120 intacta (só a camada de apresentação muda). Criar `LoginScreen.module.scss` seguindo o padrão `@import 'design-system/dist/core/scss/styles';` + `var(--a-*)`.
2. `QueueScreen.tsx` — cards de pedido, badges de urgência/status, botão de turbo mode.
3. `OrderDetailScreen.tsx` — lista de tickets, modal de confirmação (usar `Modal` do DS — atenção ao padrão de input não-controlado já documentado em [[project_ordin_design_system_gotchas]] se houver campo de texto dentro), botão de coleta.
4. `components/QrScanner.tsx` — moldura da câmera, botão de fechar, fallback de entrada manual (`InputBase`).
5. `components/AudioFeedback.ts` — sem mudança (não é visual).

### Estimativa
**G** — 5 arquivos de UI pra reescrever, mais setup de build/tooling (vendorização, tema, bootstrap) que não existe hoje no balcão. Risco principal é hardcoded colors espalhados pelas 260 linhas do `OrderDetailScreen.tsx` (maior arquivo) — checklist de "nenhum `#` de cor sobrando fora de `theme.scss`" como critério de pronto.

### Riscos técnicos identificados
- Duas armadilhas do design system já documentadas em [[project_ordin_design_system_gotchas]] (Button descarta `className`, `Modal` com bug de foco em input controlado) valem também aqui — usar os mesmos workarounds já estabelecidos no admin (estilo via `style`, inputs não-controlados em Modal).
- `QrScanner.tsx` usa vídeo de câmera em tela cheia — cuidado extra pra não quebrar o layout de vídeo ao aplicar padding/containers do DS.

## Fora de escopo
- Qualquer mudança de comportamento/lógica de negócio — puramente visual.
- Adicionar MFA ao balcão — isso já foi feito na [[ORD-120]], esta história só restyle o que já existe.

## Próximos passos
Ready — escopo, cenários e solução técnica bem definidos (mirror direto do que já existe e funciona no admin). Implementar em cima da branch da ORD-120 (que já tem o LoginScreen com MFA), não da main.
