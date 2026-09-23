---
id: ORD-201
status: Ready
estimativa: 1 ponto (fast-track — texto explicativo na UI, sem mudança de comportamento)
---

# Explicar as regras de entrada automática na tela de importação de nota

## Descrição

A tela de importação de nota de compra (`SupplierInvoiceScreen.tsx`, view "upload") já orienta o
usuário sobre *como usar a tela* (baixar XML → enviar → revisar prévia, adicionado no
`ORD-199`), mas nunca explicou *o que o sistema decide sozinho* depois que a nota é confirmada: o
vínculo automático em cascata (EAN → embalagem → código do fornecedor, `ORD-195`/`ORD-197`) e por
que um item pode cair pendente mesmo com tudo certo (ex: produto sem 1ª entrada manual de estoque,
`sem_estoque_iniciado`). Sem isso, a Empresa só descobre essas regras na prática, ao ver um item
pendente sem entender por quê.

## Persona

Admin da empresa — mesma persona de toda a tela de Estoque/Notas de compra.

## Contexto

Pedido direto do usuário, fast-track (confirmado explicitamente — sem upstream completo): ajuste
pequeno e localizado, só texto explicativo, sem mudança de comportamento de backend. Feito antes de
iniciar o Bloco E (ficha técnica) do épico de estoque/ERP.

Regras confirmadas contra o código real antes de escrever a cópia (`services/catalog/main.py`):

- **Cascata de vínculo** (`_match_supplier_invoice_item`, ~4563-4615): EAN de venda → GTIN de
  embalagem (aprendido) → código do fornecedor (aprendido). Nunca cria produto novo sozinho, nunca
  adivinha um vínculo — sem correspondência em nenhum nível, o item fica pendente.
- **Fator de conversão de unidade** (`quantidade_por_unidade` em `SupplierProductCode`/
  `ProductGtinAlt`, `ORD-197`) só existe depois de ensinado manualmente uma vez, na tela de
  Pendências — não tem como o sistema inferir isso da primeira nota.
- **`sem_estoque_iniciado`**: mesmo com vínculo automático correto, `_create_stock_movement` exige
  que o produto já tenha tido uma 1ª entrada manual antes (é o que define a unidade de controle) —
  sem isso, cai pendente mesmo estando corretamente vinculado.

## Solução técnica

Só frontend, `SupplierInvoiceScreen.tsx`/`.module.scss` (view "upload", antes do componente
`Upload`) — nenhum endpoint tocado:

- Bloco novo "Como a entrada automática de estoque funciona", separado visualmente da lista de
  passos de uso da tela (`.uploadSteps`) por uma linha divisória (`.rulesBox`) — são assuntos
  diferentes ("como usar a tela" vs. "o que o sistema decide sozinho").
- Lista numerada de 2 itens: (1) a cascata de 3 níveis em ordem, com os termos técnicos em negrito;
  (2) o que acontece quando nenhum nível bate (pendente, resolvido uma vez, aprendido pra próxima
  nota do mesmo fornecedor).
- Callout (`.rulesNote`, fundo levemente destacado + borda lateral, mesmo padrão de alerta inline já
  usado no admin) com o aviso de `sem_estoque_iniciado` — é a regra mais contraintuitiva (vínculo
  certo não é suficiente sozinho) e a que mais gera confusão sem explicação.

## Critérios de aceite

- [ ] Explicação aparece na tela de upload antes do usuário enviar o XML, sem exigir nenhuma ação
      extra (não é modal, não bloqueia o fluxo).
- [ ] Linguagem em português claro, sem jargão de código (ex: "código de barras", não "EAN" sem
      contexto; sem mencionar nomes de tabela/função).
- [ ] Regra de `sem_estoque_iniciado` — a mais não-óbvia — recebe destaque visual (callout), não fica
      perdida no meio do texto corrido.
- [ ] Nenhuma mudança de comportamento de backend — texto reflete exatamente a lógica já existente.

## Implementação

Testado ao vivo em `http://localhost:3001/stock/invoices` → "Importar nota" — painel renderiza
corretamente, texto legível, callout visualmente distinto. `tsc --noEmit` limpo. Sem novo endpoint,
sem migration, sem teste automatizado novo (é conteúdo estático, sem lógica a testar).
