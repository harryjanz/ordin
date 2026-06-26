# ORD-045 — Admin: configuração Mercado Pago por empresa

**Status:** Done  
**Pontos:** 3  
**Sprint:** Pagamentos MP

---

## Explorer

Cada empresa (tenant) do ordin pode ter seu próprio contrato com o Mercado Pago. O admin precisa de uma tela para inserir as credenciais MP por empresa — separando ambientes de teste e produção — e configurar o `device_id` do terminal Point para pagamentos com cartão.

A infraestrutura de armazenamento criptografado já existe (AES-256-GCM, prefixo `enc:`, tabela `company_payment_configs`). Esta história apenas adiciona a interface de administração e os campos específicos do MP.

**⚠️ Débito técnico registrado:** credenciais atualmente armazenadas criptografadas no banco. Migração futura para AWS Secrets Manager não altera schema — apenas o conteúdo dos campos (`enc:` → `arn:aws:secretsmanager:`).

### Credenciais Mercado Pago

| Campo | Onde guardar | Descrição |
|---|---|---|
| `access_token` | `company_payment_configs.api_key` (criptografado) | Token principal — diferente para teste (`TEST-...`) e produção (`APP_USR-...`) |
| `public_key` | `company_payment_configs.extra_config.public_key` | Opcional para uso futuro no frontend |
| `mp_device_id` | `terminals.mp_device_id` (novo campo) | ID do terminal Point registrado no painel MP, por terminal |

Um mesmo company pode ter **duas configs MP**: uma `environment=sandbox` e outra `environment=production`. O terminal escolhe qual usar pelo seu campo `environment`.

---

## QA Explorer

### Cenário 1 — Salvar credenciais MP sandbox
```gherkin
Dado que sou admin de uma empresa
Quando acesso a tela de configuração de pagamento e insiro o access_token de teste
E seleciono ambiente "Sandbox"
E clico em Salvar
Então as credenciais são salvas com prefixo "enc:" no banco
E a listagem exibe o access_token mascarado ("TEST-***...***")
```

### Cenário 2 — Salvar credenciais MP produção
```gherkin
Dado que já existe config sandbox salva
Quando adiciono uma segunda config com access_token de produção e ambiente "Produção"
Então ambas as configs coexistem (UNIQUE por company + provider + environment)
E a listagem exibe as duas separadamente
```

### Cenário 3 — Configurar device_id por terminal
```gherkin
Dado que estou editando um terminal no admin
Quando preencho o campo "MP Device ID" com o ID do Point cadastrado no painel MP
E salvo
Então o terminal armazena o mp_device_id
E pagamentos de cartão neste terminal usarão este device_id
```

### Cenário 4 — Superadmin vê configs de qualquer empresa
```gherkin
Dado que sou superadmin
Quando acesso configs de pagamento de qualquer empresa
Então vejo as configs mascaradas
```

### Cenário 5 — Admin não vê configs de outra empresa
```gherkin
Dado que sou admin da empresa A
Quando tento acessar configs de pagamento da empresa B
Então recebo 403
```

---

## Tech Explorer

### Backend — company-service

**Migration:** `20260618_1000_add_mp_device_id_to_terminals.py`
```sql
ALTER TABLE terminals ADD COLUMN mp_device_id VARCHAR(100) NULL;
```

**Novos endpoints (company-service):**
```
GET  /companies/{id}/payment-configs          → lista configs (api_key mascarado)
POST /companies/{id}/payment-configs          → cria config (criptografa api_key)
PUT  /companies/{id}/payment-configs/{cfg_id} → atualiza (re-criptografa)
DEL  /companies/{id}/payment-configs/{cfg_id} → desativa (soft delete: active=False)
```

Esses endpoints já existem do ORD-025 para o PayGo. Verificar se já funcionam para MP (provider="mercadopago") — provavelmente sim, pois o schema é genérico.

**TerminalUpdate** — aceitar `mp_device_id`:
```python
class TerminalUpdate(BaseModel):
    label:         Optional[str]
    tef_number:    Optional[str]
    paygo_terminal_id: Optional[str]   # existente
    mp_device_id:  Optional[str]       # novo
    environment:   Optional[str]
```

**Endpoint interno** — `GET /internal/terminals/{id}` já retorna `payment_provider`, `environment` e `config`. Adicionar `mp_device_id` ao response:
```json
{
  "payment_provider": "mercadopago",
  "environment": "sandbox",
  "mp_device_id": "PAX_A910__SMARTPOS123456",
  "config": {
    "api_key": "<access_token_descriptografado>",
    "extra_config": { "public_key": "TEST-..." }
  }
}
```

### Frontend — admin

**Nova seção na CompanyScreen ou SettingsScreen:** "Pagamento"

```
┌─ Configuração de Pagamento ──────────────────────────────┐
│ Provedor: [Mercado Pago ▾]                               │
│                                                          │
│ ── Sandbox ─────────────────────────────────            │
│ Access Token: [TEST-***...***        ] [✏ Editar]        │
│ Public Key:   [TEST-***...***        ] [✏ Editar] (opc.) │
│                          [+ Adicionar config sandbox]    │
│                                                          │
│ ── Produção ────────────────────────────────            │
│ Access Token: [não configurado       ] [+ Adicionar]     │
│                                                          │
└──────────────────────────────────────────────────────────┘

┌─ Terminais ──────────────────────────────────────────────┐
│ Totem 1 - Entrada  │ Ambiente: Sandbox │ MP Device: [___]│
│ Totem 2 - Caixa    │ Ambiente: Sandbox │ MP Device: [___]│
└──────────────────────────────────────────────────────────┘
```

- Campos de senha com toggle show/hide
- `access_token` nunca retorna em plaintext na API — campo exibe `"***"` com botão Editar que abre modal de input
- `mp_device_id` pode ser preenchido diretamente na listagem de terminais
