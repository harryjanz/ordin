---
id: ORD-163
status: In Progress
estimativa: 4,5 pontos (3 backend + 1,5 admin)
tipo: feature
fase: null
sprint: null
responsavel: Backend SR + Frontend
---

# ORD-163 — Contrato de empresa vinculado à tabela de preço vigente, com vencimento anual e renovação

## Descrição
Cada empresa cliente do Ordin precisa ter um "contrato" — registro que vincula a empresa à tabela
de preço comercial (ORD-163 depende de ORD-162 existir) que estava vigente no momento da
assinatura, com uma data de vencimento anual. Ao vencer, o contrato renova e passa a referenciar a
tabela que estiver vigente naquele momento (que pode ter mudado desde a assinatura original ou a
última renovação). Hoje não existe conceito de "contrato" no sistema — é modelo de dado novo.

## Persona
- **superadmin/admin da plataforma Ordin** — associa/visualiza o contrato de uma empresa,
  acompanha vencimentos.
- **owner/manager de empresa cliente** — não necessariamente interage diretamente com essa tela
  nesta primeira versão (a definir no Explorer), mas é quem o contrato representa comercialmente.

## Contexto
Derivada da ORD-162 (Explorer, 2026-09-10) — decisão de PM de separar "tabela de preço" (entidade
sem dono de empresa, configuração interna da Ordin) de "contrato" (entidade pertencente a uma
empresa cliente, que referencia uma tabela). Depende da ORD-162 estar pelo menos com o modelo de
tabela definido (não necessariamente `Ready`/implementada, mas o desenho de dado precisa existir).

**Pergunta em aberto que esta história precisa responder no Explorer, ainda não resolvida:** o que
"renovar" significa concretamente sem nenhum evento de cobrança/fechamento acontecendo ainda —
fechamento e faturamento foram explicitamente deixados de fora do escopo desta rodada pelo
usuário. Possibilidades a avaliar no Explorer: (a) renovação é só a re-atribuição da tabela vigente
na data de vencimento, sem nenhum efeito financeiro ainda (billing vem depois, em tema futuro);
(b) a renovação precisa de alguma ação manual do superadmin (confirma renovação); (c) processo
automático via job agendado. Também não decidido: onde/quando o contrato é criado pela primeira
vez — provável candidato é o fluxo já existente de aprovação de empresa no `company-service`, a
confirmar.

Sem histórias-irmãs adicionais identificadas até aqui além desta e da ORD-162. Controle de custo
por cliente e fechamento/cobrança/faturamento continuam fora de escopo, registrados como temas
futuros dependentes desta base (ORD-162 + ORD-163).

## Explorer

**Resolução da pergunta em aberto (PM, 2026-09-10):** renovação nesta primeira versão é **ação
manual do superadmin, sem job agendado**. O projeto não tem hoje nenhuma infraestrutura de
cron/scheduler, e sem nenhum evento de cobrança de verdade acontecendo (fechamento/faturamento é
tema futuro), automatizar a renovação agora adicionaria complexidade sem benefício real —
"renovar" aqui é só reatribuir a tabela de preço vigente e empurrar a data de vencimento.
Automação pode ser revisitada quando o tema de cobrança existir de fato, porque nesse ponto
"renovar" provavelmente vai precisar disparar um evento financeiro de qualquer forma. Também
resolvido: o contrato é criado automaticamente **no momento em que a empresa é criada** por um
superadmin (fluxo já existente de CRUD de `Company`) — não há um "fluxo de aprovação" separado de
empresa na arquitetura atual, é criação direta.

### História
Como superadmin/admin da plataforma Ordin, quero que cada empresa cliente tenha um contrato
vinculado à tabela de preço vigente no momento da assinatura, com vencimento anual e renovação
manual, para poder reajustar o modelo comercial ao longo do tempo sem alterar retroativamente o
que uma empresa já contratada está pagando, até ela renovar.

### Fluxo principal
1. Superadmin cria uma nova empresa no admin (fluxo já existente de CRUD de `Company`).
2. No momento da criação, o sistema busca a tabela de preço `active` (ORD-162) e cria
   automaticamente um `Contract` pra essa empresa: `price_table_id` = tabela ativa,
   `started_at = now()`, `expires_at = now() + 1 ano`.
3. Superadmin acessa a lista/detalhe de empresas no admin e vê, junto com os dados da empresa, o
   status do contrato (**Ativo** ou **Vencido** — calculado comparando `expires_at` com a data
   atual, não armazenado) e qual tabela de preço está vinculada.
4. Quando decidir (vencido ou não — renovação antecipada é permitida), superadmin aciona
   "Renovar" no contrato daquela empresa.
5. Sistema reatribui `price_table_id` pra tabela `active` **naquele momento** (pode ser diferente
   da original), registra `renewed_at = now()`, e recalcula `expires_at = now() + 1 ano`.
6. Owner/manager da empresa cliente, no próprio painel, visualiza (somente leitura) a tabela de
   preço vinculada ao contrato e a data de vencimento.

### Fluxos alternativos / exceções
- Superadmin tenta criar uma empresa sem nenhuma tabela de preço `active` no sistema → bloqueado,
  erro orientando a configurar/ativar uma tabela de preço primeiro (dependência direta da
  ORD-162).
- Renovação antecipada (contrato ainda não vencido) → permitida; reatribui a tabela vigente e
  empurra o vencimento normalmente, não é tratada como erro.
- Tabela vigente no momento da renovação é a mesma da assinatura original (preço não mudou) →
  renovação funciona normalmente, só atualiza `renewed_at`/`expires_at`.
- Owner/manager tenta editar o próprio contrato → bloqueado, role só tem leitura.
- Owner/manager tenta visualizar contrato de outra empresa → bloqueado (isolamento multi-tenant).

### Dependências
- Serviços envolvidos: `company-service` (nova tabela `contracts`, com `company_id`; extensão do
  fluxo de criação de `Company` pra criar o contrato junto).
- Frontend: `frontend/admin` — tela de empresa (superadmin) ganha seção "Contrato" com status,
  tabela vinculada e botão "Renovar"; painel da empresa cliente (owner/manager) ganha visão
  somente-leitura do próprio contrato.
- **Histórias bloqueantes:** ORD-162 (`Ready`) — precisa existir ao menos uma `price_table` com
  status `active` pra qualquer contrato poder ser criado.

### Critérios de aceite funcionais
- [ ] Ao criar uma nova empresa, o sistema cria automaticamente um contrato vinculado à tabela de
      preço `active` no momento, com vencimento em 1 ano a partir da criação.
- [ ] Criar empresa é bloqueado se não existir nenhuma tabela de preço `active` no sistema, com
      mensagem orientando a configurar uma primeiro.
- [ ] Superadmin visualiza, pra cada empresa, o status do contrato (Ativo/Vencido, calculado pela
      data de vencimento) e a tabela de preço vinculada.
- [ ] Superadmin consegue renovar um contrato (vencido ou não) — a ação reatribui a tabela
      `active` no momento da renovação e empurra o vencimento pra 1 ano à frente, registrando a
      data da renovação.
- [ ] Renovação funciona corretamente mesmo quando a tabela vigente no momento é a mesma da
      assinatura original.
- [ ] Owner/manager da empresa cliente visualiza (somente leitura) a tabela de preço vinculada ao
      próprio contrato e a data de vencimento, sem conseguir editar.
- [ ] Isolamento: owner/manager de uma empresa não visualiza contrato de outra empresa.

### Wireframe / Mockup
Nenhum mockup produzido ainda. Descrição textual: a tela de detalhe de empresa já existente no
admin (visão superadmin) ganha uma seção "Contrato" mostrando tabela de preço vinculada, status
(badge Ativo/Vencido) e data de vencimento, com botão "Renovar" (só visível pra superadmin/admin).
O painel da empresa cliente (owner/manager) ganha um card equivalente, mas somente leitura, sem o
botão de renovar.

## QA Explorer

```gherkin
Feature: Contrato de empresa vinculado à tabela de preço vigente, com vencimento anual e renovação
  Como superadmin/admin da plataforma Ordin
  Quero que cada empresa cliente tenha um contrato vinculado à tabela de preço vigente
  Para reajustar o modelo comercial ao longo do tempo sem alterar retroativamente quem já contratou

  Background:
    Dado um usuário autenticado com role "superadmin"
    E a tabela de preço "Tabela A" com status "active"

  Scenario: Criar empresa gera contrato automaticamente vinculado à tabela vigente
    Quando o superadmin cria a empresa "Burger House"
    Então um contrato é criado pra "Burger House" vinculado à "Tabela A"
    E o contrato tem status "Ativo"
    E o vencimento é 1 ano a partir da data de criação

  Scenario: Criar empresa é bloqueado sem nenhuma tabela de preço vigente
    Dado nenhuma tabela de preço com status "active" no sistema
    Quando o superadmin tenta criar a empresa "Pasta & Co"
    Então o sistema bloqueia a criação
    E retorna erro orientando a configurar uma tabela de preço vigente primeiro
    E nenhuma empresa nem contrato são criados

  Scenario: Contrato dentro do prazo aparece como Ativo
    Dado o contrato de "Burger House" com vencimento daqui a 6 meses
    Quando o superadmin consulta o contrato de "Burger House"
    Então o status exibido é "Ativo"

  Scenario: Contrato com vencimento no passado aparece como Vencido
    Dado o contrato de "Burger House" com vencimento há 10 dias
    Quando o superadmin consulta o contrato de "Burger House"
    Então o status exibido é "Vencido"

  Scenario: Contrato criado antes de uma nova tabela vigente continua na tabela original até renovar
    Dado o contrato de "Burger House" vinculado à "Tabela A" (vigente no momento da criação)
    Quando a "Tabela B" é ativada, tornando "Tabela A" histórica
    Então o contrato de "Burger House" continua vinculado à "Tabela A"
    E os valores usados pelo contrato não mudam

  Scenario: Superadmin renova um contrato vencido
    Dado o contrato de "Burger House" vinculado à "Tabela A", vencido
    E a "Tabela B" com status "active"
    Quando o superadmin renova o contrato de "Burger House"
    Então o contrato passa a referenciar "Tabela B"
    E o vencimento é recalculado pra 1 ano a partir da renovação
    E a data de renovação é registrada
    E o status do contrato passa a ser "Ativo"

  Scenario: Renovação antecipada de contrato ainda ativo é permitida
    Dado o contrato de "Burger House" vinculado à "Tabela A", com status "Ativo" (vencimento daqui a 3 meses)
    E a "Tabela B" com status "active"
    Quando o superadmin renova o contrato de "Burger House" antes do vencimento
    Então o contrato passa a referenciar "Tabela B"
    E o vencimento é recalculado pra 1 ano a partir da renovação

  Scenario: Renovação quando a tabela vigente é a mesma da assinatura original
    Dado o contrato de "Burger House" vinculado à "Tabela A", vencido
    E "Tabela A" continua com status "active"
    Quando o superadmin renova o contrato de "Burger House"
    Então o contrato continua referenciando "Tabela A"
    E o vencimento é recalculado pra 1 ano a partir da renovação

  Scenario: Owner visualiza o próprio contrato em modo leitura
    Dado um usuário autenticado com role "owner" da empresa "Burger House"
    E o contrato de "Burger House" vinculado à "Tabela A"
    Quando esse usuário consulta o próprio contrato
    Então vê a tabela de preço vinculada e a data de vencimento
    E nenhuma opção de edição ou renovação é exibida

  Scenario: Owner não consegue editar ou renovar o próprio contrato
    Dado um usuário autenticado com role "owner" da empresa "Burger House"
    Quando esse usuário tenta acionar a renovação do próprio contrato
    Então o sistema retorna erro 403
    E o contrato permanece inalterado

  Scenario: Isolamento multi-tenant — owner não visualiza contrato de outra empresa
    Dado um usuário autenticado com role "owner" da empresa "Pasta & Co"
    Quando esse usuário tenta consultar o contrato da empresa "Burger House"
    Então o sistema retorna erro 403

  Scenario: Acesso negado sem autenticação
    Dado uma requisição sem token de autenticação
    Quando essa requisição tenta acessar o endpoint de contrato
    Então o sistema retorna erro 401
```

**Cobertura:** happy path (criação de empresa gerando contrato, renovação padrão), bordas
(status calculado Ativo/Vencido, contrato não afetado por troca de tabela vigente até renovar —
o cenário mais crítico da história, valida a garantia comercial central —, renovação antecipada,
renovação sem mudança de tabela), erro de validação (criar empresa sem tabela vigente) e controle
de acesso (owner somente-leitura, sem renovar; isolamento entre empresas; sem token). Aprovado
pelo usuário em 2026-09-10.

## Solução Técnica

**Nota de nomenclatura (2026-09-11, antes de implementar):** durante a ORD-162 descobrimos que já
existe `CompanyContractScreen` (`/companies/:id/contract`) — o contrato **jurídico** da empresa
(upload de PDF, `infrastructure/contract_storage`). Pra não colidir conceitualmente, o modelo e as
rotas técnicas desta história usam **`CompanyPlan`/`company_plans`/`/plan`** em vez de
`Contract`/`contracts`/`/contract`. O termo "contrato" nas seções de negócio acima (História,
Explorer, QA) continua correto como linguagem de produto — é só o nome técnico que muda, pra não
colidir com o outro model/tela já existente.

### Serviços impactados
- `company-service`: nova tabela `company_plans` (com `company_id`); extensão transacional do
  endpoint de criação de empresa (`POST /companies`, já existente) pra criar o plano junto; dois
  endpoints novos (consulta + renovação). Reaproveita `_require_platform_admin` (ORD-162) pra
  renovação, e o dependency de auth padrão (`TokenPayload`, `services/shared/auth.py`) pra
  consulta com regra de acesso condicional por role.
- `frontend/admin`: tela de detalhe de empresa (visão superadmin) ganha seção "Plano comercial";
  painel da empresa cliente (owner/manager) ganha card equivalente, somente leitura.

### Endpoints

#### POST /companies (alterado — endpoint já existente de criação de empresa)
**Serviço:** company-service
**Auth:** JWT obrigatório | role: superadmin/admin

Mudança de comportamento, sem mudança de payload de entrada: antes de criar a empresa, o handler
busca `price_tables` com `status='active'` **dentro da mesma transação** (evita corrida com uma
ativação/troca concorrente — mesmo cuidado que o bug corrigido na revisão da ORD-162). Se não
existir, aborta antes de criar qualquer coisa. Se existir, cria `Company` e, na mesma transação,
cria o `CompanyPlan` vinculado: `price_table_id = tabela ativa`, `started_at = now()`,
`expires_at = now() + 1 ano`.

Erro novo: `400` — `"Nenhuma tabela de preço vigente configurada. Configure uma tabela de preço
antes de criar empresas."` (cenário Gherkin de bloqueio de criação).

#### GET /companies/{company_id}/plan
**Serviço:** company-service
**Auth:** JWT obrigatório
**Regra de acesso:** role `superadmin`/`admin` → qualquer `company_id`. Role `owner`/`manager` →
só se `company_id` do path bate com o `company_id` do próprio JWT (senão `403` — isolamento
multi-tenant, cenário Gherkin correspondente).

Response `200`:
```json
{
  "company_id": 12,
  "price_table": { "id": 4, "name": "Tabela 2026-Q4" },
  "started_at": "2026-01-15T10:00:00Z",
  "expires_at": "2027-01-15T10:00:00Z",
  "renewed_at": null,
  "status": "Ativo"
}
```
`status` é **calculado na resposta** (`"Ativo"` se `expires_at > now()`, senão `"Vencido"`), nunca
armazenado — evita staleness sem precisar de job pra manter atualizado.

Erros: `401`, `403` (role sem permissão pra esse `company_id`), `404` (empresa sem plano —
defensivo, não deveria acontecer se toda criação de empresa sempre gera um).

#### POST /companies/{company_id}/plan/renew
**Serviço:** company-service
**Auth:** JWT obrigatório | role: superadmin/admin (`_require_platform_admin`, reaproveitado da
ORD-162)

Sem payload — a ação busca a `price_table` `active` no momento e atualiza o plano:
`price_table_id = tabela ativa`, `renewed_at = now()`, `expires_at = now() + 1 ano`. Permitida
independente do plano estar vencido ou não (renovação antecipada, cenário Gherkin correspondente).

Response `200`: mesmo shape do `GET`, já refletindo os novos valores.

Erros: `400` (nenhuma tabela `active` no momento — defensivo), `403` (role diferente de
superadmin/admin), `404` (empresa sem plano).

### Migrations

`company_plans` (com `company_id` — é dado de tenant, diferente de `price_tables`):
```
id                 INTEGER PK AUTO_INCREMENT
company_id         INTEGER NOT NULL UNIQUE
price_table_id     INTEGER NOT NULL
started_at         DATETIME NOT NULL
expires_at         DATETIME NOT NULL
renewed_at         DATETIME NULL
created_at         DATETIME NOT NULL DEFAULT NOW()
INDEX (company_id)
INDEX (price_table_id)
```
Sem `ForeignKey` real — mesmo padrão de integridade referencial em nível de aplicação já usado no
resto do company-service (confirmado na ORD-162). `company_id UNIQUE` — modelo assume **1 plano
por empresa nesta versão** (renovação é `UPDATE` in-place no mesmo registro, não cria um novo).
Ver risco de histórico de renovações abaixo.

### Eventos de fila
Nenhum — criação/renovação de contrato é síncrona, dentro da mesma transação da criação de
empresa (create) ou uma chamada direta do superadmin (renew). Não há necessidade de propagação
assíncrona identificada nesta história.

### Impacto em outros serviços
Nenhum — `price_tables` e `company_plans` vivem no mesmo serviço (`company-service`), então a
checagem de tabela ativa na criação de empresa é uma query no mesmo processo/transação, sem
chamada HTTP entre serviços. Benefício direto da decisão de reuso de serviço já tomada na
ORD-162.

### Estimativa
- Backend: 3 pontos (tabela + migration, extensão transacional de `POST /companies`, endpoint de
  consulta com regra de acesso condicional por role, endpoint de renovação)
- Frontend: 1,5 pontos (seção de contrato na tela de empresa do admin + card somente-leitura no
  painel da empresa cliente — telas já existem, é extensão, não tela nova do zero)

### Riscos
- **Sem histórico de renovações**: cada renovação sobrescreve `price_table_id`/`renewed_at`/
  `expires_at` no mesmo registro — não fica registrado "quais tabelas esse contrato já teve ao
  longo do tempo". Isso é uma decisão consciente pra manter esta história simples (o usuário
  pediu só tabela × contrato × vencimento), mas é um risco real olhando pra frente: os temas
  futuros de controle de custo e fechamento/faturamento provavelmente vão precisar reconstruir
  "quanto essa empresa pagou em cada período", o que exige histórico. Se isso for confirmado como
  necessidade real, a solução é uma tabela `company_plan_renewals` (histórico append-only) numa
  história futura — não implementada aqui por escopo, registrada pra decisão consciente.
- **Transação atômica na criação de empresa**: criar `Company` + `CompanyPlan` precisa acontecer
  na mesma transação (rollback conjunto se qualquer parte falhar) — mesmo padrão já usado em
  outros fluxos multi-tabela do projeto.
- **Corrida entre criação de empresa e troca de tabela vigente**: mitigada lendo a tabela `active`
  dentro da mesma transação da criação da empresa (não antes, numa query separada) — evita cenário
  raro de criar plano vinculado a uma tabela que virou histórica um instante depois.
- **Corrida na ativação de tabela de preço em si**: já corrigida na ORD-162 (lock em todas as
  linhas de `price_tables`, não só nas `active`) — essa história não precisa repetir a mitigação,
  só se beneficia dela.
- **`company_id UNIQUE` em `company_plans`** assume que uma empresa nunca tem mais de um plano
  simultâneo — consistente com o escopo atual (renovação é update, não criação de novo registro),
  mas fecha a porta pra modelos futuros de múltiplos planos por empresa (ex. downgrade/upgrade no
  meio do período) sem migration adicional. Aceitável pro escopo de hoje.

**Aprovação final (2026-09-10):** usuário confirmou a solução técnica, incluindo o risco de
ausência de histórico de renovações (decisão consciente, revisitar quando o tema de custo/
faturamento chegar) e a estimativa de 4,5 pontos (3 backend + 1,5 admin). Checklist completo de
Explorer, QA Explorer e Tech Explorer verificado — sem bloqueios não resolvidos. `Ready` — apta a
entrar no sprint backlog, dependente da ORD-162 (também `Ready`).
