# Auditoria e guardrails pra troca de tabela de preço no plano comercial

## Descrição
A ORD-162/163/164 formaram o modelo comercial do Ordin (tabela de preço versionada + plano
comercial da empresa + tabelas alternativas/promocionais), mas o mecanismo de troca de
`price_table_id` no `CompanyPlan` não deixa rastro: cada renovação ou aplicação de tabela
sobrescreve o vínculo in-place, sem histórico de quem trocou, quando, de qual tabela pra qual.
Combinado com a regra de `editable` (calculada só pelo vínculo *atual*, não histórico), uma
tabela que já gerou cobrança real pode voltar a ficar 100% editável/excluível assim que a
última empresa sai dela — sem aviso, sem rastro do que ela já cobrou no passado.

## Persona
Super Admin e Admin da plataforma (tomam as decisões de troca de tabela e edição/exclusão) —
e indiretamente qualquer pessoa responsável por reconciliar faturamento/disputa de cobrança no
futuro, quando esse tema existir.

## Contexto
Levantado pelo usuário como análise de risco depois da ORD-164 (tabelas alternativas):
a receita do Ordin depende desse mecanismo funcionar de forma rastreável, e hoje não é
possível reconstruir "qual tabela valia pra empresa X num mês específico" nem saber, antes de
editar ou excluir uma tabela, quantas empresas dependem dela. Três guardrails foram indicados
como próximo passo, em ordem de impacto/custo:
1. Auditoria de toda troca de `price_table_id` (quem, de qual tabela pra qual, quando, via
   renovação ou aplicação direta) — reaproveitando `emit_audit`, já usado em outros pontos do
   company-service, em vez de criar mecanismo de log novo.
2. `editable` "grudento" — uma tabela que já foi vinculada a algum plano alguma vez nunca mais
   volta a ficar 100% livre pra editar/excluir, mesmo que o vínculo atual termine.
3. Visibilidade de uso — mostrar "N empresas usando esta tabela" na lista/detalhe, antes de
   qualquer ação (desmarcar categoria, editar, excluir), não só bloquear depois.

## Explorer

### História
Como **Super Admin**, quero que toda troca de tabela de preço vinculada ao plano comercial de
uma empresa fique registrada de forma consultável, e que tabelas já usadas historicamente nunca
mais voltem a ser livremente editáveis, para poder confiar e reconstruir o histórico de
cobrança do Ordin — já que a receita da plataforma depende diretamente desse mecanismo.

### Contexto e motivação
A ORD-162/163/164 fecharam o mecanismo de *troca* (quem pode trocar, quando, validado contra
qual regra), mas nenhuma delas resolveu *rastro*. Hoje `CompanyPlan.price_table_id` é
sobrescrito in-place a cada renovação/aplicação, sem histórico — e `editable` é calculado só
pelo vínculo atual, então uma tabela que já cobrou uma empresa no passado pode voltar a ficar
100% editável/excluível assim que a última empresa sai dela. Isso é aceitável pra um sistema
interno sem impacto financeiro; não é aceitável pra um mecanismo que decide preço cobrado.

### Ajuste de PM sobre a sugestão original (item 1)
A ideia de reaproveitar `emit_audit` (`services/company/audit.py`) é certa como **parte** da
solução, mas não é suficiente sozinha pro critério de aceite "conseguir consultar o histórico
por empresa". Confirmado lendo o código: `emit_audit` só faz `print()` de uma linha JSON em
`stdout` — não persiste em banco, não é consultável pela aplicação, e depende de retenção de
log externa (CloudWatch/Datadog em produção, nada localmente). Serve bem como trilha
operacional/segurança (mesmo padrão já usado em `pin_regenerated`, `contract_status_changed`),
mas não resolve "mostrar pro Super Admin, na tela, qual tabela valia pra empresa X em março".
Proposta ajustada: **as duas coisas, não uma ou outra** — `emit_audit` continua sendo chamado
(trilha operacional, grátis, já é o padrão do serviço) **e** um registro mínimo persistido é
gravado numa tabela nova, pra alimentar a consulta. O desenho exato dessa tabela (nome, campos)
fica pro Tech Explorer — não assumir aqui.

### Fluxo principal
1. Toda vez que `price_table_id` de um `CompanyPlan` muda — via `POST /plan/renew` ou `PATCH
   /plan` — o sistema grava um registro (tabela anterior, tabela nova, quem, quando, se foi
   renovação ou aplicação direta) na mesma transação da troca, além de chamar `emit_audit` como
   já é padrão no serviço.
2. O Super Admin/Admin consegue consultar esse histórico por empresa — no mínimo via endpoint
   novo; se couber no orçamento, também uma seção "Histórico" no `CompanyContractScreen`.
3. Uma `PriceTable` que teve **pelo menos um** `CompanyPlan` vinculado em qualquer momento do
   passado passa a ficar marcada como "já utilizada" — marcação que nunca é revertida, mesmo
   que a última empresa saia dela depois.
4. Tabela "já utilizada" nunca mais fica editável/excluível — independente de ter vínculo
   *atual* ou não. Isso substitui, pra essas tabelas, a regra atual de `editable` calculada só
   pelo vínculo presente (ORD-162/163).
5. A listagem (`PriceTableListScreen`) e o detalhe (`PriceTableFormScreen`) passam a mostrar
   quantas empresas estão vinculadas à tabela **agora** (não o histórico completo, só o
   presente) — visível antes de qualquer ação de edição, exclusão ou troca de categoria.

### Fluxos alternativos / exceções
- Tabela nunca usada (draft, ou active/historical sem nenhum `CompanyPlan` jamais vinculado)
  continua 100% editável/excluível como hoje — a trava nova só vale a partir do primeiro
  vínculo real.
- Desmarcar `kind` continua permitido mesmo numa tabela "já utilizada" — a marcação de uso
  trava conteúdo (preço/faixas) e exclusão, não a categoria (`kind` continua independente,
  decisão já fechada na ORD-164).
- Falha ao gravar o registro de histórico não deve impedir a renovação/aplicação em si — mesma
  filosofia de "auditoria é best-effort" já usada no Mongo audit do payment-service; a operação
  principal (mudar o plano) não pode ficar refém de um registro secundário.
- Tabela "já utilizada" tentando ser excluída → bloqueada (mesmo 409 que já existe hoje pra
  vínculo atual, agora também pra vínculo histórico).

### Dependências
- Serviços envolvidos: **company-service** (mesmo módulo de `PriceTable`/`CompanyPlan`/
  `PriceTableTransactionTier`, ORD-162/163/164).
- Histórias bloqueantes: **ORD-164** (mergeada; PR de correção #132 aguardando merge final —
  ORD-165 deve começar depois dela pra não conflitar nos mesmos endpoints).

### Critérios de aceite funcionais
- [ ] Toda troca de `price_table_id` de um `CompanyPlan` (via `renew` ou `apply`) gera um
  registro persistido e consultável: tabela anterior, tabela nova, quem, quando, e se foi
  renovação ou aplicação direta.
- [ ] Existe uma forma de consultar esse histórico por empresa (endpoint no mínimo).
- [ ] Uma tabela que já teve qualquer `CompanyPlan` vinculado, mesmo sem vínculo hoje, nunca
  mais aparece como `editable: true` nem pode ser excluída.
- [ ] Tabela nunca usada continua com o comportamento atual (editável/excluível livremente).
- [ ] Listagem e detalhe de tabela de preço mostram quantas empresas estão vinculadas
  atualmente.
- [ ] Falha no registro de histórico não bloqueia a operação de renovar/aplicar tabela.
- [ ] `emit_audit` continua sendo chamado nas duas operações, como trilha operacional
  complementar (não substitui o registro persistido).

### Wireframe / Mockup
Reaproveita telas existentes, sem tela nova obrigatória:
- `PriceTableListScreen` — nova coluna ou badge "N empresas" na listagem.
- `PriceTableFormScreen` — mesmo contador no detalhe/formulário (modo leitura).
- `CompanyContractScreen` — seção "Histórico do plano" opcional (pode ficar pra uma segunda
  fase se o Tech Explorer avaliar que o endpoint sozinho já atende o critério de aceite por
  ora — decisão de escopo pro Tech Explorer, não travar o Explorer nisso).

## QA Explorer

> A regra de `editable` deixa de ser binária (vínculo atual sim/não, ORD-162/163) e passa a ter
> **3 estados**: tabela **nunca usada** (editável), tabela **já utilizada mas sem vínculo hoje**
> (trava nova desta história) e tabela **com vínculo atual** (trava que já existia). Os cenários
> abaixo cobrem os três, não só dois. Isolamento multi-tenant relevante aqui é o do endpoint de
> histórico por empresa (novo) — `PriceTable` continua sem `company_id`, mesma justificativa já
> registrada no QA Explorer da ORD-164.

```gherkin
Feature: Auditoria e guardrails de tabela de preço vinculada ao plano comercial
  Como Super Admin
  Quero que toda troca de tabela de preço fique registrada de forma consultável,
  e que tabelas já usadas nunca mais voltem a ser editáveis
  Para confiar e reconstruir o histórico de cobrança do Ordin

  Background:
    Dado que existe uma tabela de preço "Tabela Vigente" com status "active"
    E existe uma empresa "Burger House" com um CompanyPlan vinculado à "Tabela Vigente"

  # ── Registro de histórico ao trocar price_table_id ─────────────────────

  Scenario: Renovar plano com tabela vigente (padrão) grava histórico
    Quando o Admin renova o plano de "Burger House" sem informar price_table_id
    Então a resposta tem status 200
    E um registro de histórico é gravado com tabela_anterior="Tabela Vigente",
      tabela_nova="Tabela Vigente", ação="renovação", ator=Admin, timestamp preenchido

  Scenario: Renovar plano escolhendo explicitamente uma tabela promocional grava histórico
    Dado que existe "Tabela Promo" (status "historical", kind="promocional")
    Quando o Admin renova o plano de "Burger House" informando price_table_id="Tabela Promo"
    Então a resposta tem status 200
    E um registro de histórico é gravado com tabela_anterior="Tabela Vigente",
      tabela_nova="Tabela Promo", ação="renovação"

  Scenario: Aplicar tabela sem renovar grava histórico com ação diferente da renovação
    Dado que existe "Tabela Alt" (status "active", kind="alternativa")
    Quando o Admin aplica "Tabela Alt" ao plano de "Burger House" sem renovar
    Então a resposta tem status 200
    E um registro de histórico é gravado com tabela_anterior="Tabela Vigente",
      tabela_nova="Tabela Alt", ação="aplicação" (não "renovação")

  Scenario: Consultar histórico de uma empresa retorna os registros em ordem cronológica
    Dado que o plano de "Burger House" já passou por 3 trocas de tabela
    Quando o Admin consulta o histórico do plano de "Burger House"
    Então a resposta tem status 200
    E retorna os 3 registros, do mais recente pro mais antigo

  Scenario: Falha ao gravar o histórico não impede a renovação em si
    Dado que a gravação do registro de histórico falha (ex: erro de infraestrutura simulado)
    Quando o Admin renova o plano de "Burger House"
    Então a resposta tem status 200 — a renovação é concluída normalmente
    E o CompanyPlan de "Burger House" reflete a nova tabela/vencimento
    E a falha de histórico é registrada via log (não propaga erro pro cliente)

  # ── editable com 3 estados ──────────────────────────────────────────────

  Scenario: Tabela nunca usada continua editável e excluível (comportamento inalterado)
    Dado que existe "Tabela Nova" (status "active") sem nenhum CompanyPlan jamais vinculado
    Quando o Admin consulta "Tabela Nova"
    Então editable=true
    E a exclusão de "Tabela Nova" é permitida (204)

  Scenario: Tabela já utilizada, mas sem vínculo hoje, permanece travada (trava nova)
    Dado que "Tabela Antiga" teve um CompanyPlan vinculado no passado
    E esse CompanyPlan foi movido pra outra tabela depois (sem vínculo atual com "Tabela Antiga")
    Quando o Admin consulta "Tabela Antiga"
    Então editable=false
    E a tentativa de editar "Tabela Antiga" retorna 409
    E a tentativa de excluir "Tabela Antiga" retorna 409

  Scenario: Tabela com vínculo atual continua travada (comportamento já existente)
    Quando o Admin tenta editar "Tabela Vigente" (vinculada a "Burger House" no Background)
    Então a resposta tem status 409

  Scenario: Desmarcar kind é permitido mesmo em tabela já utilizada
    Dado que "Tabela Antiga" já teve vínculo no passado (editable=false) e tem kind="promocional"
    Quando o Admin remove o kind de "Tabela Antiga"
    Então a resposta tem status 200
    E "Tabela Antiga" continua com editable=false (a trava de conteúdo não muda)

  # ── Contador de empresas vinculadas ─────────────────────────────────────

  Scenario: Listagem mostra quantas empresas usam cada tabela atualmente
    Dado que "Tabela Vigente" tem 1 empresa vinculada ("Burger House")
    E "Tabela Antiga" tem 0 empresas vinculadas atualmente (mas já teve no passado)
    Quando o Admin lista as tabelas de preço
    Então "Tabela Vigente" aparece com contador=1
    E "Tabela Antiga" aparece com contador=0

  # ── emit_audit continua sendo chamado ────────────────────────────────────

  Scenario: emit_audit é chamado tanto na renovação quanto na aplicação
    Quando o Admin renova o plano de "Burger House"
    Então emit_audit é chamado com event apropriado (ex: "company_plan_renewed")
    Quando o Admin aplica uma tabela sem renovar
    Então emit_audit é chamado com event apropriado (ex: "company_plan_table_applied")

  # ── Controle de acesso e isolamento ──────────────────────────────────────

  Scenario: Owner consegue consultar o histórico do plano da própria empresa
    Quando o Owner de "Burger House" consulta o histórico do próprio plano
    Então a resposta tem status 200

  Scenario: Owner não consegue consultar o histórico do plano de outra empresa
    Quando o Owner de "Burger House" tenta consultar o histórico do plano de "Sweet Corner"
    Então a resposta tem status 403

  Scenario: Admin/Super Admin conseguem consultar o histórico de qualquer empresa
    Quando o Admin consulta o histórico do plano de "Sweet Corner"
    Então a resposta tem status 200

  Scenario: Sem token não consegue consultar histórico nem trocar tabela
    Quando uma requisição sem token consulta o histórico de um plano
    Então a resposta tem status 401
```

### Cenários revisados e aprovados pelo PM
Cobertura validada contra os critérios de aceite. Um ponto para o Tech Explorer resolver
explicitamente, sinalizado no cenário "Falha ao gravar o histórico não impede a renovação":
como simular a falha de gravação de forma testável (mock do insert/commit da tabela de
histórico) sem acoplar o teste a detalhe de implementação frágil — decidir a estratégia de
teste junto com o desenho técnico da persistência, não depois.

## Tech Explorer

### Serviços impactados
- **company-service**: tabela nova `company_plan_history`; 2 helpers novos
  (`_price_table_ever_linked`, `_record_plan_history`); `editable` recalculado em 5 pontos já
  existentes; `renew_company_plan`/`apply_company_plan_table` gravam histórico +
  `emit_audit` após o commit principal; endpoint novo `GET /companies/{id}/plan/history`;
  contador `linked_companies_count` no CRUD de `price-tables`.
- **frontend/admin**: contador na lista/detalhe de tabela de preço; seção "Histórico do plano"
  no `CompanyContractScreen` (decisão: **entra nesta história** — o endpoint já devolve tudo
  pronto pra renderizar, e o ganho de visibilidade é justamente o objetivo da história; não
  faz sentido nascer só como API sem lugar nenhum pra ver isso na prática).

### Modelo de dados

```python
class CompanyPlanHistory(Base):
    # ORD-165: registro append-only de toda troca de price_table_id de um
    # CompanyPlan. Não referencia CompanyPlan.id de propósito — sobrevive
    # mesmo que o CompanyPlan seja recriado no futuro (não há hoje, mas não
    # acopla). company_id duplicado do CompanyPlan pra consulta direta sem
    # join, mesmo padrão já usado em outras tabelas do serviço.
    __tablename__ = "company_plan_history"
    id                    = Column(Integer, primary_key=True)
    company_id            = Column(Integer, nullable=False, index=True)
    from_price_table_id   = Column(Integer, nullable=False, index=True)
    to_price_table_id     = Column(Integer, nullable=False, index=True)
    action                = Column(String(20), nullable=False)  # "renew" | "apply"
    actor_user_id         = Column(Integer, nullable=True)
    created_at            = Column(DateTime, default=datetime.utcnow)
```

### Helper — `editable` com histórico (substitui `_price_table_has_linked_plans` nos 5 usos)

```python
async def _price_table_ever_linked(db: AsyncSession, price_table_id: int) -> bool:
    if await _price_table_has_linked_plans(db, price_table_id):
        return True
    result = await db.execute(
        select(CompanyPlanHistory.id)
        .where(or_(
            CompanyPlanHistory.from_price_table_id == price_table_id,
            CompanyPlanHistory.to_price_table_id == price_table_id,
        ))
        .limit(1)
    )
    return result.scalar_one_or_none() is not None
```

Substitui `_price_table_has_linked_plans` (não remove — continua existindo e é chamada de
dentro deste helper) nos 5 pontos que hoje decidem `editable`/bloqueio: `_serialize_price_table`,
`list_price_tables` (batch, ver abaixo), `update_price_table` (409), `delete_price_table` (409).
`_price_table_has_linked_plans` continua sendo o critério certo em outro lugar que não muda: em
lugar nenhum — todos os 4 usos atuais são exatamente esses 4 pontos de `editable`/bloqueio, e
todos passam a usar o helper novo.

### Helper — registro best-effort (chamado depois do commit principal)

```python
async def _record_plan_history(
    db: AsyncSession, request: Request, *, company_id: int, from_id: int, to_id: int,
    action: str, actor: TokenPayload,
) -> None:
    # ORD-165: nunca deixa uma falha aqui derrubar renew/apply — mesma
    # filosofia do audit best-effort do Mongo no payment-service. Roda DEPOIS
    # do commit principal (plan já está salvo); se isto falhar, o admin não
    # percebe diferença nenhuma na resposta — só perde o registro do evento.
    try:
        db.add(CompanyPlanHistory(
            company_id=company_id, from_price_table_id=from_id, to_price_table_id=to_id,
            action=action, actor_user_id=int(actor.sub) if actor.sub.isdigit() else None,
        ))
        await db.commit()
        emit_audit(
            "company_plan_renewed" if action == "renew" else "company_plan_table_applied",
            request, actor=actor.role, actor_id=int(actor.sub) if actor.sub.isdigit() else None,
            company_id=company_id, result="success",
            detail={"from_price_table_id": from_id, "to_price_table_id": to_id},
        )
    except Exception:
        await db.rollback()
        logging.getLogger(__name__).warning(
            "ORD-165: falha ao gravar company_plan_history (company_id=%s)", company_id, exc_info=True
        )
```

`renew_company_plan`/`apply_company_plan_table` ganham `request: Request` na assinatura (já
importado do `fastapi` no topo do arquivo) e, logo após o `await db.commit(); await
db.refresh(plan)` existentes, chamam `await _record_plan_history(db, request,
company_id=company_id, from_id=<price_table_id antigo, capturado ANTES do UPDATE>,
to_id=chosen_table.id, action="renew"/"apply", actor=current_user)`.

### Endpoints

#### GET /companies/{company_id}/plan/history
**Serviço:** company-service
**Auth:** JWT obrigatório · `_require_company_admin` (owner/manager só a própria empresa;
admin/superadmin qualquer uma — mesma regra do `GET /plan` já existente)
**company_id:** do path, checado contra o JWT dentro de `_require_company_admin`

Response 200:
```json
{
  "entries": [
    {
      "from_price_table": {"id": 3, "name": "Tabela Vigente", "kind": null},
      "to_price_table": {"id": 7, "name": "Tabela Promo", "kind": "promocional"},
      "action": "renew",
      "created_at": "2026-09-11T18:36:06"
    }
  ]
}
```
Ordenado por `created_at desc`. Nomes de tabela resolvidos via `db.get(PriceTable, id)` por
linha — volume esperado é baixo (histórico de UMA empresa, não a plataforma toda), N+1 aqui não
é o mesmo risco que seria em `list_price_tables`.

Erros: `401` (sem token) · `403` (owner/manager de outra empresa) · `404` (empresa sem
`CompanyPlan`)

### Schemas alterados
- `PriceTableOut` / `PriceTableSummaryOut`: adiciona `linked_companies_count: int = 0`.
- `list_price_tables`: troca o `SELECT DISTINCT price_table_id` atual por
  `SELECT price_table_id, COUNT(*) FROM company_plans GROUP BY price_table_id` — 1 query só,
  usada tanto pra `editable` (via `_price_table_ever_linked`, que ainda faz sua própria checagem
  de histórico por linha — não dá pra batchar o `OR` de histórico sem complicar demais pra um
  admin-only endpoint de baixo volume) quanto pro contador.
- `CompanyPlanHistoryEntryOut` / `CompanyPlanHistoryOut` (novos, ver endpoint acima).

### Migrations
- `services/company/migrations/versions/YYYYMMDD_HHMM_company_plan_history.py`: cria
  `company_plan_history` (colunas acima, índices em `company_id`, `from_price_table_id`,
  `to_price_table_id`). Idempotente via `inspector.get_table_names()`.

### Impacto em outros serviços
Nenhum — tudo contido no company-service.

### Eventos de fila
Não aplicável.

### Frontend
- **`types.ts`**: `linked_companies_count` em `PriceTable`/`PriceTableSummary`;
  `CompanyPlanHistoryEntry`/`CompanyPlanHistory` novos.
- **`api/companies.ts`**: `getCompanyPlanHistory(companyId)`.
- **`PriceTableListScreen`**: nova coluna "Empresas" (contador).
- **`PriceTableFormScreen`**: mesmo contador no topo, ao lado do aviso de somente-leitura
  quando `editable=false`.
- **`CompanyContractScreen`**: nova seção "Histórico do plano" abaixo de "Trocar tabela de
  preço" — tabela simples (data, ação, tabela anterior → tabela nova), reaproveitando o
  componente `Table` já usado nas outras listagens do admin. Carregada sob demanda (não bloqueia
  o carregamento do resto da tela se falhar, mesmo padrão já usado pro plano em si).

### Estratégia de teste — "falha no histórico não bloqueia a operação"
`_record_plan_history` é uma função de módulo isolada — o teste faz
`monkeypatch.setattr(svc, "_record_plan_history", raise_on_call)` (troca a função inteira por
uma que levanta exceção) antes de chamar `POST /plan/renew`, e confirma que a resposta ainda é
`200` e que o `CompanyPlan` foi atualizado corretamente no banco. Não acopla o teste a detalhe
de implementação (mock de `db.add`/`db.commit` especificamente) — só ao contrato público da
função, que já é a unidade certa de isolamento aqui.

### Estimativa
- Backend: ~6h (migration + model + 2 helpers + `request: Request` nas 2 assinaturas + endpoint
  novo + schemas + reescrever `editable` nos 4 pontos + testes, incluindo o cenário de falha).
- Frontend: ~3h (contador em 2 telas + seção de histórico no contrato + tipos + API).

### Riscos
- **Histórico retroativo não existe**: tabelas que já foram desvinculadas *antes* desta
  história não têm registro em `company_plan_history` — o mecanismo só existe daqui pra frente.
  Mesmo racional já aceito na ORD-163 pra ausência de histórico de renovação; não é bloqueador.
- **`_price_table_ever_linked` fica mais caro** (até 2 queries em vez de 1) nos pontos que já
  calculavam `editable` — aceitável, são endpoints administrativos de baixo volume, não hot path
  de totem/pedido.
- **`_record_plan_history` roda numa segunda transação, depois do commit principal**: entre o
  commit do `CompanyPlan` e o commit do histórico existe uma janela onde o plano já mudou mas o
  histórico ainda não foi gravado — aceitável dado que essa é justamente a definição de
  "best-effort" pedida no Explorer; se o processo cair exatamente nessa janela, o pior caso é
  perder 1 registro de histórico, nunca corromper o `CompanyPlan`.

## Ready

Checklist completo verificado — **ORD-165 está Ready**.

- **Explorer**: história Como/Quero/Para ✓ · contexto e motivação ✓ · ajuste de PM sobre
  `emit_audit` (log, não persistência) documentado e validado lendo o código real antes de
  propor ✓ · fluxo principal ✓ · dependências (ORD-162/163/164) ✓ · critérios de aceite ✓ ·
  wireframe (reaproveita `PriceTableListScreen`/`PriceTableFormScreen`/`CompanyContractScreen`,
  sem tela nova) ✓.
- **QA Explorer**: 16 cenários Gherkin — happy path (histórico gravado em renovação/aplicação),
  bordas (3 estados de `editable`: nunca usada / já utilizada sem vínculo / com vínculo atual),
  erro (falha best-effort não bloqueia a operação), isolamento (owner só a própria empresa,
  admin/superadmin qualquer uma) ✓.
- **Tech Explorer**: serviços impactados ✓ · endpoint novo (`GET /plan/history`) com payload
  completo ✓ · migration descrita (`company_plan_history`, 3 índices) ✓ · filas: não aplicável,
  justificado ✓ · estimativa (~6h backend, ~3h frontend) ✓ · riscos identificados com mitigação
  (histórico retroativo inexistente, custo de query adicional, janela de best-effort) ✓.

Sem bloqueio de sequenciamento — ORD-164 e a PR de correção #132 já estão em `main` (`6100b7c`).

✅ História priorizada no sprint backlog.
