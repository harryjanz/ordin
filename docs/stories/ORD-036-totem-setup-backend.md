---
id: ORD-036
status: Done
fase: 1
sprint: setup-revisao
responsavel: Backend SR
estimativa: 3 pontos
prioridade: P0
---

# ORD-036 — Backend: suporte ao novo fluxo de setup do totem

## Explorer

**Como** totem de autoatendimento,  
**quero** descobrir automaticamente quais terminais estão disponíveis após validar o PIN da empresa,  
**para** que a máquina se vincule ao terminal correto sem exigir entrada manual de ID.

### Contexto e motivação

O fluxo atual exige que alguém insira o `terminal_id` manualmente no `DeviceSetupScreen`
antes de qualquer autenticação. Isso é um problema operacional: um número inteiro não tem
significado visual para quem configura o totem, e qualquer erro gera falha silenciosa.

O novo fluxo proposto:
1. Totem digita PIN da empresa → backend valida e retorna lista de terminais ativos e disponíveis
2. Operador seleciona o terminal (identificado pelo label, ex: "Totem 1 - Entrada")
3. PIN + terminal_id são enviados juntos em `pin-login` → kiosk JWT
4. Totem faz transação-teste de R$ 0,01 → aguarda acionamento da máquina → cancela automaticamente

Para isso, o backend precisa de três mudanças:

**A) `internal/validate-pin` retorna terminais disponíveis**  
Hoje retorna apenas `{company: {...}}`. Precisa retornar também a lista de terminais
ativos (`active=True`) e não ocupados.

**B) Conceito de "terminal em uso" via heartbeat**  
Adicionar coluna `last_heartbeat: Optional[datetime]` ao modelo `Terminal`.
Terminal é "disponível" se `last_heartbeat IS NULL` ou `last_heartbeat < now() - 5min`.
Novo endpoint: `POST /companies/{co_id}/terminals/{t_id}/heartbeat` (kiosk JWT).
O totem envia heartbeat a cada 2 min enquanto ativo; ao largar o terminal, o TTL natural de 5 min o libera.

**C) Endpoint de teste de conexão**  
`POST /payments/test-connection` no payment-service.
Cria uma transação de R$ 0,01 para o terminal do JWT, aguarda confirmação de acionamento da máquina,
então cancela imediatamente.
- MockProvider: aprova + cancela instantaneamente → `{success: true}`
- PayGoProvider: aciona TEF físico, aguarda resposta da máquina (poll), cancela → retorna resultado real

### Personas afetadas
- **Técnico de instalação**: configura o totem sem precisar consultar IDs no banco
- **Manager**: vê no admin quais terminais estão ocupados (via last_heartbeat)
- **Operador de balcão**: indiretamente — terminal sem heartbeat é liberado para reutilização

### Dependências
- `services/company/main.py` — modelos `Terminal`, `TerminalOut`, `internal/validate-pin`, `internal/verify-pin`
- `services/payment/main.py` — IPaymentProvider, MockProvider, PayGoProvider, `cancel_payment`
- Alembic migrations em `services/company/` e `services/payment/`

---

## QA Explorer

### Casos felizes
- PIN válido → retorna empresa + lista de terminais ativos disponíveis (com label e tef_number)
- Dois terminais ativos, um com heartbeat < 5min → retorna apenas 1 disponível
- `test-connection` com MockProvider → retorna `{success: true, detail: "Máquina respondeu"}`

### Edge cases e riscos
1. **Terminal com heartbeat expirado mas JWT kiosk ativo**: O JWT expira em 4h; heartbeat expira em 5min. Se o totem travar e o processo morrer, o heartbeat expira em 5min → terminal liberado automaticamente. Correto — não precisa de invalidação de JWT ativa.
2. **`validate-pin` com PIN errado já conta tentativa de rate-limit**: comportamento existente, não muda. A extensão só adiciona campos ao response de sucesso.
3. **`test-connection` com PayGo real — timeout**: PayGo pode demorar. Endpoint deve ter timeout explícito de 30s; se expirar, retorna `{success: false, detail: "Timeout aguardando máquina de pagamento"}`.
4. **`test-connection` chamado com terminal sem credenciais TEF**: MockProvider sempre funciona. PayGoProvider sem `paygo_terminal_id` → retorna erro claro: `{success: false, detail: "Terminal sem credenciais TEF configuradas"}`.
5. **Heartbeat enviado por JWT de terminal diferente**: endpoint deve validar que `terminal_id` do JWT bate com `{t_id}` da URL. Rejeitar com 403 se divergir.
6. **Dois totens selecionando o mesmo terminal simultaneamente**: Race condition — ambos veem o terminal disponível em `validate-pin` (que é read-only). O segundo totem que fizer `pin-login` terá JWT para o mesmo terminal; o heartbeat do primeiro será sobrescrito. Aceitável para MVP — o sistema não é crítico quanto a isso.
7. **`test-connection` cancelada pela máquina (usuário pressiona cancela no PIN pad)**: PayGo retorna erro de cancelamento → `{success: false, detail: "Cancelado pelo usuário na máquina"}` → frontend oferece retry.

### Cenários de regressão
- `pin-login` existente continua funcionando (não muda — só `validate-pin` é estendido)
- `cancel_payment` endpoint existente continua inalterado (test-connection usa a lógica internamente mas não o endpoint HTTP externo)
- `internal_get_terminal` (usado pelo payment-service) continua inalterado

---

## Tech Explorer

### A) Migração Alembic — `terminals.last_heartbeat`

**Arquivo:** `services/company/migrations/versions/YYYYMMDD_HHMM_add_terminal_heartbeat.py`

```python
def upgrade():
    op.add_column('terminals', sa.Column('last_heartbeat', sa.DateTime(), nullable=True))

def downgrade():
    op.drop_column('terminals', 'last_heartbeat')
```

Nenhum backfill necessário — `NULL` significa "nunca usou" → disponível.

### B) company-service — modelo + endpoints

**Terminal model** (`main.py`):
```python
last_heartbeat = Column(DateTime, nullable=True)
```

**TerminalOut** — adicionar campo:
```python
last_heartbeat: Optional[datetime] = None
```

**`/internal/validate-pin`** — estender response:
```python
from datetime import datetime, timedelta

HEARTBEAT_TTL = timedelta(minutes=5)

# dentro de validate_pin():
avail_cutoff = datetime.utcnow() - HEARTBEAT_TTL
t_result = await db.execute(
    select(Terminal).where(
        Terminal.company_id == co.id,
        Terminal.active == True,
        or_(Terminal.last_heartbeat == None, Terminal.last_heartbeat < avail_cutoff)
    )
)
terminals = t_result.scalars().all()
return {
    "company": {"id": co.id, "name": co.name, "plan": co.plan},
    "terminals": [{"id": t.id, "label": t.label, "terminal_code": t.terminal_code,
                   "tef_number": t.tef_number} for t in terminals],
}
```

**Novo endpoint heartbeat** (kiosk auth required):
```python
@app.post("/companies/{company_id}/terminals/{terminal_id}/heartbeat", status_code=204)
async def terminal_heartbeat(
    company_id: int, terminal_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    if current_user.role != "kiosk" or current_user.terminal_id != terminal_id:
        raise HTTPException(403)
    t = (await db.execute(select(Terminal).filter_by(id=terminal_id, company_id=company_id))).scalars().first()
    if not t:
        raise HTTPException(404)
    t.last_heartbeat = datetime.utcnow()
    await db.commit()
```

### C) auth-service — estender `validate-pin` response

**`/auth/validate-pin`** (main.py, linha ~167): O auth-service repassa o response de `internal/validate-pin`. Hoje faz:
```python
return r.json()  # só retorna company
```
Como a company-service agora retorna `{company, terminals}`, o auth-service apenas repassa sem mudança. Verificar que o response schema não filtra campos extras (FastAPI usa `response_model` — se não tiver, passa tudo).

Verificar linha do `validate_pin` no auth-service — se não há `response_model`, nenhuma mudança necessária. Se houver, adicionar `terminals` ao schema.

### D) payment-service — `POST /payments/test-connection`

```python
class TestConnectionReq(BaseModel):
    pass  # terminal_id vem do JWT

@app.post("/payments/test-connection")
async def test_connection(
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    if current_user.role != "kiosk":
        raise HTTPException(403)
    terminal_id = current_user.terminal_id

    # Buscar config do terminal
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{COMPANY_SVC}/internal/terminals/{terminal_id}", headers=INTERNAL_HEADERS)
    if r.status_code != 200:
        raise HTTPException(503, "Terminal não encontrado")
    tconf = r.json()

    provider = _get_provider(tconf)
    try:
        result = await asyncio.wait_for(
            provider.test_connection(terminal_id=terminal_id, amount=Decimal("0.01")),
            timeout=30.0
        )
    except asyncio.TimeoutError:
        return {"success": False, "detail": "Timeout aguardando máquina de pagamento"}

    return {"success": result["success"], "detail": result.get("detail", "")}
```

**IPaymentProvider** — adicionar método abstrato:
```python
async def test_connection(self, terminal_id: int, amount: Decimal) -> dict:
    raise NotImplementedError
```

**MockProvider.test_connection**:
```python
async def test_connection(self, terminal_id: int, amount: Decimal) -> dict:
    await asyncio.sleep(0.5)  # simula latência
    return {"success": True, "detail": "Máquina mockada respondeu (R$ 0,01 cancelado)"}
```

**PayGoProvider.test_connection**:
```python
async def test_connection(self, terminal_id: int, amount: Decimal) -> dict:
    # Inicia transação de R$ 0,01
    init_result = await self._initiate(amount, "test-connection")
    if not init_result.get("nsu"):
        return {"success": False, "detail": "Máquina não respondeu ao acionamento"}
    # Cancela imediatamente
    await self._cancel(init_result["nsu"])
    return {"success": True, "detail": f"Máquina respondeu (NSU {init_result['nsu']}, cancelado)"}
```

### Arquivos a criar/modificar

| Arquivo | Mudança |
|---|---|
| `services/company/migrations/versions/YYYYMMDD_add_terminal_heartbeat.py` | nova migration |
| `services/company/main.py` | `Terminal.last_heartbeat`, `TerminalOut`, `/internal/validate-pin`, `/terminals/{id}/heartbeat` |
| `services/auth/main.py` | verificar/remover `response_model` em `validate-pin` se necessário |
| `services/payment/main.py` | `IPaymentProvider.test_connection`, MockProvider, PayGoProvider, `/payments/test-connection` |

### Risco de regressão
- `internal/validate-pin` agora faz query extra em `terminals` — adicionar index em `(company_id, active, last_heartbeat)` para performance
- Nenhum endpoint existente é removido ou tem sua assinatura alterada
