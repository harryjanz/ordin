# ORD-131 — Webhook secret do Mercado Pago por empresa (multi-tenant)

**Status:** Ready
**Pontos:** 6
**Sprint:** Pagamentos MP

---

## Explorer

### O problema

`MP_WEBHOOK_SECRET` (introduzido/corrigido na ORD-130) hoje é uma env var **única e global** do `payment-service`. Isso quebra o modelo multi-tenant do `ordin`: cada empresa que configurar Mercado Pago como provider tem sua **própria aplicação/conta MP**, e o Mercado Pago gera uma chave secreta de webhook **por aplicação**, não uma chave compartilhada. Uma env var global só funciona enquanto existir uma única empresa usando MP — quebra assim que a segunda empresa configurar.

Isso é consistente com o padrão que **já existe** pra `api_key`/`api_secret` — essas duas já são armazenadas por empresa em `company_payment_configs` (colunas encriptadas, únicas por `company_id` + `provider` + `environment`), exatamente porque cada empresa tem seu próprio token de acesso MP. O `webhook_secret` precisa seguir o mesmo padrão, não ficar de fora como env var solta.

### Segundo problema, mais difícil: como saber de qual empresa é a notificação?

Diferente de uma chamada de API que o `ordin` inicia (onde já sabemos `company_id` porque estamos processando um pagamento de uma empresa específica), o **webhook é o Mercado Pago chamando a gente** — e hoje existe uma única URL pública (`/payments/webhook/mercadopago`) recebendo notificações de **todas** as contas MP de **todas** as empresas. Antes de validar a assinatura, precisamos saber qual secret tentar — e não dá pra confiar em nada do payload/query string pra decidir isso, porque nada ali foi autenticado ainda (seria usar dado não confiável pra escolher a chave de validação).

**Proposta (a mesma que o usuário já indicou)**: URL de webhook **por empresa**, não uma URL compartilhada. Ex.: `/payments/webhook/mercadopago/{company_id}`. Cada empresa, ao configurar o Mercado Pago no painel deles, cola uma URL que já identifica explicitamente de qual empresa é — o `company_id` na URL não precisa ser segredo (não é a parte que garante segurança; quem garante é a assinatura HMAC verificada com o secret daquela empresa específica). É o mesmo padrão que provedores tipo Stripe usam quando não há um identificador de conta no payload em si.

### Escopo

1. Nova coluna `webhook_secret` em `company_payment_configs` (encriptada, mesmo padrão de `api_key`/`api_secret`).
2. Endpoints de config de pagamento (`POST`/`PUT /companies/{id}/payment-configs`) passam a aceitar `webhook_secret`.
3. Novo endpoint interno no company-service pra o payment-service buscar o secret por `company_id` (não por `terminal_id`, já que o webhook não tem terminal associado).
4. Rota de webhook MP passa a incluir `company_id` no path: `/payments/webhook/mercadopago/{company_id}`.
5. Remover `MP_WEBHOOK_SECRET` do `.env`/`docker-compose.yml` depois da migração — vira dado do banco, não configuração de ambiente.
6. Migrar a config já existente da Burger House (`company_payment_configs id=321`, produção) pra usar o novo campo em vez do env var atual.

7. **Admin (`frontend/admin`)**: exibir a URL do webhook (`{origin}/payments/webhook/mercadopago/{companyId}`) na aba Pagamento de `CompanyScreen.tsx`, campo somente-leitura com botão de copiar — pro cliente colar direto no painel do Mercado Pago dele. Sem isso, o cliente não tem como saber qual URL configurar (o `company_id` não é algo que ele normalmente veria).

Fora do escopo: qualquer outro provider (PayGo não usa esse mecanismo de assinatura, e não está implementado ainda).

---

## QA Explorer

### Cenário 1 — Empresa A recebe notificação com o secret certo
```gherkin
Dado a empresa 1 (Burger House) com webhook_secret configurado em company_payment_configs
Quando POST /payments/webhook/mercadopago/1 chega com assinatura calculada com esse secret
Então a notificação é aceita e processada
```

### Cenário 2 — Empresa B não consegue usar o secret da empresa A
```gherkin
Dado duas empresas diferentes, cada uma com seu próprio webhook_secret
Quando POST /payments/webhook/mercadopago/1 chega com uma assinatura calculada
  com o secret da empresa 2
Então a notificação é rejeitada com 401 (a validação usa especificamente o
  secret da empresa 1, buscado pelo company_id da URL)
```

### Cenário 3 — Empresa sem config de Mercado Pago
```gherkin
Dado uma empresa sem nenhuma company_payment_configs de provider=mercadopago
Quando POST /payments/webhook/mercadopago/{company_id} chega pra essa empresa
Então retorna 200 (não expor se a empresa existe ou não) mas não processa nada,
  loga um aviso
```

### Cenário 4 — Regressão: notificação real continua validando
```gherkin
Dado o mesmo payload e assinatura reais capturados na sessão anterior (ORD-130),
  agora usando /payments/webhook/mercadopago/1 com o webhook_secret migrado
  pro banco (não mais o env var)
Quando a requisição é replay ada
Então aceita com 200, igual ao comportamento validado na ORD-130
```

---

## Tech Explorer

### Migration nova (company-service)
```sql
ALTER TABLE company_payment_configs ADD COLUMN webhook_secret VARCHAR(500) NULL;
```
Mesmo tipo de `api_key`/`api_secret` (`String(500)`), mesma criptografia (`encrypt_field`/`decrypt_field`).

### Schemas (company-service `main.py`)
`PaymentConfigIn`, `CompanyPaymentConfig` (model), `create_payment_config`, `update_payment_config` — adicionar `webhook_secret: Optional[str]` seguindo exatamente o padrão de `api_secret` em cada um desses pontos.

### Endpoint interno novo
```python
@app.get("/internal/companies/{company_id}/payment-config", include_in_schema=False)
async def internal_get_payment_config(
    company_id: int,
    provider: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal),
):
    cfg = await db.execute(
        select(CompanyPaymentConfig).filter_by(company_id=company_id, provider=provider, active=True)
    )
    cfg = cfg.scalars().first()
    if not cfg:
        raise HTTPException(404)
    return {
        "webhook_secret": decrypt_field(cfg.webhook_secret) if cfg.webhook_secret else None,
    }
```

### Rota de webhook (payment-service `main.py`)
```python
@app.post("/payments/webhook/mercadopago/{company_id}", ...)
async def payment_webhook_mercadopago(company_id: int, request: Request, background_tasks: BackgroundTasks):
    secret = await _get_mp_webhook_secret(company_id)  # chama o endpoint interno novo, cacheável
    if secret:
        # mesma validação de assinatura da ORD-130, só que com o secret desta empresa
        ...
```

Cache do secret por `company_id` vale considerar (evita uma chamada HTTP síncrona ao company-service em todo webhook recebido) — não é obrigatório pro MVP da história, mas vale nota de performance se o volume de notificações crescer.

### Migração da config existente
A config de produção da Burger House (`id=321`) precisa do `webhook_secret` real preenchido via `PUT /companies/1/payment-configs/321` depois do deploy — passo manual de dados, não faz parte da migration de schema.

### Ação manual pós-deploy (usuário)
Atualizar a URL do webhook no painel MP de `.../payments/webhook/mercadopago` (ORD-130) para `.../payments/webhook/mercadopago/1` (com o `company_id` da Burger House) — agora copiável direto da tela de Pagamento no admin.

### Frontend — `frontend/admin/src/screens/CompanyScreen.tsx`

- `FieldKey` ganha `"webhook_secret"`; entrada `mercadopago` em `PROVIDERS` ganha um `ProviderField` novo (`type: "password"`, `required: false` — só é preenchido depois que o cliente configura o webhook no painel MP e recebe a chave secreta de lá, não dá pra saber de antemão).
- `credentialLines` passa a exibir `webhook_secret` também (mascarado, mesmo tratamento de `api_key`/`api_secret`).
- `PaymentConfig` (`types.ts`) ganha `webhook_secret?: string | null`.
- Dentro do `Modal` do formulário, logo após o `.map(modalDef.fields)`: se o provider do modal (`editConfigId === null ? provider : editCfg?.provider`) for `"mercadopago"`, renderizar um `InputBase readOnly` com `value={`${window.location.origin}/payments/webhook/mercadopago/${companyId}`}`, `icon="copy"`, `onActionIconClick` chamando `navigator.clipboard.writeText(...)` + `makeToast("success", "URL copiada!")` — mesmo padrão de ícone/callback que o `InputBase` já suporta nativamente (confirmado no design-system vendorizado), sem precisar de componente novo.

---

## Ready

**Explorer:** [x] · **QA Explorer:** [x] · **Tech Explorer:** [x] · **Aprovação final:** [x] — aprovado pelo usuário em 2026-08-27 (com adição do requisito de exibir a URL do webhook no admin).
