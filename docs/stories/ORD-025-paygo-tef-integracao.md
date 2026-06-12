---
id: ORD-025
status: Ready
fase: 1
sprint: 3
responsavel: Backend SR
---

# ORD-025 — Abstração de provider de pagamento + integração PayGo ControlPay Webservice

## Explorer

**Como** operador de totem ou caixa do Ordin,  
**quero** que meu pagamento TEF ou PIX seja processado em tempo real no terminal físico da minha empresa,  
**para** concluir a venda sem depender de aprovação manual ou simulação — com rastreabilidade completa da transação para fins de auditoria e suporte.

**Como** super admin do Ordin (SaaS),  
**quero** configurar as credenciais TEF da empresa em sandbox ou produção de forma independente por terminal,  
**para** que cada tenant use seu próprio contrato com a integradora sem interferir nos demais.

### Dependências
- ORD-015 (IMessageBroker) — o broker publica eventos de pagamento após aprovação
- ORD-024 (CRUD empresa/terminal) — `paygo_terminal_id` e `environment` são configurados via esses endpoints
- Conta sandbox PayGo ControlPay — necessária para testes com `payment_provider=paygo` (lead time externo; MockProvider cobre o desenvolvimento)

---

## Descrição

O `payment-service` usa `random.random() < 0.95` para simular pagamentos. Esta story substitui essa
simulação por uma camada de abstração (`IPaymentProvider`) que permite que cada empresa (tenant)
configure seu próprio provider TEF/PIX — com credenciais e ambiente (sandbox/produção) independentes
por empresa e por terminal — sem alterar o código da plataforma.

No Sprint 3, dois providers são implementados:
- **MockProvider** — comportamento atual (95% aprovação simulada), para desenvolvimento e CI
- **PayGoProvider** — integração real com o **ControlPay Webservice** da PayGo (TEF crédito,
  débito, voucher e PIX)

Toda transação gera um documento de auditoria no MongoDB com payloads, polling e resposta raw.

---

## Contexto de negócio

O Ordin é um SaaS multi-tenant. Cada empresa terá seu próprio contrato com uma integradora TEF.
A configuração de credenciais e ambiente é **por empresa + por provider + por ambiente** —
o mesmo provider pode ter credenciais de sandbox e produção diferentes, e cada terminal escolhe
qual ambiente usar.

Roadmap de providers:

| Fase | Provider | Tipo | Motivo |
|---|---|---|---|
| **Sprint 3 (agora)** | **Mock** | Simulação | Dev, CI, ambientes sem terminal |
| **Sprint 3 (agora)** | **PayGo ControlPay** | TEF presencial (PIN-pad) | Hardware já contratado para o piloto |
| **Fase 2** | **Mercado Pago Point** | Maquininha própria | API própria, sandbox self-service, amplo no BR |
| **Fase 2** | **Stone / Pagar.me** | Maquininha própria + gateway | Split nativo, Connect 2.0 |
| **Fase 2** | **Adyen for Platforms** | Multi-adquirente, omnichannel | Escala internacional |

> Providers de maquininha própria (MP Point, Stone, PagSeguro) são adicionados na Fase 2 —
> cada um implementa `IPaymentProvider` sem alterar o restante da plataforma.

A interface `IPaymentProvider` garante que adicionar um novo provider é criar uma nova classe —
sem tocar no `main.py`, no fluxo de auditoria ou no modelo de configuração.

---

## PayGo ControlPay — Visão geral da integração

### Ambientes

| Ambiente | URL base |
|---|---|
| Sandbox | `https://sandbox.controlpay.com.br/webapi/` |
| Produção | `https://pos-transac.pgweb.io:31735/webapi/` |

### Autenticação

Toda requisição leva `?key={{KEY}}` como query string. Headers obrigatórios:
```
Content-Type: application/json
User-Agent: Ordin/1.0
```

### Credenciais necessárias por empresa (PayGo)

| Campo | Onde fica no Ordin | Descrição |
|---|---|---|
| `api_key` | `company_payment_configs.api_key` | Chave de integração ControlPay |
| `api_secret` | `company_payment_configs.api_secret` | Senha técnica do estabelecimento |
| `pessoa_id` | `company_payment_configs.extra_config.pessoa_id` | ID da conta no ControlPay (para consultas) |

A `base_url` **não é configurável por empresa** — é fixa por ambiente e definida no código:
- `sandbox` → `https://sandbox.controlpay.com.br/webapi/`
- `production` → `https://pos-transac.pgweb.io:31735/webapi/`

### Identificação do terminal

| Campo | Tipo | Uso |
|---|---|---|
| `terminalId` | string | ID lógico no ControlPay — usado em toda transação |
| `terminalFisicoId` | integer | ID do hardware PIN-pad — fora do escopo desta story |

O `terminalId` é obtido no portal ControlPay e cadastrado manualmente em `terminals.paygo_terminal_id`.

### Formas de pagamento (formaPagamentoId)

| ID | Modalidade Ordin |
|---|---|
| 21 | `credit` |
| 22 | `debit` |
| 23 | `voucher` |
| 25 | `pix` |

### Status da intenção de venda

| ID PayGo | Nome PayGo | Status Ordin | Ação |
|---|---|---|---|
| 5 | Pendente | `processing` | Continuar polling |
| 6 | EmPagamento | `processing` | Continuar polling |
| 10 | Creditado | `approved` | ✅ Notificar order-service |
| 15 | Expirado | `expired` | ❌ Terminal não respondeu |
| 18 | CancelamentoIniciado | `processing` | Continuar polling |
| 20 | Cancelado | `cancelled` | ❌ |
| 25 | PagamentoRecusado | `refused` | ❌ Recusado pela adquirente |

---

## Fluxo de pagamento TEF/PIX

### Modo ativo (Ordin usa este)

`iniciarTransacaoAutomaticamente: true` — PayGo empurra a transação ao terminal imediatamente.
O Ordin faz polling por até **90 segundos** com intervalo de **2 segundos**.

```
Totem
  │  POST /payments {order_ref, method, amount}
  ▼
payment-service
  │  GET /internal/terminals/{terminal_id}       → company-service
  │  ← {paygo_terminal_id, payment_provider, environment, config: {api_key, api_secret, extra_config}}
  │
  │  MySQL: INSERT transaction (status=pending, provider, environment)
  │
  │  [factory instancia PayGoProvider com config da empresa]
  │
  │  POST /Venda/Vender/?key={api_key}           → PayGo ControlPay ({environment}.base_url)
  │  body: {formaPagamentoId, terminalId, valorTotalVendido, iniciarTransacaoAutomaticamente: true}
  │  ← {intencaoVenda: {id: 23454, intencaoVendaStatus: {id: 6}}}
  │
  │  [polling a cada 2s até status final ou 90s]
  │  POST /IntencaoVenda/GetById?key={api_key}&intencaoVendaId=23454
  │  ← status 10 → {pagamentosExternos: [{autorizacao, nsu, adquirente}]}
  │
  │  MySQL: UPDATE transaction (status, nsu, authorization, provider_transaction_id)
  │  MongoDB: INSERT payment_events (audit trail)
  │
  │  PATCH /internal/orders/{ref}/status {status:"paid"}  → order-service
  │
  └─► 201 {ok: true, transaction_id, status, nsu, authorization, amount}
```

### Contratos PayGo

**Request de venda:**
```json
POST /Venda/Vender/?key={{api_key}}
{
  "formaPagamentoId": 21,
  "terminalId": "81",
  "referencia": "ORD-ABC123",
  "iniciarTransacaoAutomaticamente": true,
  "quantidadeParcelas": 1,
  "valorTotalVendido": "26,00"
}
```
⚠️ `valorTotalVendido` usa **vírgula** como separador decimal.

**Resposta inicial (EmPagamento):**
```json
{
  "intencaoVenda": {
    "id": 23454,
    "token": "585156",
    "valorFinal": 26.00,
    "intencaoVendaStatus": { "id": 6, "nome": "Em Pagamento" }
  }
}
```

**Resposta de polling aprovado:**
```json
{
  "intencaoVenda": {
    "id": 23454,
    "intencaoVendaStatus": { "id": 10, "nome": "Creditado" },
    "pagamentosExternos": [{
      "autorizacao": "019501",
      "nsu": "000123",
      "adquirente": "VISANET",
      "codigoRespostaAdquirente": "0"
    }]
  }
}
```

**Request de cancelamento:**
```json
POST /Venda/CancelarVenda?key={{api_key}}
{
  "intencaoVendaId": "23454",
  "terminalId": "81",
  "iniciarTransacaoAutomaticamente": true,
  "senhaTecnica": "{{api_secret}}"
}
```
Restrições: **mesmo dia** + **mesmo terminal**. Fora disso → 422 no Ordin antes de chamar PayGo.

---

## Mudanças no company-service

### Nova tabela: `company_payment_configs`

```python
class CompanyPaymentConfig(Base):
    __tablename__ = "company_payment_configs"
    id          = Column(Integer, primary_key=True)
    company_id  = Column(Integer, nullable=False, index=True)
    provider    = Column(String(20), nullable=False)   # "paygo" | "pagarme" | "adyen"
    environment = Column(String(10), nullable=False)   # "sandbox" | "production"
    api_key     = Column(String(255), nullable=True)   # credencial principal
    api_secret  = Column(String(255), nullable=True)   # credencial secundária / senha técnica
    extra_config= Column(JSON, nullable=True)          # campos específicos do provider
    active      = Column(Boolean, default=True)
    created_at  = Column(DateTime, default=datetime.utcnow)
    # UNIQUE KEY (company_id, provider, environment)
```

Para PayGo, `extra_config` contém apenas campos opcionais específicos do provider:
```json
{ "pessoa_id": "11559" }
```

A `base_url` é derivada do campo `environment` no código — nunca armazenada por empresa.

### Segurança de credenciais — Abordagem híbrida (piloto → produção)

`api_key` e `api_secret` **nunca são armazenados em plaintext** no MySQL. A estratégia é híbrida:
o piloto usa criptografia AES-256-GCM na aplicação; a Fase 2 migra para AWS Secrets Manager
**sem alterar o modelo de dados** — apenas o conteúdo dos campos muda.

#### Prefixos de detecção (convention over configuration)

O company-service detecta o formato pelo prefixo do valor armazenado:

| Prefixo | Formato | Quando usar |
|---|---|---|
| *(sem prefixo)* | Plaintext | Ambiente local de desenvolvimento apenas |
| `enc:` | AES-256-GCM + Base64 | **Sprint 3 — piloto** |
| `arn:aws:secretsmanager:` | ARN do Secrets Manager | **Fase 2 — produção AWS** |

#### Sprint 3 — Criptografia AES-256-GCM

- Algoritmo: **AES-256-GCM** (autenticado — garante integridade além da confidencialidade)
- Biblioteca: `cryptography` (`cryptography.hazmat.primitives.ciphers.aead.AESGCM`)
- Chave mestra: `CREDENTIAL_ENCRYPTION_KEY` (32 bytes em hex) — variável de ambiente do company-service
- IV/Nonce: 12 bytes gerados aleatoriamente por operação, prefixados ao ciphertext
- Formato armazenado: `enc:<base64(nonce + ciphertext + tag)>`

```python
# Pseudocódigo das helpers em company-service
def encrypt_credential(plaintext: str, key: bytes) -> str:
    nonce = os.urandom(12)
    aesgcm = AESGCM(key)
    ct = aesgcm.encrypt(nonce, plaintext.encode(), None)
    return "enc:" + base64.b64encode(nonce + ct).decode()

def decrypt_credential(stored: str, key: bytes) -> str:
    if stored.startswith("arn:aws:secretsmanager:"):
        return _fetch_from_secrets_manager(stored)   # Fase 2
    if stored.startswith("enc:"):
        raw = base64.b64decode(stored[4:])
        nonce, ct = raw[:12], raw[12:]
        return AESGCM(key).decrypt(nonce, ct, None).decode()
    return stored  # plaintext — apenas dev local
```

- `encrypt_credential` é chamado no `POST/PUT /companies/{id}/payment-configs` antes de salvar
- `decrypt_credential` é chamado no `GET /internal/terminals/{terminal_id}` antes de retornar ao payment-service
- O payment-service **sempre recebe credenciais em plaintext** — a criptografia é transparente para ele

#### Fase 2 — Migração para AWS Secrets Manager

A migração não exige mudança de schema. O script de migração:
1. Para cada linha em `company_payment_configs` com prefixo `enc:`
2. Cria um secret no Secrets Manager: `ordin/{env}/company/{id}/{provider}`
3. Substitui o valor criptografado pelo ARN: `arn:aws:secretsmanager:sa-east-1:...`
4. `decrypt_credential` detecta o prefixo `arn:aws:` e faz `GetSecretValue` via SDK

Vantagens do Secrets Manager na Fase 2:
- Auditoria de acesso via CloudTrail (quem acessou qual chave e quando)
- Rotação automática de credenciais sem downtime
- Isolamento total: vazar o banco não expõe as chaves

### Model Terminal — novo campo

```python
environment = Column(String(10), default="sandbox")  # "sandbox" | "production"
```

Cada terminal aponta para o ambiente que a empresa configurou para aquele provider.

### Migration Alembic
`20260611_1000_payment_config.py`:
- `CREATE TABLE company_payment_configs (...)`
- `ALTER TABLE terminals ADD COLUMN paygo_terminal_id VARCHAR(40) NULL`
- `ALTER TABLE terminals ADD COLUMN environment VARCHAR(10) DEFAULT 'sandbox'`
- `ALTER TABLE companies ADD COLUMN payment_provider VARCHAR(20) DEFAULT 'mock'`

### Schemas e endpoints

**CRUD de configurações de pagamento (owner/superadmin):**
```
GET    /companies/{id}/payment-configs
POST   /companies/{id}/payment-configs
PUT    /companies/{id}/payment-configs/{config_id}
DELETE /companies/{id}/payment-configs/{config_id}
```

`PaymentConfigIn`:
```python
class PaymentConfigIn(BaseModel):
    provider:    str                    # "paygo" | "pagarme" | "adyen"
    environment: str                    # "sandbox" | "production"
    api_key:     Optional[str]
    api_secret:  Optional[str]
    extra_config: Optional[dict]
```

**TerminalUpdate** — aceitar `paygo_terminal_id` e `environment`

**Endpoint interno atualizado:**
```
GET /internal/terminals/{terminal_id}
Header: X-Internal-Secret

Response 200:
{
  "paygo_terminal_id": "81",
  "payment_provider": "paygo",
  "environment": "sandbox",
  "config": {
    "api_key": "abc123",
    "api_secret": "senha456",
    "extra_config": { "pessoa_id": "11559" }
  }
}

Response 400: provider configurado mas sem config ativa para o environment do terminal
Response 404: terminal não encontrado ou inativo
```

---

## Mudanças no payment-service

### Estrutura de diretórios

```
services/payment/
  domain/
    __init__.py
    interfaces/
      __init__.py
      payment_provider.py     # IPaymentProvider ABC
    schemas.py                # PaymentMethod, TransactionStatus, TransactionResult, ProviderConfig
  infrastructure/
    __init__.py
    providers/
      __init__.py
      mock.py                 # MockProvider
      paygo.py                # PayGoProvider
    factory.py                # get_provider(name, config) → IPaymentProvider
    mongo.py                  # motor client + save_audit()
  main.py
  config.py
  auth.py
```

### ProviderConfig — dataclass com credenciais vindas do banco

```python
@dataclass
class ProviderConfig:
    provider:     str
    environment:  str
    api_key:      Optional[str]
    api_secret:   Optional[str]
    extra_config: dict = field(default_factory=dict)

# URLs fixas por ambiente — não configuráveis por empresa
PROVIDER_BASE_URLS = {
    "paygo": {
        "sandbox":    "https://sandbox.controlpay.com.br/webapi/",
        "production": "https://pos-transac.pgweb.io:31735/webapi/",
    },
    # futuros providers adicionam sua própria entrada aqui
}
```

### IPaymentProvider — contrato

```python
class IPaymentProvider(ABC):
    async def create_transaction(
        self, amount: Decimal, method: PaymentMethod,
        terminal_ref: str, order_ref: str,
    ) -> TransactionResult: ...

    async def get_status(self, provider_transaction_id: str) -> TransactionResult: ...

    async def cancel_transaction(
        self, provider_transaction_id: str, terminal_ref: str,
    ) -> bool: ...
```

### Factory

```python
def get_provider(config: ProviderConfig) -> IPaymentProvider:
    match config.provider:
        case "mock":  return MockProvider()
        case "paygo": return PayGoProvider(config)
        case _:       raise ValueError(f"Provider '{config.provider}' não implementado")
```

### Mudanças no modelo Transaction (MySQL)

Migration `20260611_1001_transaction_provider_fields.py`:
- `ADD COLUMN provider VARCHAR(20) DEFAULT 'mock'`
- `ADD COLUMN provider_transaction_id VARCHAR(80) NULL`
- `ADD COLUMN paygo_terminal_id VARCHAR(40) NULL`
- `ADD COLUMN environment VARCHAR(10) NULL`
- `MODIFY COLUMN tef_number VARCHAR(40) NULL` (era NOT NULL — campo legado)

### PaymentIn — schema atualizado

Remove `tef_number` (obtido via company-service pelo `terminal_id` do JWT).
```python
class PaymentIn(BaseModel):
    order_ref: str
    method:    str    # "credit" | "debit" | "pix" | "voucher"
    amount:    float
    items:     List[ItemIn]
    cpf:       Optional[str] = None
```

---

## MongoDB — Auditoria

Driver: `motor`. Banco: `ordin_audit`. Coleção: `payment_events`.

Índices: `company_id`, `order_ref`, `provider_transaction_id`, `created_at`.

```json
{
  "transaction_id": 42,
  "company_id": 1,
  "order_ref": "ORD-ABC123",
  "provider": "paygo",
  "environment": "sandbox",
  "provider_transaction_id": "23454",
  "method": "credit",
  "amount": "26.00",
  "paygo_terminal_id": "81",
  "events": [
    { "event": "create_request", "ts": "...", "payload": {}, "http_status": 200, "response": "..." },
    { "event": "poll", "ts": "...", "elapsed": 2.0, "http_status": 200, "response": "..." },
    { "event": "approved", "ts": "...", "nsu": "000123", "authorization": "019501", "adquirente": "VISANET" }
  ],
  "final_status": "approved",
  "created_at": "2026-06-11T14:00:00"
}
```

Falha no MongoDB **não derruba o pagamento** — save_audit é best-effort (try/except silencioso).

---

## docker-compose.yml — adições

```yaml
mongo:
  image: mongo:7
  environment:
    MONGO_INITDB_ROOT_USERNAME: ordin
    MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD}
  volumes:
    - mongo_data:/data/db
  networks:
    - ordin_net
```

---

## Variáveis de ambiente novas

```
# company-service
CREDENTIAL_ENCRYPTION_KEY=<hex 64 chars — 32 bytes>   # gerado com: openssl rand -hex 32

# payment-service
MONGO_URL=mongodb://ordin:PASSWORD@mongo:27017/
MONGO_DB=ordin_audit
COMPANY_SERVICE_URL=http://company-service:8002        # já existe no .env

# docker-compose / infra
MONGO_PASSWORD=<senha do MongoDB>
```

> Não há `PAYGO_KEY`, `PAYGO_BASE_URL` ou `PAYGO_SENHA_TECNICA` globais.
> Todas as credenciais vêm do banco por empresa, descriptografadas em runtime pelo company-service.
> O `MockProvider` é o default quando `payment_provider="mock"` — sem chamadas externas e sem
> necessidade de `CREDENTIAL_ENCRYPTION_KEY` (mock ignora credenciais).
>
> **Fase 2:** `CREDENTIAL_ENCRYPTION_KEY` pode ser removida quando todas as linhas migrarem
> para ARN do Secrets Manager. O acesso ao Secrets Manager é via IAM Role da task ECS —
> sem chaves de longa duração.

---

## QA Explorer

### Cenário 1 — Pagamento aprovado com MockProvider (happy path)
```gherkin
Dado que a empresa tem payment_provider="mock"
E o terminal tem paygo_terminal_id preenchido e environment="sandbox"
Quando o totem envia POST /payments com method="credit", amount=26.00 e order_ref válido
Então o payment-service retorna 201 com ok=true, nsu e authorization preenchidos
E a transaction é salva no MySQL com status="approved" e provider="mock"
E um documento é salvo no MongoDB com final_status="approved"
E o order-service recebe PATCH /internal/orders/{ref}/status com status="paid"
```

### Cenário 2 — Pagamento recusado com MockProvider
```gherkin
Dado que a empresa tem payment_provider="mock"
Quando o totem envia POST /payments (simulação de recusa — 5% dos casos)
Então o payment-service retorna 201 com ok=false e status="refused"
E a transaction é salva no MySQL com status="refused"
E um documento é salvo no MongoDB com final_status="refused"
E o order-service NÃO recebe chamada de status
```

### Cenário 3 — Pagamento aprovado com PayGoProvider (sandbox)
```gherkin
Dado que a empresa tem payment_provider="paygo"
E existe uma company_payment_config ativa com provider="paygo" e environment="sandbox"
E o terminal tem paygo_terminal_id="81" e environment="sandbox"
Quando o totem envia POST /payments com method="credit" e amount=1.00
Então o payment-service chama POST /Venda/Vender no ControlPay sandbox com terminalId="81"
E aguarda polling até status 10 (Creditado) ou timeout de 90s
E retorna 201 com ok=true, nsu e authorization da adquirente
E salva o audit trail completo no MongoDB incluindo todos os eventos de polling
```

### Cenário 4 — Timeout de polling (terminal não responde)
```gherkin
Dado que a empresa tem payment_provider="paygo" com config válida
E o terminal físico não responde dentro de 90 segundos
Quando o payment-service atinge o timeout de polling
Então retorna 201 com ok=false e status="expired"
E a transaction é salva no MySQL com status="expired"
E o MongoDB registra todos os eventos de polling com elapsed crescente
E o order-service NÃO recebe chamada de status
```

### Cenário 5 — Terminal sem paygo_terminal_id configurado
```gherkin
Dado que a empresa tem payment_provider="paygo"
E o terminal tem paygo_terminal_id=null
Quando o totem envia POST /payments
Então o payment-service retorna 400 com mensagem "Terminal sem paygo_terminal_id configurado"
E nenhuma chamada é feita ao ControlPay
```

### Cenário 6 — Empresa sem config de pagamento para o environment do terminal
```gherkin
Dado que a empresa tem payment_provider="paygo"
E o terminal tem environment="production"
E não existe company_payment_config ativa com provider="paygo" e environment="production"
Quando o totem envia POST /payments
Então o payment-service retorna 400 com mensagem "Configuração de pagamento não encontrada"
E nenhuma chamada é feita ao ControlPay
```

### Cenário 7 — Credenciais armazenadas criptografadas
```gherkin
Dado que o admin cadastra uma config PayGo com api_key="chave-real" e api_secret="senha-real"
Quando o valor é salvo no banco de dados
Então o campo api_key no MySQL contém o prefixo "enc:" seguido de base64
E o campo api_secret no MySQL contém o prefixo "enc:" seguido de base64
E o GET /companies/{id}/payment-configs retorna api_key="***" e api_secret="***"
```

### Cenário 8 — Terminal sandbox usa credenciais sandbox da empresa
```gherkin
Dado que a empresa tem config PayGo para environment="sandbox" com api_key="key-sandbox"
E config PayGo para environment="production" com api_key="key-prod"
E o terminal tem environment="sandbox"
Quando o payment-service processa um pagamento nesse terminal
Então a chamada ao ControlPay usa a api_key descriptografada da config de sandbox
E a URL base usada é https://sandbox.controlpay.com.br/webapi/
```

### Cenário 9 — Cancelamento no mesmo dia com PayGoProvider
```gherkin
Dado que existe uma transaction aprovada com provider="paygo" criada hoje
E a transaction tem provider_transaction_id e paygo_terminal_id preenchidos
Quando o admin envia POST /payments/{tx_id}/cancel
Então o payment-service chama POST /Venda/CancelarVenda no ControlPay
E retorna ok=true com status="cancelled"
E o order-service recebe PATCH /internal/orders/{ref}/status com status="cancelled"
```

### Cenário 10 — Cancelamento fora do mesmo dia é bloqueado
```gherkin
Dado que existe uma transaction aprovada com provider="paygo" criada em dia anterior
Quando o admin envia POST /payments/{tx_id}/cancel
Então o payment-service retorna 422 com mensagem "Cancelamento PayGo permitido apenas no mesmo dia"
E nenhuma chamada é feita ao ControlPay
```

### Cenário 11 — Falha no MongoDB não derruba o pagamento
```gherkin
Dado que o MongoDB está indisponível
Quando um pagamento é processado e aprovado
Então o payment-service retorna 201 com ok=true normalmente
E o erro de auditoria é logado com nível WARNING
E a transaction é salva corretamente no MySQL
```

### Cenário 12 — Isolamento multi-tenant
```gherkin
Dado que o totem da empresa A está autenticado
Quando o payment-service busca a config de pagamento
Então apenas configs com company_id da empresa A são retornadas
E configs da empresa B nunca são acessadas
```

---

## Critérios de aceite

**Funcional**
- [ ] `payment_provider=mock`: nenhuma chamada HTTP externa é feita
- [ ] `payment_provider=paygo` sem config ativa para o environment do terminal → 400 antes de chamar PayGo
- [ ] `payment_provider=paygo` com `paygo_terminal_id` nulo → 400
- [ ] Empresa A não acessa configs de pagamento da empresa B
- [ ] Empresa pode ter config PayGo sandbox E produção simultaneamente (UNIQUE por provider+environment)
- [ ] Terminal com `environment=production` usa credenciais de produção da empresa
- [ ] Terminal com `environment=sandbox` usa credenciais de sandbox da empresa
- [ ] Polling encerra ao atingir status final (10, 15, 20, 25) ou timeout 90s
- [ ] Timeout retorna `status=expired` sem travar o worker
- [ ] Cancelamento fora do mesmo dia → 422 sem chamar PayGo
- [ ] Todo pagamento gera documento no MongoDB (aprovado, recusado, expirado, cancelado)
- [ ] Falha no MongoDB não derruba o pagamento

**Segurança de credenciais**
- [ ] `api_key` e `api_secret` são salvos com prefixo `enc:` (AES-256-GCM) — nunca em plaintext em produção
- [ ] Valor criptografado no banco é ilegível sem `CREDENTIAL_ENCRYPTION_KEY`
- [ ] `decrypt_credential` reconhece os três formatos: plaintext (dev), `enc:` (piloto), `arn:aws:` (Fase 2)
- [ ] `api_key` e `api_secret` não aparecem em nenhum response de API pública (GET payment-configs retorna `"***"`)
- [ ] PUT em payment-config re-criptografa com o valor novo — o valor antigo não é retornado

## Stakeholder
Operadores de caixa e totem. Pré-requisito para o piloto presencial com terminal físico real.
