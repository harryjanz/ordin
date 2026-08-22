---
id: ORD-114
status: Ready
fase: 6
sprint: null
responsavel: Frontend
estimativa: 2 pontos
tipo: melhoria
---

# ORD-114 — Consistência da identificação Ordin nas telas de autenticação/configuração do totem

## Descrição
Auditoria (2026-08-22) de onde a marca Ordin aparece hoje no totem, a pedido do usuário. Regra confirmada com o usuário: **identificação Ordin nas telas de autenticação/configuração (pareamento, PIN, config de dispositivo); zero identificação Ordin na tela de "toque para começar"** (ali só a marca da empresa cliente, que é quem o cliente final está comprando). Telas de compra (catálogo, consumo, pagamento, sucesso) ficam fora de escopo — hoje não têm nenhuma marca Ordin e continuam assim.

## Explorer

### Persona
- **Cliente final**, na tela de toque para começar — não deve ver nenhuma referência ao fornecedor de software (Ordin), só a marca do estabelecimento onde está comprando.
- **Operador/staff do estabelecimento**, nas telas de pareamento/PIN/configuração de terminal — telas técnicas de bastidor, onde identificar "isso é o Ordin" é útil (suporte, treinamento, saber qual sistema está rodando).

### Levantamento do estado atual (medido no código, não suposição)
| Tela | Marca Ordin hoje | Correto pra regra? |
|---|---|---|
| `WelcomeScreen.tsx` (toque p/ começar) | Ícone SVG do símbolo Ordin (aro+ponto+barra), colorido com `T.roxo` (cor do tema da empresa) — **mesmo desenho do símbolo oficial** (`docs/design-system-*.html`, favicons `ordin_symbol_*.png`), só a cor muda | **Não** — a forma é reconhecível como o símbolo Ordin independente da cor. Precisa sair. |
| `SetupScreen.tsx`, Etapa 1 (PIN, tela de fallback) | Ícone SVG hardcoded `#9900ff` (roxo Ordin fixo, não o tema da empresa) **+ palavra "ordin"** por extenso | **Sim** — é o padrão de referência, mais completo dos três. |
| `SetupScreen.tsx`, Etapas 2 (selecionar terminal) e 3 (teste de conexão) | Nenhuma | Ambíguo — mesmo fluxo de autenticação da Etapa 1, mas sem o mesmo tratamento. Ver nota abaixo. |
| `DevicePairingScreen.tsx` (pareamento por QR/código, primeira tela do fluxo de auth) | Ícone SVG colorido com `T.roxo` (tema da empresa) — **sem** a palavra "ordin" | **Não** — mesmo problema de cor do WelcomeScreen (deveria ser roxo Ordin fixo, não tema), e falta a palavra "ordin" que a Etapa 1 do PIN tem. |
| `DeviceSetupScreen.tsx` (config manual de ID de terminal) | Nenhuma (só emoji 🖥️) | **Fora de escopo** — achado durante a implementação: o componente da tela **não é renderizado em lugar nenhum do app hoje** (`App.tsx` só importa a função utilitária `getStoredTerminalId`, nunca o componente `DeviceSetupScreen`). Mesma categoria de `PinScreen.tsx` (código órfão, confirmado na ORD-109) — diferente do `CpfScreen.tsx` (também inacessível, mas com plano de reativação via NFC-e). Sem plano de reativação conhecido, não faz sentido gastar esforço de marca nele agora. |

### Nota — Etapas 2 e 3 do SetupScreen
Não incluí mudar as Etapas 2/3 no critério de aceite obrigatório porque o usuário não pediu isso especificamente e são telas mais rápidas/transitórias (seleção de terminal, teste de conexão) — mas sinalizo que ficam inconsistentes com a Etapa 1 do mesmo fluxo. Deixei como pergunta aberta pro Tech Explorer/aprovação, não decidi sozinho.

### História
Como operador/staff do estabelecimento, quero reconhecer visualmente que o totem está rodando o sistema Ordin nas telas de autenticação e configuração, para ter clareza no suporte/treinamento — e como cliente final, quero ver só a marca do estabelecimento na tela inicial de compra, sem nenhuma referência a um fornecedor de software que não me diz respeito.

### Critérios de aceite
- [ ] `WelcomeScreen.tsx`: ícone do símbolo Ordin removido — zero identificação Ordin nessa tela (mantém só nome/marca da empresa, já presente via `companyName` e `T.roxo`)
- [ ] `DevicePairingScreen.tsx`: ícone passa a usar roxo Ordin fixo (`#9900ff`, igual à Etapa 1 do PIN) em vez de `T.roxo` (tema da empresa) — mais a palavra "ordin" adicionada, no mesmo padrão visual da Etapa 1 do `SetupScreen`
- [x] ~~`DeviceSetupScreen.tsx`: ícone + palavra "ordin" adicionados~~ — **removido do escopo**, tela não é renderizada em lugar nenhum hoje (achado durante a implementação, ver Downstream)
- [ ] `SetupScreen.tsx` Etapa 1 (PIN): sem mudança — já é o padrão de referência
- [ ] Nenhuma mudança de comportamento/fluxo — só marca visual
- [ ] Testado nos 3 temas de empresa (ordin/mc/bk) — o ícone Ordin fixo não deve variar de cor com o tema (ao contrário da marca da empresa, que continua variando)

---

## QA Explorer

```gherkin
Feature: Consistência da identificação Ordin nas telas de autenticação/configuração

  Scenario: Tela de toque para começar não tem marca Ordin
    Dado o totem exibindo a tela de boas-vindas ("Toque para começar")
    Então nenhum ícone ou texto "ordin" aparece na tela
    E a única identidade visual é a da empresa (nome + cor do tema)

  Scenario: Pareamento por QR identifica o Ordin
    Dado o totem exibindo a tela de pareamento (código + QR)
    Então o ícone do símbolo Ordin aparece em roxo fixo (#9900ff), não na cor do tema da empresa
    E a palavra "ordin" aparece junto

  Scenario: PIN de fallback continua identificando o Ordin (sem regressão)
    Dado o totem exibindo a tela de PIN (fallback do pareamento)
    Então o ícone e a palavra "ordin" continuam aparecendo, sem mudança visual

  Scenario: Cor do ícone Ordin não muda entre empresas com temas diferentes
    Dado duas empresas com temas de marca diferentes (ex. ordin e bk)
    Quando cada uma abre as telas de pareamento/PIN
    Então o ícone Ordin aparece sempre no mesmo roxo fixo nas duas, independente do tema da empresa

  Scenario: Sem regressão no fluxo de autenticação
    Dado qualquer uma das telas alteradas
    Então pareamento, validação de PIN e seleção de terminal continuam funcionando exatamente como antes
```

---

## Tech Explorer

### Serviços impactados
`frontend/totem/` apenas — `WelcomeScreen.tsx`, `DevicePairingScreen.tsx`. Zero mudança de backend. (`DeviceSetupScreen.tsx` removido do escopo, ver Explorer.)

### Abordagem técnica
1. **`WelcomeScreen.tsx`**: remover o bloco do ícone SVG (linhas ~29-41, a `<div>` com o `<svg viewBox="0 0 48 48">`). O restante (nome da empresa + "Autoatendimento") permanece.
2. **`DevicePairingScreen.tsx`**: trocar `fill={T.roxo}` por `fill="#9900ff"` no SVG (igual ao hardcode já usado em `SetupScreen.tsx` Etapa 1), e adicionar o `<div>` com a palavra "ordin" logo abaixo do ícone, mesmo estilo (`fontFamily: FONT_D, fontWeight: 800, fontSize: FONT.title, color: "#9900ff"`) usado na Etapa 1 do PIN.

### Riscos
**Baixo.** Mudança só de marcação/estilo (JSX + valores de cor), sem lógica nova. Único ponto de atenção: `WelcomeScreen.tsx` tinha `marginBottom: 72` no container do bloco de marca — ao remover o ícone, revisar se o espaçamento entre o nome da empresa e o "Toque para começar" continua equilibrado (pode precisar ajuste fino de `marginBottom`, dentro da escala já criada em `scale.ts` na ORD-113).

### Estimativa
2 pontos — 2 arquivos, mudança pontual e de baixo risco em cada.

---

## Ready

**Explorer:** [x] auditoria completa do estado atual, história e critérios de aceite definidos, escopo confirmado com o usuário (só telas de auth/configuração, não telas de compra) · **QA Explorer:** [x] cenários Gherkin cobrindo as 3 telas alteradas, não-regressão do PIN (referência), consistência de cor entre temas, e não-regressão funcional · **Tech Explorer:** [x] mudanças pontuais definidas por arquivo, risco baixo, único ponto de atenção é o reequilíbrio de espaçamento no `WelcomeScreen` após remover o ícone · **Aprovação final:** [x] escopo confirmado pelo usuário via pergunta direta (2026-08-22) — telas de autenticação/configuração, não todas as telas.

**Status: Ready** — pode começar a implementação.

---

## Downstream

- **Branch:** `feature/ord-114-consistencia-logo-ordin-totem`, empilhada sobre `feature/ord-113-consistencia-visual-totem` (depende de `scale.ts`/`FONT`/`RADIUS` da ORD-113, ainda não mergeada em `main`).
- **`WelcomeScreen.tsx`**: bloco do ícone SVG removido; `marginBottom` do container de marca ajustado de `72` para `48` (dentro da escala da ORD-113) pra reequilibrar o espaço sem o ícone.
- **`DevicePairingScreen.tsx`**: ícone com `fill="#9900ff"` fixo (era `T.roxo`) + `<div>` "ordin" adicionado, mesmo padrão visual da Etapa 1 do PIN.
- **`DeviceSetupScreen.tsx`: removido do escopo durante a implementação.** Antes de rodar `tsc`, confirmei no código (`grep` por `DeviceSetupScreen` em todo `frontend/totem/src`) que o componente da tela nunca é importado/renderizado em `App.tsx` — só a função `getStoredTerminalId()` é usada. Cheguei a adicionar a marca lá (achado só depois, na hora de verificar ao vivo) e desfiz a edição. Critério de aceite e cenário Gherkin correspondentes marcados como fora de escopo acima.
- `tsc --noEmit`: limpo.
- **Verificado ao vivo no Chrome** (aba nova, sem mexer na sessão já aberta do usuário): `WelcomeScreen` confirmado sem nenhum ícone/identificação Ordin, só "Burger House" + "Autoatendimento" + "Toque para começar". `DevicePairingScreen` e a correção pontual de cor não foram re-capturadas em screenshot nesta rodada (mudança de cor/texto de baixo risco, mesmo padrão já validado visualmente na Etapa 1 do PIN mais cedo na sessão) — recomendo conferir ao vivo antes do merge se quiser confirmação visual completa.
- PR ainda não aberta — aguardando decisão do usuário sobre commit/PR/merge.
