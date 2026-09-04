---
id: ORD-135
status: Done
fase: 4
sprint: null
responsavel: Backend SR
estimativa: 2 pontos
---

# ORD-135 — Replicar o fix de date_to (ORD-134) em company-service e order-service

## Descrição
O ORD-134 corrigiu o bug de `date_to` sendo tratado como meia-noite (excluindo o dia final do filtro) em `GET /payments`. Uma auditoria em todos os serviços encontrou mais duas ocorrências confirmadas do mesmo bug, ambas com consumidor frontend real:

1. `services/company/main.py`, `list_companies` (`GET /companies`, linha 1012-1015)
2. `services/order/main.py`, `list_orders` (`GET /orders`, linha 668-671)

`payments_analytics` e `orders/prep-stats` já fazem certo. `hour_to`/`hour_from` em `list_orders` (comparação de hora do dia) estão corretos e não devem ser tocados. Ambos os arquivos já importam `timedelta` e `HTTPException`.

## Persona
Admin da empresa / Super Admin.

## Contexto
Consequência direta do ORD-134 — correção proativa das demais ocorrências do mesmo bug.

---

## Explorer
Como admin/super admin consultando Empresas ou Pedidos, quero que `date_to` inclua o dia inteiro, igual ao já corrigido em Transações. Mesma decisão de produto do ORD-134 (fix 100% backend), replicada sem nova decisão técnica.

## QA Explorer
10 cenários Gherkin: fim de dia incluído, não vazamento pro dia seguinte, `date_from==date_to`, sem `date_to`, formato inválido → 400, regressão de `hour_to` não afetado, isolamento multi-tenant — para os dois endpoints. Aprovados pelo PM.

## Tech Explorer
Mesmo fix do ORD-134, aplicado literalmente:
```python
if date_to:
    try:
        date_to_exclusive = datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1)
    except ValueError:
        raise HTTPException(400, "date_to deve estar no formato AAAA-MM-DD")
    base_filters.append(<Model>.created_at < date_to_exclusive)
```
Em `Company.created_at` (company-service) e `Order.created_at` (order-service). `date_from`, `hour_from`, `hour_to` inalterados. Sem migrations, sem impacto entre serviços, sem riscos além dos já mitigados no ORD-134.

11 testes (5 company-service + 6 order-service).

## Ready
**Status: Ready** — todos os steps aprovados nesta conversa ("implementa e roda os testes dos dois serviços"). Sem bloqueios.
