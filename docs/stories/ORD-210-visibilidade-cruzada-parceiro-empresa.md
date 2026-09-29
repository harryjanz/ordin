# ORD-210 — Visibilidade cruzada Parceiro ↔ Empresas indicadas

**Status:** Ready

## História
Como Administrativo/Financeiro da Ordin, quero ver quais empresas cada parceiro indicou, para
acompanhar a performance de cada parceiro sem depender de abrir empresa por empresa.

## Contexto e motivação
O ORD-208 criou o vínculo `Company.referred_by_partner_id`, mas só expôs visualização no sentido
Empresa→Parceiro (seção "Parceiro" em `CompanyContractScreen.tsx`). Não existia o sentido inverso
(Parceiro→Empresas) nem uma visão cruzada — gap descoberto pelo usuário revisando a frente de
monetização logo depois do ORD-209. Precedente direto de solução: `PriceTableListScreen` (ORD-165)
já resolve o mesmo tipo de problema com uma coluna de contagem agregada.

## Fluxo principal
1. Admin abre a listagem de Parceiros → vê a coluna "Empresas indicadas" (contagem)
2. Admin abre um parceiro específico → vê a lista nominal das empresas indicadas, cada uma com
   "vinculado desde"
3. Admin abre a listagem de Empresas → vê a coluna "Parceiro" (nome de quem indicou, ou "—")
4. Trocar o vínculo de uma empresa (ORD-208) reflete imediatamente nas duas visões

## Fluxos alternativos / exceções
- Parceiro sem nenhuma empresa indicada: contagem 0, lista vazia (não erro).
- Empresa sem parceiro (`referred_by_partner_id` nulo): aparece com "—" na listagem de empresas.
- Parceiro desativado (ORD-207): continua contando as empresas indicadas normalmente — status do
  parceiro e vínculo de indicação são independentes (mesmo princípio já fechado no ORD-208).
- Empresa desativada (`Company.active = false`): não conta na agregação do parceiro (consistente
  com o resto do admin, que já esconde empresa inativa de toda listagem).

## Dependências
- Serviços envolvidos: `company` (2 endpoints existentes ganham campo novo + 1 endpoint novo)
- Histórias bloqueantes: ORD-207 (Partner) e ORD-208 (`referred_by_partner_id`) — ambas Ready, já
  mergeadas em `main`

## Critérios de aceite funcionais
- [ ] Listagem de parceiros mostra "Empresas indicadas" (contagem, só empresas `active=true`)
- [ ] Tela de edição do parceiro mostra lista nominal com nome + "vinculado desde" de cada empresa
- [ ] Parceiro sem empresa indicada mostra 0 / estado vazio, não erro
- [ ] Listagem de empresas mostra coluna "Parceiro" (nome ou "—")
- [ ] Empresa sem parceiro mostra "—", sem erro nem célula quebrada
- [ ] As duas colunas novas têm tooltip explícito: *"Vínculo atual — não usar para cálculo de
      comissão. O fechamento mensal reconstrói o vínculo histórico separadamente."*
- [ ] Trocar o vínculo de uma empresa reflete imediatamente nas duas visões (sai do parceiro
      antigo, entra no novo)
- [ ] Parceiro inativo continua contando empresas indicadas (não filtra por status do parceiro)
- [ ] Acesso restrito a platform-admin (403 owner/manager, 401 sem token) — mesmo padrão das duas
      listagens hoje

## Wireframe / Mockup
- `PartnerListScreen.tsx`: nova coluna "Empresas indicadas" (mono, como `linked_companies_count`
  do `PriceTableListScreen`, ORD-165).
- `PartnerFormScreen.tsx`: nova seção "Empresas indicadas" — molde do bloco `linkedCompanies` do
  `PriceTableFormScreen` (ORD-167), com nome + data de vínculo por linha.
- `CompanyListScreen.tsx`: nova coluna "Parceiro" (nome ou "—").

---

## Solução Técnica

### Serviços impactados
- **`company-service`**: `list_partners` e `list_companies` ganham campo novo; 1 endpoint novo
  (`GET /commercial/partners/{id}/companies`). Nenhuma migration.
- **`frontend/admin`**: 3 telas alteradas, nenhuma rota nova.

### Endpoints

#### GET /commercial/partners (campo novo: `referred_companies_count`)
Agregação em lote, mesmo padrão de `table_ids`/`tables_by_id` já usado na própria função:
```python
partner_ids = [p.id for p in partners]
counts_by_partner: dict[int, int] = {}
if partner_ids:
    count_rows = await db.execute(
        select(Company.referred_by_partner_id, func.count())
        .where(Company.referred_by_partner_id.in_(partner_ids), Company.active == True)
        .group_by(Company.referred_by_partner_id)
    )
    counts_by_partner = dict(count_rows.all())
```
`Company.active == True` — consistente com `list_companies`, que já esconde empresa inativa de
toda listagem; sem isso a contagem incluiria empresa "fantasma" que some do resto do admin.

**Comentário de aviso obrigatório no código** (achado do repasse de Financeiro — mitigação contra
reaproveitar este número na futura história de fechamento mensal):
```python
# ATENÇÃO — futuro dev de fechamento mensal: este count é o vínculo ATUAL
# (Company.referred_by_partner_id), não serve pra calcular comissão de mês
# fechado. Pra isso, reconstruir via CompanyPartnerHistory (ver nota no
# doc do ORD-209/210) — uma empresa pode ter trocado de parceiro DEPOIS
# do mês que está sendo fechado.
```

#### GET /commercial/partners/{id}/companies — NOVO
**Auth:** platform-admin. 404 se parceiro não existe. Sem paginação (4 empresas no banco hoje —
mesmo racional de `linkedCompanies` do `PriceTableFormScreen`, que também não pagina).
Response: `{ companies: [{ id, name, document, contract_status, vinculado_desde }] }`.
`vinculado_desde` = `created_at` da entrada mais recente em `CompanyPartnerHistory` pra aquela
empresa (`WHERE company_id = X ORDER BY created_at DESC LIMIT 1`) — recomendação do repasse de
Financeiro, baixo custo no volume atual, poupa retrabalho na história de fechamento mensal.

#### GET /companies (campo novo: `referred_by_partner`)
Resolução em lote pelo **conjunto** de ids distintos da página (achado do repasse de QA — uma
página pode ter vários parceiros diferentes, não um só):
```python
partner_ids = {c.referred_by_partner_id for c in companies if c.referred_by_partner_id is not None}
partners_by_id: dict[int, Partner] = {}
if partner_ids:
    partners_result = await db.execute(select(Partner).where(Partner.id.in_(partner_ids)))
    partners_by_id = {p.id: p for p in partners_result.scalars().all()}
```
Serialização: `{"id": partner.id, "name": partner.name} if partner else None`. Mesmo formato de
`PartnerCommissionTableRef` (`{id, name}`), consistente com o padrão já usado no próprio `Partner`.

### Migrations
Nenhuma — nenhum schema muda, só serialização e 2 queries novas de agregação/resolução.

### Frontend
- `PartnerListScreen.tsx`: coluna "Empresas indicadas" + tooltip.
- `PartnerFormScreen.tsx`: seção "Empresas indicadas" (nome + `vinculado_desde` por linha).
- `CompanyListScreen.tsx`: coluna "Parceiro" (nome ou "—") + tooltip.

### Riscos técnicos
- Reaproveitamento indevido do `referred_companies_count` na futura história de fechamento mensal
  — mitigado com comentário de aviso no código (ver acima), não é responsabilidade só do texto de
  tooltip na UI.
- Nenhum risco de isolamento multi-tenant novo — `list_companies`/`list_partners` já são
  platform-admin only, sem conceito de `company_id` de quem consulta.

### Estimativa
- Backend: ~3.5–4h (2 agregações em lote + 1 endpoint novo com `vinculado_desde` + testes).
- Frontend: ~3–4h.
- **Total: ~6.5–8h.**

---

## Repasses realizados

| Repasse | Achado principal | Aplicado |
|---|---|---|
| PM | Nenhuma sobreposição real com a nota de fechamento mensal do ORD-209 (visão atual vs. histórica são coisas diferentes), mas risco de confusão de nomenclatura — recomendou tooltip explícito. Perguntou ao usuário se "cruzamento" implicava mais que a Opção A — usuário pediu Opção A **e** B | Sim — Opção B incorporada, tooltip fica pro repasse de Financeiro refinar |
| QA | Faltava cenário de empresa sem parceiro (lado da listagem de empresas); resolução em lote precisa cobrir múltiplos parceiros distintos na mesma página, não um só; parceiro inativo deve continuar contando | Sim |
| Backend-SR | Query exata das duas agregações (mirror do padrão `table_ids`/`tables_by_id` já existente); confirmado sem paginação necessária (4 empresas no banco hoje); confirmado sem migration; formato `{id,name}` consistente com `PartnerCommissionTableRef` | Sim |
| Administrativo | Sem novo risco de LGPD (mesmo dado, só em mais um lugar); sem objeção ao acesso superadmin+admin | Sim (nenhuma mudança necessária) |
| Financeiro | Tooltip genérico não bastava — reforçado pra citar explicitamente "não usar para cálculo de comissão"; comentário de aviso obrigatório no código (mitigação contra atalho futuro); recomendou incluir `vinculado_desde` desde já (baixo custo, poupa retrabalho) | Sim |

## Rastreabilidade ponta a ponta

| Passo do Fluxo Principal | Critério de aceite | Cenário Gherkin | Endpoint/tela |
|---|---|---|---|
| 1. Ver contagem na listagem de parceiros | Coluna "Empresas indicadas" (só ativas), tooltip | Sem empresa / 1 / múltiplas / parceiro inativo | `GET /commercial/partners` (+`referred_companies_count`), `PartnerListScreen.tsx` |
| 2. Ver lista nominal ao abrir um parceiro | Nome + `vinculado_desde` por empresa | 1 empresa / múltiplas | `GET /commercial/partners/{id}/companies` (novo), `PartnerFormScreen.tsx` |
| 3. Ver parceiro na listagem de empresas | Coluna "Parceiro" (nome ou "—"), tooltip | Empresa sem parceiro / página com múltiplos parceiros distintos | `GET /companies` (+`referred_by_partner`), `CompanyListScreen.tsx` |
| 4. Troca de vínculo reflete nas duas visões | Sai do antigo, entra no novo, imediatamente | Empresa que trocou de parceiro | `PUT /companies/{id}/partner` (ORD-208, sem mudança) |
| 5. Acesso restrito | 403 owner/manager, 401 sem token | Acesso negado / sem token | Mesmo `_require_platform_admin` das 2 listagens |

Fora de escopo (cálculo de comissão, fechamento mensal) — decisão explícita, não omissão.
