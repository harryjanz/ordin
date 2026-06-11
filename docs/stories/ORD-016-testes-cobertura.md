---
id: ORD-016
status: New
fase: 1
sprint: 5
responsavel: QA + Backend SR
---

# ORD-016 — Testes unitários e de integração com cobertura ≥ 80% por serviço

## Descrição
Nenhum serviço tem testes automatizados. É necessário configurar `pyproject.toml` com pytest + pytest-asyncio + pytest-cov em cada serviço, criar os testes unitários (domínio e casos de uso) e de integração (endpoints FastAPI + banco Aurora de teste) cobrindo os fluxos críticos, atingindo cobertura mínima de 80% por serviço.

## Contexto
Gate de qualidade de `docs/ARQUITETURA.md` §11 e `docs/roles/qa.md`. Sem testes, refatorações das Fases 2 e 3 não têm rede de segurança. Depende de ORD-006 (Alembic) e ORD-007 (AsyncSession) para que os testes de integração rodem com banco real.

## Stakeholder
Time de desenvolvimento. Testes são a base para refatorar com segurança nas próximas fases.
