---
id: ORD-066
status: Done
fase: 5
sprint: null
responsavel: Backend SR / DevOps
estimativa: 1 ponto
---

# ORD-066 — Fix: segfault do uvloop no payment-service

## Descrição
Ao reiniciar os containers do ordin, o `payment-service` entrou em loop de crash (`Segmentation fault (core dumped)`) repetidamente, mesmo com a migration do Alembic aplicada com sucesso. Investigação isolou a causa: não era o Alembic, era o **uvicorn** — especificamente o event loop **uvloop** (padrão automático do uvicorn) travando com segfault ao iniciar o servidor nesta máquina. Rodando o mesmo comando com `--loop asyncio` em vez do uvloop padrão, o servidor sobe normalmente.

> **Nota de processo:** esta história foi escrita **depois** da implementação e do deploy, como registro retroativo — não passou pelo fluxo upstream (Explorer → QA Explorer → Tech Explorer → Ready) antes de ser codada. Foi um fix emergencial durante uma sessão de reinício de containers, aplicado com aprovação direta do usuário no chat. Registrado aqui só para não perder o rastro da mudança.

## Persona
**Time de engenharia** — precisa que `docker compose up`/`restart` funcione de forma confiável, sem intervenção manual a cada subida do `payment-service`.

## Contexto

### Diagnóstico
- `docker compose restart` em todos os serviços reiniciou 12 dos 13 containers com sucesso; `payment-service` ficou em `Restarting (139)` (139 = 128+11 = SIGSEGV) indefinidamente.
- Isolamento passo a passo via `docker compose run` com overrides de comando: `alembic upgrade head` sozinho funcionava; `uvicorn main:app --host 0.0.0.0 --port 8005` sozinho segfaultava imediatamente, sem log de exceção Python (segfault é a nível de processo, não de exceção capturável).
- `import uvicorn` e `import main` isoladamente funcionavam bem — o crash era especificamente na inicialização do event loop.
- Confirmado com `uvicorn.run(..., loop="asyncio")`: sobe normal e fica estável.

### Causa raiz
uvloop (extensão C, event loop padrão que o uvicorn tenta usar automaticamente) incompatível com o ambiente de execução desta máquina — não investigado a fundo *por que* (poderia ser versão do kernel, glibc, ou wheel pré-compilado incompatível com a CPU), já que trocar o loop resolve sem custo de performance relevante para este serviço.

## Explorer

### Fluxo principal
1. Container do payment-service inicia com `sh -c "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8005 --loop asyncio"`
2. Uvicorn sobe usando o event loop `asyncio` (não uvloop), sem segfault

### Critérios de aceite
- [x] `docker compose up -d --force-recreate payment-service` sobe o container e ele permanece `Up` (não entra em crash loop)
- [x] `GET /docs` do payment-service responde HTTP 200
- [x] Nenhuma mudança de comportamento funcional do serviço (só troca do event loop)

## QA Explorer

```gherkin
Feature: Payment-service sobe sem segfault

  Scenario: Container sobe e permanece estável
    Quando o payment-service é recriado
    Então ele fica em status "Up" (não "Restarting")
    E GET /docs responde 200
```

Validado manualmente via `docker compose ps` (status `Up`, sem restart loop) e `curl -o /dev/null -w "%{http_code}" /docs` retornando 200. Sem teste automatizado dedicado — é uma flag de processo, não lógica de aplicação.

## Tech Explorer

### Serviços impactados
- **`services/payment/Dockerfile`** — única mudança

### Diff
```dockerfile
- CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8005"]
+ CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8005 --loop asyncio"]
```

### Riscos
- Nenhum funcional identificado. `asyncio` é o event loop padrão de referência do Python; uvloop é só uma otimização de performance — perda de throughput teórica, não medida, considerada aceitável frente ao container não subir de jeito nenhum.
- Se a causa raiz (por que uvloop segfaulta neste ambiente) mudar em algum momento (nova imagem base, novo host), vale reavaliar se dá pra voltar a usar uvloop.

### Estimativa
1 ponto — mudança de uma linha, já validada em produção local.

---

## Ready

**Explorer:** [x] causa raiz isolada e documentada · **QA Explorer:** [x] validado manualmente, container estável · **Tech Explorer:** [x] diff mínimo, sem impacto funcional · **Aprovação final:** aprovado no chat pelo usuário antes da aplicação.

**Status: Done** — aplicado, testado e em produção local. História escrita retroativamente.
