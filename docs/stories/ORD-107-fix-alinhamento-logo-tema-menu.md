---
id: ORD-107
status: Done
fase: 6
sprint: null
responsavel: Frontend
estimativa: 1 ponto
tipo: fix
---

# ORD-107 — Fix: alinhamento da logo e reposição do seletor de tema no menu

## Descrição
Pedido direto do usuário (2026-08-21), aproveitando que o menu lateral (`Sidebar.tsx`) já estava em foco:

1. A logo "ordin" (símbolo hexagonal) aparecia visualmente mais à esquerda que os ícones de navegação abaixo dela.
2. O seletor de tema (claro/escuro/padrão do navegador) ficava antes do botão "Sair", numa trilha estreita de 96px que sobrava solta no espaço vazio do menu — pedido pra mover pra depois do "Sair" e ocupar a largura toda.

## Causa do desalinhamento (achado ao vivo)
Medido via `getBoundingClientRect()` no Chrome: o ícone de navegação renderizava com `left: 19px`, mas o cálculo pela CSS (`padding-left: 16px` do token `'m'`) previa `16px`. A diferença de 3px vem de `.navItem { border-left: 3px solid transparent; }` — reserva de espaço pro indicador de item ativo (`border-left` colorido quando a rota está ativa), presente mesmo quando transparente/inativo. O cabeçalho da logo (`.header`) não tinha essa mesma reserva, ficando 3px mais à esquerda que os ícones.

## Fix
- **`Sidebar.module.scss`:** `.header` ganha `padding-left: 19px` (16px do token + 3px pra igualar a reserva de border dos itens de navegação).
- **`Sidebar.tsx`:** bloco do `ThemeModeSwitch` movido pra depois do botão "Sair" (era antes).
- **`Sidebar.module.scss`:** `.actionBtn` trocou margin fixa por `padding: 8px 16px 16px 19px` (mesmo respiro horizontal do resto do menu, incluindo os 19px de alinhamento).
- **`ThemeModeSwitch.module.scss`:** `.track` trocou `width: 96px` fixo por `width: 100%` — preenche o container em vez de sobrar espaço vazio ao redor.

## Downstream

- **Branch:** `fix/ord-107-alinhamento-logo-tema-menu`, a partir de `main`.
- `tsc --noEmit`: limpo.
- **Verificado ao vivo no Chrome:** zoom comparando pixel a pixel o símbolo da logo com os ícones de navegação (recolhido e expandido) — alinhamento confirmado. Seletor de tema confirmado abaixo de "Sair", ocupando a largura toda do menu expandido. Sem erros no console.
- PR ainda não aberta — implementação completa, aguardando decisão do usuário sobre commit/PR/merge.
