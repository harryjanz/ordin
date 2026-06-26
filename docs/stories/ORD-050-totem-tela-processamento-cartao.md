# ORD-050 — Totem: tela dedicada de processamento de cartão

**Status:** Ready
**Pontos:** 2
**Sprint:** —

---

## História

Como cliente no totem, quero ver uma instrução clara de "insira o cartão" ao confirmar o pagamento, para saber exatamente o que fazer com o terminal físico sem dúvida.

## Contexto e motivação

Quando o cliente confirma crédito ou débito, o totem exibe um spinner pequeno dentro da `PaymentScreen` com o texto "Processando pagamento… Aguarde a confirmação no terminal TEF (90s)". A mensagem é ambígua — o cliente não sabe se já deve inserir o cartão no terminal físico ou aguardar outra instrução. A tela de referência São Bento/CPlug usa um estado inteiro dedicado: ícone de cartão centralizado em ~120px, texto "Insira ou aproxime o cartão", três pontos animados e nada mais. O foco único elimina dúvida e direciona a ação física imediatamente. Não se aplica ao PIX, que já tem `PIXPaymentScreen` dedicada.

## Fluxo principal

1. Cliente seleciona Crédito ou Débito na `PaymentScreen`
2. Confirma tocando em "Pagar R$ X,XX"
3. `processing` passa para `true` — a `PaymentScreen` sai de cena e uma tela de foco único ocupa toda a viewport
4. Tela exibe: ícone SVG de cartão (~120px), título "Insira ou aproxime o cartão", três pontos animados
5. Countdown de 90s continua rodando em background (visível discretamente)
6. Ao receber resposta do backend: navega para `SuccessScreen` (aprovado) ou exibe erro (recusado/timeout)

## Fluxos alternativos / exceções

- **Recusado:** exibe mensagem de erro inline na mesma tela de processamento, com botão "Tentar novamente" que retorna à seleção de método
- **Timeout (90s):** exibe mensagem "Tempo esgotado. Tente novamente." com botão de retry
- **Erro de rede:** mesma tela de erro com retry

## Dependências

- Serviços envolvidos: nenhum (mudança exclusivamente frontend — a lógica de `api.post("/payments")` na `PaymentScreen` não muda)
- Histórias bloqueantes: ORD-048 (se SVG icons forem implementados em conjunto, reaproveitar o mesmo ícone de cartão)
- Telas afetadas: `PaymentScreen.tsx` (extrair o estado `processing=true` para componente/estado dedicado)

## Critérios de aceite funcionais

- [ ] Quando `method = credit | debit` e `processing = true`, a viewport exibe exclusivamente a tela de foco único (sem os botões de método nem o botão "Pagar")
- [ ] Tela de processamento contém: ícone SVG de cartão centralizado (≥ 100px), texto "Insira ou aproxime o cartão", animação de três pontos
- [ ] Countdown de 90s visível de forma discreta (ex: texto pequeno no rodapé "Aguardando… 87s")
- [ ] Em caso de recusa ou timeout, exibe mensagem de erro com botão de retry que retorna ao estado de seleção de método
- [ ] O fluxo PIX (`PIXPaymentScreen`) não é afetado
- [ ] Funciona nos 3 temas de cor

## Wireframe / Mockup

Referência visual: `/docs/exemples/totem1/WhatsApp Image 2026-06-26 at 08.37.01 (1).jpeg` — ícone de cartão grande centralizado, instrução simples, três pontos animados, nada mais na tela.

---

## Tech Explorer

### Serviços impactados
- `frontend/totem` (React): modificação de `PaymentScreen.tsx` — o bloco `processing=true` para `credit|debit` é substituído por uma tela de foco único. Nenhum serviço backend afetado; a chamada `api.post("/payments")` não muda.

### Estrutura do estado de processamento

`PaymentScreen` já tem os estados: `method`, `processing`, `countdown`, `error`. A mudança é **exclusivamente visual** — quando `processing && method !== "pix"`, substituir o conteúdo da viewport.

```tsx
// PaymentScreen.tsx — bloco processing atual (substituir)
{processing ? (
  <CardProcessingView
    T={T}
    countdown={countdown}
    error={error}
    onRetry={() => { setProcessing(false); setError(""); setMethod(null); }}
  />
) : (
  /* ... seleção de método e botão pagar ... */
)}
```

### Componente `CardProcessingView`

Pode ser extraído como componente interno no mesmo arquivo (não precisa de arquivo separado):

```tsx
function CardProcessingView({
  T, countdown, error, onRetry
}: { T: Theme; countdown: number; error: string; onRetry: () => void }) {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 24, background: T.radial,
    }}>
      {error ? (
        <>
          {/* Estado de erro */}
          <XCircle size={100} color={T.errorText} strokeWidth={1.5} />
          <p style={{ fontSize: 22, color: T.text, fontFamily: FONT_D, fontWeight: 700 }}>{error}</p>
          <button onClick={onRetry} style={{ /* botão retry */ }}>Tentar novamente</button>
        </>
      ) : (
        <>
          {/* Estado de aguardando cartão */}
          <CreditCard size={120} color={T.roxo} strokeWidth={1.2} />
          <p style={{ fontSize: 24, color: T.text, fontFamily: FONT_D, fontWeight: 700 }}>
            Insira ou aproxime o cartão
          </p>
          <DotsAnimation T={T} />  {/* três pontos animados — ver abaixo */}
          <p style={{ fontSize: 13, color: T.muted, opacity: 0.5, position: "absolute", bottom: 32 }}>
            Aguardando… {countdown}s
          </p>
        </>
      )}
    </div>
  );
}
```

### Animação de três pontos

CSS puro via `@keyframes` já declarado no `index.css` do projeto, ou inline via `style`:

```tsx
function DotsAnimation({ T }: { T: Theme }) {
  return (
    <div style={{ display: "flex", gap: 10 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{
          width: 10, height: 10, borderRadius: "50%",
          background: T.roxo, opacity: 0.7,
          animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
    </div>
  );
}
// Reutiliza o keyframe "pulse" já existente no WelcomeScreen
```

### Arquivos a modificar

```
frontend/totem/src/screens/
└── PaymentScreen.tsx   ← extrair CardProcessingView + DotsAnimation internos,
                           substituir bloco processing existente
```

**Dependência de ORD-048:** se ORD-048 for implementado antes, `CreditCard` e `XCircle` do Lucide já estarão disponíveis. Se ORD-048 vier depois, usar o SVG inline do cartão temporariamente (ou implementar ORD-048 primeiro — recomendado).

### Estimativa
- Frontend: **2 pontos** (extração de componente + 3 estados: aguardando / erro / timeout)
- Backend: 0 pontos

### Riscos
- **Reaproveitar `XCircle` do Lucide**: depende de ORD-048 ter adicionado `lucide-react`. Resolver na ordem: ORD-048 → ORD-050.
- **O `countdown` já existe** na `PaymentScreen` (state `countdown` inicializado em 90) — apenas exibir de forma discreta, sem lógica nova.
- **Timeout via `countdown <= 0`**: o estado de erro já é disparado pelo `catch` da chamada HTTP; o timeout de 90s precisa ser transformado em `setError("Tempo esgotado. Tente novamente.")` quando `countdown <= 0` e `processing === true`.

---

## QA Explorer

```gherkin
Feature: Tela dedicada de processamento de cartão
  Como cliente no totem
  Quero ver uma instrução clara ao confirmar pagamento com cartão
  Para saber imediatamente o que fazer com o terminal físico

  Background:
    Dado que o cliente montou um carrinho e está na PaymentScreen

  Scenario: Tela de processamento exibe foco único ao confirmar crédito
    Dado que o cliente selecionou o método "Crédito"
    Quando toca em "Pagar R$ X,XX"
    Então a seleção de métodos e o botão "Pagar" desaparecem
    E a viewport exibe exclusivamente: ícone SVG de cartão (≥100px), texto "Insira ou aproxime o cartão" e animação de três pontos
    E nenhum outro elemento de interface está visível

  Scenario: Tela de processamento exibe foco único ao confirmar débito
    Dado que o cliente selecionou o método "Débito"
    Quando toca em "Pagar R$ X,XX"
    Então a viewport exibe exclusivamente: ícone SVG de cartão, texto "Insira ou aproxime o cartão" e animação de três pontos

  Scenario: Countdown discreto está visível durante o processamento
    Dado que a tela de processamento está ativa
    Então um contador regressivo de 90s é exibido de forma discreta (ex: rodapé da tela)
    E o contador decrementa a cada segundo

  Scenario: Pagamento aprovado navega para SuccessScreen
    Dado que a tela de processamento de cartão está ativa
    Quando o backend retorna status "approved"
    Então o totem navega para a SuccessScreen
    E a tela de processamento não é mais exibida

  Scenario: Pagamento recusado exibe erro com opção de retry
    Dado que a tela de processamento de cartão está ativa
    Quando o backend retorna status "refused"
    Então a tela exibe mensagem "Pagamento recusado. Tente novamente."
    E um botão "Tentar novamente" está disponível
    Quando o cliente toca em "Tentar novamente"
    Então retorna à seleção de método de pagamento

  Scenario: Timeout de 90s exibe erro com opção de retry
    Dado que a tela de processamento de cartão está ativa
    Quando o contador chega a 0 sem resposta do backend
    Então a tela exibe mensagem "Tempo esgotado. Tente novamente."
    E um botão "Tentar novamente" está disponível

  Scenario: Erro de rede exibe mensagem apropriada
    Dado que a tela de processamento de cartão está ativa
    Quando ocorre erro de comunicação com o backend
    Então a tela exibe mensagem de erro genérica
    E um botão "Tentar novamente" está disponível

  Scenario: Fluxo PIX não é afetado
    Dado que o cliente selecionou o método "PIX"
    Quando toca em "Pagar R$ X,XX"
    Então o totem navega para a PIXPaymentScreen (comportamento inalterado)
    E a tela de processamento de cartão não é exibida

  Scenario: Tela de processamento funciona nos 3 temas de cor
    Dado que o tema ativo é alternado entre dark, light e brand
    Quando a tela de processamento de cartão está ativa
    Então o ícone, o texto e a animação são visíveis com contraste adequado em todos os temas
```
