---
id: ORD-177
status: Ready
estimativa: 2 pontos (1 backend + 1 frontend)
fase: 6
sprint: null
responsavel: Backend SR + Frontend
---

# ORD-177 — Transparência da tabela de preço vigente na aba Plano

## Descrição
Ajuste pontual levantado pelo próprio usuário enquanto revisava a área de empresa: a aba
"Plano" (`CompanyScreen.tsx`, ORD-163) mostra o **nome** da tabela de preço vigente pro
cliente (owner/manager), mas não os **valores de fato cobrados** — preço do 1º totem,
multiplicadores, faixas de transação. Owner/manager já acessam esse endpoint
(`_require_company_admin`), só faltava o dado.

## Persona
**Owner/manager** — cliente que já acessa a própria aba Plano e precisa conferir o que está
pagando sem depender do time Ordin.

## Explorer

### História
Como **owner/manager da empresa**, quero ver os valores completos da tabela de preço vigente
(não só o nome) na minha própria aba Plano, para ter transparência sobre o que estou pagando.

### Decisão de design: reaproveitar o padrão somente-leitura da ORD-167
O usuário pediu explicitamente "semelhante ao que implantamos na tabela de preços quando não
pode editar" — reaproveitado o mesmo `ReadOnlyField` (label + valor em negrito, sem parecer
campo desabilitado) já validado em `PriceTableFormScreen.tsx`. Como CSS Modules não compartilham
classe entre arquivos, o componente e as classes de layout (`.planFormRow`/`.planFormRowField`)
foram replicados dentro de `CompanyScreen.module.scss`, não importados.

### Fluxo principal
1. Owner/manager abre a aba "Plano" da própria empresa (fluxo já existente).
2. Painel de status (já existente) continua igual.
3. Novo painel abaixo: "Valores da tabela vigente" — preço do 1º totem, multiplicador do 2º
   totem, multiplicador do 3º ao 5º totem, e a lista de faixas de transação (De/Até/Preço por
   transação), tudo somente-leitura.
4. Sem valores retornados pelo backend (plano sem tabela associada, caso extremo): painel novo
   simplesmente não aparece, sem erro.

### Dependências
- **company-service**: `GET /companies/{id}/plan` (já existente, mesmo endpoint que o cliente já
  usa) ganha os campos de preço/faixas — mudança aditiva, sem endpoint novo.
- **frontend/admin**: `CompanyScreen.tsx` (`PlanTab`).
- **Histórias bloqueantes**: nenhuma.

### Critérios de aceite funcionais
- [ ] Aba Plano mostra preço do 1º totem, multiplicadores e faixas de transação da tabela
      vigente
- [ ] Dado reaproveita o mesmo endpoint já usado pelo cliente, sem endpoint novo
- [ ] Histórico de troca de tabela (endpoint separado) não é afetado

## QA Explorer

### Cenários Gherkin

```gherkin
Feature: Transparência da tabela de preço vigente
  Como owner/manager da empresa
  Quero ver os valores completos da tabela de preço vigente
  Para ter transparência sobre o que estou pagando

  Scenario: Owner vê os valores completos do próprio plano
    Dado um owner autenticado na empresa "Burger House"
    E um plano vigente com tabela "Tabela 2026-Q4"
    Quando o owner abre a aba Plano
    Então vê preço do 1º totem, multiplicadores e faixas de transação, tudo somente-leitura

  Scenario: Histórico de troca de tabela não é afetado
    Quando o owner consulta o histórico de troca de tabela (endpoint separado, ORD-165)
    Então a resposta não inclui os valores de preço completos (só id/nome/kind de cada tabela)
```

### Critérios de aceite testáveis
- [ ] `GET /companies/{id}/plan` retorna preço/faixas da tabela vigente
- [ ] `GET /companies/{id}/plan/history` continua sem esses campos (schema compartilhado,
      campos opcionais)

## Tech Explorer

### Serviços impactados
Só **company-service** + **frontend/admin**.

### Mudança no backend
`CompanyPlanPriceTableOut` ganha `totem_price_1`, `totem_multiplier_2`, `totem_multiplier_3_5`,
`transaction_tiers: list[PlanTierOut]` — todos opcionais (`| None = None` / `= []`), porque o
mesmo schema é reaproveitado por `CompanyPlanHistoryEntryOut` (histórico não precisa do preço
completo). `_serialize_company_plan` populado reaproveitando `_get_price_table_tiers` (helper já
existente da ORD-162).

**Achado durante a implementação**: tornar os campos novos obrigatórios quebrou 5 testes de
histórico existentes (`ResponseValidationError` — o serializador do histórico não preenche esses
campos, porque intencionalmente não deveria). Corrigido tornando os campos opcionais.

### Mudança no frontend
`PlanTab`: novo painel `ReadOnlyField`/`.planFormRow` (réplica do padrão da ORD-167). `.planPanel`
trocado de `max-width: 480px` fixo pra `50%` (ficava pequeno em tela larga, mesmo ajuste já
validado na aba Fiscal do épico fiscal separado).

### Migrations
Nenhuma — dado já existe em `PriceTable`/`PriceTableTransactionTier`, só exposto num endpoint que
já retornava outro subconjunto dos mesmos dados.

### Estimativa
- Backend: **~1 ponto** — extensão de schema + reaproveitamento de helper já existente.
- Frontend: **~1 ponto** — painel novo reaproveitando padrão visual já validado.
- **Total: ~2 pontos.**

### Riscos
1. **Nenhum** — mudança aditiva, sem endpoint novo, sem migration, padrão visual já validado em
   produção pela ORD-167.

## Ready

**Explorer:** [x] história Como/quero/para · [x] decisão de reaproveitar padrão da ORD-167 · [x]
fluxo principal (4 passos) · [x] sem dependências bloqueantes · [x] critérios de aceite.

**QA Explorer:** [x] happy path · [x] regressão do histórico coberta · [x] cenários aprovados.

**Tech Explorer:** [x] serviços impactados (2) · [x] mudança de schema com opcionalidade
justificada · [x] migrations — nenhuma · [x] estimativa (2 pontos) · [x] sem riscos relevantes.

**Aprovação final:** [x] solução técnica revisada e testada ao vivo com o usuário (múltiplas
iterações de largura confirmadas no navegador) · [x] estimativa 2 pontos · [x] sem bloqueios.

**Status: Ready.**

## Implementação

Implementada na branch `feature/ORD-177-transparencia-tabela-preco-cliente`, a partir de `main`:

1. **Backend** (`services/company/main.py`) — `CompanyPlanPriceTableOut` estendido,
   `_serialize_company_plan` populando os campos novos. 419 testes existentes passando (5
   quebraram na primeira tentativa por campo obrigatório, corrigido com campos opcionais).
   `ruff` limpo.
2. **Admin** (`CompanyScreen.tsx`, `CompanyScreen.module.scss`, `types.ts`) — painel novo na aba
   Plano, `ReadOnlyField` replicado do padrão da ORD-167, `.planPanel` ajustado pra 50% de
   largura (2 rodadas: primeira tentativa usou uma classe (`fiscalForm`) que só existe na branch
   separada do épico fiscal — corrigido ajustando `.planPanel` diretamente, já que aqui não é
   compartilhada com nenhuma outra tela). `tsc`/build/48 testes de frontend sem regressão.
3. **Testado ao vivo com o usuário**: confirmado no navegador após ajuste de largura.
