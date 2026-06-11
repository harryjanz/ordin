---
id: ORD-008
status: New
fase: 2
sprint: 6
responsavel: DevOps
---

# ORD-008 — Provisionar Aurora Serverless v2 + RDS Proxy em staging

## Descrição
Provisionar o cluster Aurora MySQL Serverless v2 com os 5 schemas (`ordin_auth`, `ordin_company`, `ordin_catalog`, `ordin_order`, `ordin_payment`) e o RDS Proxy na frente para gerenciar o pool de conexões. Usar Terraform modular conforme `docs/ARQUITETURA.md` §9.

## Contexto
Pré-requisito para o primeiro deploy em staging. Substitui o MySQL local do docker-compose. Depende dos módulos Terraform `networking` e `rds`. Aurora Serverless v2 auto-escala para picos de almoço/jantar sem custos fixos altos.

## Stakeholder
Time de desenvolvimento (ambiente de testes realista). Pré-requisito para ORD-007 ser validado em staging.
