---
id: ORD-015
status: New
fase: 1
sprint: 3
responsavel: Backend SR
---

# ORD-015 — Implementar IMessageBroker com RabbitMQBroker (local) e SQSBroker (produção)

## Descrição
O RabbitMQ está declarado no `docker-compose.yml` mas não integrado em nenhum serviço. É necessário criar a interface `IMessageBroker` (ABC no `domain`) com duas implementações: `RabbitMQBroker` para uso local e `SQSBroker` para produção. O broker é injetado no startup conforme o ambiente. Eventos iniciais: `payment.approved`, `payment.refused`, `payment.cancelled`.

## Contexto
Decisão de arquitetura de filas de `docs/ARQUITETURA.md` §8. A interface plugável garante que o código de negócio não conhece o broker concreto. Pré-requisito para as histórias de integração de filas nas Fases 2 e 3.

## Stakeholder
Time de desenvolvimento. Sem o broker, eventos de pagamento são tratados via chamadas HTTP síncronas frágeis.
