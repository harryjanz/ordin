---
id: ORD-083
status: Done
fase: 6
sprint: null
responsavel: Backend + Frontend
estimativa: 5 pontos
---

# ORD-083 — Catálogo herda sessão de empresa (superadmin/admin), mesmo padrão das outras 5 telas

## Descrição
Pedido direto do usuário: levar o mesmo padrão de sessão de empresa (ORD-082) pra `/catalog` — superadmin/admin devem gerenciar categorias e produtos de qualquer empresa cliente, herdando a empresa da sessão ativa (selecionada em qualquer uma das outras telas) ou, sem sessão, usando o mesmo campo de seleção de empresa que Configurações já tem.

**Achado crítico não pedido, descoberto na investigação:** diferente de `payment-service`/`order-service` (já corrigidos nesta sessão), o `catalog-service` **nunca teve nenhum bypass de empresa** — os 14 endpoints (categorias e produtos, CRUD completo + reorder + upload/remoção de imagem) usavam `current_user.company_id` direto, sem exceção nenhuma pra nenhum role. Além disso, `_WRITE_ROLES` (quem pode criar/editar/excluir) nem incluía `superadmin` — só `admin`/`owner`/`manager`. Ou seja: mesmo com `/catalog` já liberado no `ROLE_ROUTES` do frontend pra superadmin/admin (matriz de RBAC desta sessão), um superadmin tentando criar uma categoria hoje receberia 403.

## Persona
**Superadmin/admin** administram o catálogo de qualquer empresa cliente — útil pra cadastrar o cardápio inicial de uma empresa nova, corrigir um erro de catálogo sem precisar logar como o cliente, ou dar suporte direto. **Owner/manager** continuam restritos à própria empresa, sem nenhuma mudança de comportamento.

## Contexto

### Achado 1 — zero bypass em 14 endpoints
`services/catalog/main.py` — `list_categories`, `list_products`, `get_product`, `create_category`, `update_category`, `delete_category`, `create_product`, `reorder_products`, `update_product`, `delete_product`, `upload_product_image_endpoint`, `delete_product_image` usavam `current_user.company_id` direto (14 ocorrências). `list_allergens` é a exceção correta — master data global, não escopado por empresa (RDC 727/2022 é a mesma lista pra todo mundo).

### Achado 2 — `_WRITE_ROLES` sem `superadmin`
`_WRITE_ROLES = {"admin", "owner", "manager"}` — mesmo padrão de lacuna já visto em `payment-service` antes desta sessão corrigir. Sem isso, mesmo resolvendo o Achado 1, superadmin conseguiria listar mas não criar/editar nada.

### Achado 3 — catálogo é edição de UMA empresa, não visão agregada
Diferente de `list_payments`/`list_orders` (que respondem "todas as empresas" quando superadmin não filtra), catálogo não tem essa opção — não faz sentido "ver categorias de todas as empresas ao mesmo tempo" numa tela de edição. Decisão técnica: `company_id` é **obrigatório** pra superadmin/admin (400 se ausente), não opcional-com-fallback-pra-tudo.

### Achado 4 — fixture de teste quebrada pela mudança de significado de "admin"
`token_company_b` (fixture de isolamento multi-tenant, usada em 3 testes) tinha `role="admin"` representando um usuário comum de uma segunda empresa — desde que "admin" passou a significar "gestão da plataforma" (equivalente a superadmin, decisão desta sessão, `docs/ARQUITETURA.md` §1.2), isso quebrou 3 testes que não tinham nada a ver com esta mudança. Corrigido pra `role="owner"`, que é o que a fixture sempre quis representar.

### Por que não apareceu antes
Ninguém testou catálogo como superadmin — a tela só ganhou acesso de rota pra esse role nesta mesma sessão (matriz de RBAC), e o bypass de backend nunca foi implementado junto.

---

## Explorer

### História
Como **superadmin/admin**, quero gerenciar categorias e produtos de qualquer empresa cliente, herdando a empresa da sessão ativa (ou escolhendo uma, se não houver sessão), para dar suporte/configurar catálogo sem precisar logar como o cliente.

### Fluxo principal
1. Superadmin/admin abre `/catalog`
2. Se já existe empresa na sessão (selecionada em Transações, Pedidos, Configurações, etc.) — catálogo já carrega direto pra essa empresa
3. Se não existe sessão ativa — vê um seletor de empresa (mesmo campo de Configurações) e um estado vazio até escolher
4. Categorias/produtos, criação, edição, exclusão, reordenação e upload de imagem funcionam normalmente, sempre escopados à empresa selecionada
5. Owner/manager não veem seletor, comportamento idêntico ao atual

### Critérios de aceite
- [x] `_WRITE_ROLES` ganha `superadmin`
- [x] Dependency compartilhada (`resolve_company_id`/`resolve_company_id_write`) substitui as 14 ocorrências de `current_user.company_id` — superadmin/admin precisam de `company_id` explícito (400 se ausente), owner/manager restritos à própria empresa (parâmetro ignorado)
- [x] Frontend: `CatalogScreen` ganha seletor de empresa (Dropdown, mesmo padrão de Configurações), usando `selectedCompanyId`/`setSelectedCompany` (sessão compartilhada com as outras 5 telas)
- [x] Estado vazio explícito quando superadmin/admin sem empresa selecionada
- [x] Todas as chamadas de API (listar/criar/editar/excluir categorias e produtos, reorder, upload/remoção de imagem) anexam `company_id` quando aplicável
- [x] Alérgenos (master data) não são escopados por empresa — sem mudança
- [x] Owner/manager sem nenhuma mudança de comportamento

### Wireframe / Mockup
Reaproveita o campo de seleção de empresa já implementado em `SettingsScreen.tsx` (Dropdown + `listCompanies()`), mesmo padrão visual.

---

## QA Explorer

```gherkin
Feature: Catálogo herda sessão de empresa

  Scenario: Superadmin sem company_id recebe 400
    Dado que o usuário logado é superadmin
    Quando ele chama GET /catalog/categories sem informar company_id
    Então recebe 400

  Scenario: Superadmin com company_id vê o catálogo da empresa
    Dado que o usuário logado é superadmin
    Quando ele chama GET /catalog/categories?company_id=1
    Então vê as categorias da empresa 1

  Scenario: Owner ignora company_id de outra empresa
    Dado que o usuário logado é owner da empresa 1
    Quando ele chama GET /catalog/categories?company_id=2
    Então continua vendo só as categorias da empresa 1

  Scenario: Sessão compartilhada entre telas
    Dado que o superadmin selecionou uma empresa em Transações
    Quando ele navega pra Catálogo
    Então o catálogo já carrega pra essa empresa, sem precisar selecionar de novo

  Scenario: Sem sessão ativa, catálogo mostra seletor e estado vazio
    Dado que o superadmin ainda não selecionou nenhuma empresa
    Quando ele abre /catalog
    Então vê o seletor de empresa e um estado vazio, não um erro

  Scenario: Superadmin cria categoria em empresa específica
    Dado que o superadmin selecionou a empresa 1
    Quando ele cria uma categoria
    Então ela é criada na empresa 1, não na empresa do próprio token do superadmin
```

---

## Tech Explorer

### Serviços impactados
- `services/catalog/` — `main.py` (14 endpoints + 2 dependencies novas), `conftest.py` (fixtures `token_superadmin`/`token_admin` novas, `token_company_b` corrigida), `tests/test_coverage.py` (5 testes novos)
- `frontend/admin/` — `CatalogScreen.tsx`, `CatalogScreen.module.scss`

### Diagnóstico técnico (confirmado no código e ao vivo via curl)
| Achado | Evidência |
|---|---|
| 14 endpoints sem bypass | `grep current_user.company_id services/catalog/main.py` — 14 ocorrências antes da mudança |
| `_WRITE_ROLES` sem superadmin | `main.py:29` (antes) |
| Verificado ao vivo | `curl` autenticado: superadmin sem `company_id` → 400; com `company_id=1` → 4 categorias reais da Burger House; owner sem mudança → mesmas 4 categorias |

### Direção técnica aplicada

**Backend — dependency compartilhada** (em vez de repetir a lógica 14 vezes):
```python
def _resolve_company_id(company_id: Optional[int], current_user: TokenPayload) -> int:
    if current_user.role in ("superadmin", "admin"):
        if not company_id:
            raise HTTPException(400, detail="Parâmetro company_id é obrigatório para superadmin/admin")
        return company_id
    return current_user.company_id

async def resolve_company_id(company_id: Optional[int] = None, current_user: TokenPayload = Depends(get_current_user)) -> int:
    return _resolve_company_id(company_id, current_user)

async def resolve_company_id_write(company_id: Optional[int] = None, current_user: TokenPayload = Depends(require_write_role)) -> int:
    return _resolve_company_id(company_id, current_user)
```
Cada endpoint troca `current_user: TokenPayload = Depends(get_current_user | require_write_role)` por `company_id: int = Depends(resolve_company_id | resolve_company_id_write)`, e todo uso de `current_user.company_id` no corpo vira `company_id`.

**Frontend:** `catalogParams(extra)` helper que anexa `company_id` via `{ params: {...} }` do axios em toda chamada — GET, POST, PUT e DELETE aceitam esse config da mesma forma. Sessão via `selectedCompanyId`/`setSelectedCompany` (store global), mesmo valor que as outras 5 telas já leem/escrevem.

### Riscos
- `token_company_b` (fixture de teste) tinha `role="admin"` representando "usuário comum de outra empresa" — quebrou com a mudança de significado de "admin". Corrigido pra `"owner"`. Vale conferir se outros serviços têm a mesma fixture com o mesmo problema (não verificado nesta história, só catalog-service).
- 3 falhas + 1 erro em `test_catalog.py` são flakiness pré-existente de event loop (`RuntimeError: ... attached to a different loop`) — confirmado rodando a suíte no `main.py` original, sem nenhuma mudança minha, mesma falha. Não relacionado a esta história.

### Estimativa
5 pontos — maior superfície de backend desta sessão (14 endpoints vs. 1 endpoint em payment/order), mitigado pela extração em dependency compartilhada em vez de edição repetida.

---

## Downstream

Fluxo simplificado de dev único, sem revisor formal nem branch protection.

- Branch `feature/ord-083-catalogo-selecao-empresa` criada a partir de `main`.
- Backend: `_WRITE_ROLES` + dependency compartilhada + 14 endpoints migrados + fix da fixture `token_company_b` + 5 testes novos.
- Frontend: seletor de empresa + `catalogParams()` em todas as chamadas + estado vazio.
- `pytest services/catalog/tests/` — 74 passed (5 novos), 3 falhas + 1 erro de flakiness pré-existente confirmada (não introduzida por esta história).
- `tsc --noEmit` limpo.
- Verificado ao vivo via `curl` autenticado (superadmin sem/com `company_id`, owner sem regressão).

**Status: Done**
