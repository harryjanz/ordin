---
id: ORD-097
status: Ready
fase: 6
sprint: null
responsavel: Backend + Frontend
estimativa: 21 pontos
---

# ORD-097 — Recuperação de senha (esqueci minha senha + disparo administrativo)

## Descrição
Pedido do usuário (2026-08-18): faltava um jeito de recuperar acesso quando o usuário esquece a senha — hoje só existe o fluxo de convite inicial (ORD-087). Duas entradas: (1) autoatendimento — link "Esqueci minha senha" na tela de login, usuário informa o e-mail, recebe um link, define senha nova dentro dos critérios já existentes (ORD-090); (2) administrativa — `owner`/`manager`/`superadmin`/`admin` conseguem disparar esse e-mail pra outro usuário pela tela de Usuários, mesmo padrão de "Reenviar convite". Todo reset de senha revoga dispositivos confiáveis e sessões ativas da conta — discutido e decidido no chat que isso **não inclui** desativar/resetar o duplo fator em si (ver Contexto).

## Persona
Todo usuário com senha (não aplica a `kiosk`) que esquece a própria senha, e `owner`/`manager`/`superadmin`/`admin` ajudando outro usuário a recuperar acesso.

## Contexto

### Decisão de segurança — por que resetar senha NÃO reseta o MFA
Discutido e decidido no chat: senha e duplo fator são fatores propositalmente independentes. Se um reset de senha por e-mail também desligasse/reconfigurasse o MFA, um invasor que só comprometeu o **e-mail** da vítima (o vetor mais comum de "esqueci minha senha" — phishing, e-mail vazado, SIM swap) conseguiria fechar o ciclo sozinho: pedir reset → definir senha nova → MFA reseta → configurar o próprio autenticador → conta tomada inteira, sem nunca ter tido acesso ao segundo fator físico original. Nenhuma plataforma séria faz isso (GitHub/Google/AWS nunca desligam 2FA num reset de senha por e-mail). **O que reset de senha faz:** revoga dispositivos confiáveis (força reconfirmar o MFA já existente no próximo login) e revoga todas as sessões ativas (refresh tokens) da conta. **O que não faz:** não toca no segredo TOTP nem nos códigos de backup. Recuperação de MFA perdido continua sendo o fluxo assistido já existente (`/platform-users/{id}/mfa/reset` e equivalente de empresa, ORD-088/093), que exige um humano verificar — propositalmente mais fricção que um link de e-mail.

### Achado — infraestrutura do ORD-087 já é reaproveitável quase inteira
`UserInviteToken` (token de uso único, hash persistido, TTL, `used_at`), `_issue_invite`, `GET /users/invite-status` e `POST /users/complete-registration` já formam um mecanismo genérico de "definir uma senha nova dado um token válido por e-mail" — `complete_registration` não checa `pending_setup`, funciona pra qualquer usuário existente. `SetPasswordScreen.tsx` (tela pública `/set-password?token=...`) também não assume nada específico de primeiro acesso, exceto o texto ("Bem-vindo! Defina sua senha para concluir o cadastro" — ajustado nesta história pra um texto neutro que sirva nos dois contextos). **Decisão:** reaproveitar tudo isso — sem token/tabela/tela nova pra reset, só uma função de emissão nova (mesmo desenho de `_issue_invite`, template de e-mail diferente) e uma extensão em `complete_registration` (revogar dispositivos/sessões, incondicional — no primeiro acesso isso é um no-op inofensivo, já que não existe sessão/dispositivo antes do primeiro login).

### Achado — revogar sessões é cross-serviço, não existe hoje
Dispositivos confiáveis (`TrustedDevice`) vivem no company-service, mas sessões ativas (`RefreshToken.revoked`) vivem no auth-service — bancos separados. Hoje só auth-service chama company-service (nunca o inverso). Precisa de: endpoint interno novo no auth-service (`POST /internal/revoke-sessions`) e uma chamada HTTP nova saindo do company-service (mesmo padrão `X-Internal-Secret` já usado por company→notification), com uma env var nova (`AUTH_SERVICE_URL`) que ainda não existe no company-service.

### Decisão confirmada com o usuário — quem dispara pelo painel
Mesmo critério de "Reenviar convite" já existente: `owner`/`manager` disparam pra usuários da própria empresa; `superadmin`/`admin` disparam pra qualquer empresa e entre usuários de plataforma — sem regra nova de autorização, reaproveita `_require_company_admin`/`_require_platform_admin` já usados nas ações equivalentes.

### Prevenção de enumeração de e-mail e abuso
`POST /users/forgot-password` sempre responde com sucesso genérico, exista ou não o e-mail (mesma cautela documentada em `invite_status`/`complete_registration` pra não revelar motivo de falha). Rate limit por IP + e-mail via Redis, mesmo padrão de `check_rate_limit` do auth-service (pin_attempts) — impede tanto brute-force de descobrir e-mails válidos quanto spam de e-mails de reset pra uma vítima.

---

## Explorer

### História
Como usuário que esqueceu a senha, quero pedir um link de redefinição pelo meu e-mail direto na tela de login, sem precisar acionar suporte. Como `owner`/`manager`/`superadmin`/`admin`, quero poder disparar esse mesmo e-mail pra outra pessoa da minha equipe que está travada. Em qualquer um dos dois casos, quero que a conta fique protegida depois — sessões antigas encerradas, dispositivos confiáveis revogados — sem que isso signifique desligar o duplo fator de quem já tinha.

### Fluxo principal (autoatendimento)
1. Na tela de login, link "Esqueci minha senha" leva a uma tela nova (`/forgot-password`)
2. Usuário informa o e-mail, envia
3. Resposta sempre genérica: "Se esse e-mail existir na nossa base, você vai receber um link em instantes." — nunca confirma nem nega a existência do e-mail
4. Se o e-mail corresponde a um usuário ativo, um token de uso único é gerado e um e-mail com link `/set-password?token=...` é enviado (mesma tela do ORD-087, texto ajustado pra ser neutro)
5. Usuário abre o link, define a senha nova (mesma validação de força do ORD-090)
6. Ao confirmar: senha atualizada, todos os dispositivos confiáveis da conta revogados, todas as sessões ativas (refresh tokens) revogadas
7. Usuário faz login normalmente com a senha nova — se tinha MFA ativo, é desafiado normalmente (dispositivo não é mais confiável, mas o TOTP continua o mesmo)

### Fluxo principal (disparo administrativo)
1. `owner`/`manager` (própria empresa) ou `superadmin`/`admin` (qualquer empresa/plataforma) abre a tela de Usuários
2. Botão novo "Enviar redefinição de senha" na linha do usuário (qualquer usuário ativo, não só `pending_setup`)
3. Mesmo e-mail/token do fluxo de autoatendimento — usuário recebe e segue os mesmos passos 5-7 acima

### Fluxos alternativos / exceções
- E-mail de conta inativa ou inexistente: resposta genérica igual, nenhum e-mail enviado (sem revelar o motivo)
- Link expirado ou já usado: mesma tela de erro já existente no `SetPasswordScreen.tsx` ("Este link já foi usado ou expirou")
- Rate limit: excesso de pedidos pro mesmo e-mail ou do mesmo IP bloqueia temporariamente, mesmo padrão de `check_rate_limit` (pin do totem)
- Primeiro acesso (`pending_setup`) não é afetado — continua usando o mesmo token/tela, `complete_registration` não diferencia os dois casos, e revogar dispositivos/sessões nesse caso é um no-op (usuário nunca logou antes)
- `kiosk` não tem senha de usuário (login por PIN) — fora de escopo

### Dependências
- Serviços envolvidos: `company` (endpoint novo + extensão de `complete_registration`), `auth` (endpoint interno novo de revogação de sessão), `notification` (template + endpoint novo de e-mail)
- Histórias relacionadas: [[ORD-087]] (convite/definição de senha — infraestrutura reaproveitada), [[ORD-090]] (força de senha — validação reaproveitada), [[ORD-092]] (dispositivo confiável — revogação reaproveita o mesmo modelo)
- Sem histórias bloqueantes

### Critérios de aceite funcionais
- [ ] Link "Esqueci minha senha" na tela de login leva a uma tela de pedir e-mail
- [ ] `POST /users/forgot-password` sempre responde com mensagem genérica de sucesso, exista ou não o e-mail
- [ ] E-mail existente e ativo recebe link de redefinição por e-mail (token de uso único, mesmo TTL do convite)
- [ ] Definir a senha nova pelo link funciona com a mesma validação de força já existente
- [ ] Ao concluir: dispositivos confiáveis da conta revogados, sessões ativas (refresh tokens) revogadas
- [ ] Duplo fator (TOTP/backup codes) não é alterado pelo reset de senha, em nenhum caso
- [ ] Botão "Enviar redefinição de senha" na tela de Usuários (empresa cliente e plataforma), mesma regra de quem pode disparar do "Reenviar convite"
- [ ] Rate limit protege contra abuso/enumeração de e-mail no endpoint de autoatendimento
- [ ] Fluxo de primeiro acesso (convite, ORD-087) continua funcionando sem nenhuma regressão

### Wireframe / Mockup
Sem mockup formal — `ForgotPasswordScreen.tsx` segue o mesmo estilo visual de `LoginScreen.tsx`/`SetPasswordScreen.tsx` (card centralizado, mesmo `styles.page`/`styles.card`). Botão administrativo replica exatamente o padrão visual/posicional de "Reenviar convite" já existente na coluna de ações.

---

## QA Explorer

```gherkin
Feature: Recuperação de senha

  Scenario: Pedido de reset com e-mail existente
    Dado um usuário ativo com e-mail conhecido
    Quando ele pede redefinição de senha com esse e-mail
    Então recebe a mensagem genérica de sucesso
    E um e-mail com link de redefinição é enviado

  Scenario: Pedido de reset com e-mail inexistente não revela nada
    Quando alguém pede redefinição de senha com um e-mail que não existe na base
    Então recebe a mesma mensagem genérica de sucesso
    E nenhum e-mail é enviado

  Scenario: Definir senha nova pelo link
    Dado um token de reset válido
    Quando o usuário define uma senha nova que atende ao critério de força
    Então a senha é atualizada
    E o token não pode mais ser reutilizado

  Scenario: Reset revoga dispositivos confiáveis sem tocar no MFA
    Dado um usuário com duplo fator ativo e um dispositivo confiável ativo
    Quando ele conclui um reset de senha
    Então o dispositivo confiável é revogado
    E o duplo fator continua ativo e configurado (mesmo segredo TOTP)
    E no próximo login ele é desafiado a informar o código do autenticador

  Scenario: Reset revoga sessões ativas
    Dado um usuário logado em dois navegadores diferentes
    Quando ele conclui um reset de senha num deles
    Então o refresh token do outro navegador deixa de funcionar

  Scenario: Link expirado ou já usado
    Quando alguém tenta usar um link de reset expirado ou já usado
    Então vê a mensagem de link inválido, sem revelar mais detalhes

  Scenario: Rate limit protege contra abuso
    Quando o mesmo e-mail ou IP pede redefinição de senha repetidas vezes além do limite
    Então pedidos adicionais são bloqueados temporariamente

  Scenario: Owner dispara redefinição pra usuário da própria empresa
    Dado um owner autenticado e um cashier da mesma empresa
    Quando ele clica em "Enviar redefinição de senha" na linha desse cashier
    Então o e-mail de redefinição é enviado pro cashier

  Scenario: Owner não dispara redefinição pra usuário de outra empresa
    Dado um owner autenticado
    Quando ele tenta disparar redefinição pra um user_id de outra empresa direto na API
    Então a requisição é rejeitada

  Scenario: Superadmin dispara redefinição pra qualquer empresa
    Dado um superadmin autenticado
    Quando ele dispara redefinição pra um usuário de uma empresa cliente qualquer
    Então o e-mail é enviado normalmente

  Scenario: Primeiro acesso continua funcionando sem regressão
    Dado um usuário recém-convidado (pending_setup)
    Quando ele define a senha pela primeira vez pelo link de convite
    Então a conta é ativada normalmente, sem nenhum efeito colateral novo perceptível
```

---

## Tech Explorer

### Serviços impactados
- `services/company/` — endpoint novo de pedido de reset, extensão de `complete_registration`, endpoint administrativo novo, chamada HTTP nova pro auth-service
- `services/auth/` — endpoint interno novo de revogação de sessões
- `services/notification/` — template e endpoint novo de e-mail
- `frontend/admin/` — tela nova (`ForgotPasswordScreen.tsx`), ajuste de texto em `SetPasswordScreen.tsx`, link novo em `LoginScreen.tsx`, botão novo em `CompanyScreen.tsx`/`PlatformUsersScreen.tsx`, rota pública nova em `App.tsx`

### Endpoints

#### `POST /users/forgot-password` (novo, público, rate-limited)
```python
class ForgotPasswordIn(BaseModel):
    email: str

@app.post("/users/forgot-password", tags=["Usuários"], summary="Pedir redefinição de senha")
async def forgot_password(
    body: ForgotPasswordIn, request: Request, response: Response,
    db: AsyncSession = Depends(get_db),
):
    check_rate_limit(request.client.host, body.email.lower(), response)  # mesmo padrão de pin_attempts, adaptado
    result = await db.execute(select(User).filter_by(email=body.email, active=True))
    u = result.scalars().first()
    if u:
        await _issue_password_reset(db, u)  # mesmo desenho de _issue_invite, template diferente
    return {"sent": True}  # sempre, independente de encontrar o e-mail
```
`check_rate_limit`/Redis precisa ser portado (ou importado) pro company-service — hoje só existe no auth-service; company-service já tem `redis_client` configurado (usado pra blacklist/revogação imediata), então é reaproveitar a conexão já existente, só faltando a função.

#### `_issue_password_reset(db, user)` (novo, espelha `_issue_invite`)
Mesmo desenho: `UserInviteToken` novo (reaproveitado, sem mudança de schema), chama `POST /internal/send-password-reset` no notification-service em vez de `/internal/send-invite`. Mesma política de nunca propagar erro de envio.

#### `POST /users/complete-registration` (alterado)
Ao final, depois de `invite.used_at = datetime.utcnow()`:
```python
await db.execute(
    update(TrustedDevice).where(TrustedDevice.user_id == user.id, TrustedDevice.revoked_at.is_(None))
    .values(revoked_at=datetime.utcnow())
)
await db.commit()
async with httpx.AsyncClient(timeout=5) as client:
    try:
        await client.post(f"{AUTH_SERVICE_URL}/internal/revoke-sessions",
                           json={"user_id": user.id},
                           headers={"X-Internal-Secret": INTERNAL_SECRET})
    except httpx.HTTPError:
        pass  # mesma tolerância a falha do _issue_invite — nunca bloqueia o reset em si
```
Incondicional (roda tanto no primeiro acesso quanto num reset) — no primeiro acesso é um no-op (sem dispositivo/sessão prévia).

#### `POST /companies/{company_id}/users/{user_id}/send-password-reset` e `POST /platform-users/{user_id}/send-password-reset` (novos)
Espelham exatamente `resend_invite`/`resend_platform_invite` — mesma autorização (`_require_company_admin`/`_require_platform_admin`), chamam `_issue_password_reset` em vez de `_issue_invite`. Funcionam pra qualquer usuário ativo (não só `pending_setup`, diferença chave em relação a "reenviar convite").

#### `POST /internal/revoke-sessions` (novo, auth-service)
```python
class RevokeSessionsIn(BaseModel):
    user_id: int

@app.post("/internal/revoke-sessions", include_in_schema=False)
async def revoke_sessions(body: RevokeSessionsIn, db: AsyncSession = Depends(get_db), _: None = Depends(require_internal)):
    await db.execute(update(RefreshToken).where(RefreshToken.user_id == body.user_id, RefreshToken.revoked == False).values(revoked=True))
    await db.commit()
    return {"ok": True}
```

#### `POST /internal/send-password-reset` (novo, notification-service)
Espelha `send_invite` — novo `_build_password_reset_html` (mesmo header/footer, CTA "Redefinir minha senha", link pro mesmo `/set-password?token=...`).

### Frontend
- `ForgotPasswordScreen.tsx` (novo) — campo de e-mail, `POST /users/forgot-password`, sempre mostra a mesma mensagem de sucesso após enviar (mesmo se a chamada falhar por rate limit — mostrar erro genérico só nesse caso)
- `LoginScreen.tsx` — link "Esqueci minha senha" abaixo do formulário, leva a `/forgot-password`
- `SetPasswordScreen.tsx` — texto do estado inicial trocado de "Bem-vindo(a)! Defina sua senha para concluir o cadastro." pra "Defina sua nova senha." (neutro pros dois contextos); resto da tela sem mudança
- `App.tsx` — rota pública nova `/forgot-password` (mesmo padrão de exceção de `/set-password`, funciona sem sessão)
- `CompanyScreen.tsx` / `PlatformUsersScreen.tsx` — botão "Enviar redefinição de senha" na coluna de ações, visível pra qualquer usuário ativo (não condicionado a `pending_setup`)

### Variáveis de ambiente novas
- `services/company/`: `AUTH_SERVICE_URL` (novo — hoje não existe, só auth chamava company)
- `.env`/`.env.example`/`docker-compose.yml`: adicionar `AUTH_SERVICE_URL=http://auth-service:8001` ao ambiente do `company-service`

### Impacto em outros serviços
`catalog`/`order`/`payment` inteiramente alheios.

### Eventos de fila
Não aplicável.

### Estimativa
- Backend: 13 pontos (endpoint de pedido + rate limit portado, extensão de complete_registration, 2 endpoints administrativos, endpoint novo cross-serviço em auth, endpoint novo em notification, env var nova)
- Frontend: 8 pontos (1 tela nova, 2 telas ajustadas, 1 rota nova, botão novo em 2 telas de usuários)

### Riscos
- **Risco médio — nova dependência cross-serviço (company → auth):** primeira vez que essa direção de chamada existe; mitigado seguindo exatamente o padrão já validado de company→notification (mesmo header, mesma tolerância a falha, sem bloquear o fluxo principal se a chamada falhar).
- **Risco médio — rate limit precisa ser correto desde o início:** sem ele, o endpoint de reset vira ferramenta de enumeração de e-mail ou spam; mitigado reaproveitando o padrão já testado em produção (pin_attempts) em vez de inventar um novo.
- **Risco baixo — reaproveitamento de `UserInviteToken`/`complete_registration`:** já testado e em produção desde o ORD-087, mudança é aditiva (revogação no final), não deveria quebrar o fluxo de convite existente — mas testes de regressão do ORD-087 são obrigatórios antes de mergear.
