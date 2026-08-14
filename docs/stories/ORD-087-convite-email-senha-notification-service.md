---
id: ORD-087
status: Ready
fase: 6
sprint: null
responsavel: Backend + Frontend
estimativa: 13 pontos
---

# ORD-087 — Convite por e-mail: usuário define a própria senha, sem campo senha no cadastro

## Descrição
Pedido direto do usuário: ao cadastrar um usuário na aba Usuários (`/company`), o campo "Senha" deixa de existir. Em vez disso, o sistema envia um e-mail de boas-vindas ao usuário convidado, com uma descrição básica do que ele vai operar no sistema (de acordo com o papel/role escolhido) e um link para ele finalizar o próprio cadastro definindo sua senha. Depende de [[ORD-086]] estar mesclada primeiro (mesma tela, evita diff misturado). Decisões de infraestrutura já fechadas com o usuário (2026-08-13): Mailtrap em desenvolvimento (decidido), AWS SES como alvo de produção (decidido, não implementado agora — Fase 2/AWS segue bloqueada por `docs/ARQUITETURA.md` §9/§14), interface abstrata desde já para trocar de provider sem retrabalho.

## Persona
**Owner/manager** (quem convida) e o **usuário convidado** (novo `cashier`/`manager`/`owner` da empresa, ainda sem conta — ele só existe como persona a partir do clique no link do e-mail).

## Contexto

### Achado crítico — `App.tsx` não tem como renderizar nenhuma rota sem estar autenticado
`App.tsx:43-50`:
```tsx
if (!isAuth) {
  return (<><ToastContainer /><LoginScreen /></>);
}
```
Isso significa que **qualquer URL**, incluindo um link de e-mail tipo `/set-password?token=...`, cai direto na tela de login — o app nunca olha o `path` antes de decidir se mostra login ou o shell autenticado. Sem mudar essa estrutura, o link do e-mail simplesmente não funciona. Este achado muda o Tech Explorer: a rota pública precisa ser resolvida **antes** do gate de `isAuth`, não depois.

### Achado 2 — `password_hash` já é `nullable=True` no schema atual
`services/company/main.py:121` (`Column(String(128))`, sem `nullable=False`) e confirmado na migration inicial (`20260611_0900_initial_schema.py:42`: `nullable=True`). **Não precisa de migration pra permitir usuário sem senha** — só parar de exigir o campo no schema Pydantic (`UserIn`) e no endpoint.

### Achado 3 — já existe um padrão de token de uso único no próprio projeto
`RefreshToken` (`services/auth/main.py`, tabela `refresh_tokens`): `token_hash` (hash, nunca o token puro), `expires_at`, `revoked`. Vou replicar exatamente essa forma para o token de convite — nenhum padrão novo sendo inventado.

### Achado 4 — já existe convenção de chamada interna serviço-a-serviço
`auth-service → company-service` via `httpx.AsyncClient` + header `X-Internal-Secret` (`services/auth/main.py:247`, `INTERNAL_HEADERS`). O `company-service → notification-service` (novo) vai seguir a mesma convenção — nada novo a desenhar, só aplicar o padrão existente a mais um par de serviços.

### Achado 5 — já existe env var `ADMIN_BASE_URL` no auth-service
`services/auth/main.py:18`: `ADMIN_BASE_URL = os.getenv("ADMIN_BASE_URL", "http://localhost:3001")`, hoje usado para montar link de pareamento de totem. O company-service vai precisar da mesma env var para montar o link `{ADMIN_BASE_URL}/set-password?token=...` do e-mail — variável já existe no projeto, só precisa ser lida também no company-service.

---

## Explorer

### História
Como **owner/manager**, quero convidar um novo funcionário por e-mail em vez de definir a senha dele mim mesmo, para não conhecer nem transmitir a senha de outra pessoa (a senha de cada um só existe na cabeça dele) e para o funcionário receber, junto do convite, uma explicação do que vai fazer no sistema de acordo com o papel escolhido.

### Fluxo principal
1. Owner/manager preenche nome, e-mail e papel (sem senha) na aba Usuários e clica em **"Convidar usuário"**
2. `company-service` cria o usuário (`password_hash` nulo), gera um token de convite de uso único (expira em 48h) e chama o `notification-service` internamente
3. `notification-service` monta o e-mail (boas-vindas + descrição do papel escolhido + link) e envia via Mailtrap (dev)
4. Usuário convidado recebe o e-mail, clica em "Definir minha senha"
5. Abre `/set-password?token=...` — rota pública, fora do login
6. Define senha (mínimo 8 caracteres) + confirmação → `company-service` valida o token, grava `password_hash`, invalida o token
7. Usuário é redirecionado para `/login` e já consegue entrar com e-mail + senha nova
8. Na aba Usuários, enquanto o convite está pendente (`password_hash` nulo), a linha mostra Tag "Convite pendente" + botão "Reenviar convite"

### Fluxos alternativos / exceções
- E-mail já cadastrado → 409 (comportamento já existente, mantido)
- Token expirado ao abrir `/set-password` → mensagem clara de erro + opção de pedir novo convite (sem crashar a tela)
- Token já usado (reuso) → mesma mensagem genérica de "convite inválido ou expirado" (não revelar se o token existiu, por segurança)
- Reenvio de convite invalida o token anterior (evita dois links do mesmo usuário valendo ao mesmo tempo)
- Envio de e-mail falha (Mailtrap fora do ar, etc.) → **usuário é criado mesmo assim** (não travar o cadastro por indisponibilidade do notification-service); UI avisa "Usuário criado, mas o convite não foi enviado — use Reenviar convite"

### Critérios de aceite
- [ ] Campo "Senha" removido do formulário de criação de usuário
- [ ] Botão "Criar usuário" renomeado para "Convidar usuário"
- [ ] E-mail enviado via Mailtrap (dev) com nome do convidado, descrição do papel (owner/manager/cashier) e link de definição de senha
- [ ] Nova rota pública `/set-password`, acessível sem estar autenticado
- [ ] Senha definida pelo próprio usuário, mínimo 8 caracteres, com confirmação
- [ ] Token de convite: uso único, expira em 48h
- [ ] Linha com convite pendente mostra Tag "Convite pendente" + botão "Reenviar convite" (reenviar invalida o token anterior)
- [ ] Falha no envio do e-mail não impede a criação do usuário
- [ ] `IEmailProvider` com implementação `SMTPEmailProvider` (Mailtrap) já pronta; implementação AWS SES escrita mas **não conectada em nenhum ambiente** (Fase 2/AWS segue bloqueada — ver Riscos)
- [ ] Novo `notification-service`, acessível só via chamada interna do company-service (`X-Internal-Secret`), sem rota pública própria

---

## QA Explorer

```gherkin
Feature: Convite de usuário por e-mail, sem senha no cadastro

  Background:
    Dado que existe uma empresa com um owner autenticado

  Scenario: Convite feliz — do cadastro até o primeiro login
    Quando o owner convida um usuário com nome, e-mail e papel "cashier"
    Então o usuário é criado sem senha
    E um e-mail é enviado ao endereço informado, com a descrição do papel "cashier"
    E o e-mail contém um link para /set-password com um token válido
    Quando o convidado acessa o link e define uma senha de 8+ caracteres com confirmação
    Então a senha é gravada e o token é invalidado
    E o convidado consegue fazer login com e-mail e a senha definida

  Scenario: Token expirado
    Dado um token de convite gerado há mais de 48h
    Quando o convidado tenta acessar /set-password com esse token
    Então recebe uma mensagem de erro clara, sem crash
    E é orientado a pedir um novo convite

  Scenario: Token já utilizado
    Dado um token de convite já usado para definir senha
    Quando alguém tenta usar o mesmo token novamente
    Então recebe a mesma mensagem genérica de "convite inválido ou expirado"

  Scenario: Reenvio de convite invalida o token anterior
    Dado um usuário com convite pendente
    Quando o owner clica em "Reenviar convite"
    Então um novo token é gerado e um novo e-mail é enviado
    E o token anterior deixa de ser válido

  Scenario: Falha no envio do e-mail não bloqueia a criação do usuário
    Dado que o notification-service está indisponível
    Quando o owner convida um usuário
    Então o usuário é criado normalmente (com convite pendente)
    E a UI avisa que o convite não foi enviado, oferecendo "Reenviar convite"

  Scenario: Senha curta é rejeitada
    Dado um token de convite válido
    Quando o convidado tenta definir uma senha com menos de 8 caracteres
    Então recebe erro de validação e a senha não é gravada

  Scenario: Regra de papel preservada (multi-tenant / RBAC)
    Dado um usuário com role "manager" logado
    Quando tenta convidar um usuário com papel "owner"
    Então recebe erro 403, mesmo comportamento já existente

  Scenario: Isolamento entre empresas
    Dado um token de convite pertencente a um usuário da empresa A
    Quando alguém tenta usá-lo para definir a senha de um usuário da empresa B
    Então a operação falha — o token está vinculado a um único user_id, não pode ser reaproveitado entre usuários
```

---

## Tech Explorer

### Serviços impactados
- `services/company/` — remove senha do `UserIn`, gera/valida token de convite, chama `notification-service`, nova tabela `user_invite_tokens`
- **`services/notification/` (novo microsserviço)** — recebe pedido interno de envio, monta template por papel, envia via `IEmailProvider`
- `frontend/admin/` — `CompanyScreen.tsx` (aba Usuários), nova `SetPasswordScreen.tsx`, `App.tsx` (rota pública fora do gate de auth)
- `docker-compose.yml`, `.env.example` — novo serviço + variáveis de e-mail

### Endpoints

#### `POST /companies/{company_id}/users` (alterado)
**Serviço:** company-service · **Auth:** JWT, `_require_company_admin` (igual hoje)

Request (campo `password` removido):
```json
{ "name": "string", "email": "string", "role": "cashier" }
```
Comportamento novo: cria o usuário com `password_hash=None`; gera `token = secrets.token_urlsafe(32)`, grava `sha256(token)` em `user_invite_tokens` (`expires_at = now + 48h`); chama `POST {NOTIFICATION_SERVICE_URL}/internal/send-invite` com `{to, name, role, set_password_url: f"{ADMIN_BASE_URL}/set-password?token={token}"}`. Se a chamada falhar (timeout/erro), captura e segue — não propaga erro pro cliente, usuário já foi criado.

#### `POST /companies/{company_id}/users/{user_id}/resend-invite` (novo)
**Serviço:** company-service · **Auth:** JWT, `_require_company_admin`
Invalida (`used_at = now`) qualquer token ativo do usuário, gera um novo, chama `send-invite` de novo. Erro 400 se o usuário já tem senha definida.

#### `POST /users/complete-registration` (novo, **público** — sem JWT)
**Serviço:** company-service · **Auth:** nenhuma — protegido pelo próprio token (alta entropia, uso único, hash no banco, expiração)

Request:
```json
{ "token": "string", "password": "string (min 8)" }
```
Response 200: `{ "ok": true }` · Erros: 400 (token inválido/expirado/já usado, ou senha curta) — mensagem genérica, não revela detalhe do motivo.

#### `POST /internal/send-invite` (novo, notification-service)
**Serviço:** notification-service · **Auth:** `X-Internal-Secret` — **nunca exposto publicamente**, mesmo tratamento de `/internal/*` que já existe no Nginx/Kong

Request:
```json
{ "to": "string", "name": "string", "role": "owner|manager|cashier", "set_password_url": "string" }
```
Monta HTML por papel (dicionário `ROLE_DESCRIPTIONS` no próprio serviço — não duplicar essa lógica no frontend) e chama `IEmailProvider.send(to, subject, html)`.

### Migrations
- `services/company/`: nova tabela `user_invite_tokens` — `id`, `user_id` (FK `users.id`), `token_hash` (String(64), unique), `expires_at` (DateTime), `used_at` (DateTime, nullable), `created_at` (DateTime) — mesmo desenho de `RefreshToken` no auth-service.
- `UserIn`: remove `password: str`.

### Novo microsserviço `notification-service`
Sem banco próprio — stateless (recebe, envia, responde 200/erro; nenhuma persistência própria nesta primeira versão). Estrutura:
```
services/notification/
  domain/interfaces/email_provider.py   → IEmailProvider (ABC), mesmo molde de IPaymentProvider
  infrastructure/smtp_provider.py       → SMTPEmailProvider (Mailtrap via SMTP, dev)
  infrastructure/ses_provider.py        → SESEmailProvider (boto3, IAM role — escrito, não conectado)
  main.py                               → FastAPI, seleciona provider por EMAIL_PROVIDER=smtp|ses
```
Porta `8006`. Sem rota exposta no Nginx/Kong (só alcançável dentro da rede Docker/VPC pelo company-service).

### Variáveis de ambiente novas
```
NOTIFICATION_SERVICE_URL=http://notification-service:8006
EMAIL_PROVIDER=smtp                 # smtp (dev/Mailtrap) | ses (produção, não conectado ainda)
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=...
SMTP_PASSWORD=...
EMAIL_FROM_ADDRESS=no-reply@ordin.app
ADMIN_BASE_URL=http://localhost:3001   # já existe no auth-service; company-service passa a ler também
```

### Frontend

**`App.tsx` — achado crítico, precisa mudar a estrutura do gate:**
```tsx
// antes de checar isAuth, resolver rotas públicas por path:
if (window.location.pathname === "/set-password") {
  return (<><ToastContainer /><SetPasswordScreen /></>);
}
if (!isAuth) { ... LoginScreen ... }
```
(Ou equivalente usando `<Routes>` fora do bloco condicionado a `isAuth`, se ficar mais limpo na implementação — decisão de estilo do dev na hora de codar, o que importa é a rota pública resolver **antes** do gate.)

**`SetPasswordScreen.tsx` (novo):** lê `token` da query string, formulário senha + confirmação, chama `POST /users/complete-registration`, trata erro (token inválido/expirado) com mensagem amigável, sucesso redireciona pra `/login`.

**`CompanyScreen.tsx` (aba Usuários, em cima da base já reskinada no [[ORD-086]]):**
- Remove input de senha e o `newUser.password` do estado
- Botão "Criar usuário" → "Convidar usuário"
- `UserOut`/`User` (types.ts) ganha campo derivado `pending_setup: boolean` (`password_hash is None` no backend)
- Linha com `pending_setup: true` mostra `Tag` "Convite pendente" + `Button` "Reenviar convite" chamando o novo endpoint

### Impacto em outros serviços
- `company-service` → `notification-service`: HTTP interno, `X-Internal-Secret`, mesmo padrão de `auth-service` → `company-service`
- Nenhum impacto em `auth`, `catalog`, `order`, `payment`

### Riscos
- **App.tsx é código de autenticação global** — mexer no gate de `isAuth` tem risco de regressão no próprio login. Precisa de teste explícito de que o fluxo de login normal continua idêntico depois da mudança (cenário Gherkin não incluído acima por já ser coberto pelos testes de login existentes — mas deve ser rodado manualmente antes do merge).
- **AWS SES não pode ser testado de verdade agora** — Fase 2/AWS segue bloqueada (`docs/ARQUITETURA.md` §9, §14). A implementação `SESEmailProvider` fica escrita e coberta por teste unitário (mock de `boto3`), mas sem validação end-to-end de deliverability real até a Fase 2 destravar — decisão explícita do usuário (2026-08-13) de já deixar a interface pronta mesmo assim.
- **notification-service sem persistência própria** — se precisar auditar "esse e-mail foi enviado mesmo?" no futuro, essa primeira versão só tem logs estruturados, sem tabela de histórico de envios. Decisão deliberada de manter o serviço simples na v1; virar história própria se o time sentir falta de um histórico de envios.
- Token com 256 bits de entropia (`secrets.token_urlsafe(32)`) — impraticável de adivinhar, mesmo padrão de segurança do `refresh_tokens` já em produção.

### Estimativa
13 pontos — maior história da sprint: microsserviço novo, abstração de provider, fluxo de token, migration, restruturação do gate de autenticação do frontend e duas telas (uma nova). Consideravelmente maior que o [[ORD-081]] (8), que foi só endpoint + frontend num serviço já existente.

---

## Ready

**Explorer:** [x] fluxo completo (do convite ao primeiro login), persona dupla (quem convida + convidado), critérios de aceite definidos · **QA Explorer:** [x] cenários Gherkin cobrindo happy path, expiração, reuso de token, reenvio, falha de envio, validação de senha, RBAC e isolamento entre empresas · **Tech Explorer:** [x] achado crítico do gate de autenticação documentado antes de virar bug em produção, endpoints e migration completos, novo microsserviço desenhado seguindo padrões já existentes no projeto (token hash, chamada interna, abstração de provider), riscos e estimativa · **Aprovação final:** [x] decisões de infraestrutura (Mailtrap dev / AWS SES prod / TOTP adiado pra próxima sprint) aprovadas no chat pelo usuário (2026-08-13)

**Status: Ready** — pode começar a implementação, **depois** do [[ORD-086]] estar mesclado.
