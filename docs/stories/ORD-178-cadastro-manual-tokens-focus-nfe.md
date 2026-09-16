---
id: ORD-178
status: Ready
estimativa: 3 pontos (2 backend + 1 frontend)
fase: null
sprint: null
responsavel: Backend SR + Frontend
---

# ORD-178 — Cadastro manual de tokens já existentes na Focus NFe

## Descrição
Ajuste à história 3 do épico fiscal (ORD-170 — onboarding automatizado via `POST /empresas`).
Achado ao vivo (2026-09-16, durante teste da ORD-171): nem toda empresa emissora nasce pelo fluxo
que o Ordin controla. O usuário criou manualmente, direto no painel web da Focus NFe, uma empresa
de teste como **pessoa física** (seu próprio CPF) só pra obter tokens de homologação/produção
reais sem precisar de um certificado A1 de CNPJ — atalho de validação técnica antes de existir um
cliente-piloto de verdade. Essa empresa já tem tokens gerados pela Focus NFe, mas o Ordin **não
tem nenhuma via de aproveitar um token que já existe** — só sabe gerar tokens novos chamando
`POST /empresas`.

**Não é bug do que já foi implementado** — é uma lacuna de escopo: a ORD-170 cobriu só o caminho
"Ordin cria a empresa na Focus NFe do zero". Esta história adiciona o caminho complementar
"a empresa já existe na Focus NFe, só cole os tokens".

## Persona
**Superadmin/Admin da plataforma Ordin** — mesma persona e mesma aba "Fiscal" da ORD-168/170.

## Contexto
- `docs/estudo-nfce.md` §7 confirma que a Focus NFe aceita `cpf` **ou** `cnpj` como emitente — mas
  o Explorer da ORD-170 fechou escopo excluindo pessoa física deliberadamente: *"CPF/MEI-pessoa-
  física como emitente fica fora de escopo (nenhuma empresa cliente do Ordin hoje é pessoa
  física)"*. Essa decisão continua válida — não é objetivo desta história cadastrar clientes
  pessoa física, só reaproveitar tokens de uma empresa (de qualquer natureza) já existente na
  Focus NFe.
- Já existe precedente de dado colado manualmente sem chamada de API: **CSC de produção/
  homologação (ORD-168)** é sempre colado pelo admin, obtido no portal da SEFAZ — nunca vem de
  uma chamada automatizada. O padrão de UX (campo de texto tipo senha, upsert parcial) já existe
  e pode ser reaproveitado.
- `focus_nfe_empresa_id`/`focus_nfe_client_app_id`/`certificado_valido_de`/`certificado_valido_ate`
  (ORD-170) só existem quando a resposta vem de um `POST /empresas` de verdade — no cadastro
  manual eles ficam vazios (já são `nullable=True`, sem impacto na emissão em si). Efeito
  colateral aceito: a ORD-176 (monitoramento de validade do certificado) não vai ter
  `certificado_valido_ate` pra empresas cadastradas manualmente — registrado como fora de escopo
  aqui, decisão consciente do admin que optou pela via manual.

## Explorer

### História
Como **integrante do time Ordin**, quero colar tokens de homologação/produção que uma empresa já
tem na Focus NFe, para que ela fique pronta pra emissão sem precisar recriar o cadastro via API
(e sem exigir um certificado A1 real só pra gerar tokens de teste).

### Decisão de escopo
Duas vias de "ficar pronto pra emissão" coexistem na aba Fiscal, lado a lado:
1. **"Cadastrar na Focus NFe"** (ORD-170, já existe) — chama `POST /empresas`, Focus NFe gera
   tokens novos.
2. **"Já tenho os tokens"** (esta história, nova) — admin cola token de homologação e/ou produção
   que já existem, o Ordin só persiste.

As duas vias escrevem no mesmo lugar (`token_producao_enc`/`token_homologacao_enc` em
`CompanyFiscalConfig`) e têm o mesmo efeito prático: habilitam o toggle "Emissão de NFC-e"
(`ativo`, ORD-171), que só depende de `focus_nfe_cadastrado_em` estar preenchido — não importa a
origem. A diferença é só **de onde vieram os dados** e **o que fica faltando** (a via manual não
traz `certificado_valido_de/ate`, `focus_nfe_empresa_id`, `focus_nfe_client_app_id`).

### Fluxo principal
1. Na aba "Fiscal", ao lado do botão "Cadastrar na Focus NFe", aparece uma ação secundária,
   textualmente menos proeminente: "Já tenho os tokens".
2. Admin clica — abre um formulário simples com 2 campos tipo senha (Token de homologação / Token
   de produção), mesmo componente `PasswordField` já usado pra CSC (ORD-168).
3. Pelo menos um dos dois campos precisa vir preenchido — os dois vazios é rejeitado.
4. Ao salvar: os tokens informados são criptografados e persistidos; `focus_nfe_cadastrado_em`
   recebe a data/hora atual; um novo campo `focus_nfe_cadastro_manual=true` marca a origem.
5. O status na aba passa a mostrar "Cadastrado manualmente em DATA" — texto distinto de
   "Cadastrado em DATA" (via API), pra quem for investigar depois por que faltam
   `certificado_valido_ate`/`focus_nfe_empresa_id` entender a causa sem confusão.
6. Toggle "Emissão de NFC-e" (ORD-171) passa a habilitar normalmente, mesma regra de sempre.

### Fluxos alternativos / exceções
- **Só um token informado** (ex.: só homologação, pra testar sem produção ainda): aceito — o
  campo que não veio simplesmente não é atualizado (mesmo padrão de upsert parcial já usado em
  todo o resto do `FiscalConfigIn`).
- **Nenhum token informado**: rejeitado com mensagem clara.
- **Reenvio depois de já ter tokens (de qualquer origem)**: sobrescreve o que foi enviado — mesmo
  comportamento de "upsert parcial" já estabelecido pra CSC/certificado na ORD-168, sem
  confirmação extra (consistência com o padrão existente, não um caso novo a tratar diferente).
- **Empresa que tem tokens manuais e depois usa "Cadastrar na Focus NFe" (via API)**: o
  `POST /empresas` sobrescreve os tokens manuais com os novos gerados pela API, e
  `focus_nfe_cadastro_manual` volta a `false` — a origem mais recente sempre prevalece.

### Dependências
- **company-service**: extensão do `PUT /companies/{id}/fiscal-config` (ORD-168/170), 1 coluna
  nova em `CompanyFiscalConfig`.
- **frontend/admin**: `FiscalTab` ganha a ação secundária + modal simples.
- **Histórias bloqueantes**: ORD-170 (Ready/implementada) — mesma tabela, mesmos campos.
- **Histórias que dependem desta**: nenhuma nova — é só uma via alternativa de preencher o mesmo
  dado que a ORD-171 (emissão) e a ORD-176 (monitoramento) já consomem.

### Critérios de aceite funcionais
- [ ] Cadastro manual aceita token de homologação e/ou produção, persistidos criptografados
- [ ] Pelo menos um dos dois tokens é obrigatório — os dois vazios é rejeitado
- [ ] Após cadastro manual, `focus_nfe_cadastrado=true` (habilita o toggle `ativo` da ORD-171)
- [ ] Status distingue visualmente "cadastrado via API" de "cadastrado manualmente"
- [ ] `owner`/`manager` não acessam essa ação (mesmo gate de sempre)

## QA Explorer

### Sobre isolamento multi-tenant e controle de acesso
Mesmo padrão de sempre — `company_id` isola, controle real é por role de plataforma
(`superadmin`/`admin`).

### Cenários Gherkin

```gherkin
Feature: Cadastro manual de tokens já existentes na Focus NFe
  Como integrante do time Ordin
  Quero colar tokens que uma empresa já tem na Focus NFe
  Para que ela fique pronta pra emissão sem passar pelo onboarding automatizado

  Background:
    Dado que o usuário está autenticado com role "superadmin" ou "admin"

  # --- Happy path ---

  Scenario: Cadastrar os dois tokens manualmente
    Quando o usuário informa token de homologação e de produção
    E salva
    Então os dois tokens são persistidos criptografados
    E o status muda para "Cadastrado manualmente" com data/hora
    E o toggle de emissão passa a ficar habilitável

  Scenario: Cadastrar só o token de homologação
    Quando o usuário informa só o token de homologação
    E salva
    Então o token de homologação é persistido
    E o token de produção permanece como estava antes (upsert parcial)

  # --- Bordas ---

  Scenario: Nenhum token informado é rejeitado
    Quando o usuário tenta salvar sem preencher nenhum dos dois campos
    Então o sistema rejeita com mensagem clara

  Scenario: Reenvio sobrescreve tokens existentes
    Dado uma empresa já com tokens cadastrados (de qualquer origem)
    Quando o usuário cadastra manualmente um novo token de produção
    Então o token antigo é substituído pelo novo, sem confirmação extra

  Scenario: Cadastro via API depois de manual reverte a origem
    Dado uma empresa com tokens cadastrados manualmente
    Quando o usuário usa "Cadastrar na Focus NFe" (POST /empresas) com sucesso
    Então os tokens são substituídos pelos gerados pela API
    E o status volta a mostrar "Cadastrado" (via API), não mais "manualmente"

  # --- Erros / controle de acesso ---

  Scenario: Owner não acessa a ação de cadastro manual
    Dado um usuário autenticado com role "owner"
    Quando esse usuário tenta acionar o endpoint diretamente
    Então o sistema retorna 403

  Scenario: Tokens nunca aparecem em texto puro numa leitura
    Dado uma empresa com tokens cadastrados manualmente
    Quando o admin consulta o detalhe fiscal dessa empresa
    Então os tokens não aparecem em texto puro, só o indicador de status
```

### Critérios de aceite testáveis
- [ ] Upsert parcial: só o(s) token(s) enviado(s) muda(m)
- [ ] Dois campos vazios retorna erro de validação
- [ ] `focus_nfe_cadastro_manual` reflete corretamente a origem mais recente (manual vs. API)
- [ ] `owner`/`manager` recebem 403
- [ ] Tokens nunca aparecem em texto puro numa resposta de leitura

### O que ainda impede o avanço pro Tech Explorer
Nada bloqueante. Escopo pequeno e bem isolado — reaproveita padrão já validado (upsert parcial de
CSC/certificado da ORD-168).

## Tech Explorer

### Serviços impactados
- **company-service**: `PUT /companies/{id}/fiscal-config` ganha 2 campos novos no
  `FiscalConfigIn`; 1 coluna nova em `CompanyFiscalConfig`.
- **frontend/admin**: `FiscalTab` ganha ação secundária + modal.

### Modelo de dados (extensão de `CompanyFiscalConfig`)
```python
    # ORD-178 — distingue origem do cadastro na Focus NFe: true quando os
    # tokens vieram colados manualmente (empresa já existia lá), false
    # quando vieram de um POST /empresas de verdade (ORD-170). Zerado sempre
    # que o onboarding automatizado roda com sucesso — a origem mais
    # recente prevalece.
    focus_nfe_cadastro_manual = Column(Boolean, nullable=False, default=False)
```

### Mudança no endpoint existente

`FiscalConfigIn` ganha:
```python
    token_producao_manual: str | None = None
    token_homologacao_manual: str | None = None
```

Em `update_fiscal_config`: se **qualquer um** dos dois vier preenchido, valida que pelo menos um
não é string vazia/só espaço, criptografa com `encrypt_field()` (mesmo helper já usado pra
CSC/certificado), grava em `token_producao_enc`/`token_homologacao_enc`, seta
`focus_nfe_cadastrado_em = datetime.utcnow()` e `focus_nfe_cadastro_manual = True`. O endpoint de
onboarding automatizado (ORD-170, `focus_nfe_onboarding`) passa a zerar
`focus_nfe_cadastro_manual = False` no caminho de sucesso (única mudança nesse endpoint).

`FiscalConfigOut` ganha `focus_nfe_cadastro_manual: bool`.

### Mudança no frontend
`FiscalTab`: botão secundário "Já tenho os tokens" abre um `Modal` pequeno com 2
`PasswordField` (token homologação/produção, mesmo componente já usado pra CSC). Status do painel
"Focus NFe" mostra "Cadastrado manualmente em DATA" quando `focus_nfe_cadastro_manual=true`,
"Cadastrado em DATA" quando `false` (mesmo `focus_nfe_cadastrado_em`, texto diferente).

### Migrations
Uma: adiciona `focus_nfe_cadastro_manual` (boolean, default false) em `company_fiscal_configs`.

### Eventos de fila
Nenhum.

### Impacto em outros serviços
Nenhum — mesma tabela e mesmos campos que ORD-171 (emissão) e ORD-176 (monitoramento) já
consomem via `GET /internal/companies/{id}/fiscal-credentials`, sem mudança de contrato lá.

### Estimativa
- Backend: **~2 pontos** — 2 campos novos + 1 coluna + validação simples, endpoint já existe.
- Frontend: **~1 ponto** — modal pequeno, reaproveita `PasswordField` já existente.
- **Total: ~3 pontos.**

### Riscos
1. **Confusão entre as duas origens** (manual vs. API) na hora de investigar por que faltam
   `certificado_valido_ate`/`focus_nfe_empresa_id` — mitigado pelo texto de status distinto
   ("Cadastrado manualmente") e pelo comentário no modelo de dados.
2. **Nenhum risco técnico novo** — reaproveita integralmente o padrão de criptografia/upsert
   parcial já em produção desde a ORD-168.

### O que ainda impede o avanço pro Ready
Nada bloqueante.

## Ready

**Explorer:** [x] história Como/quero/para · [x] decisão de escopo (duas vias coexistentes,
mesmo destino de dado) · [x] fluxo principal (6 passos) · [x] dependências (ORD-170) · [x]
critérios de aceite funcionais.

**QA Explorer:** [x] happy path (dois tokens, um token) · [x] bordas (nenhum token, reenvio,
API depois de manual reverte origem) · [x] erros/controle de acesso (owner 403, tokens nunca em
texto puro) · [x] cenários aprovados.

**Tech Explorer:** [x] serviços impactados (company-service + frontend) · [x] modelo de dados
(1 coluna nova) · [x] extensão do endpoint existente detalhada · [x] migration · [x] eventos de
fila — nenhum · [x] estimativa (3 pontos) · [x] riscos com mitigação.

**Aprovação final:** [x] solução técnica revisada · [x] estimativa 3 pontos · [x] sem bloqueios
não resolvidos · [ ] sprint específico — não atribuída ainda.

**Status: Ready.** Escopo pequeno, reaproveita padrão já validado em produção (ORD-168). Pode
implementar direto.

## Implementação

Backend (`services/company/main.py`): coluna `focus_nfe_cadastro_manual` em `CompanyFiscalConfig`
(migration `20260916_1200_focus_nfe_cadastro_manual.py`), `FiscalConfigIn` ganha
`token_producao_manual`/`token_homologacao_manual`, `update_fiscal_config` valida que pelo menos
um dos dois vem preenchido (rejeita string vazia/só espaço com 400), criptografa e persiste,
marca `focus_nfe_cadastrado_em`/`focus_nfe_cadastro_manual=True`. `focus_nfe_onboarding` (ORD-170)
ganha uma linha a mais: zera `focus_nfe_cadastro_manual=False` no sucesso, pra origem mais recente
sempre prevalecer. 8 testes novos (`test_ord178_cadastro_manual_tokens.py`), suíte completa do
company-service 457 passou, ruff limpo.

Frontend (`CompanyScreen.tsx`): botão secundário "Já tenho os tokens" ao lado de "Cadastrar na
Focus NFe"/"Reenviar cadastro", abre `Modal` com 2 `PasswordField` (mesmo componente já usado pra
CSC). Validação client-side (pelo menos um token) antes de chamar a API. Status na aba distingue
"Cadastrado manualmente em DATA" de "Cadastrado em DATA". `tsc`, `build` e `vitest` limpos.

**Testado ao vivo**: preenchido só o token de homologação via modal → status mudou pra "Cadastrado
manualmente em 16/09/2026, 02:51:04", botão virou "Reenviar cadastro", e o toggle "Emissão de
NFC-e" (ORD-171) ficou habilitado imediatamente — confirma a integração completa com os
interruptores já existentes. Validação "nenhum token informado" testada e rejeitada corretamente
antes de chamar a API. Dado de teste revertido do banco depois da validação.

**Correção pós-review (usuário)**: o botão "Já tenho os tokens" não tinha nenhum gate — dava pra
colar um token em qualquer empresa, mesmo sem CNPJ/certificado/CSC preenchidos, e a partir daí
ativar emissão de verdade (ORD-171) numa empresa fiscal-incompleta. Corrigido pra exigir
`_fiscal_config_completo` (mesma checagem já usada pelo onboarding automatizado da ORD-170) — nos
dois lados: backend (`update_fiscal_config` rejeita com 400 antes de aceitar qualquer token
manual) e frontend (botão desabilitado com o mesmo `!cfg.completo` do "Cadastrar na Focus NFe").
Teste novo (`test_cadastro_manual_exige_dados_fiscais_completos`) e validação ao vivo via `curl`
direto no `company-service` real: empresa incompleta → 400; empresa completa → 200. Suíte
company-service: 458 passou.
