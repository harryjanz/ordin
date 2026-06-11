---
id: ORD-013
status: New
fase: 2
sprint: 7
responsavel: DevOps + Backend SR
---

# ORD-013 — Substituir Nginx pelo Kong em staging

## Descrição
Com Kong provisionado (ORD-012), remover o serviço Nginx do `docker-compose.yml` de staging e configurar os serviços para receber tráfego via Kong. Validar que todas as rotas funcionam, incluindo WebSocket do order-service com sticky sessions.

## Contexto
Nginx é apenas local. Em staging e produção, Kong é o único gateway (`docs/ARQUITETURA.md` §4). Depende de ORD-012. Inclui validação de WebSocket (sticky sessions no ALB, headers de upgrade).

## Stakeholder
Time de desenvolvimento. Marco que valida a arquitetura de gateway em ambiente real antes da produção.
