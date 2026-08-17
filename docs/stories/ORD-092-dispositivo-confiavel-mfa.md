---
id: ORD-092
status: Ready
fase: 6
sprint: null
responsavel: Backend + Frontend
estimativa: 13 pontos
---

# ORD-092 — Dispositivo confiável: não repetir o duplo fator por 7 dias no mesmo navegador

## Descrição
Pedido do usuário após usar o duplo fator (ORD-088) pela primeira vez: hoje o código é pedido em **todo** login, mesmo logo depois de um logout comum, no mesmo navegador. Padrão de mercado (Google, GitHub, etc.) é lembrar o dispositivo por um período e só voltar a pedir o código se for um navegador/aparelho novo ou desconhecido, ou depois que a janela de confiança expirar.

## Persona
Todo usuário com duplo fator ativo (owner/manager/cashier/superadmin/admin) — o mesmo público do ORD-088.

## Contexto
**Prazo decidido com o usuário (2026-08-17):** 7 dias, não os 30 dias comuns de mercado — justificativa explícita: o sistema trata valores e operações financeiras, então a janela de confiança deve ser mais curta que o padrão genérico.

Este documento já é o Explorer completo (retomado na mesma sessão do ORD-088, com o contexto do usuário ainda fresco) — não é um stub como o ORD-088 foi na primeira passada.

---

## Explorer

### História
Como usuário com duplo fator ativo, quero que o sistema não peça o código a cada login no mesmo navegador dentro de uma janela curta, para reduzir a fricção do dia a dia sem abrir mão da proteção extra em dispositivos novos ou desconhecidos.

### Contexto e motivação
2FA reduz risco, mas pedir o código em **todo** login (inclusive segundos depois de um logout comum) é fricção desproporcional pro ganho de segurança — o risco real que o 2FA mitiga é login a partir de um dispositivo que o dono da conta não controla, não logins repetidos do mesmo navegador que a pessoa já demonstrou controlar recentemente.

### Fluxo principal
1. Usuário sem duplo fator ativo faz login normalmente e completa o desafio de código (TOTP ou backup) pela primeira vez
2. Na tela do código, uma opção "Confiar neste navegador por 7 dias", **marcada por padrão** (decidido com o usuário, 2026-08-17) — desmarcar é a exceção, pra máquina compartilhada/pública
3. Se marcada: o sistema guarda um identificador de dispositivo confiável, válido por 7 dias, associado à conta
4. Próximo login, mesmo navegador, dentro dos 7 dias: sistema reconhece o dispositivo e não pede o código — só e-mail/senha, igual seria sem 2FA nenhum
5. Cada uso bem-sucedido do dispositivo confiável renova a janela de 7 dias (sliding window) — enquanto a pessoa usar o mesmo navegador regularmente, nunca expira "de surpresa" no meio do trabalho
6. Login num navegador/aparelho diferente: sempre pede o código, mesmo dentro dos 7 dias de outro dispositivo
7. Usuário vê e revoga dispositivos confiados em "Minha segurança" (Configurações)

### Fluxos alternativos / exceções
- Logout comum **não** apaga o dispositivo confiável — é sobre o navegador, não a sessão (mesma lógica do "lembrar computador" de qualquer sistema com esse padrão). Ação separada, "Esquecer este dispositivo", limpa explicitamente.
- Desativar o duplo fator (self-service ou override administrativo) apaga todos os dispositivos confiáveis daquele usuário junto — não faz sentido manter "reconhecimento de 2FA" de uma conta que não tem mais 2FA.
- Revogar um dispositivo específico invalida imediatamente — próximo login daquele navegador pede o código de novo, mesmo dentro dos 7 dias.
- Dispositivo confiável expirado (mais de 7 dias sem uso) → login volta a pedir o código normalmente, sem erro, sem aviso especial.
- **Política `required` da empresa:** dispositivo confiável continua pulando o código, mesmo com a política obrigatória — a obrigatoriedade é sobre *ter* 2FA configurado, não sobre repetir o desafio em todo login do mesmo aparelho. (Decisão explícita — sinalizar se o usuário discordar.)

### Dependências
- Serviços envolvidos: `auth` (login, decide se pula o desafio), `company` (dono do relacionamento usuário↔dispositivo confiável, mesmo padrão de `user_backup_codes`)
- Histórias bloqueantes: [[ORD-088]] (Done) — duplo fator já implementado, esta história só adiciona a camada de "lembrar dispositivo" por cima

### Critérios de aceite funcionais
- [ ] Usuário pode optar por confiar no dispositivo no momento de confirmar o código
- [ ] Dispositivo confiável válido pula o passo de código no login seguinte, mesmo navegador
- [ ] Janela desliza (renova) a cada uso — 7 dias sempre a partir do último login bem-sucedido naquele dispositivo
- [ ] Dispositivo confiável de um navegador não vale pra outro
- [ ] Usuário vê a lista de dispositivos confiados (rótulo, criado em, último uso) e revoga individualmente
- [ ] Revogar invalida imediatamente — sem esperar expiração
- [ ] Desativar 2FA (self-service ou override administrativo) limpa todos os dispositivos confiáveis daquele usuário
- [ ] Política `required` da empresa não é afetada — segue exigindo que 2FA esteja configurado; só o *desafio repetido* é que é pulado

### Wireframe / Mockup
Sem mockup formal — reaproveita padrões visuais existentes: checkbox no passo de código do `LoginScreen`, nova subseção em "Minha segurança" (`SettingsScreen`) listando dispositivos com `Tag`/`Button` no mesmo estilo da listagem de usuários do `CompanyScreen`.

---

## QA Explorer

```gherkin
Feature: Dispositivo confiável — não repetir duplo fator por 7 dias

  Background:
    Dado um usuário com duplo fator ativo

  Scenario: Marcar "confiar neste dispositivo" no login
    Quando o usuário completa o login com o código e marca "Confiar neste navegador"
    Então um dispositivo confiável é registrado, válido por 7 dias

  Scenario: Login seguinte no mesmo navegador não pede código
    Dado um dispositivo confiável válido para o usuário
    Quando ele faz login de novo (e-mail + senha) no mesmo navegador
    Então o acesso é concedido direto, sem pedir o código

  Scenario: Uso do dispositivo confiável renova a janela de 7 dias
    Dado um dispositivo confiável com 6 dias de uso
    Quando o usuário faz login com sucesso usando esse dispositivo
    Então a validade do dispositivo é renovada pra mais 7 dias a partir de agora

  Scenario: Dispositivo confiável expirado volta a pedir código
    Dado um dispositivo confiável cujos 7 dias já passaram sem uso
    Quando o usuário faz login nesse navegador
    Então o código é pedido normalmente, sem erro especial

  Scenario: Navegador diferente sempre pede código
    Dado um dispositivo confiável válido no navegador A
    Quando o usuário faz login pelo navegador B
    Então o código é pedido normalmente

  Scenario: Login sem marcar "confiar" não cria dispositivo confiável
    Quando o usuário completa o login com código sem marcar a opção
    Então nenhum dispositivo confiável é registrado
    E o próximo login nesse navegador volta a pedir o código

  Scenario: Revogar um dispositivo específico
    Dado dois dispositivos confiáveis do mesmo usuário
    Quando o usuário revoga um deles em "Minha segurança"
    Então só aquele dispositivo deixa de funcionar
    E o outro continua válido

  Scenario: Revogação é imediata, não espera expiração
    Dado um dispositivo confiável válido
    Quando o usuário o revoga
    E tenta logar de novo nesse navegador na sequência
    Então o código é pedido normalmente

  Scenario: Desativar 2FA limpa todos os dispositivos confiáveis
    Dado um usuário com 2 dispositivos confiáveis ativos
    Quando ele desativa o duplo fator (self-service)
    Então os 2 dispositivos confiáveis são removidos

  Scenario: Override administrativo também limpa dispositivos confiáveis
    Dado um usuário com dispositivo confiável ativo
    Quando o owner/manager desativa o 2FA desse usuário via /company
    Então os dispositivos confiáveis dele também são removidos

  Scenario: Política "obrigatório" não é enfraquecida
    Dado uma empresa com mfa_policy=required e um usuário com dispositivo confiável válido
    Quando ele faz login nesse dispositivo
    Então o login conclui sem pedir código (dispositivo confiável vale)
    Mas se ele nunca tivesse configurado 2FA, o setup ainda seria forçado normalmente

  Scenario: Isolamento — token de dispositivo de um usuário não serve pra outro
    Dado um dispositivo confiável do usuário A
    Quando o usuário B tenta logar usando o mesmo token de dispositivo (cenário de ataque)
    Então o token não é aceito — validação cruza token com o usuário autenticado por e-mail/senha
```

---

## Tech Explorer

### Decisão de arquitetura: localStorage + header, não cookie (aprovado com o usuário, 2026-08-17)
O padrão "de livro-texto" pra esse recurso é um cookie `HttpOnly`/`Secure`. Mas **todo o resto deste sistema é Bearer token em `localStorage`** — não existe nenhum cookie de sessão hoje em nenhum serviço. Introduzir cookie só aqui adiciona uma segunda forma de credencial (com `credentials:true` em CORS, `SameSite`, etc.) numa arquitetura que nunca teve isso.

**Recomendação:** um token de dispositivo (opaco, alta entropia, mesmo padrão de `refresh_token`/`backup_codes` — só o hash persistido) guardado numa chave de `localStorage` **separada** do estado persistido pelo Zustand (`ordin-admin-auth`), explicitamente **fora** do que `logout()` limpa — é assim que ele sobrevive a um logout comum. Enviado como header próprio (`X-Device-Trust`) na chamada de `/auth/login`.

**Trade-off aceito conscientemente:** um XSS no admin já comprometeria `refreshToken` hoje (mesmo `localStorage`) — o token de dispositivo não abre uma categoria de risco nova, só estende a superfície já aceita. Cookie `HttpOnly` teria uma vantagem real aqui (JS não alcança), mas o custo arquitetural (primeiro cookie do sistema) não valia a pena pra esse ganho incremental — confirmado com o usuário.

### Checkbox marcada por padrão (decidido com o usuário, 2026-08-17)
Menos fricção no dia a dia — usuário precisa desmarcar ativamente em máquina compartilhada/pública. A janela curta de 7 dias (em vez dos 30 comuns de mercado) já é o principal freio de segurança desta história; a checkbox marcada por padrão prioriza fricção baixa por cima disso.

### Serviços impactados
- `services/company/` — dono da tabela `trusted_devices` e da validação (mesmo padrão de `user_backup_codes`)
- `services/auth/` — login lê/envia o header do token de dispositivo, decide se emite um novo
- `frontend/admin/` — `LoginScreen.tsx` (checkbox + envio do header), `store.ts` (chave separada, sobrevive a `logout()`), `SettingsScreen.tsx` (lista + revogação em "Minha segurança")

### Migrations

**`services/company/`:**
```python
class TrustedDevice(Base):
    __tablename__ = "trusted_devices"
    id            = Column(Integer, primary_key=True)
    user_id       = Column(Integer, index=True)
    token_hash    = Column(String(64), unique=True)   # sha256, mesmo padrão de UserInviteToken
    device_label  = Column(String(200), nullable=True)  # User-Agent bruto, sem parsing sofisticado
    created_at    = Column(DateTime, default=datetime.utcnow)
    last_used_at  = Column(DateTime, default=datetime.utcnow)
    expires_at    = Column(DateTime)   # renovado (+7 dias) a cada uso bem-sucedido
    revoked_at    = Column(DateTime, nullable=True)
```

### Endpoints

#### `POST /internal/verify-trusted-device` (novo, interno)
**Serviço:** company · **Auth:** `X-Internal-Secret`

Request: `{ "email": "...", "device_token": "..." }`
Chamado pelo auth-service **depois** de `verify-credentials` já ter confirmado a senha, só se o header `X-Device-Trust` veio preenchido. Faz hash do token, busca `TrustedDevice` por hash + `user_id` do e-mail informado + `revoked_at IS NULL` + `expires_at >= now()`. Se bater: renova `expires_at = now() + 7 dias`, `last_used_at = now()`, retorna `{"trusted": true}`. Senão: `{"trusted": false}` (nunca erro — token de dispositivo inválido/expirado é só "não confie", não uma falha).

#### `POST /internal/trust-device` (novo, interno)
**Serviço:** company · **Auth:** `X-Internal-Secret`

Request: `{ "user_id": 42, "device_label": "Mozilla/5.0 ..." }`
Chamado pelo auth-service em `/auth/login/mfa-verify` quando `trust_device: true` no body. Gera token opaco (`secrets.token_urlsafe(32)`, mesmo padrão de `_issue_invite`), persiste só o hash com `expires_at = now() + 7 dias`, retorna `{"device_token": "..."}` (texto puro, uma vez, pro auth-service repassar ao frontend).

#### `GET /users/me/trusted-devices` (novo)
**Serviço:** company · **Auth:** JWT normal

Lista os dispositivos do usuário logado (`id`, `device_label`, `created_at`, `last_used_at`, `expires_at`) — não expõe hash nem token.

#### `DELETE /users/me/trusted-devices/{id}` (novo)
**Serviço:** company · **Auth:** JWT normal

Marca `revoked_at = now()` (soft delete, mesmo padrão de `active=False` em usuário) se o `id` pertencer ao usuário logado — 404 senão (isolamento).

#### `_clear_mfa` (alterado, `services/company/main.py`)
Passa a apagar também `TrustedDevice` do usuário (soft-revoke em massa) — reaproveitado tanto pelo self-service `disable` quanto pelo override administrativo `reset`, sem endpoint novo.

#### `POST /auth/login` (alterado de novo)
Novo header opcional `X-Device-Trust`. Fluxo:
```python
if x_device_trust:
    r = await verify_trusted_device(email, x_device_trust)  # chamada interna
    if r["trusted"]:
        return await _issue_login_tokens(...)  # pula 2FA inteiro, igual mfa_status="none"
# resto do fluxo igual hoje (mfa_status do verify-credentials manda)
```

#### `POST /auth/login/mfa-verify` (alterado)
Body ganha `trust_device: bool = False`. Em caso de sucesso, se `trust_device`, chama `/internal/trust-device` e inclui `device_token` na resposta (`TokenOut` ganha campo opcional `device_token: Optional[str]`).

### Impacto em outros serviços
Nenhum — mesmo isolamento do ORD-088 (`catalog`/`order`/`payment` inteiramente alheios).

### Eventos de fila
Não aplicável.

### Estimativa
- Backend: 8 pontos (1 migration, 4 endpoints novos + 2 alterados em 2 serviços, reuso pesado de padrões já existentes do ORD-088)
- Frontend: 5 pontos (checkbox no login, nova subseção em Configurações, gestão da chave de `localStorage` fora do ciclo de logout)

### Riscos
- **Risco médio — chave de `localStorage` sobrevivendo a `logout()`:** precisa de atenção pra não vazar pro fluxo normal de limpeza de sessão (fácil de introduzir um bug onde um "limpar tudo" genérico apaga sem querer). Cobrir com teste de frontend específico.
- **Risco baixo-médio — decisão de não usar cookie:** ver seção de arquitetura acima; aceito conscientemente, é a maior divergência do padrão de mercado nesta história, mas já confirmada com o usuário.
- **Risco baixo — dispositivo confiável e política `required` interagindo:** documentado explicitamente no QA Explorer pra não virar uma "porta dos fundos" não intencional que ninguém lembra de testar.
- **Risco baixo — `device_label` é só o `User-Agent` bruto:** legível o suficiente pra reconhecer ("Chrome no Windows" etc.) sem precisar de uma lib de parsing — se ficar confuso na prática, é ajuste de UI, não de arquitetura.

---

## Ready

**Explorer:** [x] fluxo, personas, critérios de aceite e fora-de-escopo (interação com política `required`) definidos · **QA Explorer:** [x] 12 cenários Gherkin cobrindo confiar/renovar/expirar/revogar, isolamento, interação com desativação de 2FA e com política obrigatória · **Tech Explorer:** [x] endpoints, migration, decisão de arquitetura (localStorage vs cookie) e default da checkbox, riscos e estimativa documentados · **Aprovação final:** [x] aprovado no chat pelo usuário (2026-08-17) — localStorage+header (não cookie) e checkbox marcada por padrão

**Status: Ready** — pode começar a implementação.

---

## Downstream

- **Branch:** `feature/ord-088-duplo-fator-autenticacao-totp` (mesma branch/PR do ORD-088, por decisão explícita do usuário — mesmo tema, ORD-092 é uma extensão direta do ORD-088).
- **Migration:** `20260817_1400_trusted_devices.py` — tabela `trusted_devices` (mesmo desenho de `user_backup_codes`, só hash persistido; `expires_at` renovado a cada uso — janela deslizante de 7 dias).
- **`services/company/main.py`:** `TrustedDevice` model; `_clear_mfa` estendido pra revogar (soft) todos os dispositivos junto com o TOTP; endpoints novos `POST /internal/trust-device`, `POST /internal/verify-trusted-device` (internos), `GET/DELETE /users/me/trusted-devices` (self-service).
- **`services/auth/main.py`:** `TokenOut` ganhou `device_token` opcional; `/auth/login` lê o header `X-Device-Trust` e pula o desafio de 2FA quando o dispositivo é reconhecido; `/auth/login/mfa-verify` ganhou `trust_device: bool` no body, emite um novo `device_token` quando marcado.
- **Frontend:** `deviceTrust.ts` (novo) — chave de `localStorage` deliberadamente fora do estado do Zustand, nunca tocada por `logout()`; `LoginScreen.tsx` (checkbox "Confiar neste navegador por 7 dias", marcada por padrão, envia/recebe o token); `SettingsScreen.tsx` (subseção "Dispositivos confiáveis" em "Minha segurança" — lista, revogação individual, "Esquecer este dispositivo" local); `types.ts` (`TrustedDevice`).
- **Testes:** `test_ord092_dispositivo_confiavel.py` novo em `company` (11 testes) e `auth` (5 testes) — cobrem os 12 cenários Gherkin.
- **Achado durante a regressão — colisão de hash de refresh token entre arquivos de teste:** dois testes (um do ORD-088, um do ORD-092) mockavam o mesmo `user_id=1`/`sub="42"`/`sub="43"` pro `verify-credentials`/`mfa_token`. Como o JWT de refresh é determinístico (mesmo `sub`/`company`/`role`/segundo de expiração), rodando dentro do mesmo segundo os dois geravam o **mesmo hash**, violando a `UNIQUE` constraint de `RefreshToken.token_hash` — falha intermitente, não bug de produto. Corrigido dando IDs próprios (5001-5003, 5010-5011) aos mocks do ORD-092; confirmado estável em 3 execuções seguidas depois do fix.
- **Suítes completas:** `company` 254 passed (só as 4 falhas pré-existentes, já documentadas no ORD-088/ORD-084). `auth` 29 passed, estável.
- `tsc --noEmit` e `vitest run` (48 passed) limpos.
- **Verificado ao vivo no Chrome** (owner `carlos@burgerhouse.com`, Burger House, política `required`): checkbox "Confiar neste navegador" aparece marcada por padrão; login com código salva o `device_token`; logout + login seguinte no mesmo navegador pula o desafio de 2FA direto pro dashboard; "Minha segurança" mostra o dispositivo com rótulo (User-Agent), validade renovada e último uso; "Remover" revoga imediatamente — próximo login volta a pedir código; "Esquecer este dispositivo" limpa o token local corretamente. Sem erros no console. Dado de teste limpo ao final.
- PR ainda não aberta pra esse commit específico (vai entrar na PR #61 já aberta do ORD-088, mesma branch).
