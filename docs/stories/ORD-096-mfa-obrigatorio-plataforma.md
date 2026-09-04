---
id: ORD-096
status: Done
fase: 6
sprint: null
responsavel: Backend
estimativa: 8 pontos
---

# ORD-096 — Duplo fator obrigatório e permanente para usuários da plataforma (superadmin/admin)

## Descrição
Pedido do usuário (2026-08-17): para contas da própria Ordin (`superadmin`/`admin`, empresa interna `is_platform=True`, ORD-093), o duplo fator não pode ser opcional nem desligável — precisa estar sempre ativo, sem exceção de política de empresa. Hoje a empresa interna nasce com `mfa_policy="disabled"` (herdado do valor padrão da coluna) e nada impede um `superadmin`/`admin` de desativar o próprio 2FA — o único superadmin existente (`admin@ordin.app`) nem tem 2FA configurado ainda.

## Persona
`superadmin`/`admin` (a própria conta fica protegida por 2FA permanentemente) e qualquer pessoa que dependa da integridade das contas administrativas da plataforma (segurança do sistema como um todo — são as contas com maior privilégio existente).

## Contexto

### Estado atual (achado nesta conversa)
```
companies.id=5461 (Ordin — Plataforma): mfa_policy = "disabled"
users.id=1 (admin@ordin.app, superadmin): totp_enabled_at = NULL (sem 2FA)
```
`update_security` (`PUT /companies/{id}/security`) não distingue empresa interna de empresa cliente — tecnicamente aceitaria qualquer política pra `company_id=5461` se alguém chamasse a API direto (a tela nunca oferece essa opção pra própria empresa do superadmin, ver ORD-095, mas a API não tinha essa trava). `/users/me/mfa/disable` (autodesativação) também não distingue — um `superadmin`/`admin` que já tivesse 2FA configurado conseguiria desativar sozinho.

### Mecanismo de "forçar setup" já existe, reaproveitado sem mudança
`POST /internal/verify-credentials` (`services/company/main.py:789`) já calcula `mfa_status = "setup_required"` sempre que `mfa_policy == "required"` e o usuário ainda não tem TOTP ativo — esse é o mesmo mecanismo do ORD-088 que força qualquer usuário de uma empresa com política obrigatória a configurar 2FA no próximo login. Bastando a empresa interna ter `mfa_policy="required"` de forma permanente, o fluxo de login já força `admin@ordin.app` (e qualquer novo superadmin/admin) a configurar no primeiro acesso — **sem precisar de nenhum código novo nesse ponto**.

### Decisão confirmada com o usuário — recuperação assistida continua existindo
Perda de autenticador + códigos de backup não pode virar uma conta travada pra sempre, especialmente hoje com um único superadmin. `POST /platform-users/{id}/mfa/reset` (recuperação assistida entre superadmins, já existente desde o ORD-093) continua funcionando — reseta o TOTP/backup codes/dispositivos confiáveis da pessoa, mas como a política da empresa interna nunca deixa de ser `"required"`, o próximo login dela já cai em `setup_required` de novo. Nunca existe uma janela real "sem 2FA e sem forçar reconfiguração" — só uma reconfiguração assistida.

---

## Explorer

### História
Como responsável pela segurança da plataforma, quero que toda conta `superadmin`/`admin` seja obrigada a ter duplo fator ativo, sem que ninguém (nem o próprio dono da conta, nem uma chamada direta à API) consiga desativar ou tornar opcional essa exigência.

### Fluxo principal
1. Migration marca a empresa interna com `mfa_policy = "required"`, permanentemente
2. `admin@ordin.app` (e qualquer novo superadmin/admin criado) faz login sem 2FA configurado ainda → `mfa_status: "setup_required"` → obrigado a configurar antes de terminar o login (fluxo já existente do ORD-088, sem mudança)
3. `PUT /companies/{company_id da empresa interna}/security` rejeita qualquer tentativa de mudar `mfa_policy` pra outro valor, mesmo vindo de um superadmin (que hoje tem bypass total de `_require_company_admin`)
4. `POST /users/me/mfa/disable` rejeita a autodesativação quando quem está chamando é `superadmin`/`admin`
5. `POST /platform-users/{id}/mfa/reset` continua funcionando normalmente (recuperação assistida) — reseta o 2FA da pessoa, que é forçada a reconfigurar no próximo login

### Fluxos alternativos / exceções
- Usuários de empresas clientes (`owner`/`manager`/`cashier`) não são afetados em nada — a trava é só pra `company_id` da empresa interna
- `GET /users/me/mfa/status` continua reportando `mfa_policy: "required"` pra qualquer superadmin/admin, o que já faz a tela "Minha segurança" mostrar o fluxo de ativação corretamente sem nenhuma mudança de frontend
- Reset assistido (`/platform-users/{id}/mfa/reset`) continua sem exigir senha (já era assim, é ação administrativa de outro superadmin/admin, não autoatendimento) — comportamento existente, sem mudança

### Dependências
- Serviços envolvidos: `company` apenas (migration + 2 validações novas)
- Histórias relacionadas: [[ORD-088]] (mecanismo de política obrigatória, reaproveitado sem mudança), [[ORD-093]] (empresa interna, `is_platform`), [[ORD-095]] (tela de Segurança em modo suporte — sem mudança, a empresa interna já não aparecia lá)
- Sem histórias bloqueantes

### Critérios de aceite funcionais
- [ ] Migration define `mfa_policy = "required"` pra empresa com `is_platform=True`
- [ ] `PUT /companies/{id}/security` retorna erro (não 200) quando `id` é o da empresa interna e `mfa_policy` pedido não é `"required"`
- [ ] `POST /users/me/mfa/disable` retorna 403 quando quem chama é `superadmin`/`admin`, com mensagem clara
- [ ] `POST /platform-users/{id}/mfa/reset` continua funcionando sem mudança (recuperação assistida)
- [ ] Login de `admin@ordin.app` (sem 2FA configurado) passa a exigir setup no próximo acesso
- [ ] Nenhuma mudança de comportamento pra `owner`/`manager`/`cashier` de empresas clientes
- [ ] Nenhuma mudança necessária no frontend (telas já não expõem a opção pra empresa interna, ver ORD-095)

### Wireframe / Mockup
Não aplicável — sem mudança de UI.

---

## QA Explorer

```gherkin
Feature: Duplo fator obrigatório e permanente pra usuários da plataforma

  Scenario: Empresa interna nasce/já existe com política obrigatória
    Dado a empresa interna da plataforma
    Então mfa_policy é "required"

  Scenario: Ninguém consegue mudar a política da empresa interna
    Dado um superadmin autenticado
    Quando ele chama PUT /companies/{id da empresa interna}/security com mfa_policy="optional"
    Então a requisição é rejeitada
    E mfa_policy da empresa interna continua "required"

  Scenario: Superadmin sem 2FA é forçado a configurar no login
    Dado um superadmin sem TOTP configurado
    Quando ele faz login com email e senha corretos
    Então mfa_status retornado é "setup_required"

  Scenario: Superadmin com 2FA ativo não consegue se autodesativar
    Dado um superadmin com 2FA ativo
    Quando ele chama POST /users/me/mfa/disable com a senha correta
    Então a requisição é rejeitada com 403

  Scenario: Owner de empresa cliente não é afetado
    Dado um owner de empresa cliente com 2FA ativo
    Quando ele chama POST /users/me/mfa/disable com a senha correta
    Então a desativação funciona normalmente, sem nenhuma mudança

  Scenario: Reset assistido entre superadmins continua funcionando
    Dado um superadmin com 2FA ativo que perdeu o autenticador
    Quando outro superadmin chama POST /platform-users/{id}/mfa/reset pra ele
    Então o 2FA dele é limpo
    E no próximo login ele volta a cair em setup_required (nunca fica permanentemente sem 2FA exigido)

  Scenario: Política da empresa interna sobrevive a uma tentativa de downgrade indireta
    Dado a empresa interna com mfa_policy "required"
    Quando alguém tenta setar mfa_policy="disabled" ou "optional" via API pra esse company_id
    Então a resposta não é 200 e o valor no banco não muda
```

---

## Tech Explorer

### Serviços impactados
- `services/company/` — 1 migration + 2 validações em endpoints já existentes (`update_security`, `mfa_disable`)

### Migrations

```python
"""mfa obrigatório permanente para empresa da plataforma (ORD-096)

Revision ID: 20260817_2000
Revises: 20260817_1600
"""
def upgrade() -> None:
    op.execute("UPDATE companies SET mfa_policy = 'required' WHERE is_platform = 1")

def downgrade() -> None:
    # Não reverte pra "disabled" — arriscado demais reintroduzir uma conta
    # de plataforma sem 2FA silenciosamente num rollback. Decisão consciente,
    # mesmo padrão de downgrade "não reversível de propósito" do ORD-093.
    pass
```

### Endpoints

#### `PUT /companies/{company_id}/security` (alterado)
```python
co = await db.get(Company, company_id)
if not co or not co.active:
    raise HTTPException(404, "Empresa não encontrada")
if co.is_platform and body.mfa_policy != "required":
    raise HTTPException(409, "Duplo fator é obrigatório e permanente para contas da plataforma")
co.mfa_policy = body.mfa_policy
```
Checagem por `co.is_platform`, não por id fixo — mesmo princípio já usado em todo o resto do ORD-093 (nunca resolver a empresa interna por um id hardcoded).

#### `POST /users/me/mfa/disable` (alterado)
```python
u = await db.get(User, int(current_user.sub))
if not u:
    raise HTTPException(404, "Usuário não encontrado")
if u.role in ("superadmin", "admin"):
    raise HTTPException(403, "Duplo fator é obrigatório para contas da plataforma e não pode ser desativado")
if not u.password_hash or not bcrypt.checkpw(...):
    ...
```
Checagem por `role`, consistente com `_require_platform_admin` (mesmo critério usado em todo o resto do sistema pra identificar conta de plataforma) — não precisa nem carregar a `Company` pra saber, já que o papel sozinho já identifica.

#### `POST /platform-users/{user_id}/mfa/reset` (sem mudança)
Continua chamando `_clear_mfa` normalmente — a garantia de "nunca fica sem exigir 2FA" vem da política permanente da empresa (`setup_required` no próximo login), não de bloquear esse endpoint.

### Frontend
Nenhuma mudança — a tela de Segurança nunca ofereceu essa opção pra empresa interna (ORD-095: card "Segurança da empresa" só aparece quando `companyId` é uma empresa cliente selecionada; a própria empresa do superadmin/admin nunca é `companyId` na tela).

### Impacto em outros serviços
Nenhum.

### Eventos de fila
Não aplicável.

### Estimativa
- Backend: 8 pontos (1 migration simples + 2 validações pontuais em endpoints já existentes)

### Riscos
- **Risco baixo:** mudança estritamente aditiva/restritiva (fecha gaps de API que a UI já não expunha) — não deveria quebrar nenhum fluxo existente de empresas clientes.
- **Observação operacional:** depois de aplicada, `admin@ordin.app` só termina o próximo login depois de configurar 2FA — vale avisar/estar presente pra fazer esse setup logo após o deploy, já que é a única conta superadmin hoje.
