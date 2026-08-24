---
id: ORD-123
status: Ready
fase: 7
sprint: null
responsavel: Backend + Frontend
estimativa: M
tipo: melhoria
---

# ORD-123 — Baixa manual no balcão (sem QR), com trilha de auditoria

## User story
**Como** operador de balcão,
**quero** poder dar baixa num pedido ou ticket direto na tela de detalhe, sem depender do QR (câmera quebrada, QR rasgado/ilegível, cliente sem celular pra mostrar o código),
**para** não travar a entrega — sabendo que essa ação fica marcada e é revisável depois.

## Contexto e motivação
Pedido direto do usuário (2026-08-24), depois da bateria de correções de câmera (NotAllowedError, contexto inseguro em rede local). Mesmo com os fixes, vai sempre existir um caso em que a câmera não é opção — QR fisicamente danificado, ticket extraviado, celular do cliente sem bateria. Hoje, sem QR legível, a única saída no app de balcão é digitar o código do ticket manualmente na tela do scanner (`QrScanner.tsx`, fallback já existente) — mas isso só cobre ticket individual, não o pedido inteiro, e não deixa nenhum sinal de que aquela coleta pulou a verificação HMAC.

Achado ao investigar (Explorer): `POST /orders/{ref}/collect` já aceita `qr_data: null` — o docstring do endpoint já previa "coleta manual pela tela operacional do admin" (`services/order/main.py`, função `collect_order`), mas essa via nunca foi exposta no app de balcão, e mais importante: **nada no schema distingue hoje uma coleta via QR de uma coleta manual** — `Ticket`/`Order` só guardam `collected_by` (string livre, enviada pelo cliente, sem validação) e `collected_at`. Não dá pra auditar depois "quantas coletas desse período puraram o QR" porque essa informação não é persistida.

## Decisões de escopo (confirmadas com o usuário)
- **Abrangência:** baixa manual disponível tanto para o pedido inteiro quanto por ticket individual — mesma cobertura que já existe hoje pro fluxo de QR.
- **Acesso:** qualquer operador logado no balcão pode usar — sem reautenticação extra. A rastreabilidade fica garantida pelo registro de auditoria (quem, quando, qual pedido/ticket), não por fricção de acesso.
- **Confirmação:** aviso claro na tela ("esta ação vai para auditoria") + confirmação — sem campo de motivo obrigatório, pra não travar a operação.

## Gap de confiabilidade encontrado (dentro do escopo desta história)
`collected_by` hoje é uma string que o **cliente** manda no corpo da requisição (`CollectIn.collected_by`, default `"balcao"`) — não é derivada do JWT autenticado. Isso já é frágil pro fluxo de QR normal, e ficaria pior ainda pra baixa manual (que por definição já pula uma camada de verificação): registrar "quem fez a baixa manual" com um valor que o próprio cliente escolhe não serve pra auditoria nenhuma. Esta história corrige isso nos dois fluxos (QR e manual): `collected_by` passa a ser sempre derivado de `current_user` (do JWT), o campo do request é ignorado/removido.

## Fluxos envolvidos
- **OrderDetailScreen (balcão):** novo botão "Baixa manual" ao lado de "Ler QR Code", abre confirmação com aviso de auditoria; cada linha de ticket pendente ganha uma ação secundária "Baixa manual" (ícone, não botão grande, pra não competir visualmente com o fluxo principal de QR).
- **QueueScreen (balcão):** fora de escopo — baixa manual só existe dentro do detalhe do pedido (`onBack` já leva pra lá), não no scan global da fila. Ver "Fora de escopo".

## Cenários (QA Explorer)

```gherkin
Funcionalidade: Baixa manual com trilha de auditoria

  Cenário: Baixa manual do pedido inteiro
    Dado um pedido pago com tickets pendentes, QR indisponível
    Quando o operador toca em "Baixa manual" no detalhe do pedido
    E confirma no aviso "esta ação vai para auditoria"
    Então todos os tickets do pedido são marcados como coletados
    E o pedido é marcado como completed
    E o registro de auditoria é emitido com method=manual, actor=operador autenticado

  Cenário: Baixa manual de um ticket individual
    Dado um pedido com múltiplos tickets, um deles com QR ilegível
    Quando o operador toca na ação "Baixa manual" daquele ticket específico
    E confirma o aviso
    Então só aquele ticket é marcado como coletado
    E os demais tickets permanecem no estado anterior

  Cenário: Coleta via QR continua sem fricção extra
    Dado um ticket com QR legível
    Quando o operador escaneia normalmente
    Então a coleta acontece sem nenhum aviso de auditoria
    E o registro persistido marca method=qr

  Cenário: collected_by reflete o operador autenticado, não um valor arbitrário
    Dado qualquer coleta (QR ou manual)
    Quando a requisição de coleta é enviada
    Então collected_by no banco corresponde ao usuário do JWT (current_user), independente do que o body da requisição contenha

  Cenário: Pedido/ticket já coletado não pode ser baixado de novo manualmente
    Dado um ticket já com status=collected
    Quando o operador tenta baixa manual nesse ticket
    Então a API retorna 409, igual já acontece hoje pro fluxo de QR
```

## Solução técnica (Tech Explorer)

### 1. Backend — `services/order/main.py`
- Nova coluna `collection_method` (`String(10)`, not null, default `"qr"`) em `Ticket` e `Order` — migration `services/order/migrations/versions/20260824_1600_collection_method.py`, convenção `YYYYMMDD_HHMM_descricao.py` já usada no serviço.
- `CollectIn`: remove `collected_by` do body (deixa de ser aceito do cliente — breaking change interno, sem consumidor externo além dos próprios frontends deste monorepo). `collected_by` passa a ser setado a partir de `current_user.sub` (ou equivalente já disponível no `TokenPayload`) direto no handler, nos dois endpoints (`collect_ticket` e `collect_order`).
- Nos dois endpoints: `collection_method = "qr" if body.qr_data is not None else "manual"`, gravado em cada `Ticket`/`Order` tocado.
- Novo `services/order/audit.py` (mesmo padrão de `services/shared/audit.py` — `emit_audit`, JSON em stdout, sem tabela nova): emitir evento `ticket.collected` / `order.collected` com `detail={"method": collection_method, "ticket_code"/"order_ref": ..., "progress": ...}` sempre que `collection_method == "manual"` (não precisa emitir no caminho de QR — volume alto, sem valor de auditoria adicional já que o HMAC já é a garantia ali).

### 2. Frontend — `frontend/balcao`
- `src/lib/collect.ts`: nova função `collectManual(kind: "order" | "ticket", ref: string): Promise<CollectResult>` — mesmo shape de retorno de `collectByQr`, mas chama o endpoint correspondente com `{}` no corpo (sem `qr_data`).
- `OrderDetailScreen.tsx`: botão "Baixa manual" (estilo `Button variant="secondary"`, ícone `icon-alert-triangle` ou similar do design system) ao lado do `ScanButton` existente; modal de confirmação reaproveita `styles.confirmModal` já existente, com texto de aviso fixo ("Esta baixa não usa o QR Code e fica registrada para auditoria.") antes dos botões Cancelar/Confirmar. Cada linha de ticket pendente ganha um ícone de ação secundária equivalente, escopado àquele `ticket_code`.
- Sem mudança em `QueueScreen.tsx` — fora de escopo (ver abaixo).

### Estimativa
**M** — migration simples + mudança em 2 endpoints já existentes (sem endpoint novo) + 1 componente novo de UI (botão/modal reaproveitando padrão existente) + módulo de audit novo pro order-service (não existia).

## Fora de escopo
- Baixa manual pelo scan global da fila (`QueueScreen`) — fica restrita ao detalhe do pedido, onde o operador já está olhando pro pedido específico antes de decidir pular o QR.
- Campo de motivo/justificativa digitado — decisão confirmada de deixar só aviso + confirmação no MVP; pode virar história separada se o volume de baixas manuais pedir mais contexto depois.
- Reautenticação (senha/PIN) no momento da baixa manual — mesma lógica, MVP usa a sessão já autenticada.
- Relatório/tela de auditoria propriamente dita (listar coletas manuais, filtrar por período) — esta história garante que o dado fica registrado (log estruturado + coluna no banco); consumir isso numa tela é história separada, sem urgência definida ainda.
- Emitir audit event também no caminho de QR — comportamento normal de alto volume, sem valor de auditoria adicional (a garantia ali já é o HMAC).

## Próximos passos
Ready — decisões de escopo já confirmadas com o usuário, sem ambiguidade técnica restante. Implementar direto.
