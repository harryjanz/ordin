---
id: ORD-025
status: New
fase: 1
sprint: 3
responsavel: Backend SR
---

# ORD-025 — Integração PayGo TEF com flag PAYGO_MODE=mock|real

## Descrição
O `payment-service` aprova pagamentos com `random.random() < 0.95` sem nenhuma integração real com a API PayGo TEF. É necessário implementar a integração real com a PayGo e introduzir uma flag de ambiente `PAYGO_MODE` que alterna entre o comportamento simulado (mock) e a chamada real à API PayGo, permitindo testar localmente sem hardware TEF e rodar o piloto real com o terminal físico.

## Contexto
PayGo é a integradora TEF usada pelo Ordin (`docs/ARQUITETURA.md` §3). A API PayGo expõe endpoints REST para iniciar transação, consultar status e cancelar. O terminal TEF físico se comunica com o PayGo Server local (configurado via `PAYGO_SERVER_URL`).

A flag `PAYGO_MODE` permite que o mesmo código sirva para:
- `mock`: aprovação simulada (comportamento atual), para desenvolvimento e CI
- `real`: chamadas reais à API PayGo, para o piloto com terminal físico

## O que precisa ser feito

1. Criar interface `IPaymentGateway` com métodos `process(transaction)` e `cancel(transaction)`
2. Implementar `MockGateway` — comportamento atual (95% aprovação, gera NSU fictício)
3. Implementar `PayGoGateway` — chamadas reais à API PayGo (`PAYGO_SERVER_URL`, `PAYGO_TOKEN`)
4. Factory que seleciona a implementação com base em `PAYGO_MODE` no startup
5. Atualizar `.env.example` com `PAYGO_MODE=mock` como padrão
6. Implementar cancelamento real com reversal (NSU + Authorization para a autorizadora)

## Variáveis de ambiente necessárias
```
PAYGO_MODE=mock          # mock | real
PAYGO_SERVER_URL=http://localhost:8085
PAYGO_TOKEN=TOKEN_AQUI
```

## Stakeholder
Operadores de caixa e totem. Integração real é pré-requisito para o piloto com clientes reais.
