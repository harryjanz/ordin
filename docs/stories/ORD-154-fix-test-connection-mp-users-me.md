---
id: ORD-154
status: Done
estimativa: 1 ponto (backend only)
tipo: bugfix
fase: 6
sprint: null
responsavel: Backend SR
---

# ORD-154 — Corrigir teste de conexão Mercado Pago (falso negativo em /v1/users/me)

## Descrição
`POST /payments/test-connection` reporta "Access token inválido (HTTP 404)" para terminais
Mercado Pago mesmo quando o token e o terminal estão 100% funcionais. Causa confirmada:
`MercadoPagoProvider.test_connection()` (`services/payment/infrastructure/providers/mercadopago.py:326`)
chama `GET /v1/users/me` como checagem inicial de validade do token — mas esse endpoint não é
acessível por credenciais tipo Application/POS (`APP_USR-...`, usadas na integração Point/PDV),
só por token de usuário pessoal via OAuth. A checagem correta (`GET /terminals/v1/list`) já
existe logo depois no mesmo método, mas nunca é alcançada porque a checagem errada falha antes
e retorna cedo.

## Persona
Admin da empresa (durante o setup do totem) e cliente no totem (fluxo de pareamento) — ambos
travam na etapa "Falha na conexão" sem conseguir prosseguir, mesmo com tudo configurado certo.

## Contexto
Bloqueava o piloto presencial da Burger House desde pelo menos o QA do `ORD-150` — tinha sido
registrado como "token de produção inválido" (pendência de configuração), mas investigação em
2026-09-03 provou que é bug de código, não de credencial: testei os dois endpoints do Mercado
Pago direto (fora da aplicação) com o token real da config ativa
(`company_payment_configs.id=321`) — `/v1/users/me` retorna 404 "resource not found",
`/terminals/v1/list` retorna 200 com o terminal em `operating_mode: "PDV"`, funcionando
perfeitamente. Achado ao investigar junto com o usuário, que notou a inconsistência entre essa
tela falhar e a tela de Empresa > Terminais carregar o MP Device ID normalmente com a mesma
credencial.

## Explorer

### História
Como admin da empresa (durante o setup do totem) e como cliente no totem (fluxo de pareamento),
quero que o teste de conexão com o Mercado Pago reflita o estado real do token e do terminal,
para não travar num "Falha na conexão" falso quando tudo está configurado corretamente.

### Contexto e motivação
O piloto presencial da Burger House está bloqueado desde o QA do ORD-150 por um falso negativo:
`test_connection()` chama `GET /v1/users/me` como primeira checagem de validade do token, mas
esse endpoint só aceita token de usuário pessoal via OAuth — não aceita credenciais tipo
Application/POS (`APP_USR-...`), que são exatamente o tipo usado na integração Point/PDV deste
projeto. Como a checagem erra o tipo de endpoint (não o token em si), o código retorna erro antes
de alcançar a checagem certa (`GET /terminals/v1/list`), que já existe e já funciona. O fix é
puramente de backend: ajustar `MercadoPagoProvider.test_connection()` para não depender de um
endpoint incompatível com o tipo de credencial usado.

### Fluxo principal
1. Admin (ou totem, no pareamento) aciona `POST /payments/test-connection` pro terminal da
   empresa.
2. `test_connection()` valida o token fazendo a chamada que já é compatível com credencial
   Application/POS: `GET /terminals/v1/list`.
3. Se `terminal_ref` (mp_device_id) não estiver configurado: reporta sucesso genérico ("MP
   conectado") sem tentar buscar terminal específico — mesmo comportamento atual pra esse caso,
   só que sem depender do `/v1/users/me` pra chegar lá.
4. Se `terminal_ref` estiver configurado: busca a lista de terminais, localiza o `device` pelo
   id, confere `operating_mode == "PDV"` — fluxo já existente, inalterado.
5. Resultado (`success`/`detail`) volta pro admin ou pro totem, refletindo o estado real.

### Fluxos alternativos / exceções
- Token realmente inválido/expirado → `/terminals/v1/list` retorna 401 → `success: false`,
  detail deve continuar comunicável ("Access token inválido"), sem regressão de mensagem.
- Terminal configurado mas não encontrado na conta MP → mantém comportamento atual (`success:
  false`, "Terminal não encontrado...").
- Terminal encontrado mas fora do modo PDV → mantém comportamento atual.
- Erro de rede/timeout ao chamar MP → mantém comportamento atual (`success: false`, "Erro ao
  conectar ao MP").
- Nenhum `mp_device_id` configurado ainda → precisa decidir, no Tech Explorer, que chamada
  mínima ainda valida o token nesse caso sem usar `/v1/users/me` (provavelmente a própria
  `/terminals/v1/list`, que não exige `terminal_ref` pra ser chamada — só pra filtrar o device
  específico).

### Dependências
- Serviços envolvidos: `payment` (único serviço tocado — mudança isolada em
  `infrastructure/providers/mercadopago.py`).
- Não depende de `company` nem `catalog`; não bloqueia nem é bloqueado pelo ORD-153 (imagem de
  combo), que segue em paralelo.
- Histórias bloqueantes: nenhuma.

### Critérios de aceite funcionais
- [x] `test_connection()` não chama mais `GET /v1/users/me`.
- [x] Com o token real de produção da Burger House (Application/POS), `test-connection` reporta
      sucesso quando terminal existe e está em modo PDV — validado contra a API real do MP, não
      só em mock.
- [x] Token realmente inválido continua sendo reportado como falha, com mensagem clara.
- [x] Terminal não encontrado / fora de modo PDV continuam sendo reportados como falha, sem
      regressão de mensagem.
- [x] Setup sem `mp_device_id` configurado continua reportando sucesso genérico.
- [x] Totem consegue completar o pareamento MP da Burger House sem o 404 falso.

## Validação

- Suíte automatizada do `payment-service`: 126 passed (incluindo 22 testes cobrindo
  `test_connection`/provider MP, reescritos para o novo fluxo).
- `ruff`/`mypy` em `mercadopago.py`: mesma contagem de achados pré-existentes antes e depois do
  fix (11 `BLE001`, 1 erro de tipo em linha não tocada) — nenhuma dívida nova.
- Validação manual contra a API real do Mercado Pago (2026-09-03): PIN login do totem (Burger
  House, terminal 1, provider `mercadopago`) → tela "Máquina OK! MP conectado (terminal em modo
  PDV)" → catálogo carregado normalmente, sem 404. Print em
  `docs/stories/ORD-154/evidencias/manual/totem-combos-com-imagem-pos-fix.png` (mostra o totem já
  no catálogo pós-pareamento — a mesma correção também destravou a verificação visual pendente do
  ORD-153).

### Wireframe / Mockup
N/A — mudança de backend, sem alteração de UI (mensagens de erro/sucesso já existentes no
frontend continuam sendo consumidas do mesmo jeito).

## QA Explorer

```gherkin
Feature: Teste de conexão com Mercado Pago sem falso negativo
  Como admin da empresa (ou totem, no fluxo de pareamento)
  Quero que POST /payments/test-connection reflita o estado real do token e do terminal MP
  Para não travar num "Falha na conexão" quando tudo está configurado corretamente

  Background:
    Dado uma empresa com CompanyPaymentConfig ativo, provider "mercadopago", token válido tipo
    Application/POS

  Scenario: Token válido e terminal configurado em modo PDV — sucesso
    Dado um terminal com mp_device_id configurado
    E esse device existe na conta Mercado Pago com operating_mode "PDV"
    Quando o admin aciona POST /payments/test-connection para esse terminal
    Então a resposta é success: true
    E test_connection() nunca chama GET /v1/users/me
    E test_connection() chama GET /terminals/v1/list para validar o token

  Scenario: Terminal sem mp_device_id configurado — sucesso genérico
    Dado um terminal sem mp_device_id configurado
    E o token da empresa é válido
    Quando o admin aciona POST /payments/test-connection para esse terminal
    Então a resposta é success: true com mensagem genérica de conexão OK
    E test_connection() não tenta buscar um device específico

  Scenario: Token realmente inválido ou expirado
    Dado um token Mercado Pago inválido ou expirado na config da empresa
    Quando o admin aciona POST /payments/test-connection
    Então GET /terminals/v1/list retorna 401
    E a resposta é success: false com mensagem indicando token inválido

  Scenario: Terminal configurado mas não encontrado na conta Mercado Pago
    Dado um terminal com mp_device_id configurado
    E esse device NÃO existe na lista retornada por GET /terminals/v1/list
    Quando o admin aciona POST /payments/test-connection para esse terminal
    Então a resposta é success: false
    E a mensagem orienta a conferir o MP Device ID em Empresa > Terminais

  Scenario: Terminal encontrado mas fora do modo PDV
    Dado um terminal com mp_device_id configurado
    E esse device existe na conta Mercado Pago com operating_mode diferente de "PDV"
    Quando o admin aciona POST /payments/test-connection para esse terminal
    Então a resposta é success: false
    E a mensagem indica que o terminal está fora do modo PDV

  Scenario: Erro de rede ou timeout ao consultar o Mercado Pago
    Dado uma falha de rede ou timeout na chamada a GET /terminals/v1/list
    Quando o admin aciona POST /payments/test-connection
    Então a resposta é success: false com mensagem de erro de conexão ao MP
    E nenhuma exceção não tratada vaza pro chamador

  Scenario: Isolamento multi-tenant (comportamento pré-existente, sem regressão)
    Dado a empresa A autenticada via JWT
    E um terminal pertencente à empresa B
    Quando a empresa A aciona POST /payments/test-connection informando o terminal da empresa B
    Então a resposta é 403 ou 404, sem revelar dados de configuração da empresa B
    E este comportamento não muda com o fix — company_id do JWT já isola a busca da config
```

**Cenários revisados e aprovados pelo PM:** sim — cobrem o happy path (token+terminal válidos),
os quatro caminhos de falha já existentes (token inválido, terminal não encontrado, fora de modo
PDV, erro de rede), a borda de terminal não configurado, e o isolamento multi-tenant como
regressão a não quebrar. Nenhum cenário novo de negócio é introduzido — o fix é estritamente
corretivo sobre comportamento já mapeado.

## Solução Técnica

### Serviços impactados
- `payment`: único serviço tocado. Mudança isolada em
  `infrastructure/providers/mercadopago.py`, método `MercadoPagoProvider.test_connection()`
  (linhas 323-373). Nenhuma mudança em `main.py` (endpoint `POST /payments/test-connection`
  continua chamando o provider do mesmo jeito) nem em schemas de request/response.

### Endpoints
Nenhum endpoint novo ou com contrato alterado. `POST /payments/test-connection` mantém a mesma
assinatura (`terminal_id` no path/body, JWT obrigatório, `company_id` do JWT) e o mesmo formato
de resposta (`{success: bool, detail: str}`) — só a lógica interna do provider muda.

### Mudança de implementação
Unificar as duas checagens num único ponto de verdade: usar `GET /terminals/v1/list` tanto para
validar o token quanto para localizar o terminal, eliminando de vez a chamada a
`GET /v1/users/me`.

```python
async def test_connection(self, terminal_ref: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            terminals_resp = await client.get(
                f"{self.BASE_URL}/terminals/v1/list",
                headers=self._headers,
            )
        except Exception as exc:
            return {"success": False, "detail": f"Erro ao conectar ao MP: {exc}"}

        if terminals_resp.status_code != 200:
            return {
                "success": False,
                "detail": f"Access token inválido (HTTP {terminals_resp.status_code})",
            }

        terminals = terminals_resp.json().get("data", {}).get("terminals", [])

        if not terminal_ref:
            # Sem mp_device_id configurado ainda (ou terminal só usa PIX) —
            # token já validado acima, nada mais a checar. Ver ORD-149.
            return {"success": True, "detail": "MP conectado"}

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

        return {"success": True, "detail": "MP conectado (terminal em modo PDV)"}
```

**Decisão de produto embutida:** a mensagem de sucesso perde o label de e-mail do usuário (ex.
"MP conectado: joao@burgerhouse.com") porque `/terminals/v1/list` não retorna esse dado — só
`/v1/users/me` retornava, e é exatamente o endpoint incompatível com o tipo de credencial usado.
Mensagem passa a ser só "MP conectado" / "MP conectado (terminal em modo PDV)". Nenhum teste ou
tela depende do e-mail no texto (confirmado por busca em `frontend/`), então é uma perda
cosmética aceitável — não vale manter uma segunda chamada HTTP só pra exibir um e-mail.

### Migrations
Nenhuma — mudança de lógica pura, sem alteração de schema.

### Eventos de fila
Nenhum — `test_connection()` é síncrono, chamado sob demanda, sem publicar nem consumir evento.

### Impacto em outros serviços
Nenhum. `company-service` e `order-service` não chamam `test_connection()` nem dependem do seu
retorno; o único consumidor é o próprio endpoint `POST /payments/test-connection` no
`payment-service`, usado pelo admin (tela de terminais) e pelo totem (fluxo de pareamento).

### Estimativa
- Backend: 1 ponto (troca pontual de uma chamada HTTP por outra já implementada no mesmo
  método, ajuste de 2 mensagens, sem mudança de schema/contrato).
- Frontend: 0 — nenhuma mudança de contrato de resposta.
- Testes: incluídos na estimativa de backend (ajustar/criar testes unitários do provider com
  `respx`/mock de `httpx`, cobrindo os 7 cenários do QA Explorer).

### Riscos
- **Perda do label de e-mail na mensagem de sucesso** — mitigado: nenhuma tela ou teste depende
  desse texto especificamente, só do `success: bool`.
- **Comportamento de `/terminals/v1/list` sob credencial só-PIX** (empresa configurada só pra
  Pix, sem Point/PDV) não foi verificado diretamente contra a API real — se esse tipo de
  credencial não tiver acesso ao endpoint de terminais, o caminho "sem `terminal_ref`" quebraria.
  Mitigação: testar contra a API real do MP com uma credencial só-Pix antes de mergear, ou, se
  não houver credencial de teste disponível, envolver o e-mail de sucesso em try/except que trata
  403/404 nesse endpoint como "token válido, sem terminal" em vez de erro — decisão a confirmar
  na implementação.
- **Regressão silenciosa**: como o bug atual mascarava o `test_connection()` real há tempo
  (desde o QA do ORD-150), vale rodar o teste manual contra o token real de produção da Burger
  House antes de considerar a história fechada, não só contra mock — já é um critério de aceite
  funcional.
