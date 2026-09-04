---
id: ORD-088
status: Done
fase: 6
sprint: null
responsavel: Backend + Frontend
estimativa: 21 pontos
---

# ORD-088 — Duplo fator de autenticação (TOTP), opcional por empresa

## Descrição
Pedido do usuário na abertura da sprint de cadastro de usuários (2026-08-13): adicionar duplo fator de autenticação no login, com cada empresa podendo optar por habilitá-lo ou não para seus próprios usuários.

## Persona
Owner/manager (decide se a própria empresa exige 2FA) e todo usuário autenticado da empresa que o habilitar (owner/manager/cashier).

## Contexto
Avaliação feita e decisão de método já tomada com o usuário (2026-08-13), **método e escopo aprovados, mas story explicitamente adiada para a sprint seguinte** — depende de [[ORD-087]] (login sem senha imposta pelo admin, fluxo de auto-cadastro) estar estável em produção primeiro, por mexer no mesmo fluxo de autenticação (`auth-service`, `App.tsx`).

**Método decidido:** TOTP (RFC 6238) — compatível com Google Authenticator, Authy, 1Password, Microsoft Authenticator. Preferido a SMS OTP por não ter custo por mensagem (sem dependência de SNS/Twilio) e por não ter a fragilidade de SIM swap que o SMS tem (NIST não recomenda SMS como único segundo fator).

**Escopo por empresa:** habilitação fica em Configurações, mesmo padrão de campo que hoje existe para tema/modo visual (`VALID_THEMES`/`VALID_MODES`, `AppearanceIn` em `services/company/main.py:434-438`) — provável novo campo `mfa_required` (ou `mfa_policy: disabled|optional|required`) na tabela `companies`.

Este documento **não é um Explorer completo** — captura a decisão de método e o motivo, para não se perder até a próxima sprint rodar o upstream (`/upstream-explorer` em diante) de verdade.

## Decisões técnicas revisadas (2026-08-17)

ORD-087 (pré-requisito) está `Done`, bloqueio de dependência resolvido. Três pontos em aberto discutidos e fechados com o usuário:

**Onde o segredo TOTP é gerado/validado:** `company-service`, não `auth-service` — mapeado no código, não suposto. `User` (com `password_hash`) e `POST /internal/verify-credentials` já vivem no `company-service`; `auth-service` só orquestra o login e emite o JWT, nunca toca dado de usuário diretamente (`services/company/main.py:127,669`). Segue o mesmo padrão: colunas novas em `User` (`totp_secret`, `totp_enabled_at`), novo endpoint interno `POST /internal/verify-totp` espelhando `verify-credentials`. `auth-service` chama esse endpoint como segundo passo, depois da senha, antes de emitir o JWT.

**Política de habilitação por empresa:** enum de 3 estados, não binário — `mfa_policy: disabled|optional|required` em Configurações (mesmo padrão de campo de `AppearanceIn`, `services/company/main.py:434-438`). `disabled` = 2FA indisponível; `optional` = usuário decide individualmente ativar; `required` = obrigatório pra todo usuário da empresa. Motivo do enum (vs. binário): evita forçar 2FA em cashiers de terminal físico compartilhado enquanto ainda permite que uma empresa que lide com muito dinheiro exija de todos.

**Recuperação de acesso (dispositivo perdido):** dois níveis. (1) 10 códigos de backup de uso único gerados na ativação do 2FA, hash salvo (mesmo tratamento de `password_hash`), usuário baixa/anota. (2) Fallback administrativo: owner/manager consegue desativar o 2FA de um usuário específico na tela `/company`, mesmo padrão de suporte já usado pra superadmin/admin acessarem qualquer empresa (ORD-082).

---

## Explorer

### História
Como **owner/manager**, quero decidir se minha empresa exige duplo fator de autenticação, e como **qualquer usuário autenticado por senha** (owner/manager/cashier/superadmin/admin), quero poder ativar e usar TOTP no meu login, para reduzir o risco de uma conta comprometida por senha vazada ou reutilizada.

### Contexto e motivação
Pedido direto do usuário (2026-08-13). Método (TOTP) e escopo (por empresa) já aprovados; retomada nesta sessão (2026-08-17) com [[ORD-087]] — pré-requisito — já `Done` em produção. Ver `## Contexto` e `## Decisões técnicas revisadas` acima para o raciocínio completo de método, política e recuperação.

**Fora do escopo desta história:** totem (`role: kiosk`, login por PIN, não por senha — TOTP não se aplica). Só afeta `POST /auth/login` (email+senha), usado por `owner`/`manager`/`cashier`/`superadmin`/`admin`.

### Fluxo principal
1. Owner/manager abre Configurações → nova seção "Segurança da empresa" → define `mfa_policy` (Desativado / Opcional / Obrigatório)
2. Qualquer usuário autenticado abre Configurações → nova seção "Minha segurança" → se a política da empresa permitir (`optional` ou `required`), vê botão "Ativar duplo fator"
3. Ao ativar: sistema mostra QR code (app autenticador) + segredo em texto (fallback manual) → usuário escaneia e digita o código de 6 dígitos gerado pra confirmar
4. Confirmado: sistema mostra os 10 códigos de backup **uma única vez** (usuário deve salvar/baixar) e marca o 2FA como ativo
5. Próximo login desse usuário: após senha correta, sistema pede o código de 6 dígitos (ou um código de backup) antes de liberar o acesso
6. Usuário pode desativar o próprio 2FA a qualquer momento em "Minha segurança" (reautenticando com a senha)

### Fluxos alternativos / exceções
- Política `required` e usuário ainda não configurou 2FA → login não conclui direto; usuário é levado ao fluxo de ativação (passo 3-4) antes de receber acesso, usando um token temporário de sessão em vez do JWT normal (ver Tech Explorer — token de escopo limitado)
- Usuário perde o dispositivo autenticador e não tem mais os códigos de backup → owner/manager acessa `/company`, aba Usuários, e desativa o 2FA daquele usuário específico (mesmo padrão de suporte do ORD-082/ORD-091)
- Owner/manager muda a política de `required` para `optional`/`disabled` → 2FA de usuários que já ativaram **não é removido automaticamente** (ver Riscos no Tech Explorer — decisão consciente, evita remover proteção que o próprio usuário escolheu sem ele agir)
- Código de backup usado → marcado como consumido, não pode ser reutilizado
- Muitas tentativas erradas de código (senha certa, TOTP errado repetido) → mesmo rate limiting por IP já usado no PIN do totem (`services/auth/main.py: check_rate_limit`)

### Dependências
- Serviços envolvidos: `auth` (fluxo de login, token temporário de MFA), `company` (dono do segredo TOTP e dos códigos de backup, mesmo padrão de `password_hash`)
- Histórias bloqueantes: nenhuma — [[ORD-087]] já `Done`

### Critérios de aceite funcionais
- [ ] Owner/manager consegue definir `mfa_policy` da empresa em Configurações (3 estados)
- [ ] Usuário autenticado consegue ativar TOTP (QR + confirmação) quando a política permitir
- [ ] Usuário recebe 10 códigos de backup de uso único na ativação, mostrados uma única vez
- [ ] Login de usuário com TOTP ativo exige o código (ou um backup) depois da senha, antes de liberar acesso
- [ ] Política `required` força o fluxo de ativação no login de quem ainda não tem TOTP configurado
- [ ] Usuário consegue desativar o próprio 2FA (reautenticando com senha)
- [ ] Owner/manager consegue desativar o 2FA de um usuário específico da própria empresa, via `/company` (recuperação assistida)
- [ ] Totem (`role: kiosk`, PIN) e demais fluxos de login não são afetados
- [ ] Isolamento multi-tenant preservado no override administrativo (empresa A não desativa 2FA de usuário da empresa B)

### Wireframe / Mockup
Sem mockup formal — reaproveita padrões visuais já existentes: `SettingsScreen.tsx` (nova seção, mesmo estilo de card das seções de tema/pagamento) e `Modal`/`Tag` do design system pra exibir QR code e códigos de backup (mesmo padrão usado pra outros fluxos de confirmação sensíveis, ex: PIN regenerado).

---

## QA Explorer

```gherkin
Feature: Duplo fator de autenticação (TOTP), opcional por empresa

  Background:
    Dado uma empresa com mfa_policy configurável
    E um usuário autenticado por e-mail e senha (owner, manager, cashier, superadmin ou admin)

  Scenario: Owner define a empresa como "Obrigatório"
    Dado o owner logado em Configurações
    Quando ele seleciona mfa_policy = "Obrigatório"
    Então a política é salva
    E usuários dessa empresa sem TOTP configurado passam a ser levados ao fluxo de ativação no próximo login

  Scenario: Ativação de TOTP com sucesso
    Dado um usuário autenticado numa empresa com mfa_policy != "disabled"
    Quando ele inicia a ativação e escaneia o QR code no app autenticador
    E digita o código de 6 dígitos correto pra confirmar
    Então o 2FA é ativado para esse usuário
    E 10 códigos de backup de uso único são exibidos uma única vez

  Scenario: Confirmação de ativação com código errado
    Dado um usuário no meio do fluxo de ativação (QR já exibido)
    Quando ele digita um código de 6 dígitos incorreto
    Então a ativação não é confirmada
    E o segredo TOTP pendente não é marcado como ativo

  Scenario: Login com TOTP ativo — código correto
    Dado um usuário com TOTP ativo
    Quando ele faz login com e-mail e senha corretos
    Então o sistema pede o código de 6 dígitos, não libera o acesso ainda
    Quando ele digita o código correto do app autenticador
    Então o login é concluído e os tokens são emitidos

  Scenario: Login com TOTP ativo — código incorreto
    Dado um usuário com TOTP ativo, já com senha validada
    Quando ele digita um código de 6 dígitos incorreto
    Então o acesso é negado com erro 401
    E nenhum token é emitido

  Scenario: Login usando código de backup
    Dado um usuário com TOTP ativo que perdeu o app autenticador
    Quando ele usa um dos 10 códigos de backup no lugar do código de 6 dígitos
    Então o login é concluído
    E aquele código de backup específico não pode ser usado novamente

  Scenario: Rate limit em tentativas de código
    Dado um usuário com senha já validada, aguardando o código TOTP
    Quando ele erra o código 5 vezes seguidas
    Então o IP é bloqueado temporariamente, mesmo padrão do rate limit de PIN do totem

  Scenario: Política "Obrigatório" força ativação no login
    Dado um usuário sem TOTP configurado, numa empresa com mfa_policy = "Obrigatório"
    Quando ele faz login com e-mail e senha corretos
    Então ele é levado ao fluxo de ativação antes de receber acesso ao sistema
    E só recebe os tokens finais depois de confirmar a ativação

  Scenario: Usuário desativa o próprio 2FA
    Dado um usuário com TOTP ativo, logado
    Quando ele opta por desativar o 2FA e reautentica com a senha
    Então o 2FA é desativado
    E o próximo login desse usuário não pede mais código

  Scenario: Owner/manager desativa 2FA de outro usuário da própria empresa (recuperação)
    Dado um usuário da mesma empresa que perdeu o dispositivo autenticador e os códigos de backup
    Quando o owner/manager acessa a aba Usuários em /company e desativa o 2FA desse usuário
    Então o 2FA desse usuário é desativado
    E ele consegue logar de novo só com e-mail e senha

  Scenario: Isolamento multi-tenant no override administrativo
    Dado um usuário com TOTP ativo na empresa B
    Quando um owner/manager da empresa A tenta desativar o 2FA desse usuário
    Então a operação é negada com erro 403

  Scenario: Alterar política não remove TOTP já ativado
    Dado um usuário com TOTP já ativo, numa empresa com mfa_policy = "Obrigatório"
    Quando o owner muda a política para "Desativado"
    Então o TOTP desse usuário continua ativo
    E ele continua sendo desafiado no login

  Scenario: Totem (PIN) não é afetado
    Dado um terminal fazendo login por PIN
    Quando o PIN é validado
    Então o acesso é concedido normalmente, sem nenhum passo de TOTP
```

---

## Tech Explorer

### Serviços impactados
- `services/company/` — dono do segredo TOTP e dos códigos de backup (mesmo padrão de `password_hash`), política por empresa, endpoints de setup/verify/disable/override
- `services/auth/` — orquestra o passo extra no `/auth/login`, emite token temporário de MFA
- `services/requirements.txt` — nova dependência `pyotp` (RFC 6238, mesma lib usada pra Google Authenticator-compatible TOTP)
- `frontend/admin/` — `SettingsScreen.tsx` (política + ativação pessoal), `LoginScreen.tsx`/`store.ts` (passo extra no login), `CompanyScreen.tsx` (override administrativo, aba Usuários), nova dependência `qrcode.react` (já usada em `frontend/totem/package.json` pro QR de ticket — mesmo padrão: backend manda o dado, frontend renderiza)

### Migrations

**`services/company/`:**
- Tabela `companies`: nova coluna `mfa_policy` (`String(10)`, `NOT NULL`, `default="disabled"`, valores `disabled|optional|required`)
- Tabela `users`: novas colunas `totp_secret` (`String(32)`, nullable — base32, null = 2FA nunca configurado), `totp_enabled_at` (`DateTime`, nullable — null = pendente/desativado)
- Tabela nova `user_backup_codes` (mesmo desenho de `UserInviteToken`/`RefreshToken` — só hash persistido):
  ```python
  class UserBackupCode(Base):
      __tablename__ = "user_backup_codes"
      id          = Column(Integer, primary_key=True)
      user_id     = Column(Integer, ForeignKey("users.id"), nullable=False)
      code_hash   = Column(String(64), nullable=False)   # sha256
      used_at     = Column(DateTime, nullable=True)
      created_at  = Column(DateTime, default=datetime.utcnow)
  ```

**`services/auth/`:** nenhuma migration — o token temporário de MFA é um JWT stateless (`type: "mfa_pending"`), não precisa persistência (mesmo raciocínio do `kiosk` access token, que também não grava nada).

### Endpoints

#### `PUT /companies/{company_id}/security` (novo)
**Serviço:** company · **Auth:** JWT, `_require_company_admin` (superadmin/admin/owner/manager — mesmo helper já corrigido no [[ORD-091]])

Request:
```json
{ "mfa_policy": "disabled" }
```
Response 200:
```json
{ "ok": true, "mfa_policy": "disabled" }
```
Erros: 422 (valor fora de `disabled|optional|required`), 403 (fora da empresa e não é superadmin/admin)

#### `POST /users/me/mfa/setup` (novo)
**Serviço:** company · **Auth:** JWT (qualquer usuário autenticado próprio) · **company_id/user_id:** do JWT, nunca do body

Gera `totp_secret` novo (pendente, não confirmado ainda — sobrescreve qualquer setup pendente anterior não confirmado). Response 200:
```json
{ "secret": "JBSWY3DPEHPK3PXP", "provisioning_uri": "otpauth://totp/Ordin:email@empresa.com?secret=...&issuer=Ordin" }
```
Erros: 403 (`mfa_policy` da empresa é `disabled`), 409 (2FA já ativo — precisa desativar antes de reconfigurar)

#### `POST /users/me/mfa/confirm` (novo)
**Serviço:** company · **Auth:** JWT

Request:
```json
{ "code": "123456" }
```
Valida o código contra o `totp_secret` pendente; se válido, marca `totp_enabled_at`, gera 10 códigos de backup (hash salvo), retorna em texto puro **uma única vez**.
Response 200:
```json
{ "ok": true, "backup_codes": ["A1B2C3D4", "..."] }
```
Erros: 400 (código inválido), 404 (nenhum setup pendente)

#### `POST /users/me/mfa/disable` (novo)
**Serviço:** company · **Auth:** JWT

Request: `{ "password": "..." }` (reautenticação — mesmo bcrypt check de login)
Response 200: `{ "ok": true }`. Limpa `totp_secret`, `totp_enabled_at`, apaga `user_backup_codes` do usuário.
Erros: 401 (senha incorreta)

#### `POST /companies/{company_id}/users/{user_id}/mfa/reset` (novo — override administrativo)
**Serviço:** company · **Auth:** JWT, `_require_company_admin` (mesmo helper de sempre — cobre a checagem de isolamento multi-tenant do Gherkin acima)

Response 200: `{ "ok": true }`. Mesmo efeito de `disable`, mas iniciado por owner/manager/superadmin/admin sobre outro usuário — usado em `/company`, aba Usuários (mesma tela do [[ORD-091]]).
Erros: 403 (fora da empresa), 404 (usuário não encontrado)

#### `POST /internal/verify-totp` (novo, interno)
**Serviço:** company · **Auth:** `X-Internal-Secret` (mesmo padrão de `verify-credentials`)

Request: `{ "user_id": 42, "code": "123456" }` — `code` pode ser TOTP de 6 dígitos ou backup code de 8 caracteres (formato distingue automaticamente).
Response 200: `{ "ok": true, "used_backup_code": false }`
Erros: 401 (código inválido)

#### `POST /internal/verify-credentials` (alterado)
Response ganha um campo:
```json
{ "id": 42, "company_id": 7, "role": "owner", "name": "...", "mfa_status": "none" }
```
`mfa_status` calculado no company-service (dono de `User` e `Company`, sem round-trip extra):
```python
if u.totp_enabled_at is not None:
    mfa_status = "verify"          # usuário já tem 2FA — sempre desafiado, política à parte
elif company.mfa_policy == "required":
    mfa_status = "setup_required"  # política exige, usuário ainda não configurou
else:
    mfa_status = "none"            # comportamento de hoje, sem mudança
```

#### `POST /auth/login` (alterado)
**Serviço:** auth · Request inalterado (email+senha). `response_model` deixa de ser só `TokenOut` — passa a ser `TokenOut | MfaRequiredOut`:
```python
class MfaRequiredOut(BaseModel):
    mfa_required: bool = True
    mfa_status: str          # "verify" | "setup_required"
    mfa_token: str           # JWT curto, type="mfa_pending", sub=user_id, exp=10min
```
Se `mfa_status == "none"`: comportamento idêntico ao de hoje (retorna `TokenOut` direto). Se `"verify"` ou `"setup_required"`: não emite tokens finais, retorna `MfaRequiredOut`.

#### `POST /auth/login/mfa-verify` (novo)
**Serviço:** auth

Request: `{ "mfa_token": "...", "code": "123456" }`. Decodifica `mfa_token` (rejeita se `type != "mfa_pending"` ou expirado), chama `POST /internal/verify-totp` no company-service. Sucesso → emite `access_token`/`refresh_token` exatamente como o final do `/auth/login` de hoje (mesmo código reaproveitado). Aplica `check_rate_limit` por IP, mesmo padrão do PIN.
Response 200: `TokenOut` (igual ao login normal)
Erros: 401 (código inválido ou `mfa_token` expirado/inválido), 429 (rate limit)

Para o caso `setup_required`: o mesmo `mfa_token` (escopo limitado, 10 min) é aceito por `POST /users/me/mfa/setup` e `/confirm` no company-service **no lugar** do JWT normal (endpoint aceita `Authorization: Bearer <mfa_token>` e trata `type=mfa_pending` como identidade válida só pra essas duas rotas). Depois de confirmado, o frontend chama `/auth/login/mfa-verify` com o código recém-confirmado, completando o login normalmente.

### Compatibilidade com Google Authenticator (confirmado com o usuário, 2026-08-17)
Google Authenticator **não aceita parâmetros customizados** — só funciona com os defaults do padrão TOTP: SHA1, 6 dígitos, período de 30s. `pyotp.TOTP(secret)` já usa esses defaults sem precisar tocar em nenhum parâmetro — a restrição é **não "otimizar" isso depois** (ex: trocar pra SHA256 ou 8 dígitos), ou quebra a compatibilidade especificamente com o Google Authenticator (outros apps como Authy/1Password são mais flexíveis, mas o alvo é o mínimo denominador comum).

### Nota sobre teste local (sem infraestrutura externa)
O fluxo de TOTP **não precisa de nenhum endpoint externo nem ngrok** — diferente de SMS OTP ou OAuth, não existe callback do app autenticador de volta pro Ordin. O QR code é só uma forma visual de transportar o segredo (`otpauth://...`); depois de escaneado, o app calcula os códigos localmente, sem chamada de rede. Duas formas de testar sem nada externo:
- **Automatizado:** `pyotp.TOTP(secret).now()` no próprio teste gera um código válido pra alimentar `/internal/verify-totp` ou `/users/me/mfa/confirm`, sem celular envolvido (mesmo padrão de simulação já usado nos testes do ORD-087)
- **Ao vivo:** apontar a câmera de um celular real pra tela do `localhost:3001` mostrando o QR — é uma foto, não uma requisição de rede, funciona igual a produção

### Impacto em outros serviços
- Nenhum serviço além de `auth`/`company` participa — `catalog`/`order`/`payment` continuam validando só o JWT final, sem saber que TOTP existe
- Totem (`role: kiosk`, `/auth/pin-login`) não é tocado — fluxo completamente separado

### Eventos de fila
Não aplicável — fluxo síncrono ponta a ponta, sem necessidade de assincronismo.

### Estimativa
- Backend: 13 pontos (2 migrations, 7 endpoints novos/alterados em 2 serviços, geração/validação TOTP + backup codes, token de escopo limitado reaproveitado por dois serviços)
- Frontend: 8 pontos (2 seções novas em Configurações, tela de confirmação com QR, modal de exibição única dos códigos de backup, passo extra no login, override em `/company`)
- Comparável ao [[ORD-087]] (13 pontos) em complexidade de backend — mexe no mesmo fluxo crítico de login

### Riscos
- **Risco alto — fluxo de login muda de contrato:** `/auth/login` passa a responder dois formatos possíveis. Qualquer client HTTP externo que assuma sempre `TokenOut` quebra. Mitigação: hoje o único consumidor é `frontend/admin` (confirmar por busca antes de implementar); versionar/documentar claramente no OpenAPI.
- **Risco médio — token de escopo limitado (`mfa_pending`) usado por dois serviços:** precisa de validação cuidadosa pra garantir que esse token *não* sirva pra nenhuma outra rota autenticada (nem em `company-service` nem em `order`/`payment`/`catalog`) — checar `type` explicitamente em `get_current_user` ou criar dependency separada só pras duas rotas de setup.
- **Risco médio — política `required` sem 2FA configurado ainda:** primeiro login de um usuário existente numa empresa que acabou de virar `required` força ativação no meio do fluxo de login — testar bem a UX pra não parecer que o login "quebrou".
- **Risco baixo — mudar política não remove 2FA existente:** decisão consciente (ver Explorer), mas precisa estar clara pro owner na UI ("desativar a política não desativa o 2FA de quem já configurou").
- **Risco baixo — brute force do código de 6 dígitos:** mitigado pelo rate limit já existente (padrão do PIN), reaplicado à nova rota.

---

## Ready

**Explorer:** [x] fluxo, personas, critérios de aceite e fora-de-escopo (totem/PIN) definidos · **QA Explorer:** [x] 13 cenários Gherkin cobrindo ativação, login com TOTP/backup code, rate limit, política obrigatória, desativação própria e administrativa, isolamento multi-tenant · **Tech Explorer:** [x] endpoints, migrations, contrato de `/auth/login` alterado, compatibilidade Google Authenticator, nota de teste local sem infra externa, riscos e estimativa documentados · **Aprovação final:** [x] aprovado no chat pelo usuário (2026-08-17) — solução técnica completa, incluindo o contrato alterado do `/auth/login` e o token de escopo limitado `mfa_pending`

**Status: Ready** — pode começar a implementação.

---

## Downstream

- **Branch:** `feature/ord-088-duplo-fator-autenticacao-totp`, a partir de `main`.
- **Migration:** `20260817_1000_totp_mfa.py` — `companies.mfa_policy` (default `disabled`), `users.totp_secret`/`totp_enabled_at`, tabela nova `user_backup_codes` (mesmo desenho de `user_invite_tokens`, só hash persistido).
- **`services/shared/auth.py` + cópias em `company`/`catalog`/`order`/`payment`:** `TokenPayload` ganhou campo `type`; `get_current_user` passa a rejeitar qualquer token com `type` setado (refresh ou `mfa_pending`) — fecha de graça uma brecha preexistente (refresh token nunca deveria ter sido aceito como Bearer).
- **`services/company/auth.py`:** nova dependency `get_setup_mfa_user` — só ela aceita `type in (None, "mfa_pending")`, usada exclusivamente por `/users/me/mfa/setup` e `/confirm`.
- **`services/company/main.py`:** `pyotp` novo; endpoints `PUT /companies/{id}/security`, `GET/POST /users/me/mfa/status|setup|confirm|disable`, `POST /companies/{id}/users/{uid}/mfa/reset` (override administrativo), `POST /internal/verify-totp`; `/internal/verify-credentials` ganhou `mfa_status` (`none|verify|setup_required`); `UserOut`/`CompanyOut` ganharam `mfa_enabled`/`mfa_policy`.
- **`services/auth/main.py`:** `/auth/login` agora responde `TokenOut` ou `MfaRequiredOut` (`Union`) conforme `mfa_status`; novo `POST /auth/login/mfa-verify` (rate limit reaproveitado do PIN) completa o login com o código.
- **`services/company/tests/test_ord088_duplo_fator_totp.py`** (novo, 22 testes) **+ `services/auth/tests/test_ord088_duplo_fator_totp.py`** (novo, 9 testes) — cobrem os 13 cenários Gherkin + `GET /users/me/mfa/status` + `GET /companies/{id}` expondo `mfa_policy`.
- **Suítes completas:** `company` 243 passed (só as 4 falhas pré-existentes, confirmadas idênticas contra `main` antes desta história — `test_require_superadmin_raises_for_owner` já documentada no ORD-084; as 3 do `test_ord065_cnpj_unico.py` são um gap real e independente: `Company.document` não tem `unique=True` no ORM, só via migration Alembic, e os testes sobem schema via `Base.metadata.create_all` sem rodar Alembic — não é regressão desta história, vale um achado à parte). `auth` 24 passed.
- **Frontend:** `SettingsScreen.tsx` (seções "Minha segurança" — sempre visível, independe de empresa selecionada — e "Segurança da empresa"), `LoginScreen.tsx` (passo de MFA: código, ou setup forçado quando `mfa_status=setup_required`), `CompanyScreen.tsx` (tag "2FA ativo" + botão "Desativar 2FA" na aba Usuários), `Sidebar.tsx`/`App.tsx` (cashier ganha acesso a `/settings`, só enxerga a seção pessoal — `canManageCompany` esconde PIN/Aparência/Segurança da empresa pra quem não é owner/manager/superadmin/admin). Nova dependência `qrcode.react` (mesma já usada no `frontend/totem`).
- `tsc --noEmit`: limpo. `vitest run`: **48 passed**, sem regressão.
- **Achado colateral corrigido:** `qrcode.react` instalado com npm 11 localmente gerava um `package-lock.json` incompatível com o `npm ci` do Dockerfile (`node:20-alpine`, npm 10) — toda vez que o npm local tocava o lockfile, removia entradas de plataforma (`@esbuild/win32-x64` etc.) que `npm ci` exige por consistência. Corrigido instalando via container `node:20-alpine` e nunca mais rodando `npm install` local depois (só `npm ci`, que não reescreve o lockfile).
- **Achados corrigidos durante a verificação ao vivo** (2026-08-17, `admin@ordin.app` / Burger House):
  1. `CompanyOut` (`GET /companies/{id}`) não expunha `mfa_policy` — a tela de Configurações nunca carregava a política salva ao reabrir, sempre voltava pra "Desativado". Corrigido + teste novo.
  2. Bug de ordem de estado no `SettingsScreen.tsx`: `confirmMfaSetup()` marcava `myMfaEnabled=true` no mesmo passo que `mfaStep="backup-codes"`, e como a renderização checa `myMfaEnabled` antes de `mfaStep`, a tela pulava direto pro estado "ativo" **sem nunca mostrar os 10 códigos de backup** — a única chance do usuário salvá-los. Corrigido movendo `setMyMfaEnabled(true)` pro `finishMfaSetup()` (só depois que o usuário confirma "Já salvei meus códigos").
  3. **Reportado pelo usuário:** QR code não aparecia no passo forçado do `LoginScreen` (política `required`, usuário sem TOTP ainda) — só o texto do segredo em fallback era visível. Causa raiz: `.mfaQrRow` é `display:flex` sem `flex-shrink:0` no `<svg>`; o card do login é bem mais estreito (380px) que o de Configurações, então o texto do segredo (32 caracteres monoespaçados, sem quebra) "ganhava" a disputa por espaço no flex e espremia o QR até 0px de largura — confirmado via `getComputedStyle` (`width: "0px"` no elemento, apesar do atributo `width="150"`). Corrigido em `LoginScreen.module.scss` e, preventivamente, também em `SettingsScreen.module.scss` (mesmo risco existe lá se a janela for redimensionada estreita) — `svg { flex-shrink: 0 }` + `overflow-wrap: anywhere` no texto do segredo.
- **Verificado ao vivo no Chrome** (superadmin `admin@ordin.app` e owner `carlos@burgerhouse.com`, Burger House): política da empresa salva e recarrega corretamente; ativação pessoal com QR real (TOTP calculado via Web Crypto dentro da própria página, sem expor o segredo) — QR + código + confirmação + exibição dos 10 códigos de backup, tudo na ordem certa após o fix; logout/login completo com desafio de segundo fator (código calculado com `pyotp`) até o dashboard; override administrativo em `/company` (aba Usuários) — "Desativar 2FA" some a tag e o botão da linha do usuário imediatamente; passo de setup forçado no login (política `required`) com QR renderizando corretamente após o fix do flex-shrink. Sem erros no console. Dado de teste revertido ao final (`mfa_policy` de volta a `disabled`, TOTP dos usuários de teste limpo).
- PR ainda não aberta.
