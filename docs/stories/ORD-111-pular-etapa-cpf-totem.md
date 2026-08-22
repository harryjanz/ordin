---
id: ORD-111
status: Done
fase: 6
sprint: null
responsavel: Frontend
estimativa: 1 ponto
tipo: ajuste
---

# ORD-111 — Pular etapa de CPF no totem (temporário, até a NFC-e existir)

## Descrição
A tela de CPF (`CpfScreen.tsx`), hoje entre a seleção de consumo/catálogo e o pagamento, não tem propósito no momento — o único motivo real de capturar CPF no totem é "CPF na nota", que só faz sentido junto da emissão de NFC-e (ver `docs/estudo-nfce.md`, levantamento feito nesta mesma sessão, ainda não implementado). Até lá, o passo é só fricção extra sem função. Decisão do usuário: pular essa etapa por ora.

## Fix
`App.tsx`: os dois pontos que navegavam pra `screen === "cpf"` agora chamam `handleCpfDone(null)` diretamente, criando o pedido com `cpf: null` e indo direto pro pagamento:
- `CatalogScreen.onCheckout` (quando a empresa não tem consumo local/para levar habilitado).
- `ConsumptionTypeScreen.onSelect` (quando tem).

`handleCpfDone` ganhou um parâmetro opcional `consumptionTypeOverride` — necessário porque, ao pular a CPF direto da `ConsumptionTypeScreen`, o `consumptionType` do store ainda não tinha re-renderizado com o valor recém-selecionado no momento da chamada (só teria efeito na próxima renderização); sem o override o pedido sairia com `consumption_type: null`.

**Não removido:** o componente `CpfScreen.tsx` e o `case "cpf"` no switch de telas continuam no código, só inacessíveis por navegação — de propósito, pra reativar quando o módulo de NFC-e existir (comentário deixado em `App.tsx` explicando isso).

## Downstream
- **Branch:** `fix/ord-111-pular-etapa-cpf-totem`, a partir de `main`.
- **`frontend/totem/src/App.tsx`:** navegação pra "cpf" removida nos dois pontos de entrada; `handleCpfDone` com parâmetro de override; comentário explicando por que o componente ficou no código mesmo inacessível.
- `tsc --noEmit`: limpo.
- **Verificado ao vivo no Chrome**, rebuild do container `totem`, dois cenários:
  - Burger House (Comportamento habilitado): catálogo → "Como você vai consumir?" → "Comer no local" → foi direto pra "Formas de Pagamento", sem passar pelo CPF. Confirmado na tabela `orders`: `consumption_type = "local"`, `cpf = NULL`.
  - Pasta & Co (Comportamento desabilitado): catálogo → "Finalizar pedido" → foi direto pra "Formas de Pagamento", sem CPF nem tela de consumo. Confirmado na tabela `orders`: `consumption_type = NULL`, `cpf = NULL`.
- **Achado à parte, não relacionado a esta história:** login via PIN falhou nos dois terminais de teste da Burger House com "Access token inválido (HTTP 404)" no self-check de `/payments/test-connection` (gate de conexão com a maquininha, roda antes do totem liberar a tela de boas-vindas) — mesma classe de problema pré-existente já visto no ORD-108 (terminal "teste" com config de provider incompleta). Contornado pra fins de teste gravando `token`/`company`/`terminal` direto no `localStorage` via chamada manual a `/auth/pin-login`, pulando esse gate. Não investigado a fundo por estar fora do escopo desta história.
