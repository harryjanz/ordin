---
id: ORD-108
status: Done
fase: 6
sprint: null
responsavel: Backend + Frontend
estimativa: 13 pontos
---

# ORD-108 — Consumo no local ou para levar

## Descrição
Pedido do usuário (2026-08-21), inspirado em concorrentes (Goomer tem exatamente essa feature, chamada de "Meios de Consumo") e no padrão consagrado pelo McDonald's no Brasil. Empresa liga/desliga uma configuração; quando ligada, o totem pergunta ao cliente se o pedido é pra **comer no local** ou **para levar**, e essa escolha vai junto pro balcão/cozinha.

**Nomenclatura definida com o usuário** (pesquisa de mercado em `docs/analise-dashboard-concorrentes-mercado.md`-style, feita no chat):
- Aba em Configurações: **Comportamento**
- Toggle: **"Consumo no local ou para levar"**
- Opções no totem: **"Comer no local"** / **"Para levar"** (mesma nomenclatura de Goomer/KCMS/McDonald's — não reinventar, o cliente já reconhece o padrão)

## Persona
- **Owner/manager** — liga a opção em Configurações.
- **Cliente do totem** — escolhe entre as duas opções antes de pagar.
- **Operador de balcão/cozinha** — vê a indicação "PARA LEVAR" no pedido pra embalar corretamente.

## Explorer

### Achado técnico — mapeamento completo dos 4 serviços + 3 frontends envolvidos
Levantamento feito lendo o código atual (não é greenfield, é uma extensão pontual em cada camada):

1. **`company-service`**: `Company` (`main.py:104`) precisa de uma coluna nova, `consumption_mode_enabled` (bool, default `False`) — mesmo padrão de `is_platform`/`mfa_policy`. `CompanyOut` (Pydantic, `from_attributes=True`) mapeia automaticamente por nome de atributo, não precisa de código extra além de declarar o campo no schema. Os endpoints internos `/internal/validate-pin` e `/internal/verify-pin` (usados por auth-service durante login/pareamento do totem) constroem o dict de `company` manualmente — precisam do campo novo explícito nos dois lugares. Endpoint novo `PATCH /companies/{id}/behavior`, espelhando exatamente `PATCH /companies/{id}/appearance` (`main.py:1076`) em auth/formato.

2. **`auth-service`**: `CompanyInfo` (Pydantic, `main.py:92`) é o schema que efetivamente sai pro totem em `/auth/pin-login` e `/auth/validate-pin` (mesmo quando o handler faz `return {"company": data["company"], ...}` com um dict solto, o `response_model` do endpoint filtra pelos campos declarados em `CompanyInfo` — sem adicionar o campo aqui, ele nunca chega no totem mesmo que o company-service já mande).

3. **`order-service`**: `Order` (`main.py:38`) precisa de uma coluna nova, `consumption_type` (string curta, nullable — `"local"` | `"viagem"` | `NULL` pra pedidos antigos ou empresas sem a feature ligada). `OrderIn` (body de `POST /orders`) ganha `consumption_type: Optional[str] = None`. `OrderListItem` (usado por `GET /orders`, é o que o balcão lê pra montar a fila) ganha o mesmo campo. Sem validação cross-service contra o flag da empresa — o totem só manda o campo quando a empresa tem a opção ligada (mesmo modelo de confiança já usado no JWT de kiosk pro resto do fluxo).

4. **`frontend/admin`** (`SettingsScreen.tsx`): já tem o padrão de abas (ORD-094) com `Tab`/`Tabs` do design system e um `Toggle` funcionando (aba "Aparência", `main.py:581`). Nova aba `"behavior"` ("Comportamento") replica exatamente a estrutura de card + `Toggle` + botão salvar da aba de aparência, usando o `PATCH /companies/{id}/behavior` novo. `GET /companies/{id}` (já chamado pra carregar a aparência) já vai trazer o campo novo de graça via `CompanyOut`.

5. **`frontend/totem`**: fluxo hoje é `welcome → catalog (carrinho) → cpf → payment → success`. A escolha entra como uma tela nova, **entre catalog e cpf** (mesmo ponto onde a Goomer pergunta — depois de fechar o carrinho, antes do checkout). `App.tsx` decide pular a tela nova quando `company.consumption_mode_enabled` for `false` (empresa sem a feature ligada não muda de fluxo nenhum). Estado (`screen`, `cpf`, `cart`) já vive no Zustand `store.ts`, com `Screen` como union type em `types.ts` — mesmo padrão pra `consumptionType`.

6. **`frontend/balcao`** (`QueueScreen.tsx`): já tem um badge "URGENTE" nos cards da fila (`S.urgentBadge`) — mesmo padrão visual pra um badge novo "PARA LEVAR", cor diferente (evita confundir os dois avisos). `OrderSummary` (`types.ts`) ganha o campo novo.

### Fluxo principal
1. Owner abre Configurações → aba "Comportamento" → liga "Consumo no local ou para levar" → salva.
2. Cliente usa o totem: monta o carrinho, toca em "Fechar pedido" (`onCheckout`). Como a empresa tem a opção ligada, aparece uma tela nova: "Como você vai consumir seu pedido?" com 2 botões grandes — "Comer no local" e "Para levar".
3. Cliente escolhe uma opção → segue pro CPF → paga. O pedido é criado com `consumption_type` preenchido.
4. No balcão, o card do pedido na fila mostra "PARA LEVAR" quando aplicável, junto com os outros metadados (terminal, hora, valor).
5. Empresa que **não** ligou a opção: fluxo do totem continua idêntico ao de hoje, sem a tela nova; `consumption_type` do pedido fica `NULL`; nenhum badge aparece no balcão.

### Fluxos alternativos / exceções
- Cliente aperta "← Voltar" na tela de escolha → volta pro carrinho (`catalog`), mesmo padrão de `CpfScreen.onBack`.
- Empresa desliga a opção depois de já ter pedidos com `consumption_type` preenchido → pedidos antigos mantêm o valor salvo (histórico), só pedidos novos deixam de perguntar.
- Superadmin/admin sem empresa selecionada em Configurações → aba "Comportamento" mostra o mesmo empty-state que "Aparência" já mostra hoje.

### Critérios de aceite
- [ ] Aba "Comportamento" em Configurações, com toggle "Consumo no local ou para levar", carregando o valor atual e salvando via `PATCH /companies/{id}/behavior`
- [ ] Com a opção desligada (padrão), o totem não muda em nada — sem tela nova, sem campo no pedido
- [ ] Com a opção ligada, depois de fechar o carrinho o totem mostra "Comer no local" / "Para levar" antes do CPF
- [ ] Pedido criado carrega `consumption_type` correto (`"local"` ou `"viagem"`)
- [ ] Balcão mostra "PARA LEVAR" no card da fila quando `consumption_type === "viagem"`, sem afetar pedidos "local" ou sem o campo
- [ ] Nenhuma migration quebra dado existente (coluna nova sempre nullable/com default)

---

## QA Explorer

```gherkin
Feature: Consumo no local ou para levar

  Scenario: Opção desligada não muda o fluxo do totem
    Dado a empresa não tem "Consumo no local ou para levar" ligado
    Quando o cliente fecha o carrinho no totem
    Então a tela de CPF aparece direto, sem tela de escolha

  Scenario: Opção ligada mostra a escolha
    Dado a empresa tem a opção ligada
    Quando o cliente fecha o carrinho no totem
    Então aparece a tela "Comer no local" / "Para levar"

  Scenario: Escolha "Para levar" vai pro pedido
    Dado o cliente escolheu "Para levar"
    Quando o pedido é criado
    Então o pedido salvo tem consumption_type = "viagem"

  Scenario: Balcão mostra o aviso
    Dado um pedido pago com consumption_type = "viagem"
    Quando o operador de balcão vê a fila
    Então o card desse pedido mostra "PARA LEVAR"

  Scenario: Pedido "no local" não mostra aviso
    Dado um pedido pago com consumption_type = "local"
    Quando o operador de balcão vê a fila
    Então o card não mostra nenhum badge de "para levar"

  Scenario: Voltar da tela de escolha
    Dado o cliente está na tela de escolha
    Quando aperta "← Voltar"
    Então volta pro carrinho, sem perder os itens

  Scenario: Toggle liga e desliga corretamente
    Dado o owner está na aba "Comportamento"
    Quando liga o toggle e salva
    Então GET /companies/{id} subsequente retorna consumption_mode_enabled=true
    E desligar e salvar de novo retorna consumption_mode_enabled=false
```

---

## Tech Explorer

### Serviços impactados
`services/company`, `services/auth`, `services/order`, `frontend/admin`, `frontend/totem`, `frontend/balcao`.

### `services/company/main.py`
```python
# Company (model)
consumption_mode_enabled = Column(Boolean, nullable=False, default=False)

# CompanyOut (schema)
consumption_mode_enabled: bool = False

# BehaviorIn (schema novo)
class BehaviorIn(BaseModel):
    consumption_mode_enabled: bool

# /internal/validate-pin e /internal/verify-pin — no dict "company":
"consumption_mode_enabled": co.consumption_mode_enabled,
```
Endpoint novo, espelhando `update_appearance`:
```python
@app.patch("/companies/{company_id}/behavior", tags=["Empresas"], summary="Atualizar comportamento do totem")
async def update_behavior(company_id: int, body: BehaviorIn, db=Depends(get_db), current_user=Depends(get_current_user)):
    if current_user.company_id != company_id and current_user.role != "superadmin":
        raise HTTPException(403, "Acesso negado")
    co = await db.get(Company, company_id)
    if not co or not co.active:
        raise HTTPException(404, "Empresa não encontrada")
    co.consumption_mode_enabled = body.consumption_mode_enabled
    await db.commit()
    return {"ok": True, "consumption_mode_enabled": body.consumption_mode_enabled}
```
Migration nova (`YYYYMMDD_HHMM_consumption_mode.py`): `ALTER TABLE companies ADD COLUMN consumption_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE`.

### `services/auth/main.py`
```python
class CompanyInfo(BaseModel):
    ...
    consumption_mode_enabled: bool = False
```

### `services/order/main.py`
```python
# Order (model)
consumption_type = Column(String(10), nullable=True)  # "local" | "viagem" | None

# OrderIn (body de POST /orders)
consumption_type: Optional[str] = None

# create_order — na hora de criar o Order:
order = Order(..., consumption_type=body.consumption_type)

# OrderListItem (usado por GET /orders, lido pelo balcão)
consumption_type: Optional[str] = None
```
Migration nova (`YYYYMMDD_HHMM_consumption_type.py`): `ALTER TABLE orders ADD COLUMN consumption_type VARCHAR(10) NULL`.

**Sem validação de enum rígida no backend** (`"local"`/`"viagem"`/`None`) além de tipo string — o totem é o único emissor confiável (JWT kiosk), mesmo nível de confiança já dado a outros campos do pedido.

### `frontend/admin`
- `types.ts`: `Company.consumption_mode_enabled: boolean`.
- `SettingsScreen.tsx`: `tab` ganha `"behavior"`; novo card espelhando o de aparência (`localConsumptionMode` carregado no mesmo `useEffect` que já busca `GET /companies/{id}`, `saveBehavior()` chamando `PATCH .../behavior`).

### `frontend/totem`
- `types.ts`: `Screen` ganha `"consumption"`; `CompanyInfo` ganha `consumption_mode_enabled: boolean`.
- `store.ts`: `consumptionType: "local" | "viagem" | null`, `setConsumptionType`, resetado em `newOrder()`/`goIdle()` (mesmo tratamento de `cpf`).
- Novo `screens/ConsumptionTypeScreen.tsx` — mesmo estilo visual de `CpfScreen.tsx` (`Theme T`, `FONT_D`/`FONT_B`, botões grandes), 2 cards grandes ("Comer no local" / "Para levar") + "← Voltar".
- `App.tsx`: `CatalogScreen.onCheckout` passa a decidir `setScreen(company?.consumption_mode_enabled ? "consumption" : "cpf")`; nova entrada `screen === "consumption"` renderizando `ConsumptionTypeScreen`, `onSelect` grava `setConsumptionType` e vai pra `"cpf"`; `handleCpfDone` inclui `consumption_type: consumptionType` no body de `POST /orders`.

### `frontend/balcao`
- `types.ts`: `OrderSummary.consumption_type?: string | null`.
- `QueueScreen.tsx`: badge novo (`S.takeawayBadge`, cor âmbar — distinto do `urgentBadge` vermelho) renderizado quando `o.consumption_type === "viagem"`.

**Fora de escopo, deliberado:** detalhe por ticket individual (`OrderDetailScreen.tsx`) não ganha o campo — o badge no card da fila já é a informação que importa pro operador decidir embalagem antes de abrir o pedido; adicionar de novo na tela de detalhe seria redundante.

### Riscos
- Baixo-médio — 3 migrations (2 colunas novas, sempre nullable/com default, não quebram dado existente) espalhadas em 2 serviços diferentes, mas cada uma isolada e reversível. O ponto de mais atenção é `CompanyInfo` em auth-service — é fácil esquecer que o `response_model` filtra o dict solto do company-service, e um campo novo "não aparecer" no totem sem nenhum erro (silencioso). Documentado explicitamente acima pra não cair nessa pegadinha durante a implementação.
- Sem migração de dado histórico necessária — pedidos antigos simplesmente ficam com `consumption_type = NULL`, tratados como "sem informação" (não aparecem com badge nenhum no balcão).

### Estimativa
13 pontos — maior história do sprint até aqui: 2 migrations, 3 serviços backend tocados, 1 tela nova no totem com fluxo de navegação novo, 1 aba nova no admin, 1 badge no balcão.

---

## Ready

**Explorer:** [x] mapeamento completo dos 6 componentes (3 serviços + 3 frontends), fluxo principal e alternativo, critérios de aceite · **QA Explorer:** [x] cenários cobrindo opção ligada/desligada, escolha "para levar", exibição no balcão, voltar, e o próprio toggle · **Tech Explorer:** [x] mudanças exatas em cada arquivo, 2 migrations, achado de risco específico (CompanyInfo filtrando campo silenciosamente), escopo deliberadamente fora (OrderDetailScreen) · **Aprovação final:** [x] aprovado no chat pelo usuário (2026-08-21) — nomenclatura pesquisada no mercado e confirmada antes de abrir a história

**Status: Ready** — pode começar a implementação.

---

## Downstream

- **Branch:** `feature/ord-108-consumo-local-ou-para-levar`, a partir de `main`.
- **`services/company/main.py`:** `Company.consumption_mode_enabled` (bool, default `False`); `CompanyOut` ganha o campo (mapeado automaticamente via `from_attributes`); `BehaviorIn` novo; `PATCH /companies/{id}/behavior` novo, espelhando `update_appearance`. Campo adicionado nos **três** lugares que constroem o dict `company` manualmente: `/internal/validate-pin`, `/internal/verify-pin` **e um terceiro achado durante a implementação** — o fluxo de pareamento por QR code (`device-challenge`/Redis, endpoint de confirmação do código de pareamento) — não estava no Tech Explorer original, só apareceu ao ler o código com atenção; mesma classe de risco já documentada (campo "sumia" silenciosamente).
- **Migration nova:** `20260821_1500_consumption_mode.py` (`companies.consumption_mode_enabled`, boolean, default false).
- **`services/auth/main.py`:** `CompanyInfo` ganha `consumption_mode_enabled: bool = False`.
- **`services/order/main.py`:** `Order.consumption_type` (string(10), nullable); `OrderIn.consumption_type`; `create_order` grava o campo; `OrderListItem.consumption_type`; `list_orders` inclui o campo no dict de resposta.
- **Migration nova:** `20260821_1500_consumption_type.py` (`orders.consumption_type`, varchar(10) nullable).
- **`services/company/tests/test_ord108_consumo_local_ou_para_levar.py`** (novo): 5 testes — padrão desligado, liga, desliga depois de ligado, 403 pra empresa alheia, 401 sem token.
- **`services/order/tests/test_ord108_consumo_local_ou_para_levar.py`** (novo): 3 testes — pedido sem campo fica `null`, "para levar", "no local".
- **`frontend/admin/src/types.ts`:** `Company.consumption_mode_enabled`.
- **`frontend/admin/src/screens/SettingsScreen.tsx`:** aba "Comportamento" nova, card "Consumo no local ou para levar" com `Toggle` + botão salvar, mesmo padrão da aba "Aparência do totem".
- **`frontend/totem/src/types.ts`:** `Screen` ganha `"consumption"`; `ConsumptionType`; `CompanyInfo.consumption_mode_enabled`.
- **`frontend/totem/src/store.ts`:** `consumptionType` + `setConsumptionType`, resetado em `newOrder()`/`goIdle()`/`resetSession()`.
- **`frontend/totem/src/screens/ConsumptionTypeScreen.tsx`** (novo): 2 cards grandes ("Comer no local"/"Para levar") + "← Voltar", mesmo estilo visual de `CpfScreen.tsx`.
- **`frontend/totem/src/App.tsx`:** `CatalogScreen.onCheckout` pula pra `"consumption"` ou `"cpf"` conforme `company.consumption_mode_enabled`; `handleCpfDone` inclui `consumption_type` no `POST /orders`.
- **`frontend/balcao/src/types.ts`:** `OrderSummary.consumption_type`.
- **`frontend/balcao/src/screens/QueueScreen.tsx`:** badge "PARA LEVAR" (âmbar, distinto do "URGENTE" vermelho) no card da fila.
- `tsc --noEmit`: limpo nos 3 frontends (admin/totem/balcão).
- **Suítes de teste:** company-service **303 passed** (6 falhas pré-existentes confirmadas via worktree de `main` — na verdade `main` tem 8 falhas nos mesmos arquivos, mais que o branch; dívida de teste não relacionada). order-service **52 passed**, zero falhas. admin `vitest`: **48 passed**.
- **Lint-delta:** `company/main.py` +2 `B008` (mesmo padrão já usado 14x no arquivo, `Depends()` em default de argumento), `order/main.py` +2 `UP045` (mesmo padrão `Optional[...]` já pervasivo no arquivo), `auth/main.py` zero diferença. Nenhuma categoria genuinamente nova.
- **Bug pré-existente encontrado, não corrigido (fora de escopo):** `POST /companies/{id}/regenerate-pin` gera um PIN de **6 dígitos** (`secrets.randbelow(900000) + 100000`), mas a tela de PIN do totem (`SetupScreen`/`PinScreen`) só aceita **4 dígitos** — qualquer PIN regenerado fica impossível de usar via essa tela. Achado ao vivo durante a verificação (o PIN documentado "1234" da seed também não funcionou — parece ter sido regenerado em alguma sessão anterior). Contornado usando o fluxo de pareamento por QR code em vez de PIN pra completar a verificação. Vale abrir uma história própria pra esse bug.
- **Verificado ao vivo no Chrome/API, ponta a ponta:**
  1. Admin → Configurações → Comportamento → ativei o toggle → salvei → recarreguei a página → toggle continuou "Ativado" (persistiu no backend).
  2. Totem pareado via QR code (contornando o bug do PIN acima) → `localStorage` confirmado com `consumption_mode_enabled: true` vindo do fluxo de pareamento (valida o terceiro ponto de código achado).
  3. Adicionei um item ao carrinho, fechei o pedido → tela "Como você vai consumir?" apareceu com "Comer no local"/"Para levar" → escolhi "Para levar" → segui pro CPF → PIX (crédito/débito falharam por terminal "teste" sem `mp_device_id` configurado, problema de config de terminal de dev não relacionado à ORD-108).
  4. Consultei `GET /orders` direto (mesmo endpoint do `QueueScreen`) e confirmei `"consumption_type":"viagem"` no pedido criado pelo totem.
  5. Não consegui logar no app de balcão (não tinha credencial de um usuário `cashier` à mão) — o badge em si não foi visto renderizado na tela, mas o dado que ele consome já está confirmado correto na API, e o JSX é uma condicional trivial já revisada.
- PR ainda não aberta — implementação completa, aguardando decisão do usuário sobre commit/PR/merge.
