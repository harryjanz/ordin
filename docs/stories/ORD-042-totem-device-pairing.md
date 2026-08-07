# ORD-042 — Autenticação do totem por pareamento de dispositivo (código + QR)

**Status:** Done
**Tipo:** Feature — Segurança / Autenticação / Full-stack
**Fase:** 1
**Sprint:** device-pairing
**Estimativa:** 5 pontos
**Prioridade:** P1
**Dependências:** ORD-036 (setup flow existente), ORD-041 (tema por empresa)

---

## Explorer

**Como** operador de loja,
**quero** autenticar o totem usando um código de pareamento gerado no admin (digitado ou escaneado via QR),
**para** eliminar a dependência de PIN memorizado, ter rastreabilidade por dispositivo e poder revogar totems individuais sem trocar o PIN da empresa.

### Contexto

O fluxo atual exige que o operador memorize ou consulte o PIN de 4 dígitos da empresa para configurar o totem. O PIN é compartilhado por todos os terminais da empresa — revogar um totem comprometido exige trocar o PIN para todos. O modelo de device pairing resolve isso: cada totem recebe um token individual, revogável de forma independente.

O fluxo de referência é o da Netflix/Spotify em smart TVs:
1. Totem exibe um código curto (6 letras) + QR code que encode a URL de aprovação
2. Operador abre o admin, digita o código **ou** escaneia o QR com o celular
3. Admin confirma → totem recebe JWT vinculado ao terminal selecionado
4. Totem entra na tela de boas-vindas com o tema da empresa

### Fluxo detalhado

```
Totem                          Backend                        Admin
  │                               │                              │
  ├─ POST /auth/device/challenge ─▶│                              │
  │◀─ { code: "ABC123", ttl: 300 }─┤                              │
  │                               │                              │
  │  exibe código + QR            │                              │
  │  polling GET /auth/device/    │                              │
  │  status?code=ABC123 (5s)      │                              │
  │                               │                              │
  │                               │◀─ POST /companies/1/devices ─┤
  │                               │      /approve { code, term } │
  │                               ├─ emite JWT kiosk ───────────▶│
  │                               │                              │
  │◀─ { status: "approved",       │                              │
  │     token, company, terminal }│                              │
  │                               │                              │
  └─ entra na WelcomeScreen ──────┘                              │
```

### Personas afetadas

- **Operador de loja** — faz o setup do totem no início do dia ou após reset
- **Dono/gerente da empresa** — vê totems pareados, revoga dispositivos comprometidos
- **Dev/QA** — testa via ngrok expondo `:3000` e `:3001` para escanear QR no celular

### Dependências de outros serviços

- `company-service` — novo endpoint `POST /companies/{id}/devices/approve`
- `auth-service` — novo endpoint `POST /auth/device/challenge` + `GET /auth/device/status`
- Redis — armazenar challenge com TTL
- `frontend/totem` — nova tela `DevicePairingScreen`
- `frontend/admin` — novo card "Parear totem" em Config.

---

## QA Explorer

### Cenários Gherkin

#### Happy path — código texto

```gherkin
Scenario: Operador pareia totem digitando o código
  Given o totem está na tela de pareamento exibindo o código "ABC123"
  And o operador está logado no admin da Burger House
  When o operador digita "ABC123" no campo de pareamento e seleciona "Totem 1"
  And confirma o pareamento
  Then o totem recebe um JWT com role "kiosk" vinculado ao terminal 1
  And o totem exibe a WelcomeScreen com o tema da Burger House
  And o código "ABC123" não pode ser reutilizado
```

#### Happy path — QR code

```gherkin
Scenario: Operador pareia totem escaneando o QR
  Given o totem está na tela de pareamento exibindo um QR code
  And o operador acessa o admin pelo celular via ngrok
  When o operador escaneia o QR com a câmera do celular
  And a URL do QR abre o admin na tela de aprovação com o código pré-preenchido
  And o operador seleciona o terminal e confirma
  Then o totem recebe o JWT e entra na WelcomeScreen
```

#### Código expirado

```gherkin
Scenario: Código expirado após TTL
  Given o totem gerou o código "XYZ789" há mais de 5 minutos
  When o operador tenta aprovar "XYZ789" no admin
  Then o admin exibe "Código expirado. Solicite um novo código no totem."
  And o backend retorna 422
```

#### Código inválido

```gherkin
Scenario: Código inexistente
  When o operador digita "000000" no campo de pareamento
  Then o admin exibe "Código inválido."
  And o backend retorna 404
```

#### Código já utilizado

```gherkin
Scenario: Reutilização de código aprovado
  Given o código "ABC123" já foi aprovado e consumido
  When o operador tenta aprovar "ABC123" novamente
  Then o backend retorna 422 com "Código já utilizado"
```

#### Isolamento multi-tenant

```gherkin
Scenario: Operador de empresa A não aprova código de empresa B
  Given o totem da Pasta & Co gerou o código "DEF456"
  And o operador está logado na Burger House
  When tenta aprovar "DEF456" no admin da Burger House
  Then o backend retorna 403
```

#### Polling timeout

```gherkin
Scenario: Totem aguarda além do TTL sem aprovação
  Given o totem está fazendo polling do código "GHI789"
  When o código expira sem aprovação
  Then o totem exibe "Código expirado" com botão "Gerar novo código"
```

#### Fallback para PIN

```gherkin
Scenario: Operador usa PIN como fallback
  Given o totem está na tela de pareamento
  When o operador clica em "Entrar com PIN"
  Then o totem exibe o teclado numérico do fluxo atual (SetupScreen)
```

---

## Tech Explorer

### Backend — auth-service

#### `POST /auth/device/challenge`

Não requer autenticação (chamada pelo totem antes do login).

**Request:** sem body

**Response:**
```json
{
  "code": "ABC123",
  "qr_url": "http://localhost:3001/pair?code=ABC123",
  "expires_in": 300
}
```

**Implementação:**
- Gera código de 6 caracteres alfanuméricos maiúsculos (sem O/0/I/1 para legibilidade)
- Salva no Redis: `device_challenge:{code}` → `{"status": "pending", "created_at": <ts>}` com TTL 300s
- `qr_url` aponta para o admin com o código como query param

#### `GET /auth/device/status?code=ABC123`

Polling pelo totem (a cada 5s). Não requer autenticação.

**Response enquanto pendente:**
```json
{ "status": "pending" }
```

**Response após aprovação:**
```json
{
  "status": "approved",
  "access_token": "<JWT kiosk>",
  "company": { "id": 1, "name": "Burger House", "visual_theme": "mc", "visual_mode": "light" },
  "terminal": { "id": 1, "label": "Totem 1 - Entrada", "tef_number": "TEF-001-A" }
}
```

**Response expirado:**
```json
{ "status": "expired" }
```

### Backend — company-service

#### `POST /companies/{company_id}/devices/approve`

Requer autenticação (owner/manager/admin da empresa).

**Request:**
```json
{
  "code": "ABC123",
  "terminal_id": 1
}
```

**Response:**
```json
{ "ok": true }
```

**Lógica:**
1. Busca `device_challenge:{code}` no Redis — 404 se não existe, 422 se `status != "pending"`
2. Verifica que o `terminal_id` pertence à `company_id` do usuário logado — 403 se não
3. Gera JWT kiosk (mesmo formato do `pin-login`): `role: kiosk`, `company_id`, `terminal_id`, exp 12h
4. Salva no Redis: `device_challenge:{code}` → `{"status": "approved", "token": <JWT>, "company": {...}, "terminal": {...}}` com TTL 60s (totem tem 1 min para buscar)
5. Salva `localStorage.setItem("ordin_terminal_id", terminal_id)` — não, isso é frontend

**Nota de segurança:** o JWT gerado aqui é idêntico ao do `pin-login`. O `company_id` no payload vem do JWT do operador logado, não do body — sem risco de IDOR.

### Frontend — totem (`DevicePairingScreen`)

Nova tela inserida no `SetupScreen` como step `"pairing"` (step inicial, antes do PIN).

**Componentes:**
- Código de 6 letras em fonte monospace grande
- QR code gerado client-side a partir de `qr_url` (lib: `qrcode.react` ou `qrcode` + canvas)
- Contador regressivo (5:00 → 0:00)
- Polling `GET /auth/device/status?code=ABC123` a cada 5s
- Link "Entrar com PIN" para fallback ao fluxo atual
- Ao receber `status: "approved"`: chama `onDone(company, terminal, token)` → WelcomeScreen

**Geração do QR:**
```typescript
// qr_url = "http://<ngrok-ou-localhost>:3001/pair?code=ABC123"
// Totem usa a URL que o backend retorna — já considera o host correto
```

### Frontend — admin (Config. → card "Parear totem")

Novo card em `SettingsScreen` abaixo do card de aparência.

**UI:**
- Campo de texto para código (6 chars, uppercase automático)
- Select de terminal (lista os terminais da empresa)
- Botão "Aprovar pareamento" → `POST /companies/{id}/devices/approve`
- Mensagem de sucesso/erro inline

**Deep link via QR:**
- URL `http://localhost:3001/pair?code=ABC123` → admin detecta query param `?code=` na rota `/pair` e pré-preenche o campo

### Configuração para teste com QR no celular

```bash
# Expor totem e admin via ngrok (duas sessões)
ngrok http 3000   # URL do totem
ngrok http 3001   # URL do admin

# Adicionar URLs ngrok no .env
CORS_ORIGINS=http://localhost:3000,http://localhost:3001,https://<ngrok-totem>.ngrok.io,https://<ngrok-admin>.ngrok.io
```

O backend já lê `CORS_ORIGINS` dinamicamente — só adicionar as URLs e rebuildar nginx (ou reiniciar).

### Estimativa

| Componente | Esforço |
|---|---|
| auth-service: challenge + status | 1 pt |
| company-service: approve | 1 pt |
| totem: DevicePairingScreen + polling + QR | 2 pts |
| admin: card pareamento + deep link | 1 pt |
| **Total** | **5 pts** |

### Riscos técnicos

- **QR no celular exige CORS/ngrok configurado** — mitigado pelo fallback de código texto
- **Polling a cada 5s** — baixo impacto; Redis com TTL garante cleanup automático
- **JWT gerado no company-service** — o segredo `JWT_SECRET` precisa ser acessível lá também (já está via env)

---

## Ready ✅

- [x] User story documentada (Como / Quero / Para)
- [x] Contexto e motivação documentados
- [x] Fluxo completo mapeado (totem ↔ backend ↔ admin)
- [x] Dependências identificadas
- [x] Cenários Gherkin escritos (happy path + 6 bordas)
- [x] Solução técnica definida (endpoints, schemas, Redis, QR)
- [x] Fallback para PIN documentado
- [x] Configuração ngrok para teste de QR documentada
- [x] Estimativa acordada: 5 pontos
- [x] Sem bloqueadores abertos
