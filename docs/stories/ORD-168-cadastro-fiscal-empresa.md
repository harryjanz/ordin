---
id: ORD-168
status: Ready
estimativa: 3 pontos (1,5 backend + 1,5 frontend)
fase: null
sprint: null
responsavel: Backend SR + Frontend
---

# ORD-168 — Cadastro fiscal da empresa (certificado, CSC — IE/regime já existem)

## Descrição
Primeira história do épico de **emissão fiscal NFC-e** (`docs/estudo-nfce.md`, levantamento não
versionado — ver `docs/roles/pm.md` § Épicos mapeados).

**Correção feita durante o próprio Tech Explorer desta história (2026-09-15)**: a primeira versão
deste documento propunha uma tabela nova com Inscrição Estadual e regime tributário — checando o
model de verdade, `Company` **já tem** `state_registration` (IE), `tax_regime` (regime),
`legal_name` (razão social) e endereço completo (`street`/`address_number`/`complement`/
`neighborhood`/`city`/`state`/`zip_code`), todos já em uso hoje por `CompanyContractScreen.tsx`
(tela de contrato/jurídico, provavelmente ORD-093). Duplicar esses campos criaria uma segunda
fonte de verdade pro mesmo dado — o mesmo tipo de problema já registrado como gotcha de sessões
anteriores ("CompanyInfo tem 4 cópias manuais"). **Escopo revisado**: esta história só precisa
adicionar o que de fato não existe — referência ao certificado digital A1 e o CSC (Código de
Segurança do Contribuinte) de produção/homologação — e reaproveitar os campos já existentes pro
resto.

**Gap encontrado nos campos existentes**: `tax_regime` hoje só tem 3 opções
(`simples_nacional`/`lucro_presumido`/`lucro_real`, ver `TAX_REGIME_OPTIONS` em
`CompanyContractScreen.tsx`) — falta **MEI**, que o mapeamento da Focus NFe trata como regime
próprio (código 4, distinto de Simples). MEI é um recorte real da base-alvo do Ordin (pequeno
food service). Esta história adiciona essa 4ª opção na lista já existente, compartilhada entre
as duas telas.

**Não depende do bloqueio externo confirmado com a Focus NFe** (CNPJ real + certificado A1
válido pra emissão de teste, `docs/estudo-nfce.md` §7.1) — esta história é só o cadastro do dado
dentro do Ordin, sem chamar a API da Focus NFe (isso é a história 3, "Onboarding na Focus NFe").
Pode ser implementada e testada de ponta a ponta agora.

## Persona
**Superadmin/Admin da plataforma Ordin** (não o owner da empresa cliente) — decisão do Explorer:
o cadastro fiscal é feito pelo time Ordin durante o onboarding assistido do cliente, não
self-service pelo dono do restaurante. Motivo (confirmado com o usuário): a complexidade
descoberta neste levantamento (regime tributário definindo CST/CSOSN, CEST variando por estado,
certificado A1 com senha) não é razoável expor direto pro dono de um restaurante sem
acompanhamento — mesmo módulo sendo opt-in comercial do cliente (decisão de negócio dele), o
preenchimento técnico fica com quem entende o domínio.

## Contexto
Levantado ao longo de várias sessões de pesquisa registradas em `docs/estudo-nfce.md` — decisões
já fechadas relevantes pra esta história:
- Escopo fechado: só NFC-e, sem NF-e (§8 item 4).
- Custódia do certificado: só referência criptografada em banco, nunca o arquivo bruto —
  reaproveita `encrypt_field`/`decrypt_field` (`services/company/main.py`, linhas ~112-131), já
  usado hoje pras credenciais de adquirente de pagamento (`CompanyPaymentConfig.api_key` etc.).
- Padrão de UI já existente e confirmado nesta sessão: `frontend/admin/src/screens/
  CompanyScreen.tsx` já é a tela de detalhe de empresa usada pelo time Ordin (`isPlatformAdmin =
  role === "superadmin" || role === "admin"`, linha 555), com abas (`Tabs`/`Tab` do
  design-system): Usuários, Terminais, Pagamento, Plano. A aba "Pagamento" (`PaymentTab`, linha
  ~166) já resolve exatamente o mesmo problema de forma — catálogo de campos por provider,
  campos sensíveis com `type="password"` — que serve de modelo direto pra esta história.

## Explorer

### História
Como **integrante do time Ordin fazendo o onboarding de uma empresa cliente**, quero cadastrar
os dados fiscais dessa empresa (Inscrição Estadual, regime tributário, certificado digital A1 e
CSC de produção/homologação) numa aba dedicada da tela de empresa, para que essa empresa tenha o
pré-requisito de dado completo antes de avançarmos pro onboarding real na Focus NFe (história 3).

### Campos desta história (escopo revisado)
| Campo | Já existe? | Tipo | Observação |
|---|---|---|---|
| `legal_name`, `state_registration` (IE), endereço completo | **Sim** (`Company`) | — | Reaproveitados como leitura na aba nova; edição continua em `CompanyContractScreen.tsx`, não duplicada aqui |
| `tax_regime` (regime tributário) | **Sim** (`Company`), com gap | enum string | `TAX_REGIME_OPTIONS` ganha 4º valor `"mei"` — hoje só tem `simples_nacional`/`lucro_presumido`/`lucro_real`. Mapeamento pra código Focus NFe (1-4) fica documentado no Tech Explorer |
| certificado A1 | **Não** — novo | upload (.pfx/.p12) + senha | Guardado como arquivo+senha criptografados (decisão já tomada no Tech Explorer original, mantida) |
| `csc_producao` + `id_token_producao` | **Não** — novo | string + string (CSC criptografado) | Gerado no portal da SEFAZ do estado da empresa |
| `csc_homologacao` + `id_token_homologacao` | **Não** — novo | string + string (CSC criptografado) | Idem, ambiente de homologação — a Focus NFe exige os dois pares desde o cadastro, não só produção |

**Fora do escopo desta história**: NCM/CFOP/CEST por produto (história 2); qualquer chamada real
à API da Focus NFe, `token_producao`/`token_homologacao` retornados por ela (história 3) — esta
história não valida o certificado contra nenhuma SEFAZ, só armazena o dado localmente.

### Fluxo principal
1. Integrante do time Ordin abre a tela de detalhe de uma empresa (`CompanyScreen.tsx`) já
   existente.
2. Nova aba **"Fiscal"** aparece ao lado de Usuários/Terminais/Pagamento/Plano — visível só pra
   `superadmin`/`admin` (mesmo gate de `isPlatformAdmin` já usado na aba "Plano").
3. Aba mostra, no topo, um **resumo somente-leitura** de razão social/IE/regime/endereço (já
   cadastrados em `CompanyContractScreen.tsx`) com um link pra editar lá se precisar — evita
   segunda fonte de verdade pro mesmo dado. Se `tax_regime` estiver vazio ou for `"mei"` sem
   ainda existir essa opção, mostra aviso "Complete o regime tributário na aba Contrato".
4. Abaixo, formulário editável só com os campos novos: certificado (upload + senha), CSC produção
   e CSC homologação, mais indicador "Dados fiscais: completos/incompletos" (agora calculado
   sobre a união dos campos já existentes + os novos, não só os novos).
5. Ao preencher e salvar, o certificado é enviado pro backend, que criptografa antes de
   persistir — nunca reaparece em texto puro na tela depois de salvo (mesmo padrão de
   `api_key`/`api_secret` na aba Pagamento).
6. CSC continua editável depois de salvo, mas também nunca ecoa em texto puro na resposta da API
   (é segredo criptográfico usado pra assinar QR fiscal, não só um identificador).

### Fluxos alternativos / exceções
- **Campos parcialmente preenchidos**: sem bloqueio pra salvar parcialmente — certificado pode
  ficar pendente enquanto IE/regime já estão completos (ou vice-versa). Indicador reflete isso.
- **`tax_regime` ainda não tem a opção "MEI"**: até essa história implementar o valor novo,
  empresas MEI ficam sem representação correta — tratado como parte do escopo desta história
  (adicionar a opção), não um caso de borda a ignorar.
- **Certificado já vencido no momento do upload**: proposta de validação local (parsear X.509,
  checar validade) — **fica fora do escopo**, mesma decisão já tomada na versão original (a Focus
  NFe rejeita na história 3, duplicar a validação agora não compensa o custo).
- **Empresa sem nenhum dado fiscal novo preenchido**: aba mostra o resumo (se existir) e o
  formulário de certificado/CSC vazio, sem erro.

### Dependências
- **company-service**: tabela satélite nova só com certificado+CSC (bem menor que a versão
  original), reaproveitando `encrypt_field`/`decrypt_field` já existentes. Pequena adição em
  `TAX_REGIME_OPTIONS`/lógica de regime (compartilhada com `CompanyContractScreen.tsx`).
- **frontend/admin**: `CompanyScreen.tsx` ganha aba nova; `CompanyContractScreen.tsx` ganha só a
  opção "MEI" no dropdown já existente, sem mudança estrutural.
- **Histórias bloqueantes**: nenhuma.
- **Histórias que dependem desta**: história 2 (parcial — CST/CSOSN do produto depende de
  `tax_regime` já existir, que já existe hoje independente desta história), história 3
  (onboarding Focus NFe consome os campos existentes + os novos desta história pra montar o
  `POST /empresas`).

### Critérios de aceite funcionais
- [ ] Aba "Fiscal" aparece em `CompanyScreen.tsx`, visível só pra `superadmin`/`admin`
- [ ] Resumo somente-leitura mostra razão social/IE/regime/endereço já cadastrados, com link pra
      editar em `CompanyContractScreen.tsx` — nenhum desses campos é editável duas vezes
- [ ] `TAX_REGIME_OPTIONS` ganha a opção "MEI", disponível nas duas telas que a usam
- [ ] Formulário permite cadastrar/editar certificado (upload + senha), CSC produção e CSC
      homologação
- [ ] Certificado e CSC nunca retornam em texto puro numa resposta da API depois de salvos
- [ ] Dado salvo persiste corretamente e é recarregado ao reabrir a tela
- [ ] Empresa sem nenhum dado fiscal novo mostra formulário vazio, sem erro
- [ ] Campos parcialmente preenchidos são aceitos (sem validação cruzada obrigatória ainda)
- [ ] `owner`/`manager` (papéis do lado do cliente) não veem nem acessam essa aba/endpoint

### Wireframe / Mockup
**Faltando** — mesma situação da ORD-167: recomendo reaproveitar exatamente o layout visual da
aba "Pagamento" (`PaymentTab`) como wireframe de fato, já que resolve o mesmo tipo de formulário
(campos sensíveis + campos de texto simples). Risco baixo de seguir sem wireframe desenhado à
parte.

## QA Explorer

### Sobre isolamento multi-tenant e controle de acesso nesta história
`Company.company_id` (o próprio id da empresa) já isola o dado fiscal por empresa automaticamente
— não há cenário novo de "empresa A vê dado fiscal de empresa B" além do que já existe pra
qualquer campo de `Company`. O ponto que **é** novo e merece cenário dedicado: mesmo o
**owner/manager da própria empresa dona do dado** não deveria ver essa aba — decisão do Explorer
foi cadastro só pelo time Ordin (`superadmin`/`admin`), diferente de Terminais/Usuários (que o
owner provavelmente já acessa da própria empresa). Vale checar explicitamente que isso não
regride sem querer se algum dia a tela de empresa for reaproveitada num contexto de login do
cliente.

### Cenários Gherkin

```gherkin
Feature: Cadastro fiscal da empresa
  Como integrante do time Ordin
  Quero cadastrar certificado e CSC de uma empresa, reaproveitando IE/regime já existentes
  Para que ela tenha o pré-requisito de dado completo antes do onboarding na Focus NFe

  Background:
    Dado que o usuário está autenticado com role "superadmin" ou "admin"
    E existe uma empresa "Burger House" cadastrada

  # --- Happy path ---

  Scenario: Cadastrar certificado e CSC pela primeira vez, com IE/regime já preenchidos
    Dado que a empresa "Burger House" já tem razão social, IE, regime e endereço cadastrados em CompanyContractScreen
    E não tem certificado nem CSC cadastrados ainda
    Quando o usuário abre a aba "Fiscal" na tela de detalhe da empresa
    Então o resumo somente-leitura mostra razão social/IE/regime/endereço já existentes
    E o formulário de certificado/CSC aparece vazio, sem erro
    Quando o usuário preenche certificado (.pfx + senha), CSC de produção e CSC de homologação
    E salva
    Então os dados são persistidos
    E o indicador de status muda para "Dados fiscais: completos"
    E reabrir a tela mostra os dados salvos (exceto o certificado, que nunca reaparece em texto puro)

  # --- Bordas ---

  Scenario: Regime tributário da empresa ainda não tem a opção MEI selecionada
    Dado que a empresa "Burger House" precisa ser cadastrada como MEI
    Quando o usuário abre o dropdown de regime tributário em CompanyContractScreen
    Então a opção "MEI" aparece disponível, ao lado de Simples Nacional/Lucro Presumido/Lucro Real

  Scenario: Salvar certificado/CSC com IE/regime ainda incompletos na outra tela
    Dado que a empresa "Burger House" não tem IE nem regime tributário cadastrados ainda
    Quando o usuário abre a aba "Fiscal"
    Então aparece um aviso "Complete o regime tributário na aba Contrato"
    E o formulário de certificado/CSC continua editável e salvável normalmente

  Scenario: Editar CSC de uma empresa que já tem certificado cadastrado
    Dado que a empresa "Burger House" já tem certificado e CSC cadastrados
    Quando o usuário atualiza só o CSC de homologação
    E salva
    Então o CSC é atualizado
    E o certificado existente não é afetado

  # --- Erros / controle de acesso ---

  Scenario: Owner da própria empresa não acessa a aba Fiscal
    Dado um usuário autenticado com role "owner" da empresa "Burger House"
    Quando esse usuário abre a tela de detalhe da própria empresa
    Então a aba "Fiscal" não aparece
    E uma tentativa direta de acesso ao endpoint correspondente retorna 403

  Scenario: Manager de outra empresa não acessa dado fiscal de empresa alheia
    Dado um usuário autenticado com role "manager" da empresa "Pasta & Co"
    Quando esse usuário tenta acessar o dado fiscal da empresa "Burger House" via API direta
    Então o sistema retorna 403

  Scenario: Certificado nunca é exposto em texto puro depois de salvo
    Dado que a empresa "Burger House" tem certificado cadastrado
    Quando o usuário admin consulta o detalhe fiscal dessa empresa
    Então o campo de certificado retorna vazio ou um indicador de presença (ex. "cadastrado"), nunca o conteúdo do arquivo nem a senha em texto puro
```

### Critérios de aceite testáveis
- [ ] Aba "Fiscal" visível só pra `superadmin`/`admin`, ausente pra `owner`/`manager`
- [ ] Endpoint de dado fiscal retorna 403 pra `owner`/`manager`, inclusive da própria empresa
- [ ] Cadastro completo persiste e recarrega corretamente (exceto certificado, nunca em texto puro)
- [ ] Cadastro parcial é aceito, sem validação cruzada obrigatória
- [ ] Atualização de um campo (ex. CSC) não afeta os demais já salvos
- [ ] Certificado/senha nunca aparecem em texto puro numa resposta de leitura

### O que ainda impede o avanço pro Tech Explorer
Nada bloqueante — os cenários acima cobrem o comportamento decidido no Explorer. Segue como
pendência explícita (carregada do Explorer, não workaround): validação local de certificado
vencido no upload ainda não é requisito confirmado, fica como proposta pro Tech Explorer decidir
se entra nesta história ou fica pra depois. Wireframe segue como débito de baixo risco (mesma
decisão da ORD-167).

## Tech Explorer

### Decisão que resolve a pendência aberta no levantamento (`docs/estudo-nfce.md` §8 item 1)
A "referência criptografada" do certificado **guarda o arquivo (base64) e a senha, ambos
criptografados** — não só um flag de "certificado cadastrado". Motivo: a história 3 (onboarding
na Focus NFe) precisa enviar `arquivo_certificado_base64` + `senha_certificado` de verdade no
`POST /empresas` da Focus NFe — sem guardar o conteúdo, não haveria como reenviar/trocar de
provedor depois sem pedir o arquivo de novo pro cliente. Mesmo padrão de "guardar criptografado
pra decifrar quando for realmente usar" já aplicado a `CompanyPaymentConfig.api_key`/`api_secret`.

### Serviços impactados
- **company-service**: tabela satélite nova `company_fiscal_configs` (1:1 com `Company`, mesmo
  padrão de `CompanyContact`/`CompanyLegalRepresentative`) só com certificado+CSC, dois endpoints
  novos (`GET`/`PUT /companies/{id}/fiscal-config`), reaproveitando `encrypt_field`/
  `decrypt_field`. `TAX_REGIME_OPTIONS`/schema `CompanyUpdate.tax_regime` ganham o valor `"mei"`.
- **frontend/admin**: `CompanyScreen.tsx` ganha aba "Fiscal" (`FiscalTab`, novo componente no
  mesmo arquivo, ao lado de `PaymentTab`), com upload de arquivo (novo padrão de interação nesta
  tela) + resumo somente-leitura dos campos já existentes. `CompanyContractScreen.tsx` ganha só a
  opção "MEI" no `TAX_REGIME_OPTIONS` já existente.

### Modelo de dados (novo, reduzido)
```python
class CompanyFiscalConfig(Base):
    __tablename__ = "company_fiscal_configs"
    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, unique=True)
    certificado_arquivo_enc = Column(Text, nullable=True)  # base64 do .pfx, criptografado
    certificado_senha_enc = Column(String(512), nullable=True)  # criptografada
    certificado_nome_arquivo = Column(String(255), nullable=True)  # metadado não sensível, só
                                                                     # pra exibir "certificado.pfx"
    certificado_enviado_em = Column(DateTime, nullable=True)
    csc_producao_enc = Column(String(512), nullable=True)  # criptografado — é segredo
                                                              # criptográfico, não só identificador
    id_token_producao = Column(String(32), nullable=True)  # não é segredo em si, só o índice
    csc_homologacao_enc = Column(String(512), nullable=True)
    id_token_homologacao = Column(String(32), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
```
`Company.tax_regime` não muda de tipo — continua string (`simples_nacional`/`lucro_presumido`/
`lucro_real`/`mei`, novo). Mapeamento pro código integer da Focus NFe fica como função pura,
usada só na história 3 (quem chama a API de verdade), não armazenada:
```python
FOCUS_NFE_REGIME_MAP = {
    "simples_nacional": 1,
    "lucro_presumido": 3,
    "lucro_real": 3,   # Focus NFe não distingue Presumido/Real — os dois são "Regime Normal" (3)
    "mei": 4,
}
# Código 2 (Simples Nacional c/ excesso) não tem equivalente no Ordin hoje — não rastreamos
# esse limiar; default pra 1 quando simples_nacional, documentado como simplificação conhecida.
```

### Endpoints novos

#### `GET /companies/{company_id}/fiscal-config`
**Auth:** JWT · role `superadmin`/`admin` (`_require_platform_admin`, já existe)

Response 200 — **nunca decripta certificado/CSC pra retornar em texto puro**, só indica presença.
Inclui também um espelho somente-leitura dos campos que já existem em `Company` (evita o
frontend precisar de duas chamadas pra montar a aba):
```json
{
  "legal_name": "Burger House Ltda",
  "state_registration": "1234567",
  "tax_regime": "simples_nacional",
  "address_summary": "Rua Exemplo, 100 - Centro, São Paulo/SP",
  "certificado_cadastrado": true,
  "certificado_nome_arquivo": "burgerhouse.pfx",
  "certificado_enviado_em": "2026-09-15T10:00:00Z",
  "csc_producao_cadastrado": true,
  "csc_homologacao_cadastrado": false,
  "completo": false
}
```
`completo` é derivado (razão social + IE + regime já em `Company`, mais certificado + os dois
CSC), usado pro indicador "Dados fiscais: completos/incompletos" — não fica armazenado.

#### `PUT /companies/{company_id}/fiscal-config`
**Auth:** mesma. Upsert só dos campos novos (certificado/CSC) — **não** edita `legal_name`/
`state_registration`/`tax_regime`/endereço, que continuam só editáveis via os endpoints já
existentes de `Company` (usados por `CompanyContractScreen.tsx`).

Payload (todos os campos opcionais, atualização parcial):
```json
{
  "certificado_base64": "MIIj4g...",
  "certificado_senha": "123456",
  "certificado_nome_arquivo": "burgerhouse.pfx",
  "csc_producao": "ABCDEF123456",
  "id_token_producao": "1",
  "csc_homologacao": "GHIJKL789012",
  "id_token_homologacao": "1"
}
```
Response 200: mesmo shape do `GET`.

### Mudança no frontend
`FiscalTab` (novo, em `CompanyScreen.tsx`, mesmo arquivo/padrão de `PaymentTab`):
- Bloco somente-leitura no topo: razão social/IE/regime/endereço, vindos do `GET`, com link
  "Editar na aba Contrato" (navega pra `CompanyContractScreen.tsx`).
- Upload de arquivo (`<input type="file" accept=".pfx,.p12">`) + campo de senha — client-side lê
  o arquivo via `FileReader` e converte pra base64 antes de enviar (**interação nova nesta tela**,
  maior risco de implementação desta história).
- Campos de senha pra CSC produção/homologação + campos de texto pros respectivos `id_token`.
- Indicador de status "Dados fiscais: completos/incompletos" no topo, derivado do `GET`.
- Mesmo padrão de segurança visual do `PaymentTab`: campos sensíveis nunca voltam preenchidos
  depois de salvos, só placeholder indicando que já existem.

`CompanyContractScreen.tsx`: `TAX_REGIME_OPTIONS` ganha `{ value: "mei", label: "MEI" }`.

`types.ts`: novo tipo `CompanyFiscalConfig` espelhando o response do `GET`.

### Migrations
Uma nova: `alembic revision --autogenerate -m "add_company_fiscal_configs"` — cria a tabela
satélite (bem menor que a versão original), FK pra `companies.id`, sem tocar em tabela existente
nem em `Company` (o campo `tax_regime` já existe, só ganha um valor novo validado em Python, não
em schema de banco — mesmo padrão do `fulfillment_mode`, string livre validada na aplicação).

### Eventos de fila
Nenhum — puro CRUD dentro do company-service.

### Impacto em outros serviços
Nenhum direto nesta história. **Forward-looking, não implementado agora**: a história 3
(onboarding Focus NFe) vai precisar de um endpoint interno (`GET /internal/companies/{id}/
fiscal-credentials`, protegido por `X-Internal-Secret`, mesmo padrão de `internal_get_payment_
config` já existente) pra decifrar e consumir estes dados **mais** `legal_name`/
`state_registration`/`tax_regime`/endereço já existentes — fica documentado como dependência da
história 3, não construído nesta história.

### Estimativa
- Backend: **~1,5 ponto** — modelo novo + migration + 2 endpoints + criptografia de múltiplos
  campos (mais superfície que a ORD-167, que só adicionou uma query).
- Frontend: **~1,5 ponto** — aba nova com 7 campos, incluindo upload de arquivo com conversão
  base64 client-side (padrão de interação novo nesta tela).
- **Total: ~3 pontos.**

### Riscos
1. **Upload de arquivo é interação nova** nesta tela (nenhuma aba hoje faz isso) — mitigado
   reaproveitando `FileReader`/base64 (padrão web comum, sem dependência nova), mas testar
   manualmente no navegador antes de considerar pronto (arquivo `.pfx` real de teste necessário).
2. **Tamanho do certificado em base64** — arquivo `.pfx` típico é poucos KB, mas a coluna precisa
   ser `Text`, não `String(255)`, pra não truncar (diferente dos campos de senha/token existentes
   em `CompanyPaymentConfig`, que são curtos).
3. **Validação local de certificado vencido** (proposta no Explorer) — decisão: **fora do escopo
   desta história**, mitigação simples de custo/benefício — a Focus NFe já rejeita certificado
   vencido na história 3, duplicar essa validação agora adiciona uma dependência de biblioteca de
   parsing X.509 sem necessidade imediata. Registrar como melhoria futura, não bloqueio.

### O que ainda impede o avanço pro Ready
Nada bloqueante. Decisão de custódia do certificado (pendência do levantamento) resolvida acima.
Wireframe segue como débito de baixo risco, mesma decisão já tomada na ORD-167.

## Ready

**Explorer:** [x] história Como/quero/para · [x] contexto e motivação · [x] campos e escopo
fechado (tabela) · [x] fluxo principal (5 passos) · [x] dependências identificadas (nenhuma
bloqueante, história 2/3 dependem desta) · [ ] wireframe — não produzido, mesma decisão de
seguir sem parar (mitigado reaproveitando o layout de `PaymentTab`) · [x] critérios de aceite
funcionais.

**QA Explorer:** [x] happy path (cadastro completo) · [x] bordas (cadastro parcial, edição de um
campo isolado) · [x] erros/controle de acesso (owner da própria empresa sem acesso, manager de
outra empresa 403, certificado nunca exposto em texto puro) · [x] esclarecido por que o controle
de acesso aqui é diferente do padrão multi-tenant usual (mesmo dono da empresa não acessa) · [x]
cenários aprovados.

**Tech Explorer:** [x] serviços impactados (`company-service` + `frontend/admin`) · [x] modelo de
dados novo (`CompanyFiscalConfig`) · [x] endpoints com payload completo (`GET`/`PUT
/companies/{id}/fiscal-config`) · [x] decisão de custódia do certificado resolvida (arquivo +
senha criptografados, não só flag) · [x] migrations (uma, tabela nova) · [x] eventos de fila —
nenhum · [x] estimativa (3 pontos) · [x] riscos com mitigação.

**Aprovação final:** [x] solução técnica revisada · [x] estimativa 3 pontos · [x] sem bloqueios
não resolvidos · [ ] sprint específico — não atribuída ainda.

**Status: Ready.** Pode começar a implementação — backend primeiro (modelo + migration +
endpoints), depois frontend (aba nova).
