# Papel: Quality Assurance

## Responsabilidades no Ordin

- Definir e implementar a estratégia de testes por serviço e por camada
- Escrever e revisar casos de teste (unitários, integração, E2E)
- Garantir que o CI bloqueia merge com testes falhando ou cobertura abaixo do mínimo
- Identificar e documentar cenários de borda não cobertos
- Validar comportamento em condições de concorrência (SELECT FOR UPDATE, rate limiting)

## Critérios de aceite para merge (CI gates)

| Critério | Valor mínimo |
|---|---|
| Cobertura de linhas por serviço backend | 80% |
| Testes failing | 0 |
| Lint (ruff) | sem erros |
| Build Docker | deve passar |

## Configuração de testes por serviço (backend)

Cada serviço tem `pyproject.toml` com:

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]

[tool.coverage.run]
source = ["app"]
omit = ["app/infrastructure/database/*/models.py"]

[tool.coverage.report]
fail_under = 80
```

Banco de teste isolado: `fk_<servico>_test`. Fixture de session scope roda `alembic upgrade head` e registra teardown com `alembic downgrade base`.

## Fluxos críticos e casos de teste prioritários

### 1. Happy path completo (integração E2E)
- **Dado** empresa ativa com PIN `1234` e terminal `T1`
- **Quando** totem faz login com PIN `1234` + terminal `T1`
- **E** cria pedido com 2 unidades de produto X
- **E** processa pagamento TEF (aprovado)
- **E** operador coleta todos os 2 tickets
- **Então** pedido tem status `completed`

### 2. Rate limiting de PIN (unitário + integração)
- **Dado** IP `1.2.3.4` fazendo requisições para `/auth/pin-login`
- **Quando** envia 5 PINs inválidos consecutivos
- **Então** 6ª requisição retorna 429 com header `X-RateLimit-Blocked: true`
- **E** Redis tem chave `pin_blocked:1.2.3.4` com TTL de 900s

### 3. Anti-dupla-coleta (integração com concorrência)
- **Dado** ticket `ABC123` com status `printed`
- **Quando** duas requisições simultâneas fazem `POST /tickets/ABC123/collect`
- **Então** exatamente uma retorna 200 e a outra retorna 409
- **E** ticket tem status `collected` com `collected_at` preenchido

### 4. Pedido concluído atomicamente
- **Dado** pedido com 3 tickets (2 já coletados)
- **Quando** o 3º ticket é coletado
- **Então** resposta inclui `"order_completed": true`
- **E** `order.status` é `completed` no banco

### 5. Pagamento recusado (integração)
- **Dado** pagamento processado com `status: refused`
- **Então** `order.status` permanece `pending` (não muda para `paid`)
- **E** nenhum evento de notificação é disparado

### 6. Cancelamento de pagamento
- **Dado** transação `TX1` com `status: approved` e `order_ref: P123456`
- **Quando** `POST /payments/TX1/cancel`
- **Então** `TX1.status = cancelled`
- **E** `order P123456.status = cancelled`

## Estrutura de testes por serviço

```
services/<nome>/tests/
  unit/
    domain/         → entidades, regras de negócio puras
    application/    → casos de uso com dependências mockadas
  integration/
    api/            → endpoints com banco de teste real
  conftest.py       → fixtures: db session, httpx client, factory-boy factories
```

## Evidências de teste (E2E e QA manual)

Toda evidência de execução de teste — screenshots, vídeos e traces do Playwright, e prints de validação manual de QA — é salva **dentro do repositório**, nunca em diretório temporário fora do projeto:

```
docs/stories/<ID>/evidencias/
  e2e/       screenshots, vídeos e traces do Playwright
  manual/    prints de validação manual (quando o cenário ainda não está automatizado)
```

`<ID>` é o código curto da história (ex: `ORD-060`), não o slug completo do arquivo `.md` da história.

`playwright.config.ts` de cada frontend aponta `outputDir` para essa pasta via variável de ambiente `ORD_ID`, definida antes de rodar a suíte:

```bash
ORD_ID=ORD-060 npx playwright test
```

```ts
// playwright.config.ts
export default defineConfig({
  outputDir: `../../docs/stories/${process.env.ORD_ID}/evidencias/e2e`,
  use: { screenshot: "only-on-failure", trace: "retain-on-failure" },
});
```

Essa pasta faz parte do PR da história — evidência de teste é entregável, não artefato descartável. Regra vale tanto para execução automatizada (CI/local) quanto para prints tirados manualmente durante o step **QA** do downstream (`docs/WORKFLOW.md`).

## Slash command

Use `/qa <tarefa>` para acionar o Claude no papel de QA.
Exemplos:
- `/qa escrever os casos de teste de integração para o endpoint POST /orders`
- `/qa configurar pytest e cobertura no order-service`
- `/qa mapear todos os cenários de borda não cobertos no payment-service`
