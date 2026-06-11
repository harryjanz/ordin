---
id: ORD-018
status: New
fase: 1
sprint: 5
responsavel: Backend SR
---

# ORD-018 — Audit log de ações sensíveis

## Descrição
Ações sensíveis como login, logout, cancelamento de pagamento e regeneração de PIN não são registradas em nenhum lugar. É necessário implementar um audit log (tabela `audit_log` ou logs estruturados JSON para CloudWatch/Datadog) que registre: ator, ação, timestamp, IP, resultado.

## Contexto
Requisito S10 de `docs/ARQUITETURA.md` §12. Necessário para rastreabilidade e conformidade. Logs estruturados seguem o padrão Datadog (`docs/ARQUITETURA.md` §10).

## Stakeholder
Super Admin, admin da empresa. Audit log é necessário para investigar fraudes, acessos indevidos e incidentes operacionais.
