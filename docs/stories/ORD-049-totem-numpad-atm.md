# ORD-049 — Totem: numpad padrão ATM + teclas maiores

**Status:** Done
**Pontos:** 1
**Sprint:** —

---

## História

Como cliente no totem, quero um teclado numérico com layout e tamanho iguais aos terminais de pagamento físicos, para digitar CPF e PIN sem hesitação ou erro.

## Contexto e motivação

O numpad das telas `CpfScreen` e `PinScreen` usa o layout de celular (1-2-3 no topo, 7-8-9 na base). Todo terminal físico de pagamento, caixa eletrônico e totem de autoatendimento usa o padrão ATM invertido (7-8-9 no topo, 1-2-3 na base). O cliente chega ao totem logo após interagir com terminais físicos — a divergência de layout cria fricção cognitiva e erros de digitação. Adicionalmente, as teclas atuais (card wrapper de 320px, padding de 18px por tecla) são subótimas para toque com dedo em tela grande; a referência São Bento/CPlug usa teclas de largura total com altura de ~80-90px por linha.

## Fluxo principal

1. Cliente chega à `CpfScreen` e vê o numpad com 7-8-9 no topo (padrão ATM)
2. Teclas ocupam ~90% da largura da tela disponível, com altura confortável para toque
3. Cliente digita CPF sem hesitar — o padrão é o mesmo dos terminais físicos que usa cotidianamente
4. Mesmo comportamento na `PinScreen` para digitação do PIN

## Fluxos alternativos / exceções

- O card wrapper atual da `CpfScreen` (320px) deve ser expandido ou removido para acomodar teclas maiores
- A tecla backspace (⌫) deve manter tamanho e posição análogos ao padrão ATM (última linha, coluna direita)
- A célula vazia (linha do 0) deve continuar não-clicável mas visualmente coerente com as demais

## Dependências

- Serviços envolvidos: nenhum (mudança exclusivamente frontend)
- Histórias bloqueantes: nenhuma
- Telas afetadas: `CpfScreen.tsx`, `PinScreen.tsx`

## Critérios de aceite funcionais

- [ ] Layout do numpad: `7 8 9 / 4 5 6 / 1 2 3 / [vazio] 0 [⌫]` em ambas as telas
- [ ] Largura das teclas: numpad ocupa ≥ 90% da largura da tela (sem card wrapper estreito)
- [ ] Altura das teclas: mínimo 80px por linha
- [ ] Comportamento de digitação inalterado (limite de 11 dígitos no CPF, 4-6 no PIN)
- [ ] Feedback visual ao toque (`T.numHover`) mantido
- [ ] Aparência coerente nos 3 temas de cor

## Wireframe / Mockup

Referência visual: `/docs/exemples/totem1/WhatsApp Image 2026-06-26 at 08.36.58.jpeg` — numpad com 7-8-9 no topo, teclas de largura total separadas por linhas divisórias, sem borda individual por tecla.

---

## Tech Explorer

### Serviços impactados
- `frontend/totem` (React): modificação do layout do numpad em `CpfScreen.tsx` e `PinScreen.tsx`. Nenhum serviço backend afetado.

### Mudança de layout

A única mudança de lógica é a ordem das teclas — de layout de celular para layout ATM:

```tsx
// ANTES (layout celular)
[1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "⌫"]

// DEPOIS (layout ATM — igual a terminais físicos)
[7, 8, 9, 4, 5, 6, 1, 2, 3, "", 0, "⌫"]
```

### Mudança de dimensões

**Problema atual:** `CpfScreen` e `PinScreen` envolvem o numpad em um card de `width: 320px` com `padding: 32px` — as teclas ficam estreitas (~80px cada).

**Solução:** expandir o numpad para ocupar a tela, sem card wrapper restritivo:

```tsx
// Container do numpad: largura relativa à tela
<div style={{
  width: "min(480px, 92vw)",   // máximo 480px, mínimo 92% da viewport
  margin: "0 auto",
}}>
  <div style={{
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 0,                      // sem gap — separação por border
    border: `1px solid ${T.border}`,
    borderRadius: 16,
    overflow: "hidden",
  }}>
    {[7,8,9,4,5,6,1,2,3,"",0,"⌫"].map((k, i) => (
      <button style={{
        minHeight: 84,            // ≥80px garantido
        fontSize: 26,
        fontWeight: 600,
        borderRight: (i+1) % 3 !== 0 ? `1px solid ${T.border}` : "none",
        borderBottom: i < 9 ? `1px solid ${T.border}` : "none",
        // sem border-radius individual — o container cuida do arredondamento
      }} />
    ))}
  </div>
</div>
```

Esse padrão replica exatamente o visual da referência: teclas separadas por linhas finas internas, sem borda individual por tecla, bordas externas arredondadas.

### Arquivos a modificar

```
frontend/totem/src/screens/
├── CpfScreen.tsx   ← inverter array, expandir container, ajustar estilo das teclas
└── PinScreen.tsx   ← inverter array no componente Numpad interno, mesmas mudanças de estilo
```

**Nota:** `PinScreen.tsx` já tem um componente `Numpad` interno reutilizável — a mudança no array e no estilo se concentra ali, sem duplicação.

### Estimativa
- Frontend: **1 ponto** (mudança cirúrgica, sem nova lógica)
- Backend: 0 pontos

### Riscos
- **Regressão na digitação:** a inversão de layout pode confundir usuários que já memorizaram o layout atual (improvável, mas possível em deploys incrementais). Mitigação: deploy direto sem feature flag — é uma melhoria de UX clara e irreversível na direção certa.
- **PinScreen tem card wrapper `width: 320px` hardcoded** (linha 104 do arquivo atual) — remover junto com a mudança do numpad para não ficar inconsistente.

---

## QA Explorer

```gherkin
Feature: Numpad padrão ATM no totem
  Como cliente no totem
  Quero um teclado numérico com layout de terminal de pagamento
  Para digitar CPF e PIN sem hesitação ou erro

  Background:
    Dado que o totem está em operação com qualquer tema de cor

  Scenario: CpfScreen exibe numpad com layout ATM (7-8-9 no topo)
    Dado que o cliente está na tela de CPF (CpfScreen)
    Então a primeira linha do numpad exibe as teclas 7, 8 e 9
    E a segunda linha exibe 4, 5 e 6
    E a terceira linha exibe 1, 2 e 3
    E a quarta linha exibe vazio, 0 e ⌫

  Scenario: PinScreen exibe numpad com layout ATM (7-8-9 no topo)
    Dado que o cliente está na tela de PIN (PinScreen)
    Então a primeira linha do numpad exibe as teclas 7, 8 e 9
    E a segunda linha exibe 4, 5 e 6
    E a terceira linha exibe 1, 2 e 3
    E a quarta linha exibe vazio, 0 e ⌫

  Scenario: Teclas do numpad têm largura e altura adequadas para toque
    Dado que o cliente está na tela de CPF (CpfScreen)
    Então o numpad ocupa pelo menos 90% da largura disponível da tela
    E cada linha de teclas tem altura mínima de 80px

  Scenario: Digitação de CPF completo funciona corretamente
    Dado que o cliente está na tela de CPF (CpfScreen)
    Quando toca nas teclas 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9
    Então o campo exibe "001.234.567-89"
    E o botão "Confirmar CPF" fica habilitado

  Scenario: Backspace remove o último dígito
    Dado que o cliente digitou "123" no campo de CPF
    Quando toca na tecla ⌫
    Então o campo exibe "12"
    E o botão "Confirmar CPF" permanece desabilitado

  Scenario: Campo não aceita mais de 11 dígitos
    Dado que o cliente já digitou 11 dígitos no campo de CPF
    Quando toca em qualquer tecla numérica adicional
    Então nenhum dígito extra é adicionado
    E o campo continua exibindo exatamente 11 dígitos

  Scenario: Célula vazia da quarta linha não responde ao toque
    Dado que o cliente está na tela de CPF (CpfScreen)
    Quando toca na célula vazia (primeira coluna da quarta linha)
    Então nenhum dígito é adicionado ao campo
    E nenhum erro é exibido

  Scenario: Numpad funciona igualmente nos 3 temas de cor
    Dado que o tema ativo é alternado entre dark, light e brand
    Quando o cliente visualiza o numpad na CpfScreen
    Então as teclas são visíveis e clicáveis em todos os temas
    E o feedback visual de hover/toque (T.numHover) é aplicado corretamente
```
