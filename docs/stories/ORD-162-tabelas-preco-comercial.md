---
id: ORD-162
status: Ready
estimativa: 5 pontos (3 backend + 2 admin)
tipo: feature
fase: null
sprint: null
responsavel: Backend SR + Frontend
---

# ORD-162 — Cadastro e versionamento de tabelas de preço comercial (por totem e por transação)

## Descrição
O admin da plataforma Ordin precisa poder cadastrar e manter tabelas de preço comercial —
mensalidade por totem (com desconto progressivo por quantidade) e taxa transacional por faixa de
volume mensal, conforme o modelo definido em `docs/proposta-plano-comercial-ordin.md` — com
versionamento: uma tabela pode ser editada ou substituída a qualquer momento, mas contratos já
ativos permanecem presos à tabela vigente no momento da assinatura até o vencimento anual do
contrato. Na renovação, o contrato passa a usar a tabela que estiver vigente naquele momento
(que pode ser diferente da original). Hoje não existe nenhum conceito de "tabela de preço" nem
de "contrato" no sistema — é modelo de dado novo, base estrutural para (em temas/histórias
futuras, fora de escopo aqui) controle de custo por cliente e fechamento/cobrança/faturamento.

## Persona
- **superadmin/admin da plataforma Ordin** — cadastra, edita e define qual tabela de preço está
  vigente; não é o admin de uma empresa cliente (`owner`/`manager`), é operação interna da Ordin.
- **owner/manager de empresa cliente** — não interage com essa tela, mas seu contrato referencia
  uma tabela específica (a vigente na assinatura ou última renovação); é quem sente o efeito
  comercial indiretamente.

## Contexto
O Ordin formalizou seu modelo comercial nesta sessão (mensalidade por totem + taxa transacional
por volume, calibrada pro segmento pequeno/médio — ver `docs/proposta-plano-comercial-ordin.md`,
`docs/analise-custo-infra-aws-estimativa.md`, `docs/analise-custo-transacional-oculto-concorrentes.md`,
`docs/analise-concorrentes-modelo-cobranca-totem.md`) e agora precisa de um jeito de administrar
esses valores sem hardcode e sem quebrar contratos já fechados quando o preço mudar — é a
diferença entre reajustar preço pra novos clientes e reajustar retroativamente clientes
existentes, o que geraria problema comercial/contratual sério.

Pedido explícito do usuário (2026-09-10): começar só por **tabela de valores × contrato ativo ×
vencimento anual do contrato** — essa é a base. Controle de custo por cliente e
fechamento/cobrança/faturamento ficam para depois, tratados como temas separados sobre a mesma
base de dado. O usuário também pediu que PM e UX sejam estratégicos nessa análise, reconhecendo
que o tema pode se desdobrar em mais de uma história — avaliação de escopo/split fica pro
Explorer.

## Explorer

**Decisão de escopo (PM, 2026-09-10): o tema vira duas histórias, não uma.** Tabela de preço e
contrato são entidades com donos e ciclos de vida diferentes — a tabela não pertence a nenhuma
empresa (é configuração interna da Ordin), o contrato pertence a uma empresa cliente específica e
referencia uma tabela. Misturar as duas numa história só juntaria uma tela puramente
administrativa com uma mudança de modelo de dado que toca o fluxo existente de empresa
(`company-service`), e a parte de contrato ainda tem uma pergunta em aberto que merece Explorer
própria: o que "renovar" significa sem nenhum evento de cobrança acontecendo ainda (fechamento e
faturamento ficaram explicitamente fora de escopo). **Esta história (ORD-162) cobre só a tabela
de preço.** A segunda parte (contrato vinculado à tabela vigente + vencimento anual/renovação)
vira **ORD-163**, registrada em New, dependente desta.

### História
Como superadmin/admin da plataforma Ordin, quero cadastrar e versionar tabelas de preço comercial
(mensalidade por totem com desconto progressivo, e taxa transacional por faixa de volume mensal),
para poder ajustar o modelo comercial ao longo do tempo sem afetar retroativamente contratos já
fechados com uma tabela anterior.

### Contexto e motivação
O Ordin formalizou seu modelo comercial nesta sessão (`docs/proposta-plano-comercial-ordin.md`):
mensalidade por totem (1º totem preço cheio, 2º a 0,5×, 3º-5º a 0,3× cada, 6º+ sob consulta) +
taxa transacional em degraus por volume mensal (calibrada pro segmento pequeno/médio). Hoje esse
modelo só existe em documentação — não há nenhum lugar no sistema onde esses valores vivam como
dado. Sem versionamento, qualquer reajuste de preço mudaria o valor cobrado de clientes já
contratados sob condições diferentes, o que é inaceitável comercialmente (mudar o preço de quem
já assinou sem aviso/renovação). A tabela versionada resolve isso na raiz: o preço muda só pra
quem contrata ou renova depois da mudança.

### Fluxo principal
1. Superadmin acessa a nova seção "Tabelas de Preço" no admin (visível só pra role
   superadmin/admin da plataforma — não aparece pra owner/manager de empresa cliente).
2. Vê a lista de tabelas existentes, cada uma com nome/label, status (**Rascunho** / **Vigente** /
   **Histórica**) e data de criação/ativação.
3. Cria uma nova tabela: define nome/label (ex. "Tabela 2026-Q4"), preço do 1º totem,
   multiplicadores dos totens adicionais (2º, 3º ao 5º), e as faixas de taxa transacional
   (intervalo de transações/mês + preço por transação em cada faixa, quantidade de faixas
   livre).
4. Salva como **Rascunho** — não afeta nenhum contrato existente enquanto estiver nesse estado.
5. Quando pronta, superadmin ativa a tabela como **Vigente**. O sistema automaticamente move a
   tabela vigente anterior (se houver) pro status **Histórica**.
6. Tabelas Vigente e Histórica ficam somente-leitura — pra alterar valores depois de ativada,
   superadmin duplica a tabela (gera um novo Rascunho com os mesmos valores) e ativa a cópia
   ajustada quando pronta.

### Fluxos alternativos / exceções
- Ativar uma tabela enquanto outra já é vigente → sistema pede confirmação explícita (ação
  substitui a vigente atual; contratos já presos à tabela anterior não são afetados, só passam a
  referenciar uma tabela agora "Histórica" em vez de "Vigente" — sem mudança de valor pra eles).
- Tentar editar uma tabela Vigente ou Histórica diretamente → bloqueado na UI; único caminho é
  duplicar.
- Tentar ativar uma tabela sem preço do 1º totem definido, ou sem nenhuma faixa de taxa
  transacional cadastrada → bloqueado com mensagem de validação (rascunho pode ficar incompleto,
  ativação não pode).
- Faixas de transação com sobreposição ou lacuna (ex. faixa 1 vai até 1.000, faixa 2 começa em
  1.500) → bloqueado na validação; faixas precisam ser contíguas e sem sobreposição.

### Dependências
- Serviço provável: `company-service` — é onde já vive hoje a gestão de empresas e as
  capacidades de superadmin (`ARQUITETURA.md` §1.2). Alternativa seria um serviço novo dedicado a
  "comercial/billing", mas criar serviço novo pra isso nesta fase parece prematuro — **confirmar
  no Tech Explorer**.
- Frontend: `frontend/admin` (nova tela, gated pra role superadmin/admin).
- Sem histórias bloqueantes — é fundação nova.
- **Gera dependência pra frente:** ORD-163 (contrato de empresa vinculado à tabela vigente +
  vencimento anual/renovação) depende desta história existir primeiro.

### Critérios de aceite funcionais
- [ ] Superadmin consegue criar uma nova tabela de preço em rascunho, definindo preço do 1º
      totem, multiplicadores de totens adicionais (2º, 3º ao 5º) e faixas de taxa transacional
      (intervalo + preço por transação).
- [ ] Superadmin consegue editar livremente uma tabela em rascunho.
- [ ] Superadmin consegue ativar uma tabela em rascunho como vigente — a tabela vigente anterior
      automaticamente passa a histórica.
- [ ] Só existe uma tabela vigente por vez.
- [ ] Tabelas vigentes ou históricas não podem ser editadas diretamente — só duplicadas pra virar
      uma nova rascunho editável.
- [ ] Lista de tabelas mostra claramente o status de cada uma (rascunho/vigente/histórica) e
      quando cada uma foi ativada.
- [ ] Sistema impede ativar uma tabela sem preço do 1º totem ou sem ao menos uma faixa de
      transação definida.
- [ ] Sistema impede salvar faixas de transação com sobreposição ou lacuna entre elas.
- [ ] Essa tela só é visível/acessível pra role superadmin/admin da plataforma.

### Wireframe / Mockup
Nenhum mockup produzido ainda. Descrição textual: tela em duas partes — lista das tabelas
existentes (nome, status, data) no topo/lateral, e formulário de criação/edição reaproveitando o
padrão visual já usado em outras telas de cadastro do admin (ex. `ComboFormScreen.tsx`), com os
multiplicadores de totem como campos fixos e as faixas de transação como uma lista dinâmica
(adicionar/remover faixa, cada linha com intervalo + preço).

## QA Explorer

```gherkin
Feature: Cadastro e versionamento de tabelas de preço comercial
  Como superadmin/admin da plataforma Ordin
  Quero cadastrar e versionar tabelas de preço comercial
  Para ajustar o modelo comercial ao longo do tempo sem afetar retroativamente contratos já fechados

  Background:
    Dado um usuário autenticado com role "superadmin"

  Scenario: Superadmin cria uma nova tabela de preço em rascunho com dados válidos
    Quando o superadmin cria uma tabela "Tabela 2026-Q4" com preço do 1º totem R$249,00,
      multiplicador 0,5x pro 2º totem e 0,3x do 3º ao 5º totem
    E adiciona as faixas de transação 0-1.000 a R$0,12, 1.001-3.000 a R$0,10 e 3.001-7.500 a R$0,08
    E salva
    Então a tabela "Tabela 2026-Q4" é criada com status "Rascunho"
    E não afeta nenhum contrato existente

  Scenario: Criação de tabela sem preço do 1º totem é bloqueada
    Quando o superadmin tenta criar uma tabela sem definir o preço do 1º totem
    Então o sistema retorna erro de validação
    E nenhuma tabela é criada

  Scenario: Cadastro de faixas de transação sobrepostas é bloqueado
    Quando o superadmin tenta cadastrar as faixas 0-1.000 e 800-3.000 na mesma tabela
    Então o sistema retorna erro de validação de sobreposição de faixas
    E a tabela não é salva

  Scenario: Cadastro de faixas de transação com lacuna é bloqueado
    Quando o superadmin tenta cadastrar as faixas 0-1.000 e 1.500-3.000 na mesma tabela
    Então o sistema retorna erro de validação de lacuna entre faixas
    E a tabela não é salva

  Scenario: Superadmin edita livremente uma tabela em rascunho
    Dado a tabela "Tabela 2026-Q4" com status "Rascunho"
    Quando o superadmin altera o preço do 1º totem para R$259,00 e salva
    Então a tabela reflete o novo valor
    E continua com status "Rascunho"

  Scenario: Superadmin ativa a primeira tabela do sistema, sem nenhuma vigente ainda
    Dado nenhuma tabela de preço vigente no sistema
    E a tabela "Tabela 2026-Q4" com status "Rascunho" e dados completos
    Quando o superadmin ativa "Tabela 2026-Q4"
    Então "Tabela 2026-Q4" passa a ter status "Vigente"
    E é a única tabela vigente no sistema

  Scenario: Ativar uma nova tabela move a vigente anterior para histórica
    Dado a tabela "Tabela 2026-Q3" com status "Vigente"
    E a tabela "Tabela 2026-Q4" com status "Rascunho" e dados completos
    Quando o superadmin ativa "Tabela 2026-Q4", confirmando a substituição
    Então "Tabela 2026-Q4" passa a ter status "Vigente"
    E "Tabela 2026-Q3" passa a ter status "Histórica"
    E só existe uma tabela vigente no sistema

  Scenario: Ativação de nova tabela pede confirmação explícita de substituição
    Dado a tabela "Tabela 2026-Q3" com status "Vigente"
    E a tabela "Tabela 2026-Q4" com status "Rascunho" e dados completos
    Quando o superadmin inicia a ativação de "Tabela 2026-Q4" sem confirmar a substituição
    Então o sistema pede confirmação antes de efetivar a troca
    E "Tabela 2026-Q3" continua "Vigente" até a confirmação

  Scenario: Contrato preso a uma tabela antiga não é afetado pela troca de vigente
    Dado a tabela "Tabela 2026-Q3" com status "Vigente", referenciada por um contrato ativo
    E a tabela "Tabela 2026-Q4" com status "Rascunho" e dados completos
    Quando o superadmin ativa "Tabela 2026-Q4"
    Então o contrato ativo continua referenciando "Tabela 2026-Q3", agora "Histórica"
    E os valores usados por esse contrato não mudam

  Scenario: Ativação bloqueada sem preço do 1º totem definido
    Dado a tabela "Tabela Incompleta" com status "Rascunho" e sem preço de 1º totem
    Quando o superadmin tenta ativar "Tabela Incompleta"
    Então o sistema bloqueia a ativação com erro de validação
    E a tabela permanece "Rascunho"

  Scenario: Ativação bloqueada sem nenhuma faixa de transação cadastrada
    Dado a tabela "Tabela Incompleta" com status "Rascunho", com preço de 1º totem definido e sem
      nenhuma faixa de transação
    Quando o superadmin tenta ativar "Tabela Incompleta"
    Então o sistema bloqueia a ativação com erro de validação
    E a tabela permanece "Rascunho"

  Scenario: Tabela vigente não pode ser editada diretamente
    Dado a tabela "Tabela 2026-Q4" com status "Vigente"
    Quando o superadmin tenta editar o preço do 1º totem dessa tabela
    Então o sistema bloqueia a edição
    E a tabela permanece com os valores originais

  Scenario: Tabela histórica não pode ser editada diretamente
    Dado a tabela "Tabela 2026-Q3" com status "Histórica"
    Quando o superadmin tenta editar essa tabela
    Então o sistema bloqueia a edição

  Scenario: Superadmin duplica uma tabela vigente para editar uma cópia
    Dado a tabela "Tabela 2026-Q4" com status "Vigente"
    Quando o superadmin duplica "Tabela 2026-Q4"
    Então uma nova tabela é criada com status "Rascunho" e os mesmos valores
    E a tabela original "Tabela 2026-Q4" continua "Vigente" e inalterada

  Scenario: Tabela em rascunho pode ser excluída
    Dado a tabela "Tabela Descartada" com status "Rascunho"
    Quando o superadmin exclui "Tabela Descartada"
    Então a tabela não aparece mais na lista

  Scenario: Tabela vigente não pode ser excluída
    Dado a tabela "Tabela 2026-Q4" com status "Vigente"
    Quando o superadmin tenta excluir "Tabela 2026-Q4"
    Então o sistema bloqueia a exclusão

  Scenario: Tabela histórica não pode ser excluída
    Dado a tabela "Tabela 2026-Q3" com status "Histórica"
    Quando o superadmin tenta excluir "Tabela 2026-Q3"
    Então o sistema bloqueia a exclusão

  Scenario: Lista de tabelas mostra status e data de ativação de cada uma
    Dado as tabelas "Tabela 2026-Q3" (Histórica, ativada em 01/07/2026) e "Tabela 2026-Q4"
      (Vigente, ativada em 01/10/2026)
    Quando o superadmin acessa a lista de tabelas de preço
    Então vê "Tabela 2026-Q3" com status "Histórica" e data "01/07/2026"
    E vê "Tabela 2026-Q4" com status "Vigente" e data "01/10/2026"

  Scenario: Acesso negado para role owner/manager de empresa cliente
    Dado um usuário autenticado com role "owner" de uma empresa cliente
    Quando esse usuário tenta acessar a tela ou endpoint de tabelas de preço
    Então o sistema retorna erro 403
    E nenhuma tabela é exibida

  Scenario: Acesso negado sem autenticação
    Dado uma requisição sem token de autenticação
    Quando essa requisição tenta acessar o endpoint de tabelas de preço
    Então o sistema retorna erro 401
```

**Cobertura:** happy path (criação, edição de rascunho, ativação — inclusive o caso de primeira
tabela do sistema sem vigente anterior), bordas (troca de vigente com confirmação explícita,
proteção de contrato preso a tabela antiga, duplicação como único caminho de "editar" vigente/
histórica, exclusão permitida só em rascunho), erros de validação (1º totem ausente, faixa
ausente, faixas sobrepostas, faixas com lacuna) e controle de acesso (role errada → 403, sem
token → 401 — adaptação do cenário de isolamento multi-tenant padrão, já que esta história é
plataforma-level, não `company_id`-scoped). Aprovado pelo usuário em 2026-09-10.

## Solução Técnica

### Decisão de arquitetura a confirmar antes do resto (flagrado pelo Explorer)

**Recomendação: reaproveitar `company-service`, não criar serviço novo agora.** Motivo: já existe
a dependência `_require_platform_admin` nesse serviço (`ARQUITETURA.md` §1.2, aceita
`superadmin`/`admin`), então dá pra reusar o controle de acesso sem reimplementar. `PriceTable`
não tem `company_id` (é dado de plataforma, não de tenant) — isso quebra o padrão "toda tabela de
negócio tem `company_id` indexado" (`ARQUITETURA.md` §5), mas é uma exceção justificada: a regra
existe pra isolamento multi-tenant, e essa tabela não pertence a tenant nenhum. Ela simplesmente
não passa pelo `BaseRepository` nem pelo decorator `@require_company_scope` — usa query direta e
o dependency `_require_platform_admin` no lugar.

**Rota Kong nova, mesmo serviço:** `/commercial/*` → `company-service:8002`, separada de
`/companies/*` pra deixar claro na API que não é sobre uma empresa específica.

**Risco registrado, não bloqueante:** o domínio comercial (esta tabela + ORD-163 contrato +
fechamento/faturamento futuro) é conceitualmente diferente de "gestão de empresa/tenant" — se
crescer nas próximas histórias, vale reavaliar extrair um `billing-service` dedicado. Decisão de
reuso aqui é pragmática pro tamanho atual (2 tabelas), não definitiva.

### Serviços impactados
- `company-service`: novo módulo de tabela de preço comercial — 2 tabelas novas
  (`price_tables`, `price_table_transaction_tiers`), sem `company_id`, protegidas por
  `_require_platform_admin`.
- `frontend/admin`: nova tela "Tabelas de Preço", visível só quando o usuário logado tem role
  `superadmin`/`admin`.

### Endpoints

#### POST /commercial/price-tables
**Serviço:** company-service
**Auth:** JWT obrigatório | role: superadmin/admin (`_require_platform_admin`)

Request:
```json
{
  "name": "Tabela 2026-Q4",
  "totem_price_1": 249.00,
  "totem_multiplier_2": 0.5,
  "totem_multiplier_3_5": 0.3,
  "transaction_tiers": [
    {"min_transactions": 0, "max_transactions": 1000, "price_per_transaction": 0.12},
    {"min_transactions": 1001, "max_transactions": 3000, "price_per_transaction": 0.10},
    {"min_transactions": 3001, "max_transactions": null, "price_per_transaction": 0.08}
  ]
}
```

Response 201:
```json
{
  "id": 4,
  "name": "Tabela 2026-Q4",
  "status": "draft",
  "totem_price_1": 249.00,
  "totem_multiplier_2": 0.5,
  "totem_multiplier_3_5": 0.3,
  "transaction_tiers": [ "..." ],
  "created_at": "2026-09-10T14:00:00Z",
  "activated_at": null,
  "archived_at": null
}
```

Erros: `400` (faixas sobrepostas/com lacuna, valores negativos, `max_transactions` nulo fora da
última faixa), `401`, `403` (role diferente de superadmin/admin)

#### GET /commercial/price-tables
Lista todas as tabelas (qualquer status), resumo sem detalhar faixas. Mesma auth.

#### GET /commercial/price-tables/{id}
Detalhe completo, incluindo `transaction_tiers`. Mesma auth.

#### PUT /commercial/price-tables/{id}
Edita — só permitido com `status == draft`. Mesmo payload do POST. Mesma auth.
Erros: `409` (tabela não está em rascunho), `400` (mesmas validações do POST)

#### POST /commercial/price-tables/{id}/duplicate
Cria um novo rascunho com os mesmos valores da tabela de origem (origem pode ser
draft/active/historical). Mesma auth.
Response `201`: nova tabela, `status: "draft"`.

#### POST /commercial/price-tables/{id}/activate
Body: `{"confirm_replace": true}` — obrigatório se já existe uma tabela `active` (sem isso,
retorna `409` pedindo confirmação, cobrindo o cenário Gherkin de confirmação explícita). Mesma
auth.
Validações antes de ativar: `totem_price_1` presente, ao menos 1 `transaction_tier`.
Efeito (transação atômica): tabela alvo → `active`, `activated_at = now()`; tabela previamente
`active` (se houver) → `historical`, `archived_at = now()`.
Erros: `400` (dados incompletos pra ativação), `409` (já existe ativa e `confirm_replace` ausente)

#### DELETE /commercial/price-tables/{id}
Só permite com `status == draft`. Mesma auth.
Erros: `409` (tabela não está em rascunho)

### Migrations

`price_tables` (sem `company_id` — dado de plataforma, não de tenant):
```
id                     INTEGER PK AUTO_INCREMENT
name                   VARCHAR(120) NOT NULL
status                 ENUM('draft','active','historical') NOT NULL DEFAULT 'draft'
totem_price_1          DECIMAL(10,2) NOT NULL
totem_multiplier_2     DECIMAL(4,2) NOT NULL
totem_multiplier_3_5   DECIMAL(4,2) NOT NULL
created_at             DATETIME NOT NULL DEFAULT NOW()
activated_at           DATETIME NULL
archived_at            DATETIME NULL
created_by_user_id     INTEGER NULL   -- auditoria, sem FK cross-schema
```

`price_table_transaction_tiers`:
```
id                     INTEGER PK AUTO_INCREMENT
price_table_id         INTEGER NOT NULL REFERENCES price_tables(id) ON DELETE CASCADE
min_transactions       INTEGER NOT NULL
max_transactions       INTEGER NULL   -- NULL = faixa aberta, só permitido na última faixa
price_per_transaction  DECIMAL(6,4) NOT NULL
sort_order             INTEGER NOT NULL
UNIQUE (price_table_id, sort_order)
INDEX (price_table_id)
```

**MySQL/Aurora não tem partial unique index nativo** — não dá pra garantir "só 1 `active` por
vez" só via constraint de schema. A garantia é feita na aplicação, dentro de uma transação com
`SELECT ... FOR UPDATE` na tabela atualmente `active` antes de trocar (mesmo padrão já usado em
`collect_ticket` do order-service pra evitar dupla coleta). Risco registrado abaixo.

### Eventos de fila
Nenhum — CRUD administrativo síncrono. ORD-163, ao vincular contrato à tabela vigente, pode
precisar publicar evento quando a vigente muda (pra notificar algo), mas fica fora de escopo
aqui — decisão da Tech Explorer da ORD-163.

### Impacto em outros serviços
Nenhum nesta história — nenhum outro serviço consome tabela de preço ainda. Isso é o que a
ORD-163 vai fazer (novo modelo `Contract` referenciando `price_table_id`).

### Estimativa
- Backend: 3 pontos (2 tabelas + migrations, validação de faixas contíguas em transação, troca
  atômica de vigente com `FOR UPDATE`, 6 endpoints, reaproveitando `_require_platform_admin`)
- Frontend: 2 pontos (tela nova — lista + formulário com faixas dinâmicas — sem componente
  existente 100% reaproveitável, mas segue padrão visual já usado em outras telas de cadastro)

### Riscos
- **Concorrência na ativação:** dois superadmins ativando tabelas diferentes ao mesmo tempo
  poderia, sem lock adequado, deixar duas tabelas `active` simultaneamente. Mitigado com
  transação + `SELECT ... FOR UPDATE`, mesmo padrão já usado no order-service.
- **Unicidade de "1 tabela ativa" só garantida em nível de aplicação, não de schema** (limitação
  do MySQL/Aurora com partial unique index) — se o time achar insuficiente, alternativa mais
  forte é uma tabela `active_price_table` com linha única (`id` fixo) apontando o
  `price_table_id` atual. Não implementado por padrão nesta proposta — registrado pra decisão
  consciente.
- **Escolha de serviço (company-service vs. `billing-service` novo):** ver seção de decisão de
  arquitetura no topo — reavaliar se o domínio comercial crescer nas próximas histórias.
- **Faixa aberta (`max_transactions = NULL`) só é válida na última faixa** — validação de
  aplicação precisa impedir explicitamente uma faixa aberta no meio da lista, que quebraria a
  lógica de contiguidade.

**Aprovação final (2026-09-10):** usuário confirmou a solução técnica, incluindo a decisão de
reaproveitar `company-service` (com o risco de futura extração pra `billing-service` registrado,
não bloqueante) e a estimativa de 5 pontos (3 backend + 2 admin). Checklist completo de Explorer,
QA Explorer e Tech Explorer verificado — sem bloqueios não resolvidos. `Ready` — apta a entrar no
sprint backlog.
