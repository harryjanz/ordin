---
id: ORD-061
status: Done
fase: 4
sprint: null
responsavel: Backend SR
estimativa: 5 pontos
---

# ORD-061 — Filtros de listagem e edição completa de cadastro (company-service)

## Descrição
O admin panel ganhou em ORD-060 um wizard de cadastro de cliente, mas depois de criado o único jeito de encontrar ou corrigir os dados de uma empresa continua sendo `curl`/Swagger — o mesmo problema que o ORD-060 resolveu para criação ainda existe para consulta e correção. Esta história prepara o `company-service` para as duas telas de frontend que vêm a seguir (ORD-062 — listagem, ORD-063 — edição): adiciona filtros ao `GET /companies` e expande o `PUT /companies/{id}` para aceitar os campos cadastrais completos, hoje restritos a `name/document/plan/payment_provider`.

## Persona
**Super admin** (mesma persona do ORD-060) e, indiretamente, os dois frontends que vão consumir esses endpoints.

## Contexto
Levantamento do `services/company/main.py` encontrou:
- `GET /companies` (linha 636) só pagina (`skip`/`limit`) — **nenhum filtro** por nome, CNPJ ou status.
- `PUT /companies/{company_id}` (linha 747) usa `CompanyUpdate`, que só tem `name`, `document`, `plan`, `payment_provider` — **não permite editar** razão social, endereço, porte, regime tributário, CNAE ou inscrição estadual, ou seja, nenhum dos campos que o wizard do ORD-060 cadastra.
- `POST /companies` (criação) revalida o CNPJ na Receita a cada submit, mesmo que o front já tenha consultado antes — decisão deliberada contra o risco de a situação cadastral mudar na janela entre a consulta e o submit. Editar o `document` reabriria essa mesma janela de risco; por isso esta história trata `document` como **imutável após a criação** (ver Tech Explorer).
- `GET /companies/{id}/contacts` e `POST .../legal-representative` já existem e o `legal-representative` já é upsert (cria ou atualiza) — **nenhuma mudança necessária neles**. Editar contatos individuais (ex. trocar e-mail de um contato específico) fica fora de escopo — não foi pedido e o schema atual de contatos não tem PUT/DELETE por item; fica registrado como débito conhecido, não como bloqueador.

Wireframe de referência (mostra como listagem e edição vão consumir esses contratos): **[ORD-061/062 — Listagem e edição de clientes (wireframe)](https://claude.ai/code/artifact/2eb261bb-6be2-4cec-99f7-bbe822472553)**.

### Dependências
- Nenhuma história bloqueante — `company-service` já está em `main` (PR #25, #26).
- **Bloqueia:** ORD-062 (listagem) e ORD-063 (edição) — ambas consomem os contratos definidos aqui.

---

## Explorer

## História
Como **super admin**, quero que a API do `company-service` permita **filtrar** empresas por razão social/nome, CNPJ e status do contrato, e **editar** todos os campos cadastrais de uma empresa já criada, para que o admin panel possa oferecer listagem com busca e edição de cadastro sem depender de `curl`.

### Fluxo principal
1. Super admin (via frontend, ORD-062) chama `GET /companies?q=...&document=...&contract_status=...&skip=...&limit=...`
2. API retorna `{companies: [...], total: N}` já filtrado, mesma forma de hoje
3. Super admin (via frontend, ORD-063) chama `PUT /companies/{id}` com os campos cadastrais completos (exceto `document`)
4. API atualiza e retorna o `CompanyOut` completo, mesmo schema do `GET /companies/{id}`

### Fluxos alternativos / exceções
- Filtros não combinados (ex: só `contract_status`) devem funcionar isoladamente
- `document` no corpo do `PUT` é **ignorado silenciosamente** (não gera erro 422) — evita quebrar um client que reenvie o payload completo do detalhe sem filtrar o campo primeiro
- CNPJ passado no filtro `document` pode vir mascarado (`00.000.000/0000-00`) ou não — normalizado no backend antes da comparação, mesmo padrão de `normalize_cnpj` já usado em `CompanyIn`

---

## QA Explorer

```gherkin
Feature: Filtros de listagem e edição de cadastro (company-service)

  Scenario: Filtrar por razão social ou nome fantasia
    Dado que existem empresas "Sabor Caseiro Ltda" e "Doce Sabor Confeitaria"
    Quando chamo GET /companies?q=sabor
    Então ambas aparecem no resultado
    E o total reflete a contagem filtrada, não o total geral

  Scenario: Filtrar por CNPJ mascarado ou não
    Dado uma empresa com document "11222333000181"
    Quando chamo GET /companies?document=11.222.333/0001-81
    Então a empresa aparece no resultado

  Scenario: Filtrar por status do contrato
    Dado empresas com contract_status "pendente", "enviado" e "assinado"
    Quando chamo GET /companies?contract_status=enviado
    Então só a empresa com status "enviado" aparece

  Scenario: Filtros combinados
    Quando chamo GET /companies?q=sabor&contract_status=pendente
    Então só empresas que atendem os dois critérios aparecem

  Scenario: Editar campos cadastrais completos
    Dado uma empresa já criada via wizard (ORD-060)
    Quando chamo PUT /companies/{id} com razão social, endereço, porte e regime tributário novos
    Então a resposta 200 reflete todos os campos atualizados
    E GET /companies/{id} depois confirma a persistência

  Scenario: document é imutável via PUT
    Dado uma empresa com document "11222333000181"
    Quando chamo PUT /companies/{id} incluindo document="99999999000199" no corpo
    Então a resposta 200 não altera o document da empresa
    E GET /companies/{id} confirma que o document original permanece

  Scenario: Isolamento por role
    Dado um usuário com role "owner" (não superadmin)
    Quando chama GET /companies ou PUT /companies/{id} de outra empresa
    Então recebe 403

  Scenario: Editar empresa inexistente ou inativa
    Quando chamo PUT /companies/99999
    Então recebo 404
```

**Aprovado pelo PM.** Cenário mais crítico: `document` imutável via `PUT` — é a decisão técnica menos óbvia da história e a mais fácil de um dev "corrigir" sem querer ao ver o campo no payload.

---

## Tech Explorer

### Serviços impactados
- **`services/company/main.py`** apenas. Nenhuma migration nova — todos os campos já existem na tabela `companies` desde ORD-056/057.

### `GET /companies` — novos query params
```python
@app.get("/companies", response_model=CompanyListOut, ...)
async def list_companies(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    q: Optional[str] = Query(None, description="Busca em nome fantasia ou razão social"),
    document: Optional[str] = Query(None, description="CNPJ, com ou sem máscara"),
    contract_status: Optional[str] = Query(None, pattern="^(pendente|enviado|assinado)$"),
    ...
):
    _require_superadmin(current_user)
    stmt = select(Company).where(Company.active == True)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Company.name.ilike(like), Company.legal_name.ilike(like)))
    if document:
        stmt = stmt.where(Company.document == normalize_cnpj(document))
    if contract_status:
        stmt = stmt.where(Company.contract_status == contract_status)
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar()
    result = await db.execute(stmt.offset(skip).limit(limit))
    return {"companies": result.scalars().all(), "total": total}
```
Reaproveita `normalize_cnpj` já importado de `domain/cnpj.py` (mesmo usado em `CompanyIn`).

### `PUT /companies/{id}` — `CompanyUpdate` expandido
```python
class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    plan: Optional[str] = None
    payment_provider: Optional[str] = None
    legal_name: Optional[str] = None
    state_registration: Optional[str] = None
    municipal_registration: Optional[str] = None
    tax_regime: Optional[str] = None
    company_size: Optional[str] = None
    cnae_code: Optional[str] = None
    zip_code: Optional[str] = None
    street: Optional[str] = None
    address_number: Optional[str] = None
    complement: Optional[str] = None
    neighborhood: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None

    @field_validator("zip_code")
    @classmethod
    def validate_zip_code(cls, v):
        # mesmo validador de CompanyIn — reaproveitar, não duplicar
        ...
```
**`document` removido do schema de update** (era o único campo de `CompanyUpdate` que também está em `CompanyIn` e permitia reescrever o CNPJ). O handler `update_company` passa a copiar apenas os campos presentes em `CompanyUpdate`; como `document` não existe mais no schema, é estruturalmente impossível alterá-lo por aqui — não é uma checagem em runtime que alguém pode esquecer, é ausência de campo.

### Índices
`Company.name` e `Company.legal_name` não têm índice hoje. Com `ILIKE '%...%'` (busca por substring), índice B-tree não ajuda de qualquer forma — aceito sem otimização adicional dado o volume atual (dezenas de empresas, não milhares). Registrar como item futuro se o volume crescer (full-text search).

### Contrato de API (resumo)
```
GET /companies?q=&document=&contract_status=&skip=&limit=   (expandido)
PUT /companies/{id}                                          (schema expandido, document imutável)
```
Nenhum endpoint novo — apenas expansão dos dois existentes.

### Impacto em outros serviços
Nenhum.

### Riscos
- `CompanyUpdate` sem `document` é uma mudança de contrato "estreitante" (remove um campo que hoje é aceito, mesmo que hoje ele já sobrescrevesse o document sem revalidar CNPJ — o que é o próprio bug que motivou removê-lo). Nenhum consumidor atual depende de editar `document` via `PUT` (ORD-060 nunca chama update depois da criação), risco de quebra é zero na prática.
- `ILIKE` com wildcard nas duas pontas impede uso de índice — aceito conscientemente pelo volume atual (ver acima).

### Estimativa
5 pontos — mudança contida a um arquivo, sem migration, sem endpoint novo, mas com reescrita de schema que exige atenção (campo removido, não só adicionado).

---

## Ready

**Explorer:** [x] história, contexto, gap de filtros e de edição documentados, decisão de `document` imutável justificada · **QA Explorer:** [x] filtros isolados e combinados, imutabilidade de `document`, isolamento por role, 404 · **Tech Explorer:** [x] query params, schema expandido, contrato resumido, riscos de índice e de contrato registrados · **Aprovação final:** pendente — apresentada ao usuário junto com ORD-062 e ORD-063.

**Status: Ready** — sem bloqueadores técnicos, pode começar assim que priorizada.
