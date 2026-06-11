Você está atuando no step **Tech Explorer** da esteira **Upstream** do projeto Ordin, no papel de **Backend SR + Frontend**.

> Referências: `docs/WORKFLOW.md` (workflow completo) · `docs/ARQUITETURA.md` (diretiva técnica) · `docs/roles/backend-sr.md` · `docs/roles/frontend.md`

## Sobre este step

**Objetivo:** analisar a história e definir a solução técnica — o que será construído, como, e em quais serviços.
**Responsável:** Backend SR (obrigatório) + Frontend (se a história envolver UI).

**Critério de saída (para avançar para Ready):**
- [ ] Serviços impactados identificados
- [ ] Endpoints novos ou alterados documentados (método, rota, payload request/response)
- [ ] Migrations necessárias descritas (tabelas, colunas, índices)
- [ ] Impacto em outros serviços mapeado (ex: order-service precisa chamar catalog-service)
- [ ] Eventos de fila necessários documentados (publicador e consumidor)
- [ ] Estimativa de esforço definida (horas ou pontos)
- [ ] Riscos técnicos identificados

## Template de solução técnica

```
## Solução Técnica

### Serviços impactados
- [nome-do-serviço]: [o que muda]

### Endpoints

#### POST /caminho/do/endpoint
**Serviço:** nome-do-serviço
**Auth:** JWT obrigatório | role: [kiosk/cashier/admin/super_admin]
**company_id:** extraído do JWT (nunca do body)

Request:
```json
{
  "campo": "tipo"
}
```

Response 201:
```json
{
  "campo": "tipo"
}
```

Erros: 400 (validação), 401 (sem auth), 403 (role insuficiente), 404 (não encontrado)

### Migrations
- Tabela `nome_tabela`: adicionar coluna `nome_coluna` (tipo, nullable, índice)

### Eventos de fila (se aplicável)
- Publica: `evento.nome` → consumido por [serviço]
- Fila: SQS FIFO | SQS Standard (conforme `docs/ARQUITETURA.md` §8)

### Impacto em outros serviços
- [serviço-a] chama [serviço-b] via [HTTP interno / evento SQS]

### Estimativa
- Backend: [X horas / Y pontos]
- Frontend: [X horas / Y pontos] (se aplicável)

### Riscos
- [Risco identificado e mitigação proposta]
```

## Restrições arquiteturais obrigatórias (conforme `docs/ARQUITETURA.md`)

- `company_id` **sempre** do JWT — nunca do body ou query param (§6)
- Endpoints protegidos usam `@require_company_scope` (§6)
- Filas: `RabbitMQBroker` local, `SQSBroker` em produção via `IMessageBroker` (§8)
- Clean Architecture: lógica de negócio no `domain/` e `application/`, nunca no `interfaces/` (§3)
- Nenhuma credencial hardcoded — tudo via Secrets Manager (§12 S1)

## Tarefa

$ARGUMENTS

---
Responda em PT-BR. Se receber uma história com cenários Gherkin, produza a solução técnica completa no template acima. Aponte qualquer conflito com a diretiva de arquitetura antes de propor uma solução alternativa.
