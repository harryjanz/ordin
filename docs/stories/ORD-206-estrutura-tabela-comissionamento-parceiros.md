# ORD-206 — Estrutura de tabela de comissionamento de parceiros

**Status:** Ready
**Serviço:** company-service
**Frente:** Monetização (parcerias comissionadas + faturamento B2B) — decidida em 2026-09-25, ver `docs/roles/administrativo.md` e `docs/roles/financeiro.md`.

## História

Como Administrativo/Financeiro da Ordin, quero definir e manter tabelas de comissionamento de
parceiro (valor de setup por totem ativado + percentual recorrente mensal), com uma tabela padrão
e tabelas customizadas por acordo, para viabilizar o programa de parceiros sem travar em decisões
contratuais/fiscais ainda não resolvidas.

## Contexto e motivação

Primeiro tijolo da frente de monetização (parcerias comissionadas + faturamento B2B). Sem uma
estrutura de comissão definida, não dá pra desenhar o cadastro de parceiro (ORD-207) nem calcular
comissão no fechamento mensal (história futura) — esta história é bloqueante pras duas.

**Precedente técnico direto, reaproveitado deliberadamente:** o company-service já resolve o mesmo
formato de problema pro lado do cliente — `PriceTable` (status draft/active/historical, campo
`kind` pra tabela alternativa/promocional — ORD-162/164, `services/company/main.py:405`) +
`CompanyPlan` (vincula empresa à price_table_id vigente, linha 458) + `CompanyPlanHistory` (log
append-only de troca — ORD-165, linha 475) + `activate_price_table` (linha 4551, o padrão de troca
atômica com `SELECT ... FOR UPDATE`). A estrutura de comissão de parceiro é o mesmo problema no
lado oposto (Ordin paga parceiro, não cobra cliente) — este documento espelha esse padrão, não
desenha do zero.

### Lente Administrativo
Tabela de comissão não tem vínculo contratual nem campo de tipo de parceiro (PF/PJ) — decisão
consciente, evita acoplamento prematuro com a entidade "Parceiro", que ainda não existe (é a
ORD-207). Toda tabela customizada carrega nota/motivo textual obrigatório (rastreabilidade de
auditoria de acordo comercial). Não depende da reativação do CNPJ — esta história não dispara
nenhuma ação com efeito jurídico ou fiscal real (sem contrato, sem nota fiscal, sem pagamento).

### Lente Financeiro
Tabela tem `vigente_desde` — metadado descritivo/de auditoria, não critério de seleção (quem
seleciona qual tabela "vale" é `is_default` e, futuramente, o vínculo direto parceiro→tabela — não
uma consulta por data). Fechamento mensal (história futura) sempre usa a tabela vigente no momento
do fechamento, sem proração dentro do mês. Histórico de troca é obrigatório e hard-transacional
(dinheiro pago a terceiro, precisa ser auditável sem exceção — diverge deliberadamente do padrão
best-effort de `CompanyPlanHistory`).

## Fluxo principal

1. Administrativo/Financeiro cria uma tabela de comissão (nome, `setup_fee_per_totem`,
   `recurring_percent`, `vigente_desde`, e `note` se não for a tabela padrão).
2. Marca uma tabela como padrão — a troca é atômica: a tabela antiga perde `is_default` na mesma
   operação em que a nova ganha; se já existe uma padrão, a troca exige confirmação explícita.
3. Edita uma tabela existente — toda alteração de valor rastreado gera uma entrada de histórico;
   reenviar os mesmos valores não gera histórico falso.
4. Consulta o histórico de mudanças de uma tabela específica (quem, quando, campo, antes/depois).
5. Lista as tabelas existentes, com opção de incluir as arquivadas.
6. Remove uma tabela — exclusão real se ela nunca teve histórico e não é a padrão atual; senão,
   só arquivamento (soft); a tabela padrão nunca pode ser excluída nem arquivada sem trocar o
   padrão antes.

## Fluxos alternativos / exceções

- Marcar uma segunda tabela como padrão sem confirmar → 409, nada muda.
- Nenhuma tabela cadastrada ainda → estado válido (lista vazia, sem fallback hardcoded).
- Tentar excluir/arquivar a tabela padrão atual → 409.
- Tentar excluir tabela com histórico → 409, orientação pra arquivar em vez de excluir.

## Dependências

- **Serviço:** company-service (mesmo serviço do precedente `PriceTable`/`CompanyPlan`).
- **Histórias bloqueantes:** nenhuma.
- **Histórias que dependem desta:** ORD-207 (cadastro de parceiro — precisa incluir UI de escolha
  de tabela como critério de aceite próprio, já que o frontend está fora do escopo desta história);
  fechamento mensal / cálculo de comissão (história futura, ainda sem número).

## Fora de escopo (histórias futuras, não travam esta)

Tela de cadastro de parceiro, contrato clickwrap, tipo de parceiro PF/PJ, geração de cobrança MP,
rotina de fechamento mensal do cliente final, seção de parcerias no site institucional, qualquer
tela de administração desta própria estrutura (só API nesta história).

## Critérios de aceite funcionais

- [PM] CRUD de tabela de comissão: nome, `setup_fee_per_totem`, `recurring_percent`,
  `vigente_desde`.
- [PM] Exatamente uma tabela pode estar marcada como padrão a qualquer momento; troca é atômica
  (nunca existe um instante com zero ou duas tabelas padrão).
- [PM] N tabelas customizadas podem coexistir com a padrão, sem afetar qual é a padrão.
- [PM] Listagem retorna por padrão só tabelas não-arquivadas; `?archived=true` inclui as
  arquivadas (achado do repasse de PM — fecha lacuna de rastreabilidade tipo ORD-194, listagem
  estava só em prosa no fluxo principal original e não tinha endpoint nem cenário correspondente).
- [Administrativo] Toda tabela customizada exige `note` não-vazio, com tamanho mínimo (achado do
  repasse de Administrativo — nota de auditoria precisa de conteúdo mínimo, não só não-vazio).
- [Administrativo] Sem campo de vínculo contratual nem tipo de parceiro (PF/PJ) na estrutura.
- [Financeiro] Toda criação/edição de valor rastreado (`setup_fee_per_totem`, `recurring_percent`,
  `is_default`, `vigente_desde`) gera entrada de histórico (quem, quando, campo, antes/depois),
  gravada na mesma transação da mudança (hard requirement, não best-effort).
- [Financeiro] Edição sem alteração de nenhum valor não gera entrada de histórico falsa.
- [Financeiro] É possível consultar o histórico de mudanças de uma tabela específica.
- [Backend-SR] Exclusão real só é permitida se a tabela nunca teve entrada de histórico e não é a
  padrão atual; caso contrário, só arquivamento (soft, `archived_at`). A tabela padrão nunca pode
  ser excluída nem arquivada sem trocar o padrão antes (409 nos dois casos).
- [Backend-SR] Troca de padrão exige `confirm_replace: true` se já existe outra tabela padrão hoje
  (409 sem confirmação); a troca em si usa lock (`SELECT ... FOR UPDATE`) pra impedir duas tabelas
  padrão simultâneas sob concorrência.
- Isolamento multi-tenant: N/A — dado interno de plataforma, sem `company_id` (mesmo padrão de
  `PriceTable`). Testável mesmo assim: qualquer platform-admin autenticado vê a mesma listagem
  (sem particionamento); owner/manager de empresa cliente recebe 403; requisição sem token recebe
  401.

## Tabela de rastreabilidade ponta a ponta

| Passo do Fluxo Principal | Critério de aceite | Cenário Gherkin | Endpoint/tela |
|---|---|---|---|
| 1. Criar tabela (padrão ou customizada) | CRUD — criação; nota obrigatória se customizada | *Criar tabela de comissão padrão com dados válidos*; *Criar tabela customizada com nota válida*; *Erro sem nota*; *Erro nota curta*; *Erro percentual negativo*; *Erro percentual >100%*; *Erro setup negativo*; *Erro nome vazio* | `POST /commercial/commission-tables` |
| 2. Marcar tabela como padrão (troca atômica) | Exatamente uma padrão por vez; troca atômica | *Marcar padrão quando não existe nenhuma*; *Marcar segunda padrão sem confirmar → 409*; *Marcar segunda padrão com confirm_replace=true troca atomicamente*; *Múltiplas customizadas coexistem sem afetar padrão* | `POST /commercial/commission-tables/{id}/set-default` |
| 3. Editar tabela existente | Edição de valor gera histórico; edição sem alteração não gera histórico | *Editar valor gera histórico*; *Editar vigente_desde de fato muda a data gera histórico*; *Reenviar mesmo vigente_desde não gera histórico falso*; *Editar múltiplos campos numa única PUT gera uma entrada por campo*; *Editar sem alterar nada não gera histórico* | `PUT /commercial/commission-tables/{id}` |
| 4. Consultar histórico de uma tabela | Consulta de histórico possível | *Consultar histórico retorna entradas em ordem cronológica* | `GET /commercial/commission-tables/{id}/history` |
| 5. Listar tabelas (com opção de arquivadas) | Listagem esconde arquivadas por padrão; `?archived=true` inclui | *Listagem por padrão esconde arquivadas*; *Listagem com archived=true inclui arquivadas*; *Qualquer platform-admin vê a mesma listagem*; *Owner/manager recebe 403*; *Sem token recebe 401* | `GET /commercial/commission-tables?archived=` |
| 6. Remover tabela (excluir ou arquivar) | Exclusão só sem histórico e não-padrão; senão arquiva; padrão nunca removível sem trocar antes | *Excluir tabela sem histórico é permitido*; *Excluir tabela com histórico é bloqueado (409)*; *Arquivar tabela com histórico remove da listagem ativa sem apagar histórico*; *Excluir/arquivar a padrão é bloqueado (409)* | `DELETE /commercial/commission-tables/{id}`; `POST /commercial/commission-tables/{id}/archive` |

Todas as 6 linhas têm as 4 colunas preenchidas. Nenhum passo do Fluxo Principal foi cortado do
escopo silenciosamente.

## QA Explorer — cenários Gherkin

```gherkin
Feature: Estrutura de tabela de comissionamento de parceiros
  Como Administrativo/Financeiro da Ordin
  Quero definir e manter tabelas de comissão de parceiro
  Para viabilizar o programa de parceiros e o fechamento mensal futuro

  Background:
    Dado que estou autenticado como platform-admin (role admin ou superadmin) da Ordin

  # Criação
  Scenario: Criar tabela de comissão padrão com dados válidos
    Quando eu crio uma tabela com nome "Padrão 2026", setup_fee_per_totem 150.00, recurring_percent 3.5
    Então a tabela é criada com sucesso (201)
    E não é exigida nenhuma nota

  Scenario: Criar tabela de comissão customizada com nota válida
    Quando eu crio uma tabela customizada com note "Acordo Parceiro XPTO — volume negociado em reunião de 2026-09-20"
    Então a tabela é criada com sucesso (201)

  Scenario: Erro ao criar tabela customizada sem nota
    Quando eu crio uma tabela customizada sem preencher note
    Então recebo erro de validação (422)

  Scenario: Erro ao criar tabela customizada com nota abaixo do tamanho mínimo
    Quando eu crio uma tabela customizada com note "ok"
    Então recebo erro de validação (422)

  Scenario: Erro ao criar tabela com percentual recorrente negativo
    Quando eu crio uma tabela com recurring_percent -1
    Então recebo erro de validação (422)

  Scenario: Erro ao criar tabela com percentual recorrente acima de 100%
    Quando eu crio uma tabela com recurring_percent 101
    Então recebo erro de validação (422)

  Scenario: Erro ao criar tabela com setup_fee_per_totem negativo
    Quando eu crio uma tabela com setup_fee_per_totem -10
    Então recebo erro de validação (422)

  Scenario: Erro ao criar tabela com nome vazio
    Quando eu crio uma tabela com name ""
    Então recebo erro de validação (422)

  # Padrão único e troca atômica
  Scenario: Marcar tabela como padrão quando não existe nenhuma padrão ainda
    Dado que nenhuma tabela está marcada como padrão
    Quando eu marco a tabela A como padrão
    Então a tabela A passa a ter is_default=true (200)

  Scenario: Marcar uma segunda tabela como padrão sem confirmar substituição retorna 409
    Dado que a tabela A é a padrão atual
    Quando eu tento marcar a tabela B como padrão sem confirm_replace
    Então recebo erro de conflito (409)
    E a tabela A continua sendo a padrão

  Scenario: Marcar uma segunda tabela como padrão com confirm_replace=true troca atomicamente
    Dado que a tabela A é a padrão atual
    Quando eu marco a tabela B como padrão com confirm_replace=true
    Então a tabela B passa a ser a padrão (200)
    E a tabela A deixa de ser a padrão na mesma operação
    E são geradas 2 entradas de histórico (uma por tabela afetada)

  Scenario: Múltiplas tabelas customizadas coexistem sem afetar qual é a padrão
    Dado que a tabela A é a padrão atual
    Quando eu crio as tabelas customizadas B e C
    Então a tabela A continua sendo a padrão
    E as tabelas B e C existem com is_default=false

  # Edição e histórico
  Scenario: Editar valor de tabela gera entrada de histórico
    Dado uma tabela com recurring_percent 3.5
    Quando eu edito recurring_percent para 4.0
    Então a alteração é salva (200)
    E uma entrada de histórico é criada com campo "recurring_percent", valor antigo 3.5, valor novo 4.0

  Scenario: Editar vigente_desde de fato muda a data gera entrada de histórico
    Dado uma tabela com vigente_desde "2026-01-01"
    Quando eu edito vigente_desde para "2026-10-01"
    Então uma entrada de histórico é criada com campo "vigente_desde"

  Scenario: Reenviar o mesmo vigente_desde não gera histórico falso
    Dado uma tabela com vigente_desde "2026-01-01"
    Quando eu envio um PUT reafirmando vigente_desde "2026-01-01" sem mudar o valor
    Então nenhuma entrada de histórico é criada

  Scenario: Editar múltiplos campos rastreados numa única requisição gera uma entrada de histórico por campo
    Dado uma tabela com setup_fee_per_totem 150.00 e recurring_percent 3.5
    Quando eu edito setup_fee_per_totem para 180.00 e recurring_percent para 4.0 numa única requisição PUT
    Então são geradas 2 entradas de histórico na mesma transação, uma por campo alterado

  Scenario: Editar sem alterar nenhum valor não gera entrada de histórico
    Dado uma tabela com determinados valores
    Quando eu envio um PUT reafirmando exatamente os mesmos valores
    Então nenhuma entrada de histórico é criada

  Scenario: Consultar histórico de uma tabela retorna entradas em ordem cronológica
    Dado uma tabela com 3 edições anteriores
    Quando eu consulto o histórico dessa tabela
    Então recebo as 3 entradas ordenadas da mais antiga pra mais recente

  # Exclusão / arquivamento
  Scenario: Excluir tabela customizada que nunca teve histórico é permitido
    Dado uma tabela customizada recém-criada, sem edições e sem ser a padrão
    Quando eu excluo essa tabela
    Então a tabela é removida de verdade (204)

  Scenario: Excluir tabela que já tem histórico é bloqueado
    Dado uma tabela com pelo menos 1 entrada de histórico
    Quando eu tento excluir essa tabela
    Então recebo erro de conflito (409) orientando a arquivar em vez de excluir

  Scenario: Arquivar tabela com histórico remove da listagem ativa sem apagar histórico
    Dado uma tabela com histórico, não-padrão
    Quando eu arquivo essa tabela
    Então ela recebe archived_at preenchido (200)
    E some da listagem padrão
    E seu histórico continua consultável

  Scenario: Tentar excluir ou arquivar a tabela padrão atual é bloqueado
    Dado que a tabela A é a padrão atual
    Quando eu tento excluir ou arquivar a tabela A
    Então recebo erro de conflito (409) nos dois casos

  # Listagem
  Scenario: Listagem por padrão esconde tabelas arquivadas
    Dado que existe 1 tabela ativa e 1 tabela arquivada
    Quando eu chamo GET /commercial/commission-tables sem parâmetros
    Então só a tabela ativa aparece na resposta

  Scenario: Listagem com archived=true inclui tabelas arquivadas
    Dado que existe 1 tabela ativa e 1 tabela arquivada
    Quando eu chamo GET /commercial/commission-tables?archived=true
    Então as 2 tabelas aparecem na resposta

  # Acesso
  Scenario: Qualquer platform-admin autenticado vê a mesma listagem
    Dado dois usuários diferentes, ambos com role admin/superadmin de plataforma
    Quando cada um chama GET /commercial/commission-tables
    Então ambos recebem exatamente a mesma lista (sem particionamento por usuário)

  Scenario: Owner/manager de empresa cliente recebe 403
    Dado um usuário com role owner ou manager de uma empresa cliente
    Quando ele chama qualquer endpoint de /commercial/commission-tables
    Então recebe erro de acesso negado (403)

  Scenario: Requisição sem token recebe 401
    Quando eu chamo qualquer endpoint de /commercial/commission-tables sem Authorization header
    Então recebo erro de não autenticado (401)
```

27 cenários no total (contagem conferida linha a linha nesta versão consolidada — supera o
happy-path/borda/erro mínimo exigido e cobre 1:1 todos os critérios acima).

## Tech Explorer — Solução técnica

### Serviços impactados

- **company-service**: novo modelo `CommissionTable` + `CommissionTableHistory`, migration, e 7
  endpoints novos sob `/commercial/commission-tables`. Nenhum outro serviço é tocado nesta
  história (fechamento mensal e cadastro de parceiro, que vão consumir esses dados, são histórias
  futuras).

### Modelo de dados

```python
class CommissionTable(Base):
    __tablename__ = "commission_tables"
    id                    = Column(Integer, primary_key=True)
    name                  = Column(String(120), nullable=False)
    is_default            = Column(Boolean, nullable=False, default=False)
    setup_fee_per_totem   = Column(Numeric(10, 2), nullable=False)
    recurring_percent     = Column(Numeric(5, 2), nullable=False)
    note                  = Column(String(500), nullable=True)
    vigente_desde         = Column(DateTime, nullable=False)
    archived_at           = Column(DateTime, nullable=True)
    created_at            = Column(DateTime, default=datetime.utcnow)
    created_by_user_id    = Column(Integer, nullable=True)

class CommissionTableHistory(Base):
    __tablename__ = "commission_table_history"
    id                    = Column(Integer, primary_key=True)
    commission_table_id   = Column(Integer, nullable=False, index=True)  # sem FK real — mesmo padrão de CompanyPlanHistory/PriceTableTransactionTier
    field_changed         = Column(String(30), nullable=False)  # setup_fee_per_totem | recurring_percent | is_default | vigente_desde
    old_value             = Column(String(50), nullable=True)
    new_value             = Column(String(50), nullable=True)
    changed_by_user_id    = Column(Integer, nullable=True)
    created_at            = Column(DateTime, default=datetime.utcnow)
```

**Correção aplicada no repasse de Financeiro:** o schema Pydantic de entrada (`CommissionTableIn`)
usa `Decimal` (não `float`) para `setup_fee_per_totem` e `recurring_percent`:

```python
class CommissionTableIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    setup_fee_per_totem: Decimal = Field(ge=0)
    recurring_percent: Decimal = Field(ge=0, le=100)
    note: str | None = Field(default=None, min_length=10, max_length=500)
    vigente_desde: datetime

    @model_validator(mode="after")
    def note_obrigatoria_se_nao_padrao(self):
        # validado no handler, já que "é padrão" não é campo deste schema de entrada
        return self
```

Isso diverge deliberadamente de `PriceTableTierIn.price_per_transaction` (linha 1052), que usa
`float` com `Field(ge=0, gt=0, le=1)` mesmo a coluna sendo `Numeric(6,4)` — uma inconsistência já
existente e não corrigida ali, mas que não deve ser copiada aqui: `recurring_percent` multiplica
diretamente faturamento mensal recorrente de cliente real (dinheiro, não estimativa), e erro de
arredondamento de ponto flutuante só apareceria quando o fechamento mensal (história futura)
começasse a calcular de verdade — mais caro de depurar depois do que de evitar agora. `Field(ge=0)`
/`Field(ge=0, le=100)` seguem o idiom real do arquivo (`PriceTableTierIn`), só trocando o tipo
base.

**Sem `is_default` no payload de criação/edição** — é uma ação dedicada (ver endpoint
`set-default` abaixo), não um campo livre em `POST`/`PUT`, pra impedir que a troca de padrão
aconteça como efeito colateral silencioso de uma edição de valor.

### Migration

Nova migration em `services/company/migrations/versions/`, convenção `YYYYMMDD_HHMM_descricao.py`:
cria `commission_tables` e `commission_table_history` com os campos acima e o índice em
`commission_table_history.commission_table_id`. Sem dado de seed — tabela padrão inicial é criada
via API, não via migration.

### Endpoints

Todos exigem JWT + `_require_platform_admin` (mesmo padrão inline de `create_price_table`,
`services/company/main.py:500` e endpoints de `PriceTable`) — **sem** `company_id`, dado de
plataforma, não de tenant (confirmado lendo o código real: nenhum endpoint de `price-tables` passa
por `resolve_company_id`).

#### `POST /commercial/commission-tables`
**Auth:** platform-admin (admin/superadmin de plataforma)
Request: `CommissionTableIn` (acima). `note` obrigatório (`min_length=10`) quando a tabela não é a
padrão — validado no handler, já que a padrão inicial também nasce sem `is_default=true` explícito.
Response 201: objeto `CommissionTable` completo.
Erros: 422 (validação, inclui nota ausente/curta), 401, 403.

#### `GET /commercial/commission-tables?archived=false`
**Auth:** platform-admin
`archived` (bool, default `false`): quando `false`/omitido, esconde arquivadas; `true` inclui
todas.
Response 200: lista de `CommissionTable`.
Erros: 401, 403.

#### `PUT /commercial/commission-tables/{id}`
**Auth:** platform-admin
Request: mesmos campos de `CommissionTableIn` (parcial ou completo). Pra cada campo rastreado
(`setup_fee_per_totem`, `recurring_percent`, `vigente_desde`) cujo valor novo difira do atual, uma
`CommissionTableHistory` é inserida **na mesma transação** do `UPDATE` — nunca best-effort.
Reenviar o valor já vigente não gera histórico.
Response 200: objeto atualizado.
Erros: 404, 422, 409 (se tentar setar `is_default` diretamente — bloqueado, usar `set-default`).

#### `POST /commercial/commission-tables/{id}/set-default`
**Auth:** platform-admin
Request: `{"confirm_replace": bool}` (default `false`).
Lock: `SELECT * FROM commission_tables FOR UPDATE` (lock em **todas** as linhas, não só a que hoje
é `is_default=true` — mesmo padrão de `activate_price_table`, linha 4551-4607, que trava mesmo o
caso de "zero linhas ativas hoje"). Se já existe outra tabela com `is_default=true` e
`confirm_replace` não veio `true`: 409 sem alterar nada. Se confirmado (ou se não havia nenhuma
padrão): na mesma transação, `UPDATE` da antiga (`is_default=false`) + `UPDATE` da nova
(`is_default=true`) + 2 `INSERT`s em `CommissionTableHistory` (campo `is_default`, um por tabela
afetada).
Response 200: tabela que passou a ser a padrão.
Erros: 404, 409 (sem confirmação).

#### `POST /commercial/commission-tables/{id}/archive`
**Auth:** platform-admin
Bloqueia (409) se a tabela é a padrão atual. Seta `archived_at = now()`. Não apaga histórico.
Response 200.
Erros: 404, 409 (é a padrão).

#### `DELETE /commercial/commission-tables/{id}`
**Auth:** platform-admin
Bloqueia (409) se `is_default=true` OU se existe qualquer `CommissionTableHistory` com esse
`commission_table_id` — verificação via helper `_has_commission_history(db, id)`, mesmo padrão de
`_has_stock_integrated_items` (ORD-203) e `_price_table_ever_linked` (linha 4286): "já foi
referenciado alguma vez" checado antes de qualquer ação destrutiva.
Response 204 (exclusão real, só quando permitida).
Erros: 404, 409 (é a padrão ou já tem histórico — mensagem orienta a usar `/archive`).

#### `GET /commercial/commission-tables/{id}/history`
**Auth:** platform-admin
Response 200: lista de `CommissionTableHistory` para o id, ordenada por `created_at` ascendente.
Erros: 404.

### Impacto em outros serviços

Nenhum nesta história. `CommissionTable`/`CommissionTableHistory` ficam sem consumidor até
ORD-207 (cadastro de parceiro) e a história de fechamento mensal existirem.

### Eventos de fila

Não aplicável — nenhuma mudança de estado aqui precisa ser propagada de forma assíncrona nesta
história.

### Riscos técnicos

- **Race condition em `set-default` sob concorrência:** mitigado pelo lock `SELECT ... FOR UPDATE`
  em todas as linhas + `confirm_replace` explícito — mesmo padrão já validado em produção por
  `activate_price_table`.
- **Sem constraint de unicidade no banco pra `is_default=true`** (MySQL/Aurora não tem partial
  unique index nativo) — garantia é só em nível de aplicação. Mesmo risco já aceito
  conscientemente para `PriceTable.status="active"`; não é uma regressão nova.
- **`CommissionTableHistory` sem FK real** para `commission_table_id` — consistente com
  `CompanyPlanHistory`/`PriceTableTransactionTier`; integridade é responsabilidade da aplicação, não
  do schema.
- **Portabilidade SQLite (testes) vs. MySQL (produção)** na verificação de histórico antes do
  `DELETE` — mesmo cuidado já dado no ORD-203 (`_has_stock_integrated_items`); usar `EXISTS`
  simples, evitar sintaxe específica de um dos dois bancos.
- **Ausência de campo de moeda** — avaliado e descartado no repasse de Financeiro: `PriceTable`
  (o precedente direto) também não tem; adicionar só aqui criaria inconsistência sem benefício
  real no estágio atual (tudo em BRL implícito).

### Estimativa

- **Backend:** 12–16h (2 modelos + migration + 7 endpoints + regra de lock/confirmação + testes
  cobrindo os 27 cenários Gherkin).
- **Frontend:** 0h — fora de escopo desta história (ver condição registrada para ORD-207).

## Repasses realizados (todos concluídos, achados aplicados)

| Repasse | Achados aplicados |
|---|---|
| PM | Contagem de cenários corrigida (23→27 na versão final); critério de listagem (`?archived=`) adicionado — fechava lacuna de rastreabilidade tipo ORD-194; confirmado que Frontend fora de escopo é aceitável com a condição de ORD-207 cobrir a UI. |
| QA | 2 novos cenários de `vigente_desde` (muda de fato / reenvio idempotente); cenário de múltiplos campos numa única `PUT` gerando múltiplas entradas de histórico; 2 cenários de listagem (`archived` on/off); atenção à portabilidade SQLite/MySQL na checagem pré-DELETE. |
| Backend-SR | `Field(ge=0)`/`Field(ge=0,le=100)` no lugar de `@field_validator` (idiom real do arquivo); endpoint dedicado `set-default` com `SELECT...FOR UPDATE` + `confirm_replace` no lugar de aceitar risco de race condition; confirmado sem FK real em `CommissionTableHistory` (padrão real); confirmado sem `company_id` em nenhum endpoint de `PriceTable` real. |
| Administrativo | `note` com tamanho mínimo (não só não-vazio) quando a tabela não é a padrão. |
| Financeiro | `Decimal` em vez de `float` no schema Pydantic (`setup_fee_per_totem`/`recurring_percent`) — precisão monetária real, diverge de propósito do `float` já existente (e não corrigido) em `PriceTableTierIn`; confirmado que `vigente_desde` não precisa de trava de data passada (é metadado, não seletor); confirmado que campo de moeda é over-engineering neste estágio. |

## Checklist de Ready

### Explorer
- [x] Formato *Como/quero/para*
- [x] Contexto e motivação documentados
- [x] Fluxo principal passo a passo
- [x] Dependências identificadas (ORD-207, fechamento mensal futuro)
- [x] Wireframe — N/A, sem frontend nesta história
- [x] Critérios de aceite funcionais, rotulados por lente (PM/Administrativo/Financeiro/Backend-SR)

### QA Explorer
- [x] Happy path em Gherkin
- [x] Cenários de borda em Gherkin
- [x] Cenários de erro em Gherkin
- [x] Cenário de acesso (403/401) — isolamento multi-tenant é N/A (dado de plataforma), mas
      comportamento de acesso é testável e está coberto
- [x] Cenários aprovados pelo PM (repasse de PM concluído)

### Tech Explorer
- [x] Serviços impactados documentados (só company-service)
- [x] Endpoints com payload request/response completos (7 endpoints)
- [x] Migration descrita
- [x] Eventos de fila — N/A, documentado como tal
- [x] Estimativa de esforço definida
- [x] Riscos identificados

### Rastreabilidade ponta a ponta
- [x] Tabela com as 4 colunas preenchidas para as 6 linhas do Fluxo Principal
- [x] Nenhuma célula vazia

### Aprovação final
- [x] Repasses de PM, QA, Backend-SR, Administrativo e Financeiro concluídos, achados aplicados
- [x] Estimativa acordada (12–16h backend)
- [x] Sem bloqueios não resolvidos — confirmado 2x (Administrativo e Financeiro) que nada aqui
      depende da reativação do CNPJ em andamento
- [x] ✅ **ORD-206 está Ready**
