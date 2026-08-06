---
id: ORD-065
status: Done
fase: 4
sprint: null
responsavel: Backend SR
estimativa: 3 pontos
---

# ORD-065 — CNPJ único (UNIQUE constraint) + processo de limpeza de dados de teste

## Descrição
Hoje é possível cadastrar duas empresas com o mesmo CNPJ — `companies.document` não tem nenhuma restrição de unicidade. Confirmado ao investigar a base de dev: só 3 registros eram o seed real (`init.sql`); os outros 141 eram dados de teste acumulados desde 2026-06-15 (E2E rodando sem limpeza nenhuma), incluindo 62 empresas duplicadas com o mesmo CNPJ `11222333000181`. Essa massa foi apagada (com confirmação explícita do usuário) como pré-requisito desta história — sem isso, a migration do `UNIQUE` constraint falharia.

Esta história tem duas partes que nasceram juntas porque uma força a outra: o constraint só se sustenta se os testes pararem de reacumular CNPJ duplicado, e os testes só param de reacumular se houver um processo de limpeza confiável.

## Persona
**Super admin** cadastrando clientes — não pode mais criar duas empresas com o mesmo CNPJ por engano. Indiretamente, **o processo de QA/engenharia** do projeto, que ganha uma base de dev limpa.

## Contexto

### Decisão de escopo (confirmada com o usuário)
CNPJ vira **`UNIQUE`**, não chave primária. `id` (auto-incremento) continua sendo a PK — nenhum FK existente muda (`terminals.company_id`, `users.company_id`, `company_contacts.company_id`, `company_legal_representatives.company_id`, `company_payment_configs.company_id`, o campo `company` no JWT, e o `company_id` armazenado nos outros microsserviços — `order`, `payment`, `catalog` — continuam todos apontando pro `id` numérico). Trocar a PK de verdade por `document` cascatearia por todos esses pontos — descartado por ser desproporcional ao problema real (impedir duplicidade).

### Limpeza retroativa já realizada
Antes desta história ser implementada, com confirmação explícita do usuário:
- Apagados (hard delete) 141 registros de `companies` — mantidos só `id=1,2,3` (Burger House, Pasta & Co, Sweet Corner, os únicos com `created_at IS NULL`, sinal de terem vindo do `init.sql` e não de uma chamada de API).
- Limpas as tabelas relacionadas junto: `terminals` (71 linhas), `users` (71), `company_contacts` (64), `company_legal_representatives` (64), `company_payment_configs` (26).
- Confirmado ao final: só as 3 empresas do seed restam, cada uma com `document` distinto — a migration do `UNIQUE` constraint pode rodar sem conflito.

### Processo de limpeza de teste — já implementado nesta história
Os testes E2E (Playwright) rodam contra o docker compose local **de verdade**, sem mock — cada execução cria empresas reais no banco de dev, e nada as apagava depois. Isso foi o que causou a poluição acima. Solução, com marcação explícita na criação (não por padrão de nome):

- Novo módulo `frontend/admin/e2e/test-data-manifest.ts` — `recordTestCompany({id, document, name, specFile})` grava num arquivo local (`frontend/admin/e2e/.test-data-manifest.json`, gitignorado) toda vez que um teste cria uma empresa pelo wizard.
- Os 3 specs que criam empresa (`cadastro-cliente.spec.ts`, `listagem-clientes.spec.ts`, `edicao-cadastro-cliente.spec.ts`) já chamam `recordTestCompany` logo após o redirecionamento pro detalhe (onde o `id` está disponível na URL).
- Novo script `services/company/scripts/cleanup_test_data.py` — recebe uma lista de ids e apaga (hard delete) a empresa e tudo que referencia ela nas tabelas relacionadas. Tem uma trava de segurança: recusa apagar `id` 1, 2 ou 3 (o seed real), mesmo que informado por engano.
- **Fluxo obrigatório: nunca apagar sem mostrar a lista e esperar confirmação explícita no chat.** Depois de rodar uma suíte E2E, ler o manifesto, listar pro usuário o que seria apagado (id, nome, CNPJ, spec de origem), e só rodar o script de limpeza após um "sim" claro — exatamente como foi feito na limpeza retroativa acima.
- Testes de backend (`pytest`) não precisam desse mecanismo — já se autolimpam imediatamente após cada teste via fixture `_cleanup_company`, sem acumular.

### Risco operacional identificado (não é bug, é uma dependência de processo)
Os specs E2E reutilizam o **mesmo CNPJ de teste** (`11222333000181`, `12ABC34501DE35`) a cada execução — de propósito, porque `11222333000181` corresponde a uma empresa real na Receita (auto-preenchimento funciona) e gerar um CNPJ aleatório novo a cada run quebraria esse cenário. **Depois que o `UNIQUE` constraint entrar em vigor, rodar a mesma suíte duas vezes sem limpar entre as execuções vai falhar** com "CNPJ já cadastrado" na segunda vez. Isso é esperado e correto (é exatamente o que o constraint deve fazer) — mas exige disciplina: sempre limpar (com confirmação) antes de rodar a suíte de novo, ou aceitar que a segunda execução vai falhar na criação. Não decidido nesta história gerar CNPJ dinâmico pros testes — ficaria mais "limpo" automaticamente, mas perderia a cobertura de consulta real à Receita que hoje só funciona com esse CNPJ conhecido; registrado como trade-off consciente.

---

## Explorer

## História
Como **super admin**, quero que o sistema impeça cadastrar duas empresas com o mesmo CNPJ, para não ter clientes duplicados na base — e como **time de engenharia**, quero um jeito confiável (com confirmação) de limpar os dados que os testes E2E criam, para a base de dev não voltar a poluir do jeito que foi encontrada.

### Fluxo principal
1. `POST /companies` com um CNPJ que já existe em outra empresa ativa → 422 com mensagem clara ("CNPJ já cadastrado para outra empresa"), não um erro 500 de banco vazando
2. Depois de rodar uma suíte E2E, o manifesto de dados de teste é lido, apresentado ao usuário, e só apagado com confirmação explícita

### Fluxos alternativos / exceções
- CNPJ igual mas empresa existente está **inativa** (soft-deleted) → decisão: ainda bloqueia (o `UNIQUE` do MySQL não distingue `active`; reativar/reaproveitar um CNPJ de empresa desativada fica fora do escopo desta história, registrado como próximo passo natural se algum dia for necessário)
- Tentativa de rodar o script de limpeza com o id 1, 2 ou 3 → recusado pela trava de segurança do próprio script

### Critérios de aceite funcionais
- [ ] Migration adiciona `UNIQUE` em `companies.document`
- [ ] `POST /companies` com CNPJ duplicado retorna 422 com mensagem clara, não 500
- [ ] Base de dev limpa (só seed 1/2/3) antes da migration rodar — pré-requisito já cumprido
- [ ] Testes E2E que criam empresa gravam no manifesto local
- [ ] Script de limpeza apaga por id, com trava contra apagar o seed
- [ ] Processo documentado: nunca limpar sem confirmação explícita

---

## QA Explorer

```gherkin
Feature: CNPJ único + limpeza de dados de teste

  Scenario: Cadastro com CNPJ duplicado é rejeitado
    Dado que já existe uma empresa ativa com CNPJ "11.222.333/0001-81"
    Quando tento cadastrar outra empresa com o mesmo CNPJ
    Então recebo 422 com mensagem "CNPJ já cadastrado para outra empresa"
    E nenhuma linha nova é criada em companies

  Scenario: CNPJ diferente cadastra normalmente
    Dado que existe uma empresa com CNPJ "11.222.333/0001-81"
    Quando cadastro uma empresa com CNPJ "12.ABC.345/01DE-35"
    Então o cadastro é criado com sucesso

  Scenario: Script de limpeza recusa apagar o seed
    Quando rodo o script de limpeza passando o id 1
    Então ele recusa com um erro claro, sem apagar nada

  Scenario: Manifesto de teste é gravado na criação
    Quando um teste E2E cria uma empresa pelo wizard
    Então o id, CNPJ, nome e spec de origem ficam registrados no manifesto local

  Scenario: Limpeza nunca acontece sem confirmação
    Dado um manifesto com empresas de teste pendentes
    Quando decido limpar a base
    Então a lista é mostrada antes, e a exclusão só roda depois de confirmação explícita
```

**Aprovado pelo PM.** Cenário mais crítico: CNPJ duplicado virar 422 claro, não 500 — é a diferença entre uma mensagem que o super admin entende e um erro genérico de servidor.

---

## Tech Explorer

### Serviços impactados
- **`services/company/migrations/versions/`** — nova migration
- **`services/company/main.py`** — tratar `IntegrityError` no `create_company`
- **`services/company/scripts/cleanup_test_data.py`** — já criado
- **`frontend/admin/e2e/test-data-manifest.ts`** — já criado e integrado nos 3 specs que criam empresa

### Migration
```python
"""companies.document UNIQUE (ORD-065)

Revision ID: 20260805_1000
Revises: 20260804_1100
Create Date: 2026-08-05 10:00:00
"""
from alembic import op

revision = "20260805_1000"
down_revision = "20260804_1100"
branch_labels = None
depends_on = None


def upgrade():
    op.create_unique_constraint("uq_companies_document", "companies", ["document"])


def downgrade():
    op.drop_constraint("uq_companies_document", "companies", type_="unique")
```
MySQL trata múltiplos `NULL` como não-conflitantes num índice único (não bloqueia várias empresas sem CNPJ) — comportamento correto, sem precisar de tratamento especial.

### `main.py` — `create_company`
```python
from sqlalchemy.exc import IntegrityError

...
    db.add(co)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(422, "CNPJ já cadastrado para outra empresa")
    await db.refresh(co)
```

### Testes
- Backend: teste parametrizado criando duas empresas com o mesmo `document` normalizado (com/sem máscara) → segunda falha com 422 e mensagem certa; teste de que CNPJs diferentes continuam funcionando.
- Script de limpeza: teste unitário simples chamando `cleanup(ids=[1])` e esperando `SystemExit`.

### Impacto em outros serviços
Nenhum — `id` continua sendo o que os outros serviços armazenam como `company_id`.

### Riscos
- Reexecutar uma suíte E2E sem limpar antes vai falhar na criação (ver seção de contexto) — comportamento esperado, não um bug, mas precisa ser lembrado ao rodar testes repetidamente na mesma sessão.
- Reativar uma empresa desativada com o mesmo CNPJ de uma ativa fica bloqueado — não haverá fluxo de "reaproveitar" cadastro antigo até que isso seja pedido explicitamente.

### Estimativa
3 pontos — migration pequena, tratamento de erro pontual; a parte de maior volume (manifesto + script + limpeza retroativa) já foi implementada como pré-requisito.

---

## Ready

**Explorer:** [x] decisão de escopo confirmada (UNIQUE, não PK), limpeza retroativa realizada e documentada, processo de teste definido · **QA Explorer:** [x] duplicado bloqueado com mensagem clara, CNPJ diferente funciona, trava do script de limpeza, manifesto gravando · **Tech Explorer:** [x] migration, tratamento de IntegrityError, riscos operacionais de reexecução de E2E documentados · **Aprovação final:** pendente — apresentada ao usuário.

**Status: Ready** — sem bloqueadores técnicos, pode começar assim que priorizada. A parte de limpeza/manifesto já está implementada; falta só a migration + tratamento de erro no `create_company`.
