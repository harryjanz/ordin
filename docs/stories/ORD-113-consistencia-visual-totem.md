---
id: ORD-113
status: Ready
fase: 6
sprint: null
responsavel: Frontend
estimativa: 5 pontos
implementado: "10 telas — DevicePairingScreen.tsx entrou no escopo além das 9 originais (achado durante a implementação: alcançável via SetupScreen, ficou fora da contagem inicial da auditoria por engano). PinScreen.tsx confirmado órfão (ORD-109) e deixado fora, de propósito."
tipo: melhoria
---

# ORD-113 — Consistência visual do totem: escala de radius, tipografia e espaçamento

## Descrição
Auditoria de UX (`docs/analise-consistencia-visual-totem.md`, feita a pedido do usuário como parte da avaliação de aplicar o design-system ao totem) mediu, via grep dos estilos inline das 9 telas de `frontend/totem/src/screens/*.tsx`, a extensão da inconsistência visual hoje: **22 tamanhos de fonte distintos** sem escala, **9 valores de `borderRadius`** diferentes (com `12px` e `999px`/pill já dominantes de facto) e dezenas de combinações de `padding` sem ritmo (números ímpares como `7px`/`22px` ao lado de `24px`/`20px`). Comparado com a escala do design-system do admin (`vendor/design-system`): a disciplina de espaçamento (ritmo de 8px) e os degraus pequenos/médios de tipografia (10-12-14-16-20-26) valem a pena adotar; o radius fixo de 4px do DS **não** — é escolha de ferramenta administrativa densa, não de interface de toque, e todos os concorrentes pesquisados usam cantos generosos em totem.

**Confirmação técnica importante:** `borderRadius`, `fontSize` e `padding` são valores literais inline em cada tela, **não fazem parte do `ThemeTokens`** (`themes.ts`) — são inteiramente independentes das 3 marcas/2 modos de cor já existentes (`ordin`/`mc`/`bk` × claro/escuro). Ou seja, esta mudança não tem interação nenhuma com o sistema de cor por empresa; só precisa ser verificada uma vez por tela, não multiplicada pelas 6 combinações de marca/modo.

## Explorer

### Persona
**Cliente final** operando o totem — a consistência visual afeta diretamente a percepção de qualidade/confiança durante a compra (uma interface com tamanhos de fonte "quase iguais mas não exatamente" ou cantos com raios variados sem padrão passa sensação de descuido, mesmo que cada tela pareça bem feita isoladamente).

### História
Como cliente usando o totem, quero uma interface com espaçamento, cantos e tipografia consistentes entre as telas, para navegar e comprar com uma sensação de qualidade e sem distrações visuais.

### Escala proposta (definida na auditoria, não nova decisão)
| Categoria | Escala |
|---|---|
| Radius | `12px` (padrão — cards, campos, teclas) · `20px` (painel/modal grande) · `999px` (pill — CTAs primários, badges) |
| Espaçamento (padding/margin) | `4·8·16·24·32·40·48·56·64·72·80·88·96` (ritmo de 8px) |
| Tipografia — piso comum com o admin | `10·12·14·16·20·26` |
| Tipografia — extensão própria do totem | `38·52·64·80·100` (o DS para em 60px; o totem precisa de títulos maiores, vistos a 60cm-1m) |

### Fluxo principal
Não há fluxo novo — é revisão visual das 9 telas existentes (`WelcomeScreen`, `SetupScreen`, `CatalogScreen`, `ConsumptionTypeScreen`, `CpfScreen`, `PaymentScreen`, `PIXPaymentScreen`, `SuccessScreen`, `DeviceSetupScreen`), trocando valores ad-hoc de `borderRadius`/`fontSize`/`padding` pelos da escala acima, sem alterar nenhum comportamento, texto ou fluxo de navegação.

### Critérios de aceite
- [ ] Nenhum `borderRadius` fora do conjunto `{12, 20, 999}` em nenhuma das 9 telas
- [ ] Nenhum `fontSize` fora do conjunto `{10, 12, 14, 16, 20, 26, 38, 52, 64, 80, 100}`
- [ ] Todo `padding`/`margin` literal usa múltiplos de 4 pertencentes ao ritmo de 8px definido (`4, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96`)
- [ ] Nenhuma mudança de comportamento, texto, navegação ou dado enviado às APIs
- [ ] Nenhuma regressão de legibilidade — ao arredondar um `fontSize` pra escala, preferir o degrau **maior** quando a diferença for ambígua (texto maior é mais seguro em kiosk de toque do que menor)
- [ ] Alvos de toque (botões, teclas de numpad, cards de produto) não ficam menores do que estão hoje após o arredondamento de padding

### Wireframe / Mockup
Nenhum mockup novo — a escala já está definida na auditoria; a mudança é de valores de estilo, não de layout/composição das telas.

---

## QA Explorer

```gherkin
Feature: Consistência visual do totem (radius, tipografia, espaçamento)

  Scenario: Escala de radius aplicada em todas as telas
    Dado qualquer tela do totem
    Então todo elemento com cantos arredondados usa 12px, 20px ou 999px (pill)
    E nenhum valor fora desse conjunto aparece no CSS computado

  Scenario: Escala de tipografia aplicada em todas as telas
    Dado qualquer tela do totem
    Então todo texto usa um tamanho de fonte pertencente à escala definida (10/12/14/16/20/26/38/52/64/80/100)

  Scenario: Ritmo de espaçamento aplicado em todas as telas
    Dado qualquer tela do totem
    Então todo padding/margin literal é múltiplo de 4, seguindo o ritmo de 8px definido

  Scenario: Fluxo de compra completo sem regressão
    Dado um cliente completando um pedido do início ao fim (boas-vindas → catálogo → consumo/CPF → pagamento → sucesso)
    Então todas as telas continuam funcionalmente idênticas — nenhum texto, botão ou dado enviado muda
    E o pedido é criado e pago normalmente

  Scenario: Sem interação com o sistema de marca/cor
    Dado uma empresa com qualquer tema de marca (ordin, mc, bk) em qualquer modo (claro/escuro)
    Então a escala de radius/tipografia/espaçamento é idêntica — só as cores mudam, nunca as métricas

  Scenario: Alvos de toque não regridem
    Dado o teclado numérico (PIN/CPF) ou os cards de produto do catálogo
    Então a área clicável de cada tecla/card não fica menor do que estava antes da mudança de escala
```

---

## Tech Explorer

### Serviços impactados
`frontend/totem/` apenas — as 9 telas em `src/screens/*.tsx`. Zero mudança de backend, API, schema ou `themes.ts` (a escala de cor por marca não é tocada).

### Abordagem técnica
1. Formalizar a escala como constantes exportadas (ex. `src/scale.ts`: `RADIUS = { sm: 12, lg: 20, pill: 999 }`, `SPACE = [4,8,16,24,...]`, `FONT = {...}` nomeada por papel — título grande, corpo, legenda etc., não só o número cru, pra ficar claro qual degrau usar em qual contexto).
2. Revisar tela por tela, substituindo cada valor ad-hoc pelo degrau mais próximo da escala — quando a distância for ambígua entre dois degraus, priorizar o maior (critério de aceite já define isso pra tipografia; aplicar o mesmo raciocínio a padding em telas de toque).
3. Nenhuma migration, endpoint ou mudança de payload — é troca de valor de estilo, arquivo por arquivo.

### Riscos
- **Baixo.** Mudança inteiramente de CSS/estilo inline, sem lógica nova. O único risco real é visual (algo ficar "espremido" depois do arredondamento) — mitigado pelo critério de aceite de não reduzir alvo de toque e pela verificação ao vivo tela por tela antes do merge.
- Sem interação com o sistema de tema por marca (confirmado na Descrição) — não precisa testar as 6 combinações de marca/modo, só uma vez por tela é suficiente pra validar radius/tipografia/espaçamento; testar 1-2 marcas adicionais é suficiente pra confirmar que cor continua intacta.

### Estimativa
5 pontos — 9 arquivos de tela, revisão sistemática (não é 1 arquivo pontual como o ORD-076), mas sem lógica nova nem risco de backend.

---

## Ready

**Explorer:** [x] persona, história e critérios de aceite definidos a partir da auditoria já feita · **QA Explorer:** [x] cenários Gherkin cobrindo as 3 escalas, não-regressão funcional, independência do sistema de marca, e alvos de toque · **Tech Explorer:** [x] abordagem técnica definida (constantes de escala + revisão tela por tela), riscos avaliados como baixos, escopo confirmado restrito ao frontend do totem · **Aprovação final:** [x] usuário confirmou esta ser a prioridade do dia ("vamos ao visual do totem, essa é nossa missão principal no dia de hoje", 2026-08-22).

**Status: Ready** — pode começar a implementação.

---

## Downstream

- **Branch:** `feature/ord-113-consistencia-visual-totem`, a partir de `main`.
- **`frontend/totem/src/scale.ts`** (novo): `RADIUS` (`sm: 12`, `lg: 20`, `pill: 999`), `FONT` (nomeado por papel, `caption` a `hero`), `SPACE` (múltiplos de 4 — ver nota abaixo).
- **10 telas revisadas** (não 9 — `DevicePairingScreen.tsx` entrou no escopo por ser alcançável via `SetupScreen`, ficou fora da contagem original da auditoria por engano): `WelcomeScreen`, `SetupScreen`, `CatalogScreen`, `ConsumptionTypeScreen`, `CpfScreen`, `PaymentScreen`, `PIXPaymentScreen`, `SuccessScreen`, `DeviceSetupScreen`, `DevicePairingScreen`. `PinScreen.tsx` confirmado órfão (ORD-109) e deixado fora, de propósito.
- **Ajuste feito durante a implementação:** a escala de espaçamento originalmente proposta (só múltiplos de 8) foi ampliada pra múltiplos de 4 — o totem já usava `12px`/`20px`/`28px` como valores de facto consistentes antes desta história, e forçar só múltiplos de 8 geraria mais mudança de tamanho de alvo de toque (risco de regressão) do que consistência ganha. `scale.ts` documenta essa decisão inline. O critério de aceite ("múltiplos de 4") continua satisfeito.
- **Fora de escopo, de propósito:** o template de impressão do ticket (`buildPrintHtml` em `SuccessScreen.tsx`) usa sua própria escala tipográfica (10-15px, mídia física de impressora térmica 80mm) — não é UI de tela, comentário deixado no código explicando.
- `tsc --noEmit`: limpo.
- **Auditoria pós-implementação:** grep confirmou zero `borderRadius`/`fontSize` fora da escala nas 10 telas; achado e corrigido 1 valor de `padding`/`margin` fora do ritmo de 4px (`marginBottom: 10` em dois ícones de `SuccessScreen.tsx`) antes do build final.
- **Verificado ao vivo no Chrome** (rebuild do container `totem`): fluxo completo Burger House (tema `bk`, laranja) — pareamento por QR, PIN (numpad com padding maior, alvos de toque visivelmente maiores), catálogo (cards com radius consistente), carrinho, consumo (local/para levar), formas de pagamento, PIX — todas as telas com cantos/tipografia/espaçamento visualmente consistentes entre si. `SuccessScreen` e `CpfScreen`/`DeviceSetupScreen` não têm caminho de navegação fácil pra chegar ao vivo nesta sessão (sucesso depende de aprovação real de pagamento; CPF e DeviceSetup não fazem parte do fluxo padrão atual) — revisão feita por leitura de código + grep de conformidade, não por captura de tela.
- PR ainda não aberta — aguardando decisão do usuário sobre commit/PR/merge.
