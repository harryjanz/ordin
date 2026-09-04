---
id: ORD-134
status: Done
fase: 4
sprint: null
responsavel: Backend SR
estimativa: 2 pontos
---

# ORD-134 — Filtro de data em GET /payments exclui transações do próprio dia final (date_to tratado como meia-noite, não fim do dia)

## Descrição
O endpoint `GET /payments` (`services/payment/main.py`, linhas 533-536), usado pela tela de Transações do admin, filtra `Transaction.created_at <= date_to` com `date_to` no formato `"AAAA-MM-DD"`. O MySQL trata isso como `'AAAA-MM-DD 00:00:00'` — excluindo qualquer transação do próprio dia final criada depois da meia-noite. Como a tela usa "hoje" como `date_to` padrão, isso esconde virtualmente todas as transações do dia corrente por padrão.

Já existe a correção certa em `GET /payments/analytics` (mesmo arquivo, ~linha 657-672): `end = datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1)`, limite exclusivo.

## Persona
Admin da empresa / Super Admin.

## Contexto
Motivo real de um incidente nesta sessão: transações genuínas foram reportadas como "ausentes" quando só estavam escondidas pelo filtro. Confirmado que o impacto é o dia corrente inteiro, o caso de uso mais comum da tela.

---

## Explorer

## História
Como admin da empresa ou super admin consultando a tela de Transações, quero que o filtro "até" (`date_to`) inclua o dia inteiro selecionado, para ver todas as transações de hoje sem precisar avançar a data manualmente.

### Decisão de produto
Correção **100% no backend**, replicando o padrão já usado em `payments_analytics`. Frontend não muda — continua enviando a data crua do dia selecionado.

### Critérios de aceite funcionais
- [x] Transação às 23:59 do dia em `date_to` aparece
- [x] Transação às 00:00:01 do dia seguinte continua excluída
- [x] `date_from == date_to` retorna o dia inteiro
- [x] `date_from` permanece inalterado
- [x] Filtro sem `date_to` continua sem limite superior

---

## QA Explorer

```gherkin
Feature: GET /payments inclui o dia inteiro no filtro date_to
  Scenario: Transação no fim do dia informado em date_to aparece
  Scenario: Transação do dia seguinte a date_to continua excluída
  Scenario: Transação exatamente à meia-noite do dia informado continua incluída (regressão)
  Scenario: date_from igual a date_to retorna o dia inteiro
  Scenario: date_from continua funcionando como limite inferior inalterado
  Scenario: Filtro sem date_to não aplica limite superior
  Scenario: Isolamento multi-tenant é preservado pela correção
  Scenario: GET /payments/analytics continua com o mesmo comportamento (não tocado)
```

**Cenários aprovados pelo PM.**

---

## Tech Explorer

### Mudança de código (`services/payment/main.py`, `list_payments`)
```python
if date_to:
    try:
        date_to_exclusive = datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1)
    except ValueError:
        raise HTTPException(400, "date_to deve estar no formato AAAA-MM-DD")
    base_filters.append(Transaction.created_at < date_to_exclusive)
```
`date_from` não muda. `payments_analytics` não é tocado.

### Migrations / Eventos de fila / Impacto em outros serviços
Nenhum. Único consumidor frontend confirmado: `frontend/admin/src/screens/PaymentsScreen.tsx`.

### Testes
7 testes cobrindo os cenários Gherkin (fim de dia, não vazamento, meia-noite regressão, date_from==date_to, date_from inalterado, sem date_to, formato inválido 400, isolamento multi-tenant).

### Estimativa
2 pontos.

### Riscos
Nenhum de quebra de contrato — comportamento só fica mais permissivo.

---

## Ready

**Status: Ready** — todos os steps do upstream completos e aprovados nesta conversa ("pode implementar"). Sem bloqueios.
