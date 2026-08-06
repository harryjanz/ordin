---
id: ORD-067
status: Done
fase: 5
sprint: null
responsavel: Backend SR
estimativa: 2 pontos
---

# ORD-067 — Bug: filtro de CNPJ por prefixo não batia com empresas do seed

## Descrição
Usuário reportou: filtrar a listagem de empresas por CNPJ digitando os 3 primeiros dígitos (ex: "123" para a Burger House, CNPJ `12.345.678/0001-99`) não retornava nenhum resultado. Causa raiz: a migration de seed (`bbb002`) inseria `document` **com máscara** via SQL direto (`INSERT ... VALUES (1, 'Burger House', '12.345.678/0001-99', ...)`), sem passar pelo validador Pydantic que normaliza o CNPJ (remove máscara) no fluxo normal de cadastro via API. O filtro faz `Company.document.LIKE 'prefixo_normalizado%'` — `"123"` nunca batia contra `"12.345.678/0001-99"` (que começa com `"12."`), só bateria com dados criados via API normal (que já nascem sem máscara).

> **Nota de processo:** história escrita retroativamente, depois do fix já aplicado e testado. Não passou pelo fluxo upstream antes de ser codada — foi um bug reportado diretamente pelo usuário durante uma sessão de reinício de containers, com fix aplicado na hora.

## Persona
**Super admin** — filtra a lista de empresas por CNPJ (total ou parcial) na tela de listagem de clientes (ORD-061/062) e espera que o filtro funcione para qualquer empresa cadastrada, incluindo as 3 do seed inicial.

## Contexto

### Confirmação da causa raiz
```sql
SELECT id, name, document FROM fk_company.companies;
-- 1  Burger House   12.345.678/0001-99   <- com máscara
-- 2  Pasta & Co     98.765.432/0001-11   <- com máscara
-- 3  Sweet Corner   11.222.333/0001-44   <- com máscara
```
A invariante documentada no próprio código (`main.py`, comentário no `field_validator("document")`: *"banco armazena sempre sem máscara"*) estava sendo violada só pelas 3 linhas do seed, que não passam pelo Pydantic — o `INSERT` é SQL cru dentro de uma migration Alembic.

## Explorer

### Fluxo principal
1. Nova migration normaliza (remove máscara de) qualquer `document` já gravado no banco que ainda contenha `.`, `/` ou `-`
2. Seed original (`20260611_0901_seed_initial.py`) corrigido pra inserir sem máscara desde já — instalações novas do zero não repetem o bug
3. Filtro `GET /companies?document=123` volta a bater com a Burger House

### Critérios de aceite
- [x] `SELECT document FROM companies WHERE id IN (1,2,3)` retorna valores sem máscara (`12345678000199`, etc.)
- [x] `GET /companies?document=123` retorna a Burger House
- [x] Seed original corrigido para não reintroduzir o bug em bancos novos

## QA Explorer

```gherkin
Feature: Filtro de CNPJ por prefixo funciona para dados do seed

  Scenario: Filtro por prefixo bate com empresa do seed
    Dado que a Burger House tem CNPJ "12345678000199" (sem máscara) no banco
    Quando filtro empresas com document="123"
    Então a Burger House aparece no resultado
```

Validado direto no MySQL (`WHERE document LIKE '123%'` retornando a linha da Burger House) e via API real (`GET /companies?document=123`), sem necessidade de teste automatizado novo — o comportamento do filtro em si já tinha cobertura em `test_ord061_filtros_edicao_cadastro.py`; o bug era um problema de **dado**, não de lógica.

## Tech Explorer

### Serviços impactados
- **`services/company/migrations/versions/20260806_1300_normalize_seed_document.py`** — nova migration, normaliza dados já gravados
- **`services/company/migrations/versions/20260611_0901_seed_initial.py`** — seed original corrigido (CNPJs inseridos sem máscara)

### Migration
```python
def upgrade() -> None:
    op.execute("""
        UPDATE companies
        SET document = REPLACE(REPLACE(REPLACE(document, '.', ''), '/', ''), '-', '')
        WHERE document IS NOT NULL
          AND (document LIKE '%.%' OR document LIKE '%/%' OR document LIKE '%-%')
    """)
```

### Riscos
- Nenhum — migration idempotente (só afeta linhas que ainda tenham caractere de máscara) e reversível apenas no sentido de não fazer nada no `downgrade` (não há como saber se um CNPJ sem máscara já estava assim ou foi normalizado por esta migration).

### Estimativa
2 pontos — diagnóstico levou mais tempo que o fix em si (migration de uma query + correção do seed).

---

## Ready

**Explorer:** [x] causa raiz confirmada com evidência do banco · **QA Explorer:** [x] validado via SQL direto e API real · **Tech Explorer:** [x] migration simples e idempotente, seed original corrigido · **Aprovação final:** aprovado no chat pelo usuário.

**Status: Done** — aplicado, testado e em produção local. História escrita retroativamente.
