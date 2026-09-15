---
id: ORD-175
status: Ready
estimativa: 3 pontos (2,5 backend + 0,5 frontend)
fase: null
sprint: null
responsavel: Backend SR
---

# ORD-175 — Contingência/resiliência: retry e reconciliação de notas pendentes

## Descrição
Oitava e última história do épico — a de menor prioridade desde o levantamento original
("pós-piloto, não bloqueia a validação inicial"). Trata o que acontece **depois** do modelo de
resiliência já implementado na ORD-171 (falha/timeout → status "pendente", pedido nunca trava):
como essas notas pendentes se resolvem, sem deixar acúmulo permanente sem tratamento.

**Escopo deliberadamente reduzido**: implementa **retry automático com reconciliação**, não o
modo de contingência legal formal da NFC-e (`forma_emissao=offline`, série própria de
contingência, marcação especial no DANFE — mecanismo mais complexo, mencionado no levantamento
§2, "nenhum provedor elimina essa complexidade, só a facilita"). Justificativa: pro volume
esperado do piloto (poucos clientes), retry automático dentro de uma janela razoável resolve a
grande maioria dos casos reais (instabilidade momentânea de rede/SEFAZ); contingência formal
fica registrada como possível história futura, fora deste épico, só se o retry se mostrar
insuficiente na prática.

## Persona
**Operação do time Ordin** — esta história não tem persona de usuário final; é um job de
background com visibilidade mínima pro time acompanhar o que não se resolveu sozinho.

## Contexto
`FiscalDocument.status="pendente"` (ORD-171) já existe e é gravado toda vez que a emissão falha
ou dá timeout. Hoje nada acontece depois disso — fica pendente pra sempre. Esta história fecha
esse ciclo.

## Explorer

### História
Como **operação do time Ordin**, quero que notas fiscais pendentes sejam reenviadas
automaticamente dentro de uma janela razoável, e que as que não se resolverem fiquem visíveis
pra tratamento manual, para que nenhuma venda com módulo fiscal ativo fique com pendência fiscal
esquecida.

### Fluxo principal
1. Job periódico (a cada poucos minutos) busca `FiscalDocument` com status "pendente" e menos de
   24h desde a criação.
2. Pra cada um, tenta `POST /nfce` de novo com o **mesmo `order_ref`** (mesmo endpoint e payload
   da ORD-171, reconstruído a partir do pedido/empresa/produtos no momento do retry).
3. **Sucesso**: status muda pra "autorizada", grava chave/DANFE — nota fiscal fica correta nos
   registros da empresa, mesmo que o cliente já tenha saído com só o ticket (o valor aqui é
   completude do registro fiscal da empresa, não reimpressão pro cliente — fora de alcance depois
   que ele sai do totem).
4. **Falha continuada além de 24h**: status muda pra "falha_definitiva", para de tentar
   automaticamente — fica como pendência de tratamento manual (visível num relatório simples, não
   uma tela nova elaborada).
5. **Pergunta em aberto, não resolvida nesta história**: `POST /nfce` reenviado com o mesmo `ref`
   é idempotente na Focus NFe (não duplica nota se a primeira tentativa na verdade tinha
   funcionado mas a resposta se perdeu), ou pode gerar nota duplicada? **Diferente do `POST
   /empresas`, que confirmamos ser upsert** (`docs/estudo-nfce.md` §7.1) — não testamos
   isso especificamente pra `/nfce`. Risco real, registrado abaixo.

### Pendência que precisa de confirmação externa antes da implementação
Recomendo perguntar direto pro suporte da Focus NFe (mesmo canal já usado): **"o parâmetro `ref`
do `POST /nfce` garante idempotência — reenviar a mesma `ref` depois de um timeout retorna a nota
já emitida (se ela de fato foi autorizada do lado de vocês) em vez de criar uma segunda, ou
preciso checar o status antes de reenviar?"** Isso decide se o retry desta história pode ser um
`POST` simples de novo, ou se precisa de um `GET` de consulta prévio (endpoint de consulta de
NFC-e por `ref`, não detalhado neste levantamento) antes de cada tentativa.

### Fluxos alternativos / exceções
- **Módulo fiscal desativado entre a tentativa original e o retry**: job pula esse documento,
  sem tentar (empresa decidiu desligar o módulo nesse meio tempo).
- **Pedido cancelado/reembolsado entre a tentativa original e o retry**: job pula (ORD-173 já
  teria tentado cancelar se estivesse dentro da janela; se a nota nunca foi autorizada, não há
  o que cancelar — só não tenta mais emitir uma nota pra um pedido já desfeito).

### Dependências
- **payment-service**: mesmo serviço de todo o resto da emissão, reaproveita o cliente HTTP e a
  tabela `fiscal_documents` já existentes.
- **Histórias bloqueantes**: ORD-171 (Ready).
- **Histórias que dependem desta**: nenhuma — é a última do épico.

### Critérios de aceite funcionais
- [ ] Job periódico reenvia notas pendentes com menos de 24h automaticamente
- [ ] Sucesso no retry atualiza o documento pra "autorizada" normalmente
- [ ] Falha continuada além de 24h vira "falha_definitiva", sem mais tentativas automáticas
- [ ] Pedido cancelado/reembolsado ou módulo desativado no meio tempo não gera tentativa de
      retry

### Wireframe / Mockup
Nenhuma UI elaborada nesta história — no máximo uma contagem/lista simples de "falha_definitiva"
em algum lugar já existente do admin, não uma tela dedicada nova.

## QA Explorer

### Cenários Gherkin

```gherkin
Feature: Retry e reconciliação de notas fiscais pendentes
  Como operação do time Ordin
  Quero que notas pendentes sejam reenviadas automaticamente dentro de uma janela razoável
  Para que nenhuma pendência fiscal fique esquecida

  # --- Happy path ---

  Scenario: Retry bem-sucedido dentro da janela
    Dado um FiscalDocument "pendente" criado há 10 minutos
    Quando o job periódico roda
    Então POST /nfce é chamado de novo com o mesmo order_ref
    E, se autorizada, o documento muda para status "autorizada"

  # --- Bordas ---

  Scenario: Falha continuada além de 24h para de tentar
    Dado um FiscalDocument "pendente" criado há mais de 24h
    Quando o job periódico roda
    Então o documento muda para "falha_definitiva"
    E nenhuma nova tentativa automática acontece depois disso

  Scenario: Pedido cancelado no meio tempo não gera retry
    Dado um FiscalDocument "pendente" cujo pedido foi cancelado depois
    Quando o job periódico roda
    Então esse documento é pulado, sem tentativa de reenvio

  Scenario: Módulo fiscal desativado no meio tempo não gera retry
    Dado um FiscalDocument "pendente" de uma empresa que desativou o módulo fiscal depois
    Quando o job periódico roda
    Então esse documento é pulado, sem tentativa de reenvio

  # --- Erro ---

  Scenario: Retry continua falhando dentro da janela
    Dado um FiscalDocument "pendente" criado há 2 horas
    Quando o job tenta reenviar e a Focus NFe continua recusando
    Então o documento permanece "pendente", tentando de novo na próxima execução do job
    E só vira "falha_definitiva" depois de passar de 24h
```

### Critérios de aceite testáveis
- [ ] Retry dentro da janela de 24h tenta reenviar automaticamente
- [ ] Sucesso atualiza pra "autorizada" corretamente
- [ ] Além de 24h, vira "falha_definitiva" e para de tentar
- [ ] Pedido cancelado/módulo desativado no meio tempo é pulado, sem tentativa

### O que ainda impede o avanço pro Tech Explorer
**Pendência explícita, não bloqueia Ready, mas bloqueia validação real**: confirmar com a Focus
NFe se reenviar `POST /nfce` com o mesmo `ref` é idempotente ou pode duplicar — registrado acima,
mesma recomendação de perguntar no ticket de suporte já aberto.

## Tech Explorer

### Serviços impactados
Só **payment-service**, mesmo módulo das ORD-171/173.

### Job periódico
```python
async def reconcile_pending_fiscal_documents() -> None:
    cutoff = datetime.utcnow() - timedelta(hours=24)
    pending = await get_fiscal_documents(status="pendente", created_after=cutoff)
    for doc in pending:
        order = await get_order(doc.order_ref)  # pulа se cancelado/reembolsado
        if order is None or order.status in ("cancelled", "refunded"):
            continue
        creds = await get_fiscal_credentials(doc.company_id)
        if not creds["ativo"]:
            continue
        await emit_nfce(order, doc.company_id)  # mesma função da ORD-171, upsert do resultado

    expired = await get_fiscal_documents(status="pendente", created_before=cutoff)
    for doc in expired:
        doc.status = "falha_definitiva"
    await db.commit()
```
Agendamento (cron do container ou scheduler externo) é decisão de infra/deploy, não muda a
função em si — mesmo tipo de decisão já deixada em aberto pro job de sincronização de NCM
(ORD-169).

### Migrations
Nenhuma — `FiscalDocument.status` já é string livre, só ganha mais um valor convencionado
("falha_definitiva").

### Eventos de fila
Nenhum — job periódico simples, não pub/sub.

### Impacto em outros serviços
Nenhum direto — consulta `order` (referência já usada em outras histórias) e `company` (mesma
chamada interna da ORD-171).

### Estimativa
- Backend: **~2,5 pontos** — job periódico + lógica de skip (cancelado/desativado) + transição
  pra "falha_definitiva", reaproveitando quase tudo da ORD-171.
- Frontend: **~0,5 ponto** — no máximo uma contagem/indicador simples, sem tela nova.
- **Total: ~3 pontos.**

### Riscos
1. **Idempotência de `POST /nfce` não confirmada** (pendência do QA Explorer) — maior risco desta
   história. Mitigação: enquanto não confirmado, considerar consultar o status antes de reenviar
   (se existir endpoint de consulta por `ref` — não detalhado neste levantamento, precisa de mais
   pesquisa na doc da Focus NFe antes do downstream) em vez de reenviar direto.
2. **Job periódico é infraestrutura nova** (nenhum serviço do Ordin tem job agendado recorrente
   hoje, confirmar) — mesmo tipo de componente novo já necessário pro sync de NCM (ORD-169),
   pode reaproveitar a mesma decisão de mecanismo de agendamento quando ela for tomada.
3. **Contingência legal formal fica de fora** (decisão deliberada de escopo) — aceitável pro
   volume do piloto; se o volume de "falha_definitiva" crescer na prática, revisitar.

### O que ainda impede o avanço pro Ready
Nada bloqueante. Idempotência do `/nfce` é pendência real, mas não impede Ready — só precisa ser
resolvida antes de considerar a implementação testada de ponta a ponta.

## Ready

**Explorer:** [x] história Como/quero/para · [x] escopo deliberadamente reduzido (retry, não
contingência legal formal) justificado · [x] fluxo principal (5 passos) · [x] pendência de
idempotência identificada e com pergunta pronta pro suporte · [x] dependências (bloqueada por
ORD-171, última do épico) · [x] critérios de aceite funcionais · sem necessidade de wireframe.

**QA Explorer:** [x] happy path (retry bem-sucedido) · [x] bordas (expira em 24h, pedido
cancelado, módulo desativado) · [x] erro (retry continua falhando dentro da janela) · [x]
cenários aprovados.

**Tech Explorer:** [x] serviço impactado (só payment-service) · [x] job periódico detalhado · [x]
migrations — nenhuma · [x] eventos de fila — nenhum · [x] estimativa (3 pontos) · [x] riscos com
mitigação, incluindo o de idempotência não confirmada.

**Aprovação final:** [x] solução técnica revisada · [x] estimativa 3 pontos · [x] sem bloqueios
não resolvidos pro Ready (idempotência é pendência de validação, não bloqueio) · [ ] sprint
específico — não atribuída ainda.

**Status: Ready.** Última história do épico — recomendo confirmar a idempotência do `POST
/nfce` com o suporte antes de implementar o retry de verdade, mesmo com Ready alcançado.
