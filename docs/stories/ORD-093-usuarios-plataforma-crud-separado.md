---
id: ORD-093
status: Ready
fase: 6
sprint: null
responsavel: Backend + Frontend
estimativa: 21 pontos
---

# ORD-093 — Usuários da plataforma (superadmin/admin) em CRUD separado, fora do cadastro de clientes

## Descrição
Pedido do usuário (2026-08-17): usuários administrativos da própria Ordin (`superadmin`/`admin`) estão se misturando visualmente com o cadastro de usuários de empresas clientes, gerando confusão pra quem opera o sistema. Solução: manter a mesma tabela `users` (sem quebrar schema/migrations existentes), mas criar uma tela de gestão **separada**, exclusiva pra `superadmin`/`admin`, com item de menu próprio — e garantir que a aba Usuários de `/company` nunca mais mostre contas administrativas, nem pra quem já é `superadmin`/`admin`.

## Persona
`superadmin`/`admin` (gerencia a própria equipe da plataforma) e, indiretamente, todo `owner`/`manager` (deixa de ver contas administrativas "vazando" na listagem da própria empresa).

## Contexto

### Causa raiz confirmada no código
`User.company_id` é `NOT NULL` — o seed força `superadmin`/`admin` a "pertencer" a uma empresa cliente qualquer (hoje, Burger House, id=1). O ORD-091 (achado dentro da sessão do ORD-088, nunca virou story própria) já filtrou esses usuários da visão de `owner`/`manager` em `list_users`, mas manteve visíveis pra quem já é `superadmin`/`admin` — sob a premissa de que ajudava no suporte. Na prática: ao selecionar a empresa que por acaso é a mesma que os usuários de plataforma estão "presos" (Burger House), a listagem de usuários dessa empresa mostra as duas populações juntas — confuso mesmo pra quem é `superadmin`/`admin`.

### Achado adicional — validação de papel ausente (relevante pra esta história)
`UserIn.role` (`POST /companies/{company_id}/users`, `services/company/main.py:487-492`) é só `str`, sem `Enum`/`pattern` — a única restrição de papel hoje é na UI (dropdown do `CompanyScreen.tsx`). Batendo direto na API, um `owner`/`manager` conseguiria criar um usuário com `role: "superadmin"` dentro da própria empresa. Sem corrigir isso, a separação proposta por esta história fica furada por fora da UI — vira parte obrigatória do escopo.

### Decisão de arquitetura confirmada com o usuário
"Empresa interna" dedicada (`Company` com flag `is_platform=True`, criada uma única vez por migration) — `superadmin`/`admin` passam a ter `company_id` apontando pra ela, e ela é filtrada de qualquer listagem/seletor voltado a empresa cliente. **Confirmado com o usuário:** o fluxo de "assumir controle de uma empresa" (seletor de empresa em Configurações/Empresa, mesmo padrão do ORD-082) **não muda em nada** — ele nunca dependeu do `company_id` próprio de `superadmin`/`admin`, só do papel + `selectedCompanyId` da sessão. A única mudança visível é que a empresa interna nunca aparece como opção pra dar suporte.

**Sobre o id da empresa interna (decidido com o usuário, 2026-08-17):** o pedido original era a empresa Ordin nascer com `id=1`. No banco de dev atual, `id=1` já é a Burger House (com terminais/catálogo/pedidos/pagamentos referenciando esse id em cascata) — renumerar isso pra abrir espaço é mais arriscado que o ganho. **Decisão:** a empresa interna nasce com o próximo id disponível (auto-increment normal); todo o código resolve ela pela flag `is_platform=True`, nunca por um id fixo — o valor numérico do id não importa em nenhum lugar da lógica.

**Regra adicional confirmada:** a empresa interna só pode conter usuários `superadmin`/`admin` — e, na direção oposta, nenhuma empresa cliente pode conter usuários `superadmin`/`admin`. As duas pontas dessa regra têm que ser validadas (ver Tech Explorer — hoje só existia validação de UI, nenhuma no backend, pros dois lados).

---

## Explorer

### História
Como `owner`/`manager`, quero que a listagem de usuários da minha empresa mostre só gente de verdade da minha empresa, nunca a equipe interna da Ordin. Como `superadmin`/`admin`, quero uma tela própria pra gerenciar os usuários da plataforma, separada do cadastro de clientes, com o mesmo padrão de convite/edição/desativação que já existe — sem misturar as duas populações em lugar nenhum da interface.

### Fluxo principal
1. `superadmin`/`admin` acessa um item novo no menu lateral — "Usuários da plataforma" (ou nome equivalente), visível só pra esses dois papéis
2. Tela igual em estrutura à aba Usuários de `/company` (convite por nome/e-mail/papel, listagem com filtros, reenviar convite, desativar/reativar), mas:
   - Papel do convite só aceita `superadmin` ou `admin`
   - Lista só mostra usuários com esses dois papéis
   - Não depende de nenhum seletor de empresa (não é "de" nenhuma empresa cliente)
3. A aba Usuários de `/company` (qualquer empresa, inclusive quando `superadmin`/`admin` está dando suporte) passa a **sempre** excluir `superadmin`/`admin` da listagem — sem exceção por papel de quem está vendo
4. `POST /companies/{id}/users` passa a rejeitar `role` fora de `owner|manager|cashier`; o novo endpoint de plataforma rejeita `role` fora de `superadmin|admin`

### Fluxos alternativos / exceções
- Migration de dados: usuários `superadmin`/`admin` já existentes (seed) têm o `company_id` migrado pra empresa interna nova, na mesma migration que cria essa empresa — não pode ficar em dois passos (janela onde a empresa interna existe mas ninguém aponta pra ela, ou vice-versa)
- `GET /companies` (listagem geral e seletores de Settings/CompanyScreen) nunca retorna a empresa interna, nem pra `superadmin`/`admin`
- Duplo fator, dispositivo confiável, força de senha etc. (ORD-088/090/092) continuam funcionando pra usuários de plataforma sem nenhuma mudança — nada nesses fluxos depende de qual empresa o usuário pertence, exceto a política de MFA (`mfa_policy`), que passa a ser a da empresa interna (mais correto que hoje, onde a política de 2FA de um `superadmin` dependia arbitrariamente da política da Burger House)
- Override administrativo de MFA (`/companies/{id}/users/{uid}/mfa/reset`) precisa de um equivalente pro CRUD de plataforma, já que agora platform users não passam mais pela aba Usuários de nenhuma empresa

### Dependências
- Serviços envolvidos: `company` (schema, migration de dados, endpoints novos e alterados)
- Histórias relacionadas: [[ORD-088]] (MFA), [[ORD-090]] (edição/força de senha), [[ORD-092]] (dispositivo confiável) — nenhuma muda de comportamento, só de dado (qual `company_id` o usuário de plataforma carrega)
- Sem histórias bloqueantes

### Critérios de aceite funcionais
- [ ] Empresa interna "Ordin — Plataforma" criada via migration, com `is_platform=True`
- [ ] Todo usuário `superadmin`/`admin` existente migrado pra `company_id` da empresa interna, na mesma migration
- [ ] `GET /companies` nunca retorna a empresa interna (listagem geral nem seletores)
- [ ] Aba Usuários de `/company` nunca mostra `superadmin`/`admin`, pra nenhum papel (inclusive quando o próprio `superadmin`/`admin` está vendo)
- [ ] Nova tela "Usuários da plataforma", exclusiva `superadmin`/`admin`, com convite/edição/desativação/reenvio — mesmo padrão visual da aba Usuários de `/company`
- [ ] Novo item de menu, visível só pra `superadmin`/`admin`
- [ ] `POST /companies/{id}/users` rejeita `role` fora de `owner|manager|cashier`
- [ ] Novo endpoint de convite de plataforma rejeita `role` fora de `superadmin|admin`
- [ ] `admin` só consegue criar/promover outro `admin` — nunca `superadmin`; `superadmin` cria/promove qualquer um dos dois
- [ ] Seletor de empresa (Configurações/Empresa) continua funcionando exatamente como hoje pra dar suporte a qualquer empresa real
- [ ] MFA, força de senha, dispositivo confiável — sem regressão pra usuários de plataforma

### Wireframe / Mockup
Sem mockup formal — clona a estrutura visual da aba Usuários de `/company` (`CompanyScreen.tsx`), removendo o que é específico de empresa (seletor, abas Terminais/Pagamento) e restringindo o dropdown de papel a `superadmin`/`admin`.

---

## QA Explorer

```gherkin
Feature: Usuários da plataforma em CRUD separado

  Background:
    Dado a empresa interna "Ordin — Plataforma" já migrada
    E usuários superadmin/admin já apontando pra ela

  Scenario: Empresa interna nunca aparece na listagem geral
    Quando qualquer usuário (superadmin, admin, owner) lista empresas via GET /companies
    Então a empresa interna "Ordin — Plataforma" nunca está no resultado

  Scenario: Empresa interna nunca aparece no seletor de suporte
    Dado um superadmin logado em Configurações ou na tela Empresa
    Quando ele abre o seletor de empresa
    Então só empresas de clientes reais aparecem, nunca a empresa interna

  Scenario: Aba Usuários de /company nunca mostra usuários de plataforma
    Dado uma empresa cliente com usuários owner/manager/cashier
    Quando um superadmin ou admin visualiza a aba Usuários dessa empresa
    Então nenhum usuário com papel superadmin/admin aparece na lista

  Scenario: Owner/manager continuam sem ver usuários de plataforma (regra já existente)
    Quando um owner ou manager visualiza a aba Usuários da própria empresa
    Então nenhum usuário com papel superadmin/admin aparece (comportamento já garantido pelo ORD-091, preservado)

  Scenario: Nova tela de plataforma lista só superadmin/admin
    Dado usuários com papéis variados no sistema
    Quando um superadmin acessa "Usuários da plataforma"
    Então só usuários com papel superadmin ou admin aparecem

  Scenario: Convite na tela de plataforma só aceita papéis de plataforma
    Quando um superadmin convida um novo usuário na tela de plataforma com papel "admin"
    Então o usuário é criado com company_id da empresa interna e role="admin"

  Scenario: API de empresa rejeita criar usuário com papel de plataforma
    Dado um owner autenticado numa empresa cliente
    Quando ele chama POST /companies/{id}/users com role="superadmin" diretamente na API
    Então a requisição é rejeitada com erro de validação

  Scenario: API de plataforma rejeita criar usuário com papel de empresa
    Dado um superadmin autenticado
    Quando ele chama o endpoint de convite de plataforma com role="owner"
    Então a requisição é rejeitada com erro de validação

  Scenario: Admin não consegue criar superadmin
    Dado um admin autenticado na tela de plataforma
    Quando ele tenta convidar um novo usuário com papel "superadmin"
    Então a requisição é rejeitada com erro 403

  Scenario: Admin consegue criar outro admin
    Dado um admin autenticado na tela de plataforma
    Quando ele convida um novo usuário com papel "admin"
    Então o usuário é criado normalmente

  Scenario: Superadmin consegue criar superadmin e admin
    Dado um superadmin autenticado na tela de plataforma
    Quando ele convida um usuário com papel "superadmin" e depois outro com papel "admin"
    Então ambos são criados normalmente

  Scenario: Admin não consegue promover um admin existente a superadmin
    Dado um admin autenticado editando outro usuário de plataforma
    Quando ele tenta trocar o papel desse usuário para "superadmin"
    Então a requisição é rejeitada com erro 403

  Scenario: owner/manager/cashier não acessam a tela nem a API de plataforma
    Quando um owner tenta acessar a tela ou os endpoints de "Usuários da plataforma"
    Então o acesso é negado com erro 403

  Scenario: Seletor de empresa para suporte continua funcionando normalmente
    Dado um superadmin sem nenhuma empresa selecionada na sessão
    Quando ele seleciona uma empresa cliente real em Configurações
    Então ele passa a operar os dados dessa empresa exatamente como antes desta história

  Scenario: Override administrativo de MFA para usuário de plataforma
    Dado um usuário de plataforma com duplo fator ativo que perdeu o dispositivo
    Quando outro superadmin desativa o 2FA dele pela tela de plataforma
    Então o 2FA desse usuário é desativado, mesmo padrão do override em /company

  Scenario: Migration de dados não deixa usuário de plataforma "órfão"
    Dado o estado do banco antes da migration (superadmin/admin presos numa empresa cliente)
    Quando a migration roda
    Então todo usuário superadmin/admin passa a ter company_id da empresa interna, nenhum fica com company_id de empresa cliente
```

---

## Tech Explorer

### Serviços impactados
- `services/company/` — migration (schema + dado), model `Company.is_platform`, `list_users` sem exceção de papel, `UserIn`/nova validação de papel, endpoints novos de plataforma, `list_companies` filtrando a empresa interna
- `frontend/admin/` — nova tela `PlatformUsersScreen.tsx`, novo item de menu, nova rota

### Migrations

```python
def upgrade():
    op.add_column("companies", sa.Column(
        "is_platform", sa.Boolean(), nullable=False, server_default=sa.text("0")))

    conn = op.get_bind()
    # Cria a empresa interna uma única vez (idempotente — migration pode
    # rodar mais de uma vez em ambientes diferentes sem duplicar).
    result = conn.execute(sa.text(
        "SELECT id FROM companies WHERE is_platform = 1 LIMIT 1"
    )).first()
    if result:
        platform_company_id = result[0]
    else:
        conn.execute(sa.text("""
            INSERT INTO companies (name, document, pin_hash, plan, active, is_platform, state, country)
            VALUES ('Ordin — Plataforma', NULL, '', 'internal', 1, 1, 'SP', 'Brasil')
        """))
        platform_company_id = conn.execute(sa.text("SELECT LAST_INSERT_ID()")).scalar()

    # Migra usuários de plataforma já existentes na mesma transação —
    # nunca existe uma janela onde a empresa interna existe mas ninguém
    # aponta pra ela, nem o inverso.
    conn.execute(sa.text(
        "UPDATE users SET company_id = :pid WHERE role IN ('superadmin', 'admin')"
    ), {"pid": platform_company_id})
```
**Nota:** `pin_hash` da empresa interna fica vazio/inutilizável de propósito — essa empresa nunca faz login de totem, `pin_hash=''` garante que nenhum PIN real bata com ela por acidente.

### Endpoints

#### `GET /companies` (alterado)
Filtro adicional incondicional: `Company.is_platform == False` — nunca retorna a empresa interna, pra nenhum papel.

#### `POST /companies/{company_id}/users` (alterado)
`UserIn.role` ganha validação:
```python
class UserIn(BaseModel):
    name: str
    email: str
    role: str = Field("cashier", pattern="^(owner|manager|cashier)$")
```
Erro 422 se `role` fora desse conjunto — fecha o gap encontrado nesta história.

#### `GET /platform-users` (novo)
**Auth:** JWT, `_require_platform_admin` (já existe, reaproveitado)

Mesma forma de `list_users`, mas filtra `User.company_id == platform_company_id` (resolvido via `select(Company).filter_by(is_platform=True)`, cacheável em memória no processo) e `role IN ('superadmin','admin')` sempre — sem parâmetro de empresa nenhum.

#### `POST /platform-users` (novo)
**Auth:** `_require_platform_admin`

```python
class PlatformUserIn(BaseModel):
    name: str
    email: str
    role: str = Field(..., pattern="^(superadmin|admin)$")
```
**Regra de hierarquia (confirmada com o usuário, 2026-08-17):** ninguém cria um perfil de plataforma com privilégio maior ou igual à trava do próprio papel de quem convida:
```python
if body.role == "superadmin" and current_user.role != "superadmin":
    raise HTTPException(403, "Somente superadmin pode criar outro superadmin")
```
`admin` só consegue convidar `role="admin"` (a validação do `pattern` já barra qualquer coisa fora de `superadmin|admin`; a checagem acima fecha a lacuna entre os dois). `superadmin` pode convidar qualquer um dos dois. Isso é específico do convite de plataforma — **não muda** a regra já existente de convite de usuário de empresa cliente (`owner`/`manager`/`admin`/`superadmin` continuam podendo convidar `owner`/`manager`/`cashier` normalmente, ver ORD-091).

Cria `User` com `company_id = platform_company_id`, reaproveita `_issue_invite` (mesmo fluxo de convite por e-mail do ORD-087, sem mudança).

#### `PUT /platform-users/{user_id}` / `DELETE /platform-users/{user_id}` / `POST /platform-users/{user_id}/resend-invite` (novos)
Espelham `update_user`/`delete_user`/`resend_invite` de `/companies/{id}/users/*`, restritos a usuários cujo `company_id == platform_company_id`. `PUT` (troca de papel) aplica a mesma regra de hierarquia do `POST` acima — um `admin` não promove ninguém a `superadmin` editando o papel depois de criado.

#### `POST /platform-users/{user_id}/mfa/reset` (novo)
Espelha `POST /companies/{id}/users/{uid}/mfa/reset` (override administrativo do ORD-088), mesmo `_clear_mfa` reaproveitado.

### Frontend
- `PlatformUsersScreen.tsx` (novo) — clone estrutural da aba Usuários de `CompanyScreen.tsx`, sem seletor de empresa nem abas Terminais/Pagamento, dropdown de papel restrito a `superadmin`/`admin`
- `Sidebar.tsx` — novo item de menu, `roles: ["superadmin", "admin"]`
- `App.tsx` — nova rota `/platform-users`, `ROLE_ROUTES` só pra `superadmin`/`admin`
- `CompanyScreen.tsx` — nenhuma mudança de código necessária (o filtro de exclusão já é feito no backend por `list_users`; só o comportamento muda, não o componente)

### Impacto em outros serviços
Nenhum — `catalog`/`order`/`payment`/`auth` inteiramente alheios (mesmo padrão do ORD-088/092).

### Eventos de fila
Não aplicável.

### Estimativa
- Backend: 13 pontos (1 migration com dado + schema, 5 endpoints novos, 2 alterados, resolução da empresa interna reaproveitada em vários pontos)
- Frontend: 8 pontos (1 tela nova clonando estrutura existente, 1 item de menu, 1 rota — sem mudança na tela de empresa)

### Riscos
- **Risco médio — migration de dado, não só schema:** precisa rodar dentro da mesma transação/migration (criar empresa + migrar usuários), documentado acima; testar `alembic downgrade` também reverte o dado (ou documentar que não reverte, se for o caso — decisão técnica a confirmar na implementação).
- **Risco médio — endpoints novos duplicam bastante lógica dos existentes:** aceito conscientemente (mesma decisão do usuário de manter "separado" em vez de reaproveitar `/companies/{id}/users` com a empresa interna) — mitigado reaproveitando helpers (`_issue_invite`, `_clear_mfa`, `_password_strength`) em vez de rotas inteiras.
- **Risco baixo — validação de papel retroativa:** usuários já existentes com papel "errado" pra sua tabela (se houver algum caso hoje) não são afetados pela validação nova (ela só vale pra criação, não reescreve dado existente) — mas vale uma checagem manual no banco de produção antes de subir, fora do escopo desta migration.
- **Risco baixo — `pin_hash=''` na empresa interna:** confirmar que `bcrypt.checkpw` nunca aceita string vazia como PIN válido (comportamento padrão do bcrypt, mas vale um teste explícito).

---

## Ready

**Explorer:** [x] fluxo, personas, causa raiz e achados adicionais (validação de papel ausente) documentados · **QA Explorer:** [x] 16 cenários Gherkin cobrindo empresa interna, exclusão da listagem, CRUD de plataforma, validação de papel nos dois sentidos e hierarquia de criação · **Tech Explorer:** [x] migration (schema+dado), endpoints novos/alterados, decisão sobre id da empresa interna, regra de hierarquia superadmin/admin, riscos e estimativa documentados · **Aprovação final:** [x] aprovado no chat pelo usuário (2026-08-17) — empresa interna com id auto-increment (resolvida por `is_platform`, não por id fixo), regra de hierarquia de criação (`admin` só cria `admin`; `superadmin` cria qualquer um dos dois)

**Status: Ready** — pode começar a implementação.

---

## Downstream

- **Branch:** `feature/ord-093-usuarios-plataforma-crud-separado`, a partir de `main`, com merge do `feature/ord-088-duplo-fator-autenticacao-totp` trazido pra dentro (ORD-093 depende diretamente de código do ORD-088/092 — `_clear_mfa`, endpoints de MFA — que ainda não estava em `main`). Branch/PR separada da ORD-088, como pedido.
- **Migration:** `20260817_1600_platform_company.py` — `companies.is_platform`, cria a empresa interna "Ordin — Plataforma" (id auto-increment, `pin_hash` com hash bcrypt válido de valor aleatório — não vazio, pra não quebrar o loop de `bcrypt.checkpw` do `validate_pin`/`verify_pin` em toda empresa `active=True`), migra todo `superadmin`/`admin` existente pra ela, tudo na mesma migration.
- **`services/company/main.py`:** `Company.is_platform`; `UserIn`/`UserUpdate.role` validados (`owner|manager|cashier`, fecha o gap encontrado no Explorer); `list_users` exclusão incondicional de `superadmin`/`admin`; `list_companies` filtra `is_platform` sempre; endpoints novos `GET/POST /platform-users`, `PUT/DELETE /platform-users/{id}`, `resend-invite`, `mfa/reset`, com `_require_can_grant_role` (hierarquia).
- **Frontend:** `PlatformUsersScreen.tsx` (novo, reaproveita `CompanyScreen.module.scss` — clone estrutural sem seletor de empresa nem abas Terminais/Pagamento, dropdown de papel adaptado à hierarquia do usuário logado), rota `/platform-users`, item de menu "Equipe Ordin" (`icon-user-check`).
- **Testes:** `test_ord093_usuarios_plataforma.py` novo (14 testes, os 16 cenários Gherkin cobertos com alguma sobreposição natural); 2 testes do `test_ord091_superadmin_invisivel_listagem.py` atualizados (a exceção "superadmin/admin vê todo mundo" ficou obsoleta com a tela nova — comportamento antigo intencionalmente substituído, não regressão).
- **Achado durante a verificação ao vivo — rota nova sem proxy no Nginx:** `/platform-users` é rota de API E de página do SPA ao mesmo tempo (mesmo padrão de `/companies`), mas eu tinha esquecido de registrá-la nos três lugares que fazem esse roteamento duplo: `nginx.conf` (gateway, proxy pro `company-service`), `frontend/admin/nginx.conf` (container do admin, mesma lógica de `$is_navigation`) e `frontend/admin/vite.config.ts` (proxy do dev local). Sem isso, a chamada de API pra `/platform-users` caía no fallback de SPA do Nginx e voltava `index.html` em vez de JSON — a tela crashava inteira (`TypeError: t.map is not a function`, React sem error boundary, tela em branco). Corrigido nos três arquivos, mesmo padrão de `/companies`.
- **Suítes completas:** `company` 268 passed (só as 4 falhas pré-existentes, já documentadas). `auth` 29 passed (não impactado por esta história, rodado por precaução).
- `tsc --noEmit` e `vitest run` (48 passed) limpos.
- **Verificado ao vivo no Chrome + curl** (superadmin `admin@ordin.app`, depois de rebuild + migration no banco de dev real): empresa interna nasceu com id auto-increment (5461, não um id fixo), badge "Empresa ativa" mostra "Ordin — Plataforma" corretamente (em-dash íntegro, UTF-8 confirmado via `HEX()`); seletor de empresa (Configurações/Dashboard) nunca lista a empresa interna, só clientes reais; `/company` de uma empresa cliente não mostra mais `superadmin`/`admin` na listagem, mesmo logado como superadmin; tela "Usuários da plataforma" lista só `superadmin`/`admin`, convite funciona de ponta a ponta (`pending_setup`, `resend-invite`); `POST /companies/{id}/users` com `role=superadmin` rejeitado com 422; hierarquia confirmada via curl com token real de `admin` — criar `superadmin` nega com 403, criar `admin` aceita com 201. Dado de teste limpo ao final.
- PR ainda não aberta.
