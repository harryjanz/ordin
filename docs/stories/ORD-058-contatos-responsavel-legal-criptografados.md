---
id: ORD-058
status: Ready
fase: 4
sprint: null
responsavel: Backend SR
estimativa: 5 pontos
---

# ORD-058 — Contatos segmentados e responsável legal, com PII criptografada em repouso

## Descrição
O cadastro de empresa hoje não tem nenhum contato humano estruturado além do `User.email` do operador do sistema. Esta história adiciona contatos segmentados por finalidade (comercial, financeiro, técnico) e o responsável legal (necessário para saber quem assina o contrato, tratado em ORD-059), com todos os dados pessoais **criptografados em repouso** — requisito explícito do usuário: "tudo que for referente a LGPD deve ficar criptografado no banco de dados e ser descriptografado para exibir na plataforma".

## Persona
**Super admin** (cadastra) e qualquer usuário autorizado da própria empresa que precise consultar esses contatos depois (ex: `owner` vendo quem é o contato financeiro cadastrado).

## Contexto
O company-service já tem um mecanismo de criptografia simétrica (AES-256-GCM) em produção, hoje usado exclusivamente para credenciais de pagamento (`api_key`/`api_secret` do PayGo/Mercado Pago em `company_payment_configs`, ver `services/company/main.py:43-67`). Esta história reaproveita esse mecanismo já validado em vez de criar um novo, e o generaliza — hoje as funções se chamam `encrypt_credential`/`decrypt_credential`, o que deixou de refletir seu uso real (não é mais só credencial de pagamento).

---

## Explorer

## História
Como **super admin cadastrando um novo cliente**, quero registrar os contatos comercial, financeiro, técnico e o responsável legal da empresa, com esses dados pessoais protegidos por criptografia no banco, para que a plataforma tenha os pontos de contato corretos por finalidade e esteja alinhada à LGPD quanto a dados pessoais em repouso.

### Contexto e motivação
Hoje, se alguém do time do ordin precisa saber quem é o financeiro de uma empresa cliente para tratar uma cobrança, não há onde essa informação esteja registrada no sistema — é informal (planilha, e-mail avulso). Isso também bloqueia ORD-059 (rastreio de contrato), que precisa saber para quem enviar o contrato para assinatura (o responsável legal).

### Personas afetadas
- **Super admin**: cadastra e consulta os contatos
- **Time comercial/CS**: usa o contato comercial para relacionamento contínuo
- **Financeiro**: usa o contato financeiro para cobrança e nota fiscal
- **Responsável legal da empresa cliente** (titular dos dados): é quem assina o contrato (ORD-059) — seus dados (nome, CPF, e-mail) são PII sensível e precisam de proteção reforçada

### Fluxo principal
1. Super admin, no mesmo fluxo de cadastro de ORD-056/057, preenche:
   - Contato comercial (obrigatório): nome, cargo, e-mail, telefone
   - Contato financeiro (opcional): nome, e-mail, telefone
   - Contato técnico (opcional): nome, e-mail, telefone
   - Responsável legal (obrigatório): nome completo, CPF, cargo, e-mail, telefone
2. Backend valida CPF do responsável legal (dígito verificador)
3. Ao persistir, cada campo de PII (nome, CPF, e-mail, telefone) é criptografado individualmente antes de ir ao banco
4. Ao consultar (`GET /companies/{id}/contacts` ou endpoint equivalente), os campos são descriptografados antes de retornar ao cliente autorizado

### Fluxos alternativos / exceções
- CPF do responsável legal com dígito verificador inválido → 422
- Contato financeiro/técnico ausentes → aceito, só comercial e responsável legal são obrigatórios
- Consulta por usuário de outra empresa → 403/404 (isolamento multi-tenant, igual a qualquer outro recurso do company-service)

### Dependências
- Serviços envolvidos: `company-service` apenas
- Histórias bloqueantes: nenhuma tecnicamente (pode rodar em paralelo com ORD-057), mas faz sentido sequenciar depois de ORD-056 por ser a mesma janela de migration/schema
- Bloqueia: ORD-059 (precisa do responsável legal cadastrado para saber a quem enviar o contrato)

### Critérios de aceite funcionais
- [ ] Contato comercial obrigatório, financeiro e técnico opcionais, persistidos com `type` distinguindo cada um
- [ ] Responsável legal obrigatório com CPF validado (dígito verificador)
- [ ] Todos os campos de PII (nome, CPF, e-mail, telefone) armazenados **criptografados** no banco — verificável inspecionando a tabela diretamente (não deve haver texto plano)
- [ ] Consulta autorizada retorna os dados **descriptografados** corretamente
- [ ] Isolamento multi-tenant: empresa A não acessa contatos/responsável legal da empresa B
- [ ] CPF inválido rejeitado com 422

### Wireframe / Mockup
N/A — mesmo caso de ORD-056/057, contrato de API é o entregável; UI fica para história de frontend futura.

---

## QA Explorer

```gherkin
Feature: Contatos segmentados e responsável legal com PII criptografada
  Como super admin
  Quero cadastrar contatos por finalidade e o responsável legal, com dados pessoais criptografados em repouso
  Para ter os pontos de contato corretos e atender LGPD

  Background:
    Dado que estou autenticado como super admin
    E existe uma empresa "Burger House" já cadastrada (company_id=1)

  Scenario: Cadastro de contato comercial (happy path)
    Dado nome, cargo, e-mail e telefone válidos para o contato comercial
    Quando envio POST /companies/1/contacts com type="comercial"
    Então a resposta é 201
    E ao consultar o registro diretamente no MySQL, os campos nome/e-mail/telefone não aparecem em texto plano
    E GET /companies/1/contacts retorna esses mesmos campos legíveis (descriptografados)

  Scenario: Cadastro do responsável legal com CPF válido
    Dado nome, CPF válido, cargo e e-mail do responsável legal
    Quando envio POST /companies/1/legal-representative
    Então a resposta é 201
    E o CPF é armazenado criptografado no banco

  Scenario: CPF do responsável legal com dígito verificador inválido
    Dado um CPF com o último dígito alterado
    Quando envio POST /companies/1/legal-representative
    Então a resposta é 422
    E nenhum registro é criado

  Scenario: Contato financeiro e técnico são opcionais
    Dado um cadastro de empresa contendo apenas o contato comercial e o responsável legal
    Quando consulto os contatos da empresa
    Então a ausência de contato financeiro/técnico não gera erro, apenas não retorna esses tipos

  Scenario: Isolamento multi-tenant nos contatos
    Dado que a empresa 2 (Pasta & Co) também tem contatos cadastrados
    Quando um usuário da empresa 1 tenta GET /companies/2/contacts
    Então a resposta é 403

  Scenario: Descriptografia correta preserva os dados originais
    Dado um contato cadastrado com nome "Maria Silva" e e-mail "maria@burgerhouse.com"
    Quando consulto esse contato via API
    Então os valores retornados são exatamente "Maria Silva" e "maria@burgerhouse.com", sem corrupção
```

**Aprovado pelo PM** — cenário de descriptografia correta é o mais crítico de todos: um bug de encoding/nonce na criptografia quebra o dado de forma silenciosa e só aparece depois, então QA deve rodar esse cenário com múltiplos valores (incluindo acentos e caracteres especiais em nomes) antes de aceitar a história.

---

## Tech Explorer

### Serviços impactados
- **company-service**: novas tabelas, generalização do módulo de criptografia existente, novos endpoints.

### Migrations
Nova migration, `down_revision` apontando para a criada em ORD-056/057 (a mais recente da cadeia no momento em que esta história for implementada):

```sql
CREATE TABLE company_contacts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  company_id INT NOT NULL,
  contact_type VARCHAR(20) NOT NULL,   -- comercial | financeiro | tecnico
  name_enc TEXT NOT NULL,
  role_title VARCHAR(80) NULL,          -- não é PII, fica em texto plano
  email_enc TEXT NOT NULL,
  phone_enc TEXT NULL,
  created_at DATETIME NOT NULL
);
CREATE INDEX ix_company_contacts_company_id ON company_contacts(company_id);

CREATE TABLE company_legal_representatives (
  id INT PRIMARY KEY AUTO_INCREMENT,
  company_id INT NOT NULL UNIQUE,       -- um responsável legal ativo por empresa neste MVP
  name_enc TEXT NOT NULL,
  cpf_enc TEXT NOT NULL,
  role_title VARCHAR(80) NULL,
  email_enc TEXT NOT NULL,
  phone_enc TEXT NULL,
  created_at DATETIME NOT NULL
);
```
Campos `_enc` são `TEXT` (não `VARCHAR`) porque o valor criptografado (base64 de nonce+ciphertext) é maior que o texto original.

### Generalização do módulo de criptografia
`services/company/main.py:48-67` — `encrypt_credential`/`decrypt_credential` são renomeadas para `encrypt_field`/`decrypt_field` (mesma implementação, sem mudança de algoritmo/chave — continua `AESGCM` com `CREDENTIAL_ENCRYPTION_KEY`). Todos os call sites existentes (`company_payment_configs`) são atualizados para o novo nome. **Nenhuma mudança de comportamento**, só nomenclatura — reduz risco de reescrever um mecanismo já validado em produção.

### Endpoints

#### POST /companies/{company_id}/contacts
**Auth:** JWT | role: `superadmin` ou `owner`/`manager` da própria empresa (reaproveita `_require_company_admin`, `main.py:145-149`)
Request: `{ "contact_type": "comercial|financeiro|tecnico", "name": "string", "role_title": "string|null", "email": "string", "phone": "string|null" }`
Response 201: contato criado (campos descriptografados na resposta, já que é o próprio criador vendo o que acabou de criar)
Erros: 400 (contact_type inválido), 403, 404 (empresa não encontrada)

#### GET /companies/{company_id}/contacts
**Auth:** mesma regra acima
Response 200: lista de contatos, campos descriptografados

#### POST /companies/{company_id}/legal-representative
**Auth:** `superadmin` ou `owner` (não `manager` — dado sensível de quem assina contrato, mesma régua de quem pode promover a owner)
Request: `{ "name": "string", "cpf": "string", "role_title": "string|null", "email": "string", "phone": "string|null" }`
Response 201/200 (upsert — um responsável legal ativo por empresa)
Erros: 422 (CPF inválido), 403

### Módulo novo
`services/company/domain/cpf.py` — validação de CPF (algoritmo mod 11 clássico, estável, sem as complicações do CNPJ alfanumérico): `normalize_cpf`, `is_valid_cpf`.

### company_id sempre do JWT
Igual a todo endpoint do projeto (`ARQUITETURA.md` §6) — `company_id` do path é comparado contra o do JWT (ou `superadmin` bypassa), nunca confiado cegamente.

### Impacto em outros serviços
Nenhum diretamente. Indiretamente, ORD-059 vai ler `company_legal_representatives` para saber o e-mail de destino do contrato.

### Eventos de fila
Não aplicável.

### Estimativa
- Backend: 5 pontos (2 tabelas novas, generalização de módulo existente, 3 endpoints, validação de CPF, testes de criptografia/descriptografia)

### Riscos
- **Baixo, mitigado por reuso**: como a criptografia já é usada em produção para `company_payment_configs`, o risco técnico do mecanismo em si é baixo — o risco real é só de aplicação correta (nonce único por valor, tratamento de string vazia/null antes de criptografar)
- Rotação de chave (`CREDENTIAL_ENCRYPTION_KEY`) não é tratada nesta história nem hoje no projeto — se a chave rotacionar, dados antigos ficam ilegíveis. Fora de escopo, mas vale registrar como débito técnico compartilhado com o mecanismo já existente

---

## Ready

**Explorer:** [x] · **QA Explorer:** [x] happy path, CPF inválido, opcionalidade de contatos, isolamento multi-tenant, integridade da descriptografia · **Tech Explorer:** [x] migrations, generalização do módulo de cripto existente, 3 endpoints, riscos documentados · **Aprovação final:** [x] solução técnica definida, estimativa 5 pontos, sem bloqueios técnicos novos (reaproveita mecanismo já em produção) — pendente apenas priorização de sprint.

**Status: Ready.**
