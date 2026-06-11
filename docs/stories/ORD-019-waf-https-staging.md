---
id: ORD-019
status: New
fase: 2
sprint: 8
responsavel: DevOps
---

# ORD-019 — WAF OWASP Top 10 + HTTPS via ACM em staging

## Descrição
A comunicação com a plataforma é inteiramente em HTTP sem proteção de WAF. É necessário configurar o AWS WAF com as managed rule groups OWASP Top 10 na frente do ALB e habilitar HTTPS via AWS Certificate Manager em staging, conforme `docs/ARQUITETURA.md` §9 e S3/S11 do §12.

## Contexto
Requisitos S3 (HTTPS) e S11 (WAF) de `docs/ARQUITETURA.md` §12, ambos bloqueantes para produção. Staging precisa replicar a configuração de produção para validar. Depende de ORD-008 (infra staging) e ORD-012 (Kong + ALB).

## Stakeholder
Todos os usuários da plataforma. HTTPS protege credenciais em trânsito; WAF protege contra ataques de injeção e scraping.
