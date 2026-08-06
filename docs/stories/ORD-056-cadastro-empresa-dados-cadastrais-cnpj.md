---
id: ORD-056
status: Done
fase: 4
sprint: null
responsavel: Backend SR
estimativa: 3 pontos
---

# ORD-056 — Dados cadastrais e endereço da empresa com CNPJ validado (numérico e alfanumérico)

## Descrição
Hoje o cadastro de empresa (`POST /companies`, `services/company/main.py:477-501`) aceita só `name`, `document` (string livre, sem nenhuma validação), `plan` e `payment_provider`. Não existe validação de CNPJ (nem formato, nem dígito verificador) em lugar nenhum do repositório, e não há campos de razão social, inscrição estadual/municipal, regime tributário, porte ou endereço.

Esta história cria a base de dados cadastrais completa exigida para um cadastro de cliente PJ legalmente consistente (ver análise de mercado/legal discutida com o PM), incluindo suporte ao **novo CNPJ alfanumérico** da Receita Federal (que passou a ser emitido em 2026, convivendo com o formato numérico legado) — sem ainda consultar API externa (isso é ORD-057, que depende desta).

## Persona
**Super admin** (única role que hoje pode criar empresa — `_require_superadmin`, `main.py:140-142`). Cadastro é **interno**: feito pelo time do ordin ao onboardar um novo cliente, não self-service pelo próprio cliente.

## Contexto
Descoberto ao analisar, junto com o PM, o que falta para o cadastro de cliente do ordin ter validade jurídica mínima e paridade com ERPs de mercado (Omie, Bling, Conta Azul, TOTVS). O usuário confirmou que o formato alfanumérico de CNPJ já está valendo (primeiro CNPJ alfanumérico emitido em 2026-08-03) e que a validação precisa cobrir os dois formatos desde já.

---

## Explorer

## História
Como **super admin cadastrando um novo cliente**, quero informar CNPJ (numérico ou alfanumérico), razão social, dados fiscais e endereço completo da empresa, com o CNPJ validado localmente antes de salvar, para garantir que o cadastro tenha os dados mínimos exigidos para operar e faturar legalmente, sem depender de correção manual posterior.

### Contexto e motivação
O campo `document` atual é uma string livre de até 20 caracteres sem nenhuma validação — hoje é tecnicamente possível cadastrar uma empresa com `document="abc"`. Isso é um risco tanto operacional (impossível emitir nota fiscal, cobrar, ou identificar duplicidade de cliente) quanto de conformidade. Além disso, a Receita Federal passou a emitir CNPJs no novo formato alfanumérico (12 caracteres alfanuméricos + 2 dígitos verificadores numéricos) convivendo com o formato numérico tradicional — qualquer validação escrita apenas para dígitos vai rejeitar clientes legítimos a partir de agora.

### Personas afetadas
- **Super admin**: preenche o cadastro, precisa de feedback claro e imediato se o CNPJ for inválido
- **Financeiro/Compliance**: depende dos dados fiscais (regime tributário, IE, IM) para emissão de nota fiscal da mensalidade do ordin
- **Cliente final da empresa (indireto)**: endereço correto da empresa é usado em eventual nota fiscal/cupom emitido pelo totem no futuro

### Fluxo principal
1. Super admin acessa a tela de cadastro de nova empresa no admin
2. Preenche CNPJ — sistema valida formato e dígito verificador **no momento da digitação/blur do campo** (feedback imediato no frontend) e novamente no backend antes de persistir
3. Preenche razão social, nome fantasia (campo `name` já existente), inscrição estadual (ou marca "Isento"), inscrição municipal (opcional), regime tributário, porte, CNAE principal
4. Preenche endereço completo (CEP, logradouro, número, complemento, bairro, cidade, UF, país)
5. Submete o formulário → `POST /companies` valida tudo novamente no backend e persiste
6. Resposta inclui os dados persistidos + PIN gerado (comportamento já existente mantido)

### Fluxos alternativos / exceções
- CNPJ com dígito verificador inválido (numérico ou alfanumérico) → erro 422 antes de qualquer persistência
- CNPJ com tamanho ou caracteres fora do alfabeto permitido (letras minúsculas, símbolos) → erro 422
- Campos fiscais opcionais (IM, CNAE) podem ficar em branco
- IE pode ser explicitamente "ISENTO" (não é a mesma coisa que campo vazio — ambos precisam ser distinguíveis)

### Dependências
- Serviços envolvidos: `company-service` apenas
- Histórias bloqueantes: nenhuma
- Bloqueia: ORD-057 (consulta Receita depende destes campos existirem), ORD-058 (contatos/responsável legal, mesma tabela/época de migration)
- Sem dependência de wireframe formal — segue o padrão visual já existente do admin panel (`frontend/admin`)

### Critérios de aceite funcionais
- [ ] CNPJ numérico (14 dígitos) com DV correto é aceito
- [ ] CNPJ alfanumérico (12 alfanuméricos + 2 dígitos verificadores numéricos) com DV correto é aceito
- [ ] CNPJ com DV incorreto (qualquer formato) é rejeitado com 422 e mensagem clara
- [ ] Endereço completo é persistido e retornado no `GET /companies/{id}`
- [ ] Dados fiscais (razão social, IE, IM, regime tributário, porte, CNAE) são persistidos e retornados
- [ ] Comportamento atual (criação só por superadmin, PIN gerado automaticamente) é preservado
- [ ] Campos novos são opcionais o suficiente para não quebrar nenhum teste/seed existente que já cria empresa com payload mínimo

### Wireframe / Mockup
N/A neste ticket — ajuste de formulário no admin é conteúdo de uma história de frontend separada, fora do escopo desta entrega de backend. O contrato de API já deve prever os campos para o frontend consumir depois.

---

## QA Explorer

```gherkin
Feature: Cadastro de dados cadastrais e endereço da empresa com CNPJ validado
  Como super admin
  Quero cadastrar uma empresa com CNPJ validado (numérico ou alfanumérico) e dados fiscais/endereço completos
  Para garantir um cadastro de cliente juridicamente consistente

  Background:
    Dado que estou autenticado como super admin

  Scenario: Cadastro com CNPJ numérico válido (happy path)
    Dado um CNPJ numérico de 14 dígitos com dígito verificador correto, ex. "11222333000181"
    Quando envio POST /companies com razão social, endereço completo e esse CNPJ
    Então a resposta é 201
    E o GET /companies/{id} subsequente retorna o CNPJ, razão social e endereço persistidos

  Scenario: Cadastro com CNPJ alfanumérico válido (happy path)
    Dado um CNPJ no novo formato alfanumérico (12 caracteres alfanuméricos + 2 dígitos verificadores numéricos válidos)
    Quando envio POST /companies com esse CNPJ e os demais dados obrigatórios
    Então a resposta é 201
    E o CNPJ é armazenado exatamente como informado (sem perda de caracteres alfabéticos)

  Scenario: CNPJ numérico com dígito verificador inválido
    Dado um CNPJ de 14 dígitos com o último dígito alterado (DV incorreto)
    Quando envio POST /companies com esse CNPJ
    Então a resposta é 422 com mensagem indicando CNPJ inválido
    E nenhuma empresa é criada no banco

  Scenario: CNPJ alfanumérico com dígito verificador inválido
    Dado um CNPJ alfanumérico com os 12 caracteres válidos mas os 2 dígitos verificadores incorretos
    Quando envio POST /companies com esse CNPJ
    Então a resposta é 422 com mensagem indicando CNPJ inválido

  Scenario: CNPJ com formato inválido (caracteres ou tamanho incorretos)
    Dado um CNPJ com letra minúscula, símbolo, ou tamanho diferente de 14 caracteres
    Quando envio POST /companies com esse CNPJ
    Então a resposta é 422

  Scenario: Inscrição estadual isenta é distinguível de campo vazio
    Dado um cadastro válido com state_registration = "ISENTO"
    Quando consulto a empresa criada
    Então o campo retorna exatamente "ISENTO", diferente de null ou string vazia

  Scenario: Endpoint continua restrito a super admin
    Dado um usuário autenticado com role "owner" (não superadmin)
    Quando ele tenta POST /companies
    Então a resposta é 403

  Scenario: Payload mínimo legado continua funcionando (retrocompatibilidade)
    Dado um payload contendo apenas name, document (CNPJ numérico válido), plan e payment_provider
    Quando envio POST /companies
    Então a resposta é 201 (campos fiscais/endereço ficam nulos, não é obrigatório preenchê-los neste ticket)
```

**Cenários aprovados pelo PM.** Nota: a decisão de tornar razão social/endereço **obrigatórios** ou apenas **disponíveis** ficou em aberto — o cenário de retrocompatibilidade acima assume que só CNPJ ganha validação forte nesta história, e os demais campos novos são opcionais até decisão em contrário (evita quebrar seeds/testes existentes que criam empresa com payload mínimo).

---

## Tech Explorer

### Serviços impactados
- **company-service**: única mudança. Nova migration, novos campos no modelo `Company`, novo módulo de validação de CNPJ, validação no schema Pydantic `CompanyIn`.

### Algoritmo de validação de CNPJ (numérico e alfanumérico)

A Receita Federal manteve o algoritmo de dígito verificador (peso 5,4,3,2,9,8,7,6,5,4,3,2 para o primeiro DV, mais peso 6 incluindo o primeiro DV para o segundo — mod 11, resto <2 vira 0) **inalterado**. A mudança está em como cada caractere das 12 primeiras posições é convertido a valor numérico: em vez de `int(char)` (que só funciona para dígitos), usa-se `ord(char) - 48` — isso preserva compatibilidade total com CNPJs numéricos existentes (dígitos '0'-'9' têm `ord(c)-48` idêntico ao valor do dígito) e estende para letras maiúsculas 'A'-'Z' (`ord(c)-48` no intervalo 17-42). Os 2 dígitos verificadores finais continuam sendo sempre numéricos (0-9), nunca letras.

**✅ Risco fechado no ORD-064 (2026-08-05):** o algoritmo foi confrontado contra os vetores de teste oficiais publicados pelo SERPRO (PDF + exemplos Java/Python/TypeScript, material fornecido pelo usuário) — todos os 8 vetores de cálculo de DV e 9 dos 10 vetores de validação completa bateram. O único gap encontrado (CNPJ totalmente zerado `00000000000000` sendo aceito como válido por coincidência matemática do checksum) foi corrigido no mesmo ORD-064, junto com dois gaps adicionais descobertos durante a implementação: consulta à Receita podendo bloquear CNPJ alfanumérico legítimo por 404/corpo-de-erro não confiável, e promoção automática para `cadastral_status="ATIVA"` quando nenhum provedor confirma um CNPJ alfanumérico (decisão de produto, DV já validado localmente).

### Migrations
Nova migration em `services/company/migrations/versions/`, `down_revision` apontando para a head atual (`20260618_1200`). Adiciona à tabela `companies`:

```
legal_name              VARCHAR(160) NULL   -- razão social
state_registration      VARCHAR(20)  NULL   -- IE, ou "ISENTO"
municipal_registration  VARCHAR(20)  NULL   -- IM
tax_regime              VARCHAR(20)  NULL   -- simples_nacional | lucro_presumido | lucro_real
company_size            VARCHAR(10)  NULL   -- MEI | ME | EPP | DEMAIS
cnae_code                VARCHAR(10)  NULL
cadastral_status         VARCHAR(20)  NULL   -- preenchido futuramente por ORD-057
zip_code                 VARCHAR(9)   NULL
street                   VARCHAR(160) NULL
address_number           VARCHAR(20)  NULL
complement                VARCHAR(80)  NULL
neighborhood              VARCHAR(80)  NULL
city                      VARCHAR(80)  NULL
state                     VARCHAR(2)   NULL
country                   VARCHAR(60)  NULL DEFAULT 'Brasil'
```
`document` (coluna existente, `String(20)`) permanece como está — 14 caracteres cabem confortavelmente, não precisa alterar tamanho.

### Endpoints

Nenhum endpoint novo — `POST /companies` (já existente) ganha validação adicional.

#### POST /companies
**Serviço:** company-service
**Auth:** JWT obrigatório | role: `superadmin`
Request (novos campos, todos opcionais exceto `document` que ganha validação forte):
```json
{
  "name": "string",
  "document": "string (CNPJ numérico ou alfanumérico)",
  "legal_name": "string | null",
  "state_registration": "string | null",
  "municipal_registration": "string | null",
  "tax_regime": "string | null",
  "company_size": "string | null",
  "cnae_code": "string | null",
  "zip_code": "string | null",
  "street": "string | null",
  "address_number": "string | null",
  "complement": "string | null",
  "neighborhood": "string | null",
  "city": "string | null",
  "state": "string | null",
  "plan": "string",
  "payment_provider": "string"
}
```
Erros: 422 (CNPJ inválido — formato ou DV), 403 (não é superadmin)

### Módulo novo
`services/company/domain/cnpj.py` — funções puras, sem I/O:
- `normalize_cnpj(raw: str) -> str` — remove máscara (`.`, `/`, `-`), upper-case
- `is_valid_cnpj(cnpj: str) -> bool` — valida tamanho (14), charset (12 primeiros: `[0-9A-Z]`, 2 últimos: `[0-9]`) e dígitos verificadores via `ord(c)-48`
- Aplicado em `CompanyIn` via `field_validator` do Pydantic, levantando erro que vira 422 automaticamente

### Impacto em outros serviços
Nenhum. `document` já é lido apenas dentro do company-service hoje.

### Eventos de fila
Não aplicável.

### Estimativa
- Backend: 3 pontos (migration + validação CNPJ + testes). Sem frontend nesta história.

### Riscos
- ~~Algoritmo do CNPJ alfanumérico precisa de confronto com vetores de teste oficiais da RFB antes de produção~~ — **fechado no ORD-064** (ver seção acima)
- Decisão de negócio pendente: razão social/endereço deveriam ser obrigatórios? Ficou como opcional nesta história para não quebrar retrocompatibilidade — revisar com PM se isso deve virar obrigatório numa história de "hardening" futura

---

## Ready

**Explorer:** [x] todos os itens · **QA Explorer:** [x] happy path numérico e alfanumérico, bordas de DV inválido, formato inválido, isolamento de role, retrocompatibilidade · **Tech Explorer:** [x] migration, endpoint, módulo de validação, riscos documentados · **Aprovação final:** [x] solução técnica definida, estimativa 3 pontos, sem bloqueios — pendente apenas priorização de sprint pelo time.

**Status: Ready.**
