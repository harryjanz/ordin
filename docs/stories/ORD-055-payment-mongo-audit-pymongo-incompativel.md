---
id: ORD-055
status: Done
fase: 4
sprint: null
responsavel: Backend SR
estimativa: 2 pontos
---

# ORD-055 — Audit de pagamento no MongoDB falha silenciosamente por incompatibilidade motor/pymongo

## Descrição
O payment-service tenta gravar cada evento de pagamento na coleção `payment_events` do MongoDB (`ordin_audit`) via `save_audit()` em `services/payment/infrastructure/mongo.py`. Hoje essa gravação falha em 100% dos casos: `motor==3.4.0` está pinado no `requirements.txt`, mas `pymongo` não está — o pip resolve `pymongo==4.17.0`, versão incompatível (motor 3.4.0 requer `pymongo>=4.5,<4.7`). O erro observado é `cannot import name '_QUERY_OPTIONS' from 'pymongo.cursor'`.

A falha é engolida silenciosamente: `_get_client()` captura a exceção, loga um `logger.warning` e retorna `None`, então `save_audit()` simplesmente não grava nada e a requisição de pagamento segue normalmente (retorna 201 com sucesso). Não há alerta visível fora do log do container. Validado em teste manual: transação `P043878` foi salva corretamente em MySQL (`fk_payment.transactions`), mas o banco `ordin_audit` no Mongo nunca chegou a ser criado.

## Persona
Compliance / Auditoria e Backend SR — a trilha de auditoria de pagamentos (requisito ligado a ORD-018 / ARQUITETURA.md §12) está incompleta sem que ninguém saiba.

## Contexto
Descoberto ao subir a stack local e rodar o fluxo de teste manual (login → PIN → pedido → pagamento) e conferir os logs de todos os serviços e o conteúdo do MongoDB. O payment-service reportou 201 em todas as chamadas, mascarando a falha de audit — só apareceu ao inspecionar `docker compose logs payment-service` linha a linha. Precisa de correção do pin de dependências (fixar `pymongo` compatível ou atualizar `motor`) e, possivelmente, de um sinal mais forte que warning-de-log quando o audit trail de pagamento não pode ser gravado (hoje indistinguível de uma falha transitória de rede).

---

## Explorer

## História
Como **Backend SR responsável pela confiabilidade do payment-service**, quero que a gravação do audit trail de pagamentos no MongoDB funcione de fato (ou falhe de forma visível), para que a trilha de auditoria exigida por ORD-018/ARQUITETURA.md §12 não fique incompleta sem que ninguém perceba.

### Contexto e motivação
`save_audit()` é chamado em dois pontos críticos do payment-service — confirmação de pagamento (`POST /payments`) e cancelamento (`POST /payments/{id}/cancel`) — e é o único registro detalhado do evento de pagamento (inclui `events: result.audit_events`, histórico do provider, `environment`, `provider_transaction_id`). O MySQL guarda apenas o estado final da transação, não o histórico de eventos do provider. Hoje esse histórico nunca é persistido em lugar nenhum: é gerado em memória e descartado, porque a conexão Mongo falha na inicialização e a função retorna silenciosamente. Isso é uma lacuna de auditoria (LGPD/PCI-DSS, citada como motivação em ORD-018) que existe desde que o serviço foi implantado com essas versões de dependência, sem qualquer sinalização em produção além de uma linha de `WARNING` no stdout do container.

### Personas afetadas
- **Backend SR / DevOps**: precisa de confiabilidade de infraestrutura — uma dependência quebrada não deveria compilar/subir silenciosamente
- **Compliance / Auditoria**: depende do audit trail completo de pagamentos para investigações e certificações futuras
- **Super admin**: se precisar investigar uma disputa de pagamento (chargeback, erro de provider), hoje só tem o status final no MySQL, sem o histórico de eventos do provider

### Fluxo principal
1. Cliente paga no totem → `POST /payments` no payment-service
2. Payment-service processa a transação com o provider (mock ou PayGo), atualiza o MySQL (`tx.status`, `tx.nsu`, etc.)
3. Payment-service chama `save_audit()` com o histórico de eventos, `provider_transaction_id`, `environment` e status final
4. `save_audit()` deveria persistir esse documento em `ordin_audit.payment_events` no MongoDB
5. Payment-service notifica order-service e publica evento na fila (`payment.approved`/`payment.refused`)
6. Resposta 201 retorna ao totem

### Fluxos alternativos / exceções
- **Cancelamento de pagamento** (`POST /payments/{id}/cancel`): mesmo problema, `save_audit()` chamado no passo final também falha silenciosamente
- **MongoDB genuinamente indisponível** (rede, container caído): mesmo comportamento hoje — falha silenciosa. Este ticket deve tornar esse caso visível também, não só o caso de incompatibilidade de versão

### Dependências
- Serviços envolvidos: `payment-service` apenas (auth/company/catalog/order não são afetados)
- Histórias bloqueantes: nenhuma. Relacionada a ORD-018 (audit log — já `Done`, mas cobre apenas auth/company via stdout, não payment via Mongo)
- Sem dependência de frontend — mudança é 100% backend/infraestrutura

### Critérios de aceite funcionais
- [ ] `pip install -r services/payment/requirements.txt` (e o build da imagem Docker) resolve uma combinação `motor`/`pymongo` compatível, sem warning de import quebrado
- [ ] Após `POST /payments`, um documento correspondente existe em `ordin_audit.payment_events` no MongoDB, com os mesmos campos hoje montados em `main.py:311-323`
- [ ] Após `POST /payments/{id}/cancel`, um documento correspondente existe em `ordin_audit.payment_events`, com os campos de `main.py:489-499`
- [ ] Se o Mongo estiver genuinamente indisponível (falha de rede/timeout), o erro é logado em nível `ERROR` (não `WARNING`) com contexto suficiente para alertar (transaction_id, order_ref) — e idealmente incrementa uma métrica/contador observável, sem quebrar o fluxo de pagamento (audit continua best-effort, não bloqueante)
- [ ] Teste automatizado cobre: (a) audit gravado com sucesso em pagamento aprovado, (b) audit gravado com sucesso em cancelamento, (c) falha de conexão Mongo não derruba a resposta HTTP do pagamento

### Wireframe / Mockup
N/A — história é 100% backend/infraestrutura, sem impacto em UI.

---

## QA Explorer

```gherkin
Feature: Auditoria de pagamentos persistida no MongoDB
  Como Backend SR / Compliance
  Quero que todo evento de pagamento seja gravado de forma confiável em ordin_audit.payment_events
  Para manter a trilha de auditoria completa e não perder eventos silenciosamente

  Background:
    Dado que o payment-service está no ar com motor e pymongo em versões compatíveis
    E o MongoDB está acessível em MONGO_URL

  Scenario: Pagamento aprovado grava audit no Mongo (happy path)
    Dado um pedido "P100001" pendente de pagamento
    Quando o totem envia POST /payments com method=credit e amount=25.90
    Então a resposta é 201 com status=approved
    E existe em ordin_audit.payment_events um documento com transaction_id igual ao da transação criada
    E o documento contém order_ref="P100001", provider, environment, method, amount e final_status="approved"

  Scenario: Cancelamento de pagamento grava audit no Mongo
    Dado uma transação aprovada existente para o pedido "P100002"
    Quando é chamado POST /payments/{id}/cancel com reason="solicitado pelo cliente"
    Então a resposta é 200 e o order-service é notificado como "cancelled"
    E existe em ordin_audit.payment_events um documento com final_status="cancelled" e reason="solicitado pelo cliente" no campo events

  Scenario: Falha de conexão Mongo não derruba o pagamento, mas é logada como erro visível
    Dado que o MongoDB está inacessível (rede indisponível ou credenciais inválidas)
    Quando o totem envia POST /payments com dados válidos
    Então a resposta ainda é 201 com o status real da transação (o pagamento não falha por causa do audit)
    E é emitida uma linha de log em nível ERROR contendo transaction_id e order_ref
    E o MySQL (fk_payment.transactions) reflete o status correto da transação, independente do Mongo

  Scenario: Build da imagem falha (ou alerta) se motor/pymongo forem incompatíveis
    Dado o requirements.txt do payment-service
    Quando o ambiente é construído (pip install / docker build)
    Então a combinação de versões resolvida de motor e pymongo é mutuamente compatível
    E um teste de smoke (import motor.motor_asyncio; AsyncIOMotorClient(...)) não lança ImportError

  Scenario: Auditoria não vaza dados entre empresas (isolamento multi-tenant)
    Dado transações de pagamento pertencentes à empresa 1 (Burger House) e à empresa 2 (Pasta & Co)
    Quando os documentos de audit são consultados filtrando por company_id=1
    Então apenas documentos com company_id=1 são retornados
    E nenhum documento de company_id=2 aparece no resultado
```

**Cenários revisados e aprovados pelo PM** — cobre happy path (pagamento e cancelamento), cenário de borda (Mongo indisponível em runtime, distinto do bug de versão), cenário de build/dependência (raiz do problema atual) e isolamento multi-tenant (obrigatório por convenção do projeto, ORD-017).

---

## Tech Explorer

### Serviços impactados
- **payment-service**: único serviço afetado. Mudança em `requirements.txt`, `infrastructure/mongo.py`, e testes em `tests/`.

### Diagnóstico técnico confirmado
```
motor==3.4.0 (pinado em services/payment/requirements.txt e services/requirements.txt)
pymongo (não pinado) → resolvido para 4.17.0 no build atual
```
`motor==3.4.0` depende internamente de símbolos privados de `pymongo.cursor` (`_QUERY_OPTIONS`) que foram removidos/renomeados em versões recentes do pymongo (a partir da linha 4.7+). Resultado: `ImportError` capturado em `_get_client()` (`infrastructure/mongo.py:21-23`), que retorna `None` e faz `save_audit()` (linha 26-35) sair silenciosamente no `if client is None: return`.

### Opções de correção avaliadas
1. **Pinar `pymongo` compatível com motor 3.4.0** (`pymongo>=4.5,<4.7`) — menor risco, não muda comportamento do driver assíncrono, mas fixa uma versão mais antiga do pymongo.
2. **Atualizar `motor` para uma versão compatível com pymongo 4.17** — motor 3.5+ ainda depende de PyMongo <4.9; para pymongo 4.17 é necessário migrar para a API assíncrona nativa do PyMongo 4.9+ (`pymongo.asynchronous`), que descontinua o pacote `motor` (arquivado pela MongoDB em 2026). É a opção "correta" a médio prazo, mas maior escopo/risco para este ticket.

**Decisão:** opção 1 para este ticket (pin `pymongo>=4.5,<4.7,<5` junto de `motor==3.4.0`), por ser a correção mínima e reversível do bug reportado. Migrar para a API assíncrona nativa do PyMongo fica registrado como débito técnico separado (não bloqueia este ticket).

### Endpoints
Nenhum endpoint novo ou com contrato alterado — `POST /payments` e `POST /payments/{id}/cancel` mantêm request/response atuais. A mudança é inteiramente de infraestrutura (dependências) e de robustez de log em `infrastructure/mongo.py`.

### Mudanças de código

**`services/payment/requirements.txt` e `services/requirements.txt`:**
```
motor==3.4.0
pymongo>=4.5,<4.7
```

**`services/payment/infrastructure/mongo.py`** — elevar o nível de log da falha de conexão/gravação de `warning` para `error`, incluindo contexto do documento quando disponível, para que passe a ser visível em qualquer pipeline de alerta baseado em nível de log (hoje WARNING é tipicamente filtrado):
```python
except Exception as exc:
    logger.error("MongoDB: falha ao salvar audit — transaction_id=%s order_ref=%s — %s",
                 document.get("transaction_id"), document.get("order_ref"), exc)
```
Mantém o comportamento best-effort (não lança exceção, não derruba a resposta HTTP do pagamento) — só muda a severidade e o contexto do log.

### Migrations
Nenhuma. MongoDB não usa Alembic; `ordin_audit.payment_events` é criado implicitamente no primeiro `insert_one`.

### Eventos de fila
Não aplicável — esta história não publica nem consome eventos SQS/RabbitMQ.

### Impacto em outros serviços
Nenhum. `save_audit()` é interno ao payment-service; nenhum outro serviço lê `ordin_audit.payment_events` hoje.

### Testes
- `tests/test_mongo_audit.py` (novo): mock de `motor.motor_asyncio.AsyncIOMotorClient`, cobrindo os 3 cenários Gherkin de gravação/falha
- Teste de smoke de import (`import motor.motor_asyncio` seguido de instanciar `AsyncIOMotorClient` contra Mongo real do `docker-compose.yml` de teste) para pegar regressões futuras de incompatibilidade de versão antes que cheguem a produção — sugerido como step do CI (`ruff`/`pytest`) já existente, não como pipeline novo

### Estimativa
- Backend: 2 pontos (correção de pin + log level + testes). Sem frontend.

### Riscos
- **Baixo**: fixar `pymongo<4.7` pode conflitar com outra dependência transitiva do projeto que exija pymongo mais novo — mitigar rodando `pip install -r services/requirements.txt` completo (todos os serviços compartilham o mesmo requirements base) antes de merge, não só o do payment-service isolado.
- **Débito técnico registrado, não bloqueante**: pacote `motor` está em processo de descontinuação pela MongoDB em favor da API assíncrona nativa do PyMongo — este pin é uma correção tática; migração para `pymongo.asynchronous` deve virar história própria quando o projeto atualizar o driver.

---

## Ready

### Checklist de entrada

**Explorer (PM + Produto)**
- [x] História no formato *Como [persona], quero [ação], para [benefício]*
- [x] Contexto e motivação documentados
- [x] Fluxo principal descrito passo a passo
- [x] Dependências com outros serviços identificadas (nenhuma — só payment-service)
- [x] Wireframe/mockup — N/A (sem impacto em UI)
- [x] Critérios de aceite funcionais escritos

**QA Explorer (QA)**
- [x] Happy path em Gherkin (pagamento aprovado)
- [x] Cenários de borda em Gherkin (Mongo indisponível em runtime; incompatibilidade de build)
- [x] Cenários de erro em Gherkin
- [x] Cenário de isolamento multi-tenant incluído
- [x] Cenários aprovados pelo PM

**Tech Explorer (Backend)**
- [x] Serviços impactados documentados (payment-service apenas)
- [x] Mudanças de dependências e código documentadas com localização exata (`requirements.txt`, `infrastructure/mongo.py`)
- [x] Migrations necessárias descritas (nenhuma)
- [x] Eventos de fila documentados (nenhum aplicável)
- [x] Estimativa de esforço definida (2 pontos)
- [x] Riscos identificados com mitigação

**Aprovação final**
- [x] Solução técnica definida (pin de `pymongo>=4.5,<4.7` + elevar log a ERROR)
- [x] Estimativa acordada (2 pontos)
- [x] Sem bloqueios não resolvidos
- [ ] Priorização no sprint backlog — pendente de decisão do time (não priorizada por este processo automatizado)

**Status: Ready** — apta a entrar em sprint. Falta apenas a priorização/alocação de sprint, que é decisão de time fora do escopo deste upstream.
