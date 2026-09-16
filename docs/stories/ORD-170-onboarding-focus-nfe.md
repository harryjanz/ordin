---
id: ORD-170
status: Ready
estimativa: 5 pontos (3,5 backend + 1,5 frontend)
fase: null
sprint: null
responsavel: Backend SR + Frontend
---

# ORD-170 — Onboarding da empresa na Focus NFe (`POST /empresas`)

## Descrição
Terceira história do épico de emissão fiscal NFC-e. Consome os dados já cadastrados pela ORD-168
(razão social/IE/regime/endereço já existentes em `Company`, certificado e CSC novos da própria
ORD-168) e faz a chamada real que registra a empresa cliente como emitente na Focus NFe,
guardando os tokens por empresa que ela devolve.

**Esta história esbarra no bloqueio confirmado em `docs/estudo-nfce.md` §7.1**: `POST /empresas`
com certificado anexado provavelmente valida se o certificado pertence ao CNPJ informado (erro
422 documentado: "Certificado não pertence ao CNPJ informado") — algo que só um certificado A1
real, emitido pro CNPJ real da empresa, passa. **Pode ser implementada e ficar Ready agora**
(upstream é documentação, não teste ao vivo), mas a validação de ponta a ponta em QA/produção
continua dependendo de um cliente-piloto real com certificado A1 válido — mesma pendência já
registrada, não nova.

## Persona
**Superadmin/Admin da plataforma Ordin** — mesma persona da ORD-168, mesma aba "Fiscal" — é uma
ação seguinte no mesmo fluxo de onboarding assistido, não uma tela nova.

## Contexto
Achados ao vivo desta sessão (`docs/estudo-nfce.md` §7.1, testado com chave de API real):
- `POST /empresas` só existe no host de **produção** (`api.focusnfe.com.br`) — mesmo pra gerar o
  token de homologação de uma empresa. Usa o **token principal/master da conta Ordin na Focus
  NFe** como credencial (Basic Auth), não um token por empresa (que só existe depois desta
  chamada).
- Resposta traz **`token_producao` e `token_homologacao` juntos**, mais `id` (identificador da
  empresa na Focus NFe) e `client_app_id`, tudo numa única chamada.
- Cadastro sem certificado passa (`dry_run` e real) — a validação forte de identidade real
  acontece adiante (emissão, história 4) ou, com certificado anexado, na checagem
  certificado×CNPJ documentada.
- `cpf` ou `cnpj` é exigido (pelo menos um) — Ordin usa sempre `cnpj` (campo já existente em
  `Company.document`), CPF/MEI-pessoa-física como emitente fica fora de escopo (nenhuma empresa
  cliente do Ordin hoje é pessoa física).

## Explorer

### História
Como **integrante do time Ordin**, quero enviar os dados fiscais já cadastrados de uma empresa
pra Focus NFe e guardar os tokens que ela devolve, para que essa empresa esteja pronta pra
emissão de NFC-e (história 4) sem precisar repetir cadastro manual lá.

### Fluxo principal
1. Na aba "Fiscal" (`CompanyScreen.tsx`, mesma da ORD-168), quando os campos obrigatórios já
   estão completos (razão social, IE, regime, endereço, certificado, CSC produção e homologação),
   aparece um botão **"Cadastrar na Focus NFe"** — ausente/desabilitado enquanto incompleto.
2. Admin clica — backend monta o payload do `POST /empresas` a partir de `Company` +
   `CompanyFiscalConfig` (decripta certificado/senha/CSC só nesse momento, em memória, nunca
   loga em texto puro), chama a API real (host de produção, token master da conta Ordin).
3. **Sucesso**: resposta traz `id`, `client_app_id`, `token_producao`, `token_homologacao` — os
   4 valores são criptografados e persistidos em `CompanyFiscalConfig`. Status muda pra
   "Cadastrado na Focus NFe" com a data/hora.
4. **Erro**: resposta de erro da Focus NFe (400/401/403/422) é exibida de forma legível pro
   admin — mapeando os códigos já conhecidos (`requisicao_invalida`, `erro_validacao`,
   `permissao_negada`) pra mensagens em português, sem expor o payload bruto enviado.
5. Uma vez cadastrada (passo 3), o botão vira **"Reenviar cadastro"** — reenvia com os dados
   atuais (útil se algo mudou, ex. endereço) — comportamento exato de "criar de novo vs.
   atualizar" na Focus NFe é **pendência levantada nesta história**, ver abaixo.

### Pendência resolvida com teste real (2026-09-15)
`POST /empresas` chamado de novo pro mesmo CPF/CNPJ faz **upsert**, não cria duplicata — testado
ao vivo: reenviado o cadastro de teste (mesmo CPF, endereço alterado), a resposta voltou com o
**mesmo `id`**, o campo de endereço **atualizado de verdade**, e — o mais importante — os
**`token_producao`/`token_homologacao` retornados foram exatamente os mesmos de antes**. Ou
seja: "Reenviar cadastro" pode ser implementado como um `POST` simples de novo (mesmo endpoint,
mesmo payload reconstruído a partir do estado atual de `Company`/`CompanyFiscalConfig`), sem
risco de duplicar a empresa na Focus NFe nem de invalidar tokens já emitidos e eventualmente já
em uso (história 4). Não existe mecanismo de "criar vs. atualizar" a decidir — é sempre o mesmo
`POST /empresas`.

### Fluxos alternativos / exceções
- **Campos obrigatórios incompletos**: botão "Cadastrar na Focus NFe" fica desabilitado, com
  texto explicando o que falta (reaproveita o indicador "completo" já calculado na ORD-168).
- **Erro de validação de endereço** (ex. município inválido) — mesmo formato de erro já mapeado
  ao vivo (`erro_validacao`), exibido campo a campo quando a API retorna múltiplos erros na lista
  `erros[]` (confirmado no teste real — a resposta pode trazer mais de um erro na mesma chamada).
- **Certificado não pertence ao CNPJ**: erro 422 específico, mensagem clara indicando que o
  certificado enviado não bate com o CNPJ da empresa — orienta o admin a verificar o arquivo.

### Dependências
- **company-service**: novo cliente HTTP pra Focus NFe (biblioteca já disponível no
  `requirements.txt` compartilhado, ex. `httpx`, já usado nos testes), novo endpoint interno de
  onboarding, colunas novas em `CompanyFiscalConfig`.
- **Infraestrutura**: variável de ambiente nova `FOCUS_NFE_MASTER_TOKEN` (token principal da
  conta Ordin na Focus NFe — **segredo de plataforma, não de empresa cliente**, mesmo padrão de
  `QR_SECRET`/`INTERNAL_SECRET`, via `require_env()`).
- **Histórias bloqueantes**: ORD-168 (Ready) — precisa dos campos completos pra montar o payload.
- **Histórias que dependem desta**: história 4 (emissão) usa o `token_homologacao`/
  `token_producao` guardados aqui.

### Critérios de aceite funcionais
- [ ] Botão "Cadastrar na Focus NFe" só habilita quando os campos obrigatórios estão completos
- [ ] Cadastro bem-sucedido guarda `id`, `client_app_id`, `token_producao`, `token_homologacao`
      criptografados, e mostra status "Cadastrado na Focus NFe" com data
- [ ] Erros da Focus NFe são exibidos em português, mapeando os códigos conhecidos
- [ ] Tokens nunca retornam em texto puro numa resposta de leitura do Ordin
- [ ] `owner`/`manager` não acessam essa ação (mesmo gate da ORD-168)

### Wireframe / Mockup
**Faltando** — extensão pequena da aba "Fiscal" já desenhada na ORD-168 (botão + área de
status/erro), risco baixo de seguir sem wireframe à parte.

## QA Explorer

### Sobre isolamento multi-tenant e controle de acesso
Mesmo padrão da ORD-168 — `company_id` isola automaticamente, controle real é por role de
plataforma (`superadmin`/`admin`), não por tenant.

### Cenários Gherkin

```gherkin
Feature: Onboarding da empresa na Focus NFe
  Como integrante do time Ordin
  Quero enviar os dados fiscais de uma empresa pra Focus NFe
  Para que ela fique pronta pra emissão de NFC-e

  Background:
    Dado que o usuário está autenticado com role "superadmin" ou "admin"
    E existe uma empresa "Burger House" com dados fiscais completos (ORD-168)

  # --- Happy path ---

  Scenario: Cadastrar empresa com sucesso na Focus NFe
    Quando o usuário clica em "Cadastrar na Focus NFe"
    E a Focus NFe responde com sucesso (id, client_app_id, token_producao, token_homologacao)
    Então os 4 valores são persistidos criptografados
    E o status muda para "Cadastrado na Focus NFe" com data/hora
    E o botão muda para "Reenviar cadastro"

  # --- Bordas ---

  Scenario: Botão desabilitado com dados fiscais incompletos
    Dado uma empresa "Pasta & Co" sem CSC de homologação cadastrado
    Quando o usuário abre a aba "Fiscal" dessa empresa
    Então o botão "Cadastrar na Focus NFe" aparece desabilitado
    E um texto indica o que falta

  Scenario: Focus NFe retorna múltiplos erros de validação numa única chamada
    Quando o usuário clica em "Cadastrar na Focus NFe" com endereço incompleto
    E a Focus NFe responde com erro_validacao contendo 2 itens em "erros[]"
    Então os 2 erros são exibidos de forma legível, não só o primeiro

  # --- Erros / controle de acesso ---

  Scenario: Certificado não pertence ao CNPJ
    Quando o usuário clica em "Cadastrar na Focus NFe"
    E a Focus NFe responde 422 "Certificado não pertence ao CNPJ informado"
    Então a mensagem é exibida de forma clara, orientando a revisar o arquivo do certificado

  Scenario: Owner não acessa a ação de cadastro na Focus NFe
    Dado um usuário autenticado com role "owner" da empresa "Burger House"
    Quando esse usuário tenta acionar o endpoint de onboarding via API direta
    Então o sistema retorna 403

  Scenario: Tokens nunca aparecem em texto puro numa leitura
    Dado uma empresa já cadastrada na Focus NFe
    Quando o admin consulta o detalhe fiscal dessa empresa
    Então os tokens não aparecem em texto puro, só o indicador de status "cadastrado"
```

### Critérios de aceite testáveis
- [ ] Botão habilita/desabilita corretamente conforme completude dos dados
- [ ] Cadastro bem-sucedido persiste os 4 valores criptografados e atualiza o status
- [ ] Múltiplos erros de validação são todos exibidos, não só o primeiro
- [ ] Erro de certificado×CNPJ é exibido com mensagem orientativa
- [ ] `owner`/`manager` recebem 403 na ação de onboarding
- [ ] Tokens nunca aparecem em texto puro numa resposta de leitura

### O que ainda impede o avanço pro Tech Explorer
Nada bloqueante. Comportamento de reenvio já confirmado com teste real (acima) — upsert por
CPF/CNPJ, mesmo `id`, mesmos tokens.

## Tech Explorer

### Serviços impactados
- **company-service**: cliente HTTP pra `api.focusnfe.com.br/v2/empresas`, endpoint novo
  `POST /companies/{id}/fiscal-config/focus-nfe-onboarding`, colunas novas em
  `CompanyFiscalConfig`.
- **Infraestrutura**: `FOCUS_NFE_MASTER_TOKEN` como env var nova, lida via `require_env()`
  (`services/shared/config.py`).
- **frontend/admin**: `FiscalTab` (ORD-168) ganha botão + área de status/erro.

### Modelo de dados (extensão de `CompanyFiscalConfig`, ORD-168)
```python
    # ORD-170 — colunas novas na mesma tabela da ORD-168:
    focus_nfe_empresa_id = Column(Integer, nullable=True)
    focus_nfe_client_app_id = Column(Integer, nullable=True)
    token_producao_enc = Column(String(512), nullable=True)
    token_homologacao_enc = Column(String(512), nullable=True)
    focus_nfe_cadastrado_em = Column(DateTime, nullable=True)
    # Achado de 2026-09-15 (teste ao vivo contra a API real): a resposta do
    # POST /empresas já traz certificado_valido_ate/certificado_valido_de —
    # a Focus NFe extrai isso do X.509 no momento do cadastro. Capturado
    # aqui pra virar pré-requisito de dado da ORD-176 (monitoramento de
    # validade), sem precisar parsear o certificado localmente.
    certificado_valido_de = Column(DateTime, nullable=True)
    certificado_valido_ate = Column(DateTime, nullable=True)
```

### Endpoint novo

#### `POST /companies/{company_id}/fiscal-config/focus-nfe-onboarding`
**Auth:** JWT · role `superadmin`/`admin` (`_require_platform_admin`)

Sem payload no corpo — monta tudo a partir dos dados já persistidos. Internamente:
1. Carrega `Company` (`legal_name`, `document`/CNPJ, `state_registration`, endereço,
   `tax_regime` mapeado via `FOCUS_NFE_REGIME_MAP`, ORD-168) + `CompanyFiscalConfig` (decripta
   certificado/senha/CSC).
2. Monta o payload do `POST /empresas` da Focus NFe (campos documentados em
   `docs/estudo-nfce.md` §7), chama com `Basic Auth (FOCUS_NFE_MASTER_TOKEN, "")` contra
   `https://api.focusnfe.com.br/v2/empresas` (produção — confirmado que é o único host que serve
   este endpoint, mesmo pra gerar token de homologação).
3. Sucesso (201): persiste `id`→`focus_nfe_empresa_id`, `client_app_id`, `token_producao`
   (criptografado), `token_homologacao` (criptografado), `focus_nfe_cadastrado_em = now()`, e
   **`certificado_valido_de`/`certificado_valido_ate`** (vêm prontos na resposta, sem
   processamento local — pré-requisito de dado da ORD-176).
4. Erro (4xx): repassa `codigo`/`mensagem`/`erros[]` da Focus NFe pro frontend, sem persistir
   nada, sem logar o payload enviado (contém dado sensível decriptado em memória).

Response 200 (sucesso):
```json
{
  "cadastrado": true,
  "focus_nfe_cadastrado_em": "2026-09-15T15:00:00Z"
}
```
Response 422 (erro da Focus NFe repassado):
```json
{
  "codigo": "erro_validacao",
  "mensagem": "Erro de validação",
  "erros": [{ "mensagem": "Certificado não pertence ao CNPJ informado" }]
}
```

`GET /companies/{company_id}/fiscal-config` (ORD-168) ganha os campos derivados
`focus_nfe_cadastrado` (bool) e `focus_nfe_cadastrado_em`, mesmo padrão de nunca expor os tokens
em texto puro.

### Mudança no frontend
`FiscalTab`: botão condicional — "Cadastrar na Focus NFe" (desabilitado se `completo=false`) →
após sucesso, "Reenviar cadastro" + selo de status com a data. Erros exibidos num `Alert` do
design-system, iterando `erros[]` quando presente.

### Migrations
Uma: adiciona as 5 colunas novas em `company_fiscal_configs` (mesma tabela da ORD-168) —
se a ORD-168 ainda não tiver sido implementada/migrada quando esta for, as duas migrations podem
ser squashadas numa só; se a ORD-168 já estiver em produção, é uma migration aditiva separada.

### Eventos de fila
Nenhum.

### Impacto em outros serviços
Nenhum direto. História 4 vai consumir `token_homologacao`/`token_producao` guardados aqui via
um endpoint interno a ser desenhado na própria história 4 (mesmo padrão de
`internal_get_payment_config`).

### Estimativa
- Backend: **~3,5 pontos** — cliente HTTP externo real (com tratamento de erro de rede/timeout,
  não só happy path), mapeamento de regime, endpoint novo, 5 colunas novas + migration, variável
  de ambiente nova documentada em `.env.example`.
- Frontend: **~1,5 ponto** — botão + estado de erro/sucesso na aba já existente.
- **Total: ~5 pontos.**

### Riscos
1. **Chamada de rede real e síncrona num endpoint de admin** — precisa de timeout explícito e
   tratamento de erro de conectividade (Focus NFe fora do ar), não só erros 4xx — mesmo cuidado
   já aplicado a outras integrações externas do payment-service.
2. **Token master de conta é segredo de altíssimo impacto** (cadastra empresas na conta real da
   Focus NFe) — só deve estar acessível a este endpoint específico, nunca logado, nunca
   retornado em nenhuma resposta.

### O que ainda impede o avanço pro Ready
Nada bloqueante.

## Ready

**Explorer:** [x] história Como/quero/para · [x] contexto com achados ao vivo da sessão · [x]
fluxo principal (5 passos) · [x] comportamento de reenvio confirmado com teste real (upsert,
mesmo id, mesmos tokens) · [x] dependências (bloqueada por ORD-168, bloqueia história 4) · [ ]
wireframe — não produzido, risco baixo (extensão pequena da ORD-168) · [x] critérios de aceite
funcionais.

**QA Explorer:** [x] happy path (cadastro com sucesso) · [x] bordas (botão desabilitado,
múltiplos erros de validação) · [x] erros/controle de acesso (certificado×CNPJ, owner 403, tokens
nunca em texto puro) · [x] cenários aprovados.

**Tech Explorer:** [x] serviços impactados · [x] modelo de dados (extensão da ORD-168) · [x]
endpoint com payload completo e mapeamento de erro · [x] variável de ambiente nova documentada
(`FOCUS_NFE_MASTER_TOKEN`) · [x] migrations · [x] eventos de fila — nenhum · [x] estimativa (5
pontos) · [x] riscos com mitigação, incluindo o de rede real/timeout.

**Aprovação final:** [x] solução técnica revisada · [x] estimativa 5 pontos · [x] sem bloqueios
não resolvidos · [ ] sprint
específico — não atribuída ainda.

**Status: Ready.** Implementação pode começar, mas **validação de ponta a ponta (QA de verdade)
continua dependendo do cliente-piloto real com certificado A1 válido** — mesma pendência já
registrada em `docs/estudo-nfce.md`, não nova desta história.

## Implementação

Backend (`services/company/main.py`): 7 colunas novas em `CompanyFiscalConfig` (`focus_nfe_empresa_id`,
`focus_nfe_client_app_id`, `token_producao_enc`, `token_homologacao_enc`, `focus_nfe_cadastrado_em`,
`certificado_valido_de`, `certificado_valido_ate`), `FOCUS_NFE_REGIME_MAP` (mapeia
`tax_regime` do Ordin pro inteiro que a Focus NFe espera — `lucro_presumido`/`lucro_real` caem
os dois em "3 — Normal"), `_fiscal_config_completo()` extraído como helper único (usado tanto na
resposta de leitura quanto como gate do onboarding, pra nunca divergir "botão habilitado" de
"backend aceita a chamada"), endpoint `POST /companies/{id}/fiscal-config/focus-nfe-onboarding`
(monta o payload a partir de `Company`+`CompanyFiscalConfig`, decripta em memória, chama a Focus
NFe real com `httpx` + Basic Auth do token master, repassa erro 4xx como 422 com o corpo original
da Focus NFe). `FOCUS_NFE_MASTER_TOKEN` como env var obrigatória (`require_env`), documentada em
`.env.example`, `docker-compose.yml` e `CLAUDE.md`; placeholder adicionado em `.env` local (sem o
token real, `POST /empresas` retorna 401 — comportamento esperado, confirmado no teste ao vivo
abaixo). Migration `20260916_0900_focus_nfe_onboarding.py`. 9 testes novos
(`test_ord170_onboarding_focus_nfe.py`), mockando a chamada à Focus NFe via `respx` (nunca bate
na rede em teste) — cobrem sucesso, reenvio (mesmo POST, `call_count == 2`), dados incompletos,
múltiplos erros em `erros[]`, certificado×CNPJ, timeout/erro de conectividade (502), controle de
acesso (owner 403) e tokens nunca em texto puro. Suíte completa do company-service: 438 passou.
Ruff limpo.

Frontend (`CompanyScreen.tsx`): novo painel "Focus NFe" na `FiscalTab`, com `Tag` de status (data
formatada quando já cadastrado) e botão condicional "Cadastrar na Focus NFe"/"Reenviar cadastro"
(desabilitado com hint textual quando `completo=false`). `parseFocusNfeError()` local (não
reaproveita `parseApiError` genérico — o formato de erro repassado da Focus NFe,
`{codigo, mensagem, erros[]}`, é diferente do formato padrão do FastAPI/Pydantic que aquele
parser trata) junta `mensagem` + todos os itens de `erros[]` numa única string legível. `tsc`,
`build` e `vitest` limpos (48 testes).

**Testado ao vivo, ponta a ponta**: rebuild completo dos containers `admin` e `company-service`
(o `company-service` estava sendo só hot-patchado via `docker compose cp` + `restart` nas
histórias anteriores da sessão — isso deixou a imagem baked desatualizada, sem as migrations do
próprio épico; precisou de `docker compose build company-service` de verdade pra pegar a cadeia
de migrations completa). Certificado/CSC da Burger House seedados via chamada direta à API (o
Upload do design-system valida por MIME real do arquivo — um `.pfx` fake gerado com bytes
aleatórios não tem magic bytes de PKCS#12 e foi rejeitado no browser, mesmo risco já registrado
na ORD-168; contornado testando o backend diretamente, não é regressão). Com os dados completos,
cliquei em "Cadastrar na Focus NFe": a chamada bateu de verdade em `api.focusnfe.com.br` (não
mockada) e voltou `401 "Access token inválido (host: api.focusnfe.com.br)"` — esperado, já que o
`.env` local só tem um placeholder, não o token master real. O erro foi repassado e exibido de
forma legível na tela, sem persistir nada (status continuou "Ainda não cadastrado"), confirmando
o fluxo de erro de ponta a ponta. Validação com sucesso real (cadastro de verdade na Focus NFe)
continua dependendo do cliente-piloto com certificado A1 válido, como já esperado desde o
Explorer.
