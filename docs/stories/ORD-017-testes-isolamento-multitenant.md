---
id: ORD-017
status: New
fase: 1
sprint: 5
responsavel: QA + Backend SR
---

# ORD-017 — Testes de isolamento multi-tenant obrigatórios por endpoint

## Descrição
Cada endpoint protegido precisa ter um caso de teste que verifica que o token JWT da empresa A não retorna nem modifica dados da empresa B. Esses testes devem ser executados no CI e seu falho bloqueia o merge conforme `docs/ARQUITETURA.md` §6 e §11.

## Contexto
Regra central de multi-tenancy. Sem esses testes, regressões de isolamento passariam despercebidas em code reviews. Depende de ORD-002 (JWT nos endpoints) e ORD-005 (company_id do JWT). Complementar a ORD-016.

## Stakeholder
Admin da empresa. Vazamento de dados entre empresas é o risco de segurança mais crítico da plataforma.
