---
id: ORD-079
status: Ready
fase: 6
sprint: null
responsavel: Backend + Frontend
estimativa: 5 pontos
---

# ORD-079 — Cancelamento de transação TEF (contestação do cliente)

## Descrição
Terceira história da análise de PM sobre `/payments` (ver [[ORD-077]] pra contexto geral da tela). Esta é a que o usuário marcou explicitamente como **a mais importante**: dar ao admin uma forma de cancelar uma transação quando o cliente contesta a cobrança.

**Achado que muda completamente o tamanho da história:** o backend **já tem esse endpoint pronto e funcional** — `POST /payments/{tx_id}/cancel` (`services/payment/main.py:415-501`). Ele valida que a transação está `approved`, muda o status pra `cancelled`, grava `cancelled_at`/`cancel_reason`, chama o cancelamento no provider (PayGo/MercadoPago/mock), notifica o `order-service`, publica evento `payment.cancelled` e grava auditoria no Mongo. **Nada disso está exposto no frontend hoje** — `PaymentsScreen.tsx` não tem nenhum botão, nenhuma chamada pra esse endpoint. Isso não é "construir cancelamento do zero", é **expor e dar UX decente a uma capacidade que já existe e está sem uso** — o que muda a estimativa (pra menos) mas não reduz a importância de fazer a UX certa, porque é uma ação financeira irreversível.

## Persona
**Admin/owner/manager** de uma empresa — precisa cancelar uma transação aprovada quando o cliente contesta a cobrança (produto não entregue, cobrança duplicada, erro de valor) ou quando o próprio operador percebe um erro logo depois de bater o cartão.

## Contexto

### Achado 1 — o endpoint já existe, com regras de negócio já implementadas
`cancel_payment` (`main.py:426-501`) já resolve:
- Só cancela transação com `status == "approved"` (400 se não for)
- PayGo: só permite cancelamento **no mesmo dia** da transação (422 se não for — `main.py:445-447`) — regra real de TEF (uma venda já liquidada não é "cancelável" pela maquininha depois de virar o dia, é um estorno via bandeira/adquirente, processo totalmente diferente e fora do alcance deste admin)
- Chama `provider.cancel_transaction()` — best-effort: se falhar a chamada ao provider, a transação **ainda assim** é marcada `cancelled` no banco local (`main.py:471-474`, captura a exceção e só loga) — decisão de design já tomada no backend: prioriza o registro contábil local sobre a confirmação síncrona do provider
- Body aceita `reason` opcional, default `"Cancelamento solicitado"` (`CancelIn`, `main.py:131-132`)

### Achado 2 (segurança) — endpoint sem controle de role nenhum
Busquei por checagem de `role` em `services/payment/main.py` inteiro — a única existe em `test_connection` (linha 518, restrita a `kiosk`). **`cancel_payment` não tem nenhuma.** Qualquer usuário autenticado com um JWT da empresa dona da transação pode cancelar — hoje isso só não é um problema porque nenhum frontend chama o endpoint. Assim que a UI existir, **a única barreira vai ser o frontend esconder o botão** — não é proteção real (um `curl` com o token de um `manager`, ou de qualquer role que tenha token válido daquela empresa, cancela do mesmo jeito). Pra comparação, o `catalog-service` já tem o padrão certo pra isso: `require_write_role` (`services/catalog/main.py:29-34`), uma dependency que restringe a `{"admin", "owner", "manager"}` — mesmo conjunto de roles que já tem acesso a `/payments` no frontend (`App.tsx:21-23`). Proponho o mesmo padrão aqui, não uma trava nova inventada.

### Achado 3 (risco a validar, não a resolver nesta história) — cancelamento de cartão MercadoPago aprovado pode não ser um estorno de verdade
Olhando `MPProvider.cancel_transaction` (`infrastructure/providers/mercadopago.py:242-260`): quando o `provider_transaction_id` é um UUID (pagamento de cartão), ele faz `DELETE /point/integration-api/devices/{terminal}/payment-intents/{id}` — API de **intenção de pagamento** (usada pra cancelar uma cobrança em andamento na maquininha), não a API de **Refunds** do Mercado Pago (`POST /v1/payments/{id}/refunds`), que é o endpoint correto pra estornar um pagamento **já aprovado e capturado**. Não confirmei em ambiente sandbox real (não tenho credenciais MP configuradas neste dev — todas as empresas do seed usam `payment_provider=mock`, `project_ordin_dev_reference`), então não posso afirmar que o estorno de cartão MP falha — só que a chamada parece semanticamente errada pra esse caso, e o endpoint mascara isso (`except: pass`, `main.py:471-472` — sempre cancela local mesmo se o provider falhar ou devolver o efeito errado). Recomendo confirmar com quem configurar a integração MP real antes de liberar o botão de cancelar pra transações `provider="mercadopago"` já aprovadas — dá pra escopar o botão só pra `paygo`/`mock` na v1 e destravar MP depois de confirmado (ver Riscos).

### Achado 4 — sem estorno parcial
`CancelIn` só tem `reason`, sem campo de valor — o cancelamento é sempre do valor **total** da transação. Se o caso for "cliente devolveu metade do pedido", isso não é coberto por este endpoint — fica fora do escopo desta história (voltaria como pedido futuro, exigiria mudança de schema e de regra de negócio, não é decisão de frontend).

---

## Explorer

### História
Como **admin/owner/manager**, quero cancelar uma transação aprovada informando o motivo, para poder reverter uma cobrança quando o cliente contesta ou quando identifico um erro — sem precisar pedir pra alguém mexer direto no banco.

### Fluxo principal
1. Na tabela de transações, toda linha com `status = "approved"` tem uma ação "Cancelar" (ícone, coluna de ações — não precisa esperar o painel de detalhe de [[ORD-080]], funciona direto na linha)
2. Clique abre um Modal (não o `ConfirmDialog` simples — precisa capturar motivo): mostra valor, pedido, data da transação; campo de motivo com opções pré-definidas (**"Contestação do cliente"**, "Erro operacional", "Duplicidade", "Outro") + campo de texto livre quando "Outro"
3. Se `provider === "paygo"` e a transação não é do dia atual, o modal já avisa **antes** de tentar (não deixa o usuário preencher tudo pra descobrir com um 422) — mensagem clara: "Transações PayGo só podem ser canceladas no mesmo dia. Fale com o suporte da adquirente pra estornar esta."
4. Confirma → chama `POST /payments/{id}/cancel` → sucesso: toast de confirmação, linha da tabela atualiza pra `cancelled` sem precisar recarregar a página inteira
5. Erro (400/404/422): toast de erro com a mensagem específica do backend, modal permanece aberto pro usuário tentar de novo ou desistir

### Critérios de aceite
- [ ] Botão/ação "Cancelar" visível só em transações `status === "approved"`, só pra roles `admin`/`owner`/`manager`
- [ ] Modal de cancelamento pede motivo (presets + "Outro" com texto livre) — não é um `window.confirm` nem um `ConfirmDialog` de texto fixo
- [ ] Transação PayGo fora do dia: aviso preventivo no modal antes de tentar confirmar (não depende só do erro 422 do backend)
- [ ] Sucesso: toast de confirmação + atualização otimista/refetch da linha (não recarrega a tela inteira)
- [ ] Erro: toast com mensagem específica por status (400 "não está aprovada", 404 "não encontrada", 422 mensagem do PayGo), nunca um erro genérico tipo "algo deu errado"
- [ ] Backend: `cancel_payment` passa a exigir role `admin`/`owner`/`manager` (mesmo padrão de `require_write_role` do catalog-service) — hoje está sem nenhuma checagem
- [ ] Transação `provider === "mercadopago"` e já `approved`: **v1 esconde o botão de cancelar** (ver Achado 3) até confirmação de que o refund funciona de verdade — critério de aceite explícito, não esquecimento
- [ ] Depois de cancelar, o motivo (`cancel_reason`) fica visível em algum lugar da UI pra quem olhar essa transação depois (linha da tabela ou detalhe — ver [[ORD-080]])

### Wireframe / Mockup
Ver protótipo (Artifact, atualizado 2026-08-11 a pedido do usuário) — reaproveita o `ConfirmDialog` já usado em "Excluir definitivamente" categoria/produto (`CatalogScreen.tsx`), com o campo de motivo (`Dropdown` + `TextArea` condicional) adicionado ao corpo do mesmo componente em vez de um modal novo — ver detalhe em Tech Explorer.

---

## QA Explorer

```gherkin
Feature: Cancelamento de transação TEF

  Scenario: Cancelar transação aprovada com motivo pré-definido
    Dado que existe uma transação "approved" de hoje, provider mock
    Quando o usuário clica em "Cancelar", escolhe "Contestação do cliente" e confirma
    Então a transação muda para "cancelled"
    E um toast de sucesso aparece
    E a linha na tabela reflete o novo status sem reload manual

  Scenario: Cancelar com motivo "Outro" exige texto
    Dado que o modal de cancelamento está aberto
    Quando o usuário seleciona "Outro" sem preencher o texto livre
    Então o botão de confirmar fica desabilitado ou mostra erro de validação

  Scenario: Tentativa de cancelar transação já cancelada ou recusada
    Dado que uma transação tem status "cancelled" ou "refused"
    Então a ação "Cancelar" não aparece pra ela

  Scenario: PayGo fora da janela de cancelamento
    Dado que uma transação PayGo foi feita em um dia anterior a hoje
    Quando o usuário abre o modal de cancelamento dela
    Então vê o aviso de que só é possível cancelar no mesmo dia, antes mesmo de confirmar
    E se mesmo assim tentar confirmar, recebe o erro 422 traduzido de forma amigável

  Scenario: Role sem permissão não vê a ação
    Dado que o usuário logado não é admin/owner/manager
    Então a ação "Cancelar" não é exibida nem acessível

  Scenario: Backend rejeita cancelamento de role não autorizada mesmo via API direta
    Dado um token válido de um role fora de admin/owner/manager
    Quando POST /payments/{id}/cancel é chamado diretamente
    Então o backend retorna 403 — não depende só do frontend esconder o botão

  Scenario: Transação Mercado Pago aprovada não mostra botão de cancelar (v1)
    Dado uma transação approved com provider "mercadopago"
    Então a ação "Cancelar" não é exibida (até confirmação do fluxo de refund real)

  Scenario: Erro genérico do backend
    Dado que o backend retorna 404 (transação não encontrada — condição de corrida, ex: já cancelada por outra aba)
    Quando o usuário tenta cancelar
    Então vê uma mensagem específica, não um erro genérico
```

---

## Tech Explorer

### Serviços impactados
- `services/payment/main.py` — adicionar checagem de role em `cancel_payment` (Achado 2)
- `frontend/admin/` — `PaymentsScreen.tsx` (coluna de ação + estado do modal), novo componente de modal de cancelamento (não reaproveita `ConfirmDialog` puro — precisa de campos), `api/payments.ts`

### Diagnóstico técnico (confirmado no código)
| Achado | Evidência |
|---|---|
| Endpoint já existe e funciona | `main.py:415-501`, testado indiretamente (regras de status/data já implementadas e cobertas por `responses={400,404,422}` na doc do FastAPI) |
| Sem checagem de role | Busca por `role` em `main.py` só retorna a checagem de `kiosk` em `test_connection` (linha 518) |
| MP cancel de cartão usa API de intent, não de refund | `mercadopago.py:247-256` — `DELETE .../payment-intents/{id}`, não `POST /v1/payments/{id}/refunds` |
| Falha do provider não impede cancelamento local | `main.py:471-474` — captura qualquer exceção do provider e segue |

### Direção técnica proposta

**Backend — restringir role:**
```python
@app.post("/payments/{tx_id}/cancel", ...)
async def cancel_payment(
    tx_id: int,
    body: CancelIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    if current_user.role not in {"admin", "owner", "manager"}:
        raise HTTPException(403, "Permissão insuficiente")
    ...  # resto do endpoint sem mudança
```

**Backend — v1 sem cancelamento MP aprovado (Achado 3):** ou o backend recusa (`400` se `provider == "mercadopago" and tx.status == "approved" and method in ("credit","debit")`), ou o frontend simplesmente esconde o botão nesse caso. Recomendo os dois: frontend esconde (UX), backend recusa (defesa em profundidade — mesma filosofia do resto do sistema, nunca confiar só na UI escondendo algo).

**Frontend — modal de cancelamento reaproveita o `ConfirmDialog` já existente, não um modal novo do zero (ajustado a pedido do usuário, 2026-08-11):**
`ConfirmDialog.tsx` já é o padrão estabelecido pra confirmação de ação destrutiva neste admin — é o mesmo componente usado em "Excluir definitivamente" categoria/produto (`CatalogScreen.tsx`, `deleteCategoryPermanently`/`deleteProductPermanently`, `alertVariant="warning"` + `alertIcon="alert-triangle"`). Ele já resolve o `Modal` do DS + `Alert` de aviso + par de botões `Cancelar`/`Confirmar` (`ConfirmDialog.tsx:32-53`).

O único ponto onde o cancelamento de transação precisa de mais do que o `ConfirmDialog` genérico oferece hoje é o campo de motivo (`Dropdown` + `TextArea` condicional) — `ConfirmDialog` só aceita uma `message: string`. Duas opções, a decidir na implementação:
1. **Estender `ConfirmDialog`** com uma prop opcional `children`/`body` (o próprio `Modal` do DS já aceita `children: ReactNode` como alternativa ao `template`, `Modal.d.ts`) — mantém todo código que já usa `ConfirmDialog` sem mudança, só quem precisar do campo extra passa o novo prop.
2. **Ir direto no `Modal`** (o mesmo componente por baixo do `ConfirmDialog`) com `template.icon` carregando um fragment `<Alert/>` + `<Dropdown/>` + `<TextArea/>` condicional — é o mesmo truque que `ConfirmDialog.tsx:39-41` já faz pra caber o `Alert` inteiro dentro do slot `icon` (que aceita `ReactNode`, não só um ícone).

Recomendo a opção 1 (estender `ConfirmDialog`) — mantém um único componente de confirmação no admin, em vez de duas formas de montar a mesma coisa.

```tsx
const CANCEL_REASONS: DropdownOptions[] = [
  { value: "contestacao", label: "Contestação do cliente" },
  { value: "erro_operacional", label: "Erro operacional" },
  { value: "duplicidade", label: "Duplicidade" },
  { value: "outro", label: "Outro" },
];
// <ConfirmDialog
//   open={!!cancelling} title="Cancelar transação"
//   message="Essa ação não pode ser desfeita pelo admin — o valor volta pro cliente de acordo com o provider."
//   alertVariant={sameDayBlocked ? "warning" : undefined} alertIcon={sameDayBlocked ? "alert-triangle" : undefined}
//   confirmLabel="Confirmar cancelamento" onConfirm={...} onCancel={...}
// >
//   {/* motivo: Dropdown + TextArea condicional — via prop children/body nova no ConfirmDialog */}
// </ConfirmDialog>
// Ao confirmar: api.post(`/payments/${tx.id}/cancel`, { reason: reasonText })
// Sucesso: makeToast("success", "Transação cancelada") + atualiza a linha local (sem refetch de tudo)
// Erro: makeToast("error", mensagemPorStatus[err.response.status] ?? err.response.data.detail)
```

### Riscos
- **Primeira adoção de `makeToast`/`ToastContainer` de verdade no admin** — o componente já está montado globalmente (`App.tsx:3,45,53`) mas **nenhuma tela chama `makeToast` hoje** (busquei, zero ocorrências). Mesmo risco de "primeiro uso" já visto no `Toggle` do design system em [[ORD-076]] — vale testar visualmente antes de fechar (posição, tempo de exibição, comportamento em toast duplo se o usuário clicar duas vezes).
- **Mercado Pago (Achado 3):** decisão de escopo já embutida nos critérios de aceite (esconder na v1) — evita prometer um cancelamento que pode não estornar de verdade um cartão já capturado.
- **Falha silenciosa do provider (Achado 1):** o comportamento atual (cancela local mesmo se o provider falhar) já é uma decisão tomada no backend, não desta história — mas vale a UI **não dar a entender que o dinheiro necessariamente voltou pro cliente** só porque o registro local mudou. Sugestão de copy: "Transação marcada como cancelada" em vez de "Estorno confirmado".
- **Falta de auditoria de quem cancelou:** `save_audit` (`main.py:489-499`) grava o motivo mas não registra explicitamente qual usuário (`current_user.sub`) fez o cancelamento no payload de auditoria — vale adicionar (`"cancelled_by": current_user.sub`), mudança pequena e de baixo risco dentro do mesmo endpoint.

### Estimativa
5 pontos — a lógica de negócio já existe (backend feito), o esforço real é: 1 linha de role check + o front (modal com formulário, tratamento de erro granular, toast de primeira adoção, atualização otimista da linha). Prioridade alta conforme pedido do usuário — pode ser puxada antes de [[ORD-077]]/[[ORD-078]] se necessário, não depende delas tecnicamente (só compartilha a mesma tela).

---

## Ready

**Explorer:** [x] fluxo e critérios definidos, com achado de que o endpoint já existe (muda a estimativa) e achado de segurança (sem role check) · **QA Explorer:** [x] cenários cobrindo motivo obrigatório, janela PayGo, permissão de role (frontend e backend), exclusão de MP v1 · **Tech Explorer:** [x] diagnóstico com citação de linha exata, proposta de código pro role check e pro modal (reaproveitando `ConfirmDialog`), riscos incluindo primeira adoção de toast · **Aprovação final:** [x] aprovado no chat pelo usuário (2026-08-11), incluindo o escopo do Achado 3 (MP escondido na v1) e a lista de motivos pré-definidos

**Status: Ready** — pode começar a implementação.
