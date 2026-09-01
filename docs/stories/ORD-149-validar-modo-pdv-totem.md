---
id: ORD-149
status: Done
fase: null
sprint: null
responsavel: Backend SR
estimativa: 3 pontos
---

# ORD-149 — Validar modo PDV do terminal Mercado Pago ao iniciar o totem

## Descrição
O totem já tem um passo de teste de conexão com a máquina de pagamento na tela de configuração
(`SetupScreen.tsx`, via `POST /payments/test-connection`), mas para Mercado Pago esse teste
hoje só valida se o `access_token` é válido (`GET /v1/users/me`) — nunca confere se o terminal
Point vinculado está de fato em modo PDV, que é o único modo que permite receber pagamentos
via API. Um terminal fora do modo PDV passa despercebido no setup e só é descoberto quando um
cliente real tenta pagar e o pagamento não chega na maquininha. Além disso, existe um bug
real: o endpoint `POST /payments/test-connection` sempre passa `paygo_terminal_id` pro
provider, mesmo quando o provider é `mercadopago` — pra MP isso é sempre vazio, o parâmetro que
deveria identificar o terminal nunca carrega o `mp_device_id` de verdade.

## Persona
**Operador/instalador que configura o totem** — quem passa pela tela de setup/pareamento do
totem (`SetupScreen.tsx`) antes dele entrar em operação, e precisa saber ali, na hora, se o
terminal Point está pronto pra receber pagamentos via API.

## Contexto
Nasceu de uma pergunta direta do usuário durante o Tech Explorer do ORD-148: quais verificações
são possíveis ao iniciar um totem vinculado a um terminal Mercado Pago? Pesquisa na documentação
oficial do MP (via MCP, 2026-09-01) confirmou que a API de terminais do Mercado Pago não expõe
telemetria de hardware (bateria, status online/offline) — as únicas verificações reais
disponíveis são validade do token de acesso e o `operating_mode` do terminal. Isso, combinado
com o bug real encontrado no código (`terminal_ref` nunca carrega o `mp_device_id` no caminho
de Mercado Pago), torna esta história uma correção de bug + extensão de uma capacidade já
existente (`test_connection`), não uma funcionalidade do zero. Tem sinergia direta com o
[[ORD-148]] (que dá ao admin a ação de corrigir o modo PDV) — esta história é o que detecta o
problema mais cedo, no setup do totem, em vez de só na hora de um pagamento real falhar.

Decisão explícita do usuário: história separada do ORD-148 (que já teve o Tech Explorer fechado
com escopo restrito à tela de admin) — não expandir o escopo já fechado.

---

## Explorer

## História
Como **operador/instalador que configura o totem**, quero que o teste de conexão do setup
detecte quando o terminal Mercado Pago vinculado não está em modo PDV, para corrigir isso antes
do totem entrar em operação, em vez de descobrir só quando um cliente real tentar pagar.

## Contexto e motivação
`SetupScreen.tsx` já tem uma etapa de "teste de conexão" (`POST /payments/test-connection`)
que roda logo depois de selecionar o terminal, e o resultado já é **bloqueante**: se
`success: false`, o fluxo de setup não avança (`onDone` só é chamado quando `success: true`),
e a tela oferece "Tentar novamente". Hoje, pra Mercado Pago, esse teste só valida o
`access_token` — um terminal com token válido mas fora do modo PDV passa nessa etapa sem
nenhum aviso, e o problema só aparece na primeira tentativa de pagamento real com cliente na
fila. Essa história fecha essa lacuna reaproveitando a mesma etapa e o mesmo comportamento
bloqueante que já existe, sem inventar um padrão de UX novo — e corrige, de caminho, um bug
real: o `terminal_ref` passado pro provider nunca carrega o `mp_device_id` de verdade quando o
provider é Mercado Pago (sempre recebe `paygo_terminal_id`, vazio nesse caso).

## Fluxo principal
1. Operador seleciona o terminal na etapa 2 do setup (`selectTerminal`), já existente
2. Etapa 3 (teste de conexão, já existente) chama `POST /payments/test-connection`
3. Backend identifica que o provider da empresa é `mercadopago` e passa o `mp_device_id` do
   terminal (não mais `paygo_terminal_id`) pro `provider.test_connection(...)`
4. `MPProvider.test_connection` valida o `access_token` (comportamento já existente) e, se o
   método de pagamento suportar cartão e houver um `mp_device_id` configurado, também consulta
   `GET /terminals/v1/list` e confere se esse device está em `operating_mode == "PDV"`
5. Se tudo ok: `success: true`, mesmo comportamento de hoje — setup avança automaticamente
6. Se o terminal existir mas não estiver em PDV: `success: false`, mensagem específica
   ("Terminal fora do modo PDV — corrija em Empresa > Terminais antes de continuar") — mesma UI
   de "Tentar novamente" que já existe hoje pra token inválido, sem tela nova

## Fluxos alternativos / exceções
- Terminal MP sem `mp_device_id` configurado ainda: checagem de `operating_mode` é pulada (não
  é erro) — só a validação de token vale, exatamente como hoje. Não bloqueia setup de totens
  que ainda não têm terminal físico atribuído.
- Método de pagamento é só PIX (sem cartão habilitado pro terminal): checagem de `operating_mode`
  não se aplica — PIX não depende de terminal físico
- Terminal com `mp_device_id` configurado mas que não existe mais na conta MP (removido/trocado):
  mensagem diferente da de "fora do modo PDV" — "Terminal não encontrado na conta Mercado Pago"
  — evita confundir os dois problemas, que têm correções diferentes
- Falha de rede ao consultar `GET /terminals/v1/list`: mesmo tratamento de erro genérico já
  existente pro teste de conexão hoje (mensagem de erro de comunicação, permite tentar de novo)
- Provider PayGo/mock: comportamento inteiramente inalterado — a correção do `terminal_ref`
  só muda o caminho de código quando `provider_name == "mercadopago"`

## Dependências
- Serviços envolvidos: `payment-service` (`main.py`, `infrastructure/providers/mercadopago.py`),
  `frontend/totem` (nenhuma mudança de UI esperada — reaproveita a etapa 3 já existente)
- Histórias relacionadas: [[ORD-148]] (dá ao admin a ação de corrigir o modo PDV que esta
  história vai detectar mais cedo) — não bloqueante, as duas podem avançar em paralelo

## Critérios de aceite funcionais
- [ ] `POST /payments/test-connection` passa `mp_device_id` (não `paygo_terminal_id`) pro
      provider quando `provider_name == "mercadopago"`
- [ ] Terminal MP com `operating_mode == "PDV"` continua passando no teste normalmente (sem
      regressão do comportamento atual)
- [ ] Terminal MP com `operating_mode` diferente de PDV falha o teste com mensagem específica,
      diferente da mensagem de token inválido
- [ ] Terminal MP não encontrado na conta (device removido/trocado) falha com mensagem própria,
      distinta da de "fora do modo PDV"
- [ ] Sem `mp_device_id` configurado: checagem de PDV é pulada, não bloqueia o setup
- [ ] Método PIX-only: checagem de PDV não se aplica
- [ ] Provider PayGo/mock: comportamento inalterado
- [ ] Setup do totem continua bloqueado (não chama `onDone`) quando o teste falhar por
      qualquer motivo — mesmo comportamento bloqueante já existente, sem mudança de UX

## Wireframe / Mockup
Sem mockup novo — reaproveita a etapa 3 (teste de conexão) do `SetupScreen.tsx` já existente,
incluindo o botão "Tentar novamente" e o layout de sucesso/erro já implementados. Só o texto da
mensagem de erro muda conforme o motivo da falha.

---

## QA Explorer

```gherkin
Feature: Validar modo PDV do terminal Mercado Pago ao iniciar o totem
  Como operador/instalador que configura o totem
  Quero que o teste de conexão detecte um terminal Mercado Pago fora do modo PDV
  Para corrigir isso antes do totem entrar em operação

  Background:
    Dado que o totem está na etapa 3 (teste de conexão) do setup, já autenticado com um
      terminal selecionado

  # ── Happy path ────────────────────────────────────────────────────────────

  Scenario: Terminal MP com token válido e em modo PDV passa no teste
    Dado que o terminal tem provider "mercadopago", access_token válido, mp_device_id
      configurado e método aceita cartão
    E GET /terminals/v1/list retorna esse device com operating_mode "PDV"
    Quando POST /payments/test-connection é chamado
    Então a resposta é success=true
    E o setup avança automaticamente (onDone é chamado), mesmo comportamento de hoje

  # ── Bordas ────────────────────────────────────────────────────────────────

  Scenario: Terminal MP sem mp_device_id configurado ainda passa no teste
    Dado que o terminal tem provider "mercadopago", access_token válido, mas nenhum
      mp_device_id configurado
    Quando POST /payments/test-connection é chamado
    Então a checagem de operating_mode é pulada (nenhuma chamada a GET /terminals/v1/list)
    E a resposta é success=true, baseada só na validação do token
    E o setup avança normalmente

  Scenario: Método PIX-only não dispara a checagem de PDV
    Dado que o terminal tem provider "mercadopago" configurado só para PIX (sem cartão habilitado)
    Quando POST /payments/test-connection é chamado
    Então nenhuma chamada é feita a GET /terminals/v1/list
    E a resposta é success=true, baseada só na validação do token

  # ── Erros ─────────────────────────────────────────────────────────────────

  Scenario: Terminal fora do modo PDV bloqueia o setup com mensagem específica
    Dado que o terminal tem provider "mercadopago", access_token válido, mp_device_id
      configurado e método aceita cartão
    E GET /terminals/v1/list retorna esse device com operating_mode "STANDALONE"
    Quando POST /payments/test-connection é chamado
    Então a resposta é success=false
    E a mensagem indica que o terminal está fora do modo PDV e aponta pra correção em
      Empresa > Terminais
    E o setup não avança (onDone não é chamado), mesmo comportamento bloqueante de hoje
    E a tela oferece "Tentar novamente"

  Scenario: Terminal não encontrado na conta Mercado Pago mostra mensagem distinta
    Dado que o terminal tem provider "mercadopago", access_token válido, mp_device_id
      configurado, mas esse device não aparece na resposta de GET /terminals/v1/list
    Quando POST /payments/test-connection é chamado
    Então a resposta é success=false
    E a mensagem indica que o terminal não foi encontrado na conta Mercado Pago
    E essa mensagem é diferente da mensagem de "terminal fora do modo PDV"
    E o setup não avança

  Scenario: Falha de rede ao consultar terminais usa o erro genérico já existente
    Dado que o terminal tem provider "mercadopago", access_token válido, mp_device_id
      configurado e método aceita cartão
    E a chamada a GET /terminals/v1/list falha por erro de rede/timeout
    Quando POST /payments/test-connection é chamado
    Então a resposta é success=false com a mensagem de erro de comunicação já existente hoje
    E o setup não avança, com opção de "Tentar novamente"

  # ── Regressão ────────────────────────────────────────────────────────────

  Scenario: Provider PayGo permanece inteiramente inalterado
    Dado que o terminal tem provider "paygo"
    Quando POST /payments/test-connection é chamado
    Então o comportamento é exatamente o mesmo de antes desta história (usa paygo_terminal_id,
      nenhuma chamada relacionada a Mercado Pago é feita)

  Scenario: Provider mock permanece inteiramente inalterado
    Dado que o terminal tem provider "mock"
    Quando POST /payments/test-connection é chamado
    Então o comportamento é exatamente o mesmo de antes desta história

  Scenario: Token Mercado Pago inválido continua com a mensagem já existente
    Dado que o terminal tem provider "mercadopago" com access_token inválido
    Quando POST /payments/test-connection é chamado
    Então a resposta é success=false com a mensagem já existente de "Access token inválido"
    E essa mensagem não é confundida com as mensagens novas de "fora do modo PDV" ou
      "terminal não encontrado"
    E nenhuma chamada a GET /terminals/v1/list é feita (token já falhou antes)
```

**Cenários revisados e aprovados pelo PM.**

---

## Tech Explorer

### Correção de suposição do Explorer/QA Explorer
Não existe (nem precisa existir) um campo "método aceita cartão" separado. `POST
/payments/test-connection` não recebe nenhum parâmetro de método — é chamado sem body
(`axios.post("/payments/test-connection", {}, ...)` no totem). O único sinal real disponível é
a presença do `mp_device_id` (já retornado por `_get_terminal_config`, direto de `t.mp_device_id`
na tabela `terminals`): se estiver preenchido, a intenção de usar cartão via Point já está
configurada. Os cenários "sem mp_device_id configurado" e "método PIX-only" da QA Explorer são,
na prática, a mesma condição técnica — nenhuma mudança nos cenários, só uma simplificação de
como a condição é verificada no código.

### Serviços impactados
- **payment-service**: `main.py` (endpoint `test_connection`) e
  `infrastructure/providers/mercadopago.py` (`MPProvider.test_connection`)

### Endpoints
Nenhum endpoint novo — `POST /payments/test-connection` já existe (role `kiosk`,
`current_user.terminal_id` obrigatório), só muda o comportamento interno. Contrato de
request/response inalterado: `{}` → `{"success": bool, "detail": str}`.

### Correção no endpoint (`main.py`, dentro de `test_connection`)
```python
terminal_cfg = await _get_terminal_config(current_user.terminal_id)
provider_name = terminal_cfg.get("payment_provider", "mock")
environment   = terminal_cfg.get("environment", "sandbox")
raw_config    = terminal_cfg.get("config") or {}

if provider_name == "paygo":
    terminal_ref = terminal_cfg.get("paygo_terminal_id") or ""
    if not terminal_ref:
        return TestConnectionOut(success=False, detail="Terminal sem credenciais TEF configuradas")
elif provider_name == "mercadopago":
    terminal_ref = terminal_cfg.get("mp_device_id") or ""
else:
    terminal_ref = ""
```
Antes, `paygo_terminal_id` era usado incondicionalmente como `terminal_ref` — para Mercado Pago
isso sempre vinha vazio (bug corrigido aqui). O `if not terminal_ref: return ...` do bloco PayGo
permanece exatamente como está hoje — não se aplica a MP, que trata `terminal_ref` vazio como
"sem terminal configurado ainda" (não é erro, ver abaixo).

### Reescrita de `MPProvider.test_connection`
```python
async def test_connection(self, terminal_ref: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(f"{self.BASE_URL}/v1/users/me", headers=self._headers)
        except Exception as exc:
            return {"success": False, "detail": f"Erro ao conectar ao MP: {exc}"}

        if resp.status_code != 200:
            return {"success": False, "detail": f"Access token inválido (HTTP {resp.status_code})"}

        label = resp.json().get("email") or str(resp.json().get("id", "ok"))

        if not terminal_ref:
            # Sem mp_device_id configurado ainda (ou terminal só usa PIX) — nada mais a checar.
            return {"success": True, "detail": f"MP conectado: {label}"}

        try:
            terminals_resp = await client.get(
                f"{self.BASE_URL}/terminals/v1/list",
                headers=self._headers,
            )
        except Exception as exc:
            return {"success": False, "detail": f"Erro ao consultar terminal no MP: {exc}"}

        if terminals_resp.status_code != 200:
            return {"success": False, "detail": "Erro ao consultar terminal no MP. Tente novamente."}

        terminals = terminals_resp.json().get("data", {}).get("terminals", [])
        device = next((t for t in terminals if t.get("id") == terminal_ref), None)

        if device is None:
            return {
                "success": False,
                "detail": "Terminal não encontrado na conta Mercado Pago — verifique o MP Device ID em Empresa > Terminais.",
            }

        if device.get("operating_mode") != "PDV":
            return {
                "success": False,
                "detail": "Terminal fora do modo PDV — corrija em Empresa > Terminais antes de continuar.",
            }

        return {"success": True, "detail": f"MP conectado: {label} (terminal em modo PDV)"}
```
Mesmo cliente `httpx.AsyncClient` reaproveitado pras duas chamadas em série (`/v1/users/me` e
`/terminals/v1/list`), mesmo `self._headers` (Bearer do `access_token`) usado em todo o resto da
classe — nenhum código de autenticação novo.

### Migrations
Nenhuma.

### Eventos de fila
Não aplicável.

### Impacto em outros serviços
Nenhum além da chamada já existente do `payment-service` à API do Mercado Pago —
`frontend/totem` não muda de contrato, só recebe uma `detail` diferente conforme o motivo da
falha; `company-service` não é chamado (o `mp_device_id` já vem embutido no payload que
`_get_terminal_config` retorna, sem chamada adicional).

### Estimativa
- Backend: 3 pontos (correção do bug de `terminal_ref`, reescrita de `test_connection` com 3
  desfechos novos de falha, sem migration nem mudança de contrato externo)
- Frontend: 0 pontos — `SetupScreen.tsx` já trata `success`/`detail` genericamente
- **Total: 3 pontos**

### Riscos
- **Latência adicional**: uma chamada HTTP a mais (`GET /terminals/v1/list`) só quando há
  `mp_device_id` configurado, com timeout próprio de 10s (mesmo padrão do `/v1/users/me`).
  Somando as duas chamadas em série, o pior caso fica bem abaixo do timeout de 33s que o totem
  já usa pra essa etapa (`axios.post(..., {timeout: 33_000})`) — sem risco de estourar o limite
  existente.
- **Mensagens de erro precisam ser realmente distinguíveis** — "terminal não encontrado" vs.
  "fora do modo PDV" apontam pra ações de correção diferentes (reconfigurar o MP Device ID vs.
  usar a correção do [[ORD-148]]); QA deve validar que os textos não geram confusão no operador.
- Sem conflito com `docs/ARQUITETURA.md` — nenhuma credencial nova, nenhuma mudança de
  `company_id`/autenticação, só enriquece um método de provider já existente.

---

## Ready

### Checklist de entrada

**Explorer (PM + Produto)**
- [x] História no formato Como/Quero/Para
- [x] Contexto e motivação documentados (hook já existe em `SetupScreen.tsx`, bug real de
      `terminal_ref` encontrado e documentado)
- [x] Fluxo principal passo a passo
- [x] Dependências identificadas (relacionada a [[ORD-148]], não bloqueante)
- [x] Wireframe descrito (reaproveita etapa 3 do setup existente, sem mockup novo)
- [x] Critérios de aceite funcionais escritos

**QA Explorer (QA)**
- [x] Happy path em Gherkin (token válido + operating_mode PDV)
- [x] Cenários de borda (sem mp_device_id configurado, método PIX-only)
- [x] Cenários de erro (fora do modo PDV, terminal não encontrado, falha de rede — três
      mensagens distintas)
- [x] Isolamento multi-tenant: **não aplicável** — endpoint existente já escopado por
      `current_user.terminal_id` do JWT (role `kiosk`), esta história não introduz nem altera
      superfície de acesso entre empresas
- [x] Cenários de regressão (PayGo, mock, token MP inválido — todos inalterados)
- [x] Cenários aprovados pelo PM

**Tech Explorer (Backend)**
- [x] Serviços impactados documentados (payment-service apenas)
- [x] Endpoint documentado (nenhum novo — contrato de `POST /payments/test-connection` inalterado)
- [x] Migrations descritas (nenhuma)
- [x] Eventos de fila (nenhum aplicável)
- [x] Estimativa de esforço definida (3 pontos, só backend)
- [x] Riscos identificados com mitigação (latência adicional dentro do timeout existente,
      clareza das mensagens de erro)
- [x] Correção de suposição incorreta do Explorer documentada (não existe campo "método aceita
      cartão" — condição real é presença de `mp_device_id`)

**Aprovação final**
- [x] Time (usuário) revisou e aprovou a solução técnica — "aprovar" (2026-09-01)
- [x] Estimativa acordada (3 pontos)
- [x] Sem bloqueios não resolvidos
- [x] Priorização aprovada para implementação imediata

**Status: Ready** — apta para implementação.

---

## Done

Implementado em `feature/ord-149-validar-modo-pdv-totem`, PR [#116](https://github.com/harryjanz/ordin/pull/116), mergeado em `main` (2026-09-01). 10 testes novos (6 no nível de provider, 4 no nível de endpoint, incluindo teste de regressão com config "envenenada" provando o roteamento correto de `terminal_ref`). Suíte completa do payment-service: 126/126 passando.

**Status: Done.**
