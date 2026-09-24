---
id: ORD-202
status: Ready
estimativa: 8 pontos
---

# Cadastro profissional de fornecedor

## Descrição

O cadastro de fornecedor (`Supplier`, catalog-service, `ORD-182`/A6) foi desenhado deliberadamente
mínimo — nome, CNPJ, telefone, email — porque na época o único motivo dele existir era alimentar
B1 (importação de NF) e C1 (vínculo automático). Isso é suficiente pro *sistema* funcionar, mas
insuficiente pra Empresa *gerir* o relacionamento com o fornecedor como um cadastro de negócio de
verdade: sem razão social, sem endereço, sem saber quem é o contato comercial ou o responsável
legal do fornecedor. Esta história leva o cadastro de fornecedor ao mesmo nível de completude do
cadastro de cliente/empresa já existente (`Company`, company-service), reaproveitando a mesma
integração de consulta de CNPJ.

## Persona

Admin da empresa — mesma persona de `ORD-182`, no fluxo de gestão de fornecedores.

## Contexto

Achado pelo próprio usuário revisando o épico de estoque/ERP: mesmo com o épico encerrado (Blocos
A-D/F/G mergeados, B2/Bloco E descartados por decisão de produto, ver
`docs/estudo-modulo-estoque-erp.md`), ficou um gap de qualidade no cadastro de fornecedor que vale
corrigir antes de mudar o foco do projeto pra integradores de pagamento.

**Desmembrada em duas histórias** (decisão do usuário, confirmada no Explorer): esta (`ORD-202`)
cobre só o cadastro manual completo. O fluxo de "fornecedor criado automaticamente durante a
importação de NF, sinalizado como pendente de revisão" vira `ORD-203`, história futura separada,
dependente desta — só faz sentido sinalizar "cadastro incompleto" depois que existir mais cadastro
pra completar.

## História

Como Admin da empresa, quero cadastrar fornecedores com o mesmo nível de detalhe e confiabilidade
do cadastro de cliente/empresa (dados cadastrais completos, endereço, contatos tipados, responsável
legal, validado por consulta de CNPJ), para ter um cadastro de fornecedor profissional e confiável,
não só um registro mínimo pra casar NF.

## Fluxo principal

1. Admin abre "Fornecedores" → "Novo fornecedor" (ou edita um existente) — `SupplierFormScreen.tsx`
   continua página única, ganha seções.
2. Digita o CNPJ — sistema consulta a Receita (cascata BrasilAPI → ReceitaWS → cnpj.ws) e
   pré-preenche razão social, nome fantasia, endereço e situação cadastral — tudo editável.
3. Se a situação cadastral não vier "ATIVA", sistema alerta (`Alert variant="warning"`) mas **não
   bloqueia** — diferente do cadastro de empresa, que bloqueia.
4. Admin completa/revisa: dados cadastrais, endereço, contato comercial (obrigatório), responsável
   legal (opcional).
5. Admin confirma — fornecedor salvo com cadastro completo.
6. Fornecedor aparece na listagem — sem mudança visual na tela de listagem nesta história.

## Fluxos alternativos / exceções

- **CNPJ não encontrado / consulta indisponível**: degradação graciosa, mesmo padrão de `Company`
  — admin preenche manualmente, sem bloqueio.
- **CNPJ inativo na Receita**: alerta (`warning`), nunca bloqueia — decisão explícita, diverge do
  comportamento de `Company` (que bloqueia).
- **Responsável legal tocado parcialmente**: se qualquer campo da seção for preenchido, nome +
  telefone + email viram obrigatórios juntos — CPF continua sempre opcional, mesmo com a seção
  "ativada" (decisão do repasse de PM, diverge intencionalmente de `CompanyLegalRepresentative`,
  onde CPF é obrigatório).
- **Fornecedor criado automaticamente durante importação de NF**: fora de escopo — vira `ORD-203`.
- **Edição limpando o responsável legal já preenchido**: registro é removido (`SupplierLegalRepresentative`
  deletado), não fica "meio preenchido" — ver Tech Explorer.

## Dependências

- Serviços envolvidos: `catalog` (dono de `Supplier`, ganha tabelas novas), `company` (dona de
  `lookup_cnpj`/`encrypt_field`, viram referência canônica em `services/shared/`, copiadas
  localmente pra `catalog-service` — build context de cada serviço não permite import direto de
  `services/shared/`, ver Tech Explorer).
- Histórias bloqueantes: nenhuma — `ORD-182` (A6) já mergeada, é a base que esta história estende.
- Desbloqueia: `ORD-203` (fluxo de pendência de cadastro na importação automática de NF).

## Critérios de aceite funcionais

- [ ] Cadastro de fornecedor tem: dados cadastrais (razão social, nome fantasia, CNPJ, inscrição
      estadual/municipal opcionais), endereço completo, contato comercial (obrigatório), responsável
      legal (opcional).
- [ ] Digitar um CNPJ válido dispara consulta à Receita e pré-preenche razão social/nome
      fantasia/endereço/situação cadastral, todos editáveis depois.
- [ ] Consulta indisponível ou CNPJ não encontrado não bloqueia o cadastro.
- [ ] CNPJ inativo na Receita gera alerta visual (`warning`), mas não bloqueia o cadastro.
- [ ] Contato comercial é obrigatório (nome+telefone+email); responsável legal é opcional, mas se
      tocado exige nome+telefone+email juntos (CPF sempre opcional).
- [ ] Fornecedores existentes (cadastrados antes desta história) continuam funcionando sem quebrar
      — migration aditiva, campos novos nullable.
- [ ] Isolamento multi-tenant: `SupplierContact`/`SupplierLegalRepresentative` têm `company_id`
      próprio (não é PK global — `Supplier.id` é sequencial por empresa, diferente de `product_id`).
- [ ] Endpoint novo de consulta de CNPJ exige autenticação (401 sem token, 403 fora de
      `_WRITE_ROLES`) mesmo não sendo dado de tenant.
- [ ] `SupplierListOut`/a tela de listagem não ganham coluna nova nem indicador visual nesta
      história — o payload pode crescer (reaproveita `SupplierOut`), a tela não muda.

## Wireframe / Mockup

`SupplierFormScreen.tsx` (página única, `ComboFormScreen.module.scss`) ganha 4 seções empilhadas:
Dados cadastrais (com lookup de CNPJ debounced 500ms) → Endereço → Contato comercial → Responsável
legal (opcional, sempre visível, nunca obrigatório — sem checkbox/seção colapsável, mesmo padrão já
usado pra telefone/email opcionais hoje). Botão único "Salvar fornecedor" no fim — sem validação por
passo (diferente do wizard de 5 passos de `NewCompanyScreen.tsx`, que não se aplica aqui pela menor
quantidade de campos obrigatórios). Referência visual de precedente pro Alert não-bloqueante:
`NewCompanyScreen.tsx:323-326` (`variant="warning"`, `icon="alert-triangle"`).

## QA Explorer

### Rastreabilidade — Critério (Explorer) → Cenário

| # | Critério | Cenário(s) |
|---|---|---|
| 1 | Campos novos (cadastrais/endereço/contato/responsável legal) | *Criação com todos os campos* / *Criação só com os obrigatórios* |
| 2 | CNPJ lookup pré-preenche | *CNPJ válido dispara consulta e preenche os campos* |
| 3 | Lookup indisponível/não encontrado não bloqueia | *Consulta indisponível* / *CNPJ não encontrado* |
| 4 | CNPJ inativo → warning, não bloqueia | *CNPJ com situação diferente de ATIVA* |
| 5 | Fornecedor existente continua funcionando | *Fornecedor cadastrado antes desta história* |
| 6 | Isolamento multi-tenant nas tabelas novas | *Contato de outra empresa não acessível* / *Responsável legal de outra empresa não acessível* |
| 7 | Endpoint de lookup exige auth | *Sem token → 401* / *Role sem permissão → 403* / *Sem filtro por company_id (consciente)* |
| 8 | Listagem inalterada na tela, payload pode crescer | *Payload de listagem inclui campos novos* / *Tela continua com as mesmas colunas* |

### Cenários Gherkin

```gherkin
Feature: Cadastro profissional de fornecedor
  Como Admin da empresa
  Quero cadastrar fornecedores com dados cadastrais completos, endereço, contato e responsável legal
  Para ter um cadastro de fornecedor tão confiável quanto o de cliente/empresa

  Background:
    Dado que estou autenticado como admin da empresa "Burger House" (company_id=1)

  # ── Happy path (Critério 1) ────────────────────────────────────────────────

  Scenario: Criação com todos os campos preenchidos
    Dado que estou na tela de novo fornecedor
    Quando preencho razão social, nome fantasia, CNPJ válido, inscrição estadual, endereço completo, contato comercial e responsável legal
    E salvo o fornecedor
    Então o fornecedor é criado com todos os campos persistidos
    E o contato comercial fica associado a ele em SupplierContact
    E o responsável legal fica associado a ele em SupplierLegalRepresentative

  Scenario: Criação só com os campos obrigatórios
    Dado que estou na tela de novo fornecedor
    Quando preencho apenas nome, CNPJ válido e o contato comercial (nome/telefone/email)
    E deixo inscrição estadual/municipal, endereço e responsável legal em branco
    E salvo o fornecedor
    Então o fornecedor é criado com sucesso, sem erro de validação pelos campos em branco

  # ── CNPJ lookup (Critério 2) ────────────────────────────────────────────────

  Scenario: CNPJ válido dispara consulta e preenche os campos, editáveis depois
    Dado que estou na tela de novo fornecedor
    Quando digito um CNPJ válido e ativo na Receita
    Então após o debounce a consulta é disparada com indicador de carregamento
    E ao concluir, razão social, nome fantasia e endereço são preenchidos automaticamente
    E consigo editar qualquer um desses campos antes de salvar

  # ── Degradação graciosa (Critério 3) ────────────────────────────────────────

  Scenario: Consulta à Receita indisponível — cadastro segue manual
    Dado que a consulta de CNPJ está indisponível (timeout ou erro 5xx)
    Quando digito um CNPJ válido
    Então nenhum campo é preenchido automaticamente
    E preencho manualmente e salvo normalmente, sem bloqueio

  Scenario: CNPJ não encontrado na Receita — cadastro segue manual
    Dado que consulto um CNPJ válido mas não encontrado na base da Receita
    Quando a consulta retorna sem resultado
    Então o cadastro continua liberado pra preenchimento manual e salvamento

  # ── Divergência de comportamento frente a Company (Critério 4) ─────────────

  Scenario: CNPJ com situação diferente de ATIVA — alerta mas não bloqueia
    Dado que consulto um CNPJ cuja situação cadastral na Receita não é "ATIVA"
    Quando a consulta retorna com sucesso
    Então um Alert de variant "warning" é exibido (nunca "error")
    E o botão "Salvar fornecedor" permanece habilitado
    E consigo salvar o fornecedor normalmente
    # Contraste deliberado com NewCompanyScreen.tsx:311-314 (Company bloqueia
    # com Alert "error" no mesmo caso) — não pode ser implementado copiando
    # esse bloqueio por engano.

  # ── Regressão do fluxo mínimo já existente (ORD-182) ────────────────────────

  Scenario: Fornecedor cadastrado antes desta história continua editável e visível
    Dado que existe um fornecedor criado antes desta história, só com nome/CNPJ/telefone/email
    Quando abro esse fornecedor pra edição
    Então os campos novos aparecem em branco, sem erro de carregamento
    E consigo salvar sem preencher os campos novos, sem quebrar o registro existente

  Scenario: CNPJ inválido é rejeitado na criação
    Dado que estou na tela de novo fornecedor
    Quando digito um CNPJ com dígito verificador inválido
    Então o campo exibe "CNPJ inválido" e "Salvar fornecedor" permanece desabilitado

  Scenario: CNPJ duplicado na mesma empresa é rejeitado
    Dado que já existe um fornecedor com CNPJ "12.345.678/0001-99" na minha empresa
    Quando tento criar um novo fornecedor com o mesmo CNPJ
    Então a criação é rejeitada com erro de duplicidade

  Scenario: Exclusão de fornecedor continua funcionando
    Dado que existe um fornecedor com contato comercial e responsável legal preenchidos
    Quando excluo esse fornecedor
    Então o fornecedor é removido
    E seus registros associados em SupplierContact/SupplierLegalRepresentative também deixam de existir

  # ── Isolamento multi-tenant nas tabelas novas (Critério 6) ──────────────────

  Scenario: Contato comercial de fornecedor de outra empresa não é acessível
    Dado que a empresa "Pasta & Co" tem um fornecedor com contato comercial cadastrado
    Quando eu, autenticado como admin da "Burger House", tento acessar esse fornecedor por id
    Então recebo 404
    E nenhum dado do contato comercial da "Pasta & Co" vaza na resposta

  Scenario: Responsável legal de fornecedor de outra empresa não é acessível
    Dado que a empresa "Pasta & Co" tem um fornecedor com responsável legal cadastrado
    Quando eu, autenticado como admin da "Burger House", listo ou edito meus próprios fornecedores
    Então o responsável legal do fornecedor da "Pasta & Co" nunca aparece em nenhuma resposta minha

  # ── Auth do endpoint de CNPJ lookup (Critério 7, achado do repasse de QA) ───

  Scenario: Consulta de CNPJ sem token é rejeitada
    Dado que não estou autenticado
    Quando chamo GET /catalog/suppliers/cnpj-lookup/12345678000199
    Então recebo 401

  Scenario: Consulta de CNPJ com role sem permissão de escrita é rejeitada
    Dado que estou autenticado com role "cashier" (fora de _WRITE_ROLES)
    Quando chamo GET /catalog/suppliers/cnpj-lookup/12345678000199
    Então recebo 403

  Scenario: Consulta de CNPJ não é filtrada por company_id, de propósito
    Dado que estou autenticado como admin de qualquer empresa válida
    Quando consulto um CNPJ de terceiro (não é CNPJ de nenhuma empresa cadastrada no Ordin)
    Então recebo a resposta normal do lookup — não é dado de tenant, é consulta pública de CNPJ

  # ── Listagem — payload cresce, tela não muda (Critério 8) ───────────────────

  Scenario: Payload de listagem inclui os campos novos, mesmo que a tela não os exiba
    Dado um fornecedor com cadastro completo (endereço, contato, responsável legal)
    Quando chamo GET /catalog/suppliers
    Então a resposta de cada item inclui os campos novos (endereço, cadastral_status)

  Scenario: Listagem de fornecedores permanece com as mesmas colunas de hoje
    Dado que existem fornecedores com cadastro completo e fornecedores antigos (cadastro mínimo)
    Quando abro a listagem de fornecedores
    Então as colunas exibidas são exatamente Nome/CNPJ/Telefone/E-mail/Criado em/Ações
    E nenhum indicador visual de "cadastro incompleto" aparece nesta história (fica pra ORD-203)

  # ── Validação condicional do responsável legal (achado do repasse de Backend) ─

  Scenario: Responsável legal parcialmente preenchido é rejeitado
    Dado que estou cadastrando um fornecedor com contato comercial válido
    Quando preencho apenas o nome do responsável legal, deixando telefone e email em branco
    E tento salvar o fornecedor
    Então a API retorna 422 com "Responsável legal: nome, telefone e e-mail são obrigatórios juntos quando preenchido"
    E nenhum fornecedor é criado

  Scenario: Responsável legal com CPF em branco é aceito (CPF sempre opcional)
    Dado que estou cadastrando um fornecedor com contato comercial válido
    Quando preencho nome, telefone e email do responsável legal, deixando CPF em branco
    E salvo o fornecedor
    Então o fornecedor é criado com sucesso, com SupplierLegalRepresentative.cpf_enc nulo

  Scenario: Editar fornecedor limpando o responsável legal remove o registro
    Dado um fornecedor com responsável legal já cadastrado
    Quando edito o fornecedor e apago todos os campos da seção de responsável legal
    E salvo
    Então o registro em SupplierLegalRepresentative é removido, não fica parcialmente preenchido
```

### Nota de execução de teste

Estratégia de regressão do CRUD: `test_ord182_cadastro_fornecedor.py` tem 16 testes hoje — suíte
grande o suficiente pra merecer a mesma cerimônia de D1/D2: rodar como baseline antes de tocar em
`create_supplier`/`update_supplier`, alterar o código, rodar de novo — qualquer teste que quebrar é
regressão real.

## Tech Explorer

### Correções aplicadas nos repasses (achados reais)

1. **(Backend, bloqueador corrigido)** "Promover `cnpj_lookup.py`/`encrypt_field` pra
   `services/shared/`" não é buildável como uma promoção simples — cada serviço tem build context
   escopado à própria pasta (`docker-compose.yml`: `build: ./services/catalog`), sem acesso a
   `services/shared/`. Correção: `services/shared/` vira referência canônica; `catalog-service`
   ganha **cópia local** (`services/catalog/cnpj_lookup.py`), mesmo padrão já usado por
   `auth.py`/`config.py` (drift risk já aceito conscientemente pro projeto).
2. **(Backend)** `cryptography==42.0.7` já está em `services/catalog/requirements.txt` — sem
   dependência nova pra reaproveitar `encrypt_field`.
3. **(Backend)** `supplier_contacts.supplier_id` corrigido pra `unique=True` — estava faltando na
   primeira versão da migration, inconsistente com o payload (`contato` é objeto único, não lista).
4. **(Backend)** Lógica de upsert-ou-delete do responsável legal opcional desenhada explicitamente
   — 3 estados de transição (nunca existiu → criado; existia → editado; existia → removido se
   limpo na edição).
5. **(QA)** Endpoint de CNPJ lookup ganhou cenários de auth próprios (não existiam no QA Explorer
   original, porque o endpoint só foi desenhado no Tech Explorer).
6. **(QA)** `SupplierOut` cresce com os campos novos; `SupplierListOut` reaproveita o mesmo schema
   — payload pode crescer sem a tela mudar, agora explícito.

### Serviços impactados

- `catalog`: `Supplier` ganha colunas novas; 2 tabelas novas (`SupplierContact`,
  `SupplierLegalRepresentative`); 5 endpoints de `Supplier` alterados (payload maior); endpoint novo
  de CNPJ lookup; cópia local de `cnpj_lookup.py`/`encrypt_field`.
- `company`: nenhuma mudança de comportamento — só vira a fonte de referência de
  `services/shared/cnpj_lookup.py`/`crypto.py`.
- `frontend/admin`: `SupplierFormScreen.tsx` ganha 4 seções; `types.ts` reflete os campos novos.

### Endpoints

#### GET /catalog/suppliers/cnpj-lookup/{cnpj}
**Serviço:** catalog · **Auth:** JWT, role em `_WRITE_ROLES` · **company_id:** não usado (lookup
público de CNPJ, não dado de tenant — decisão consciente, ver cenário de QA)

Response 200 (sempre — nunca erro, degrada internamente):
```json
{"found": true, "cadastral_status": "ATIVA", "legal_name": "...", "trade_name": "...",
 "zip_code": "...", "street": "...", "address_number": "...", "complement": "...",
 "neighborhood": "...", "city": "...", "state": "SP"}
```

#### POST /catalog/suppliers (existente, payload alterado)
**Serviço:** catalog · **Auth:** JWT, `_WRITE_ROLES` · **company_id:** do JWT

Request:
```json
{
  "nome": "Coca-Cola Distribuidora", "cnpj": "12345678000199",
  "razao_social": "...", "nome_fantasia": "...",
  "inscricao_estadual": null, "inscricao_municipal": null,
  "zip_code": "...", "street": "...", "address_number": "...", "complement": null,
  "neighborhood": "...", "city": "...", "state": "SP",
  "contato": {"nome": "...", "telefone": "...", "email": "..."},
  "responsavel_legal": {"nome": null, "cpf": null, "telefone": null, "email": null}
}
```

`contato` sempre obrigatório. `responsavel_legal` opcional como objeto — se qualquer campo
não-nulo, exige `nome`+`telefone`+`email` juntos (`cpf` sempre opcional):

```python
class SupplierLegalRepresentativeIn(BaseModel):
    nome: str | None = None
    cpf: str | None = None
    telefone: str | None = None
    email: str | None = None

    @model_validator(mode="after")
    def _completo_se_tocado(self):
        tocou = any([self.nome, self.cpf, self.telefone, self.email])
        if tocou and not (self.nome and self.telefone and self.email):
            raise ValueError("Responsável legal: nome, telefone e e-mail são obrigatórios juntos quando preenchido")
        return self
```

`PUT /catalog/suppliers/{id}`, `GET /catalog/suppliers`, `GET/DELETE /catalog/suppliers/{id}`:
mesmos endpoints existentes, `SupplierOut` cresce com os campos novos.

### Migrations (catalog-service, `fk_catalog`)

```python
def upgrade() -> None:
    op.add_column("suppliers", sa.Column("razao_social", sa.String(150), nullable=True))
    op.add_column("suppliers", sa.Column("nome_fantasia", sa.String(150), nullable=True))
    op.add_column("suppliers", sa.Column("inscricao_estadual", sa.String(20), nullable=True))
    op.add_column("suppliers", sa.Column("inscricao_municipal", sa.String(20), nullable=True))
    op.add_column("suppliers", sa.Column("cadastral_status", sa.String(20), nullable=True))
    op.add_column("suppliers", sa.Column("zip_code", sa.String(9), nullable=True))
    op.add_column("suppliers", sa.Column("street", sa.String(150), nullable=True))
    op.add_column("suppliers", sa.Column("address_number", sa.String(20), nullable=True))
    op.add_column("suppliers", sa.Column("complement", sa.String(100), nullable=True))
    op.add_column("suppliers", sa.Column("neighborhood", sa.String(100), nullable=True))
    op.add_column("suppliers", sa.Column("city", sa.String(100), nullable=True))
    op.add_column("suppliers", sa.Column("state", sa.String(2), nullable=True))

    op.create_table(
        "supplier_contacts",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("supplier_id", sa.Integer, sa.ForeignKey("suppliers.id"), nullable=False, unique=True),
        sa.Column("company_id", sa.Integer, nullable=False, index=True),
        sa.Column("nome", sa.String(120), nullable=False),
        sa.Column("telefone", sa.String(20), nullable=False),
        sa.Column("email", sa.String(120), nullable=False),
    )
    op.create_table(
        "supplier_legal_representatives",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("supplier_id", sa.Integer, sa.ForeignKey("suppliers.id"), nullable=False, unique=True),
        sa.Column("company_id", sa.Integer, nullable=False, index=True),
        sa.Column("name_enc", sa.String(500), nullable=False),
        sa.Column("cpf_enc", sa.String(500), nullable=True),
        sa.Column("phone_enc", sa.String(500), nullable=False),
        sa.Column("email_enc", sa.String(500), nullable=False),
    )
```

`company_id` nas duas tabelas novas **não é redundante**: `Supplier.id` não é PK global cross-empresa
(diferente de `product_id`) — é necessário pra checagem direta de tenant sem `JOIN`.

### Impacto em outros serviços

Nenhum — `B1`/`C1`/`C2` continuam lendo só `Supplier.nome`/`.cnpj`, sem tocar nos campos novos.

### Eventos de fila

Nenhum — CRUD síncrono, mesmo padrão do resto de `Supplier`.

### Estimativa

| Frente | Estimativa |
|---|---|
| Migration + `Supplier`/`SupplierContact`/`SupplierLegalRepresentative` + validação condicional + upsert/delete | ~3.5h |
| Cópia local de `cnpj_lookup.py`/`encrypt_field` em catalog-service + `CREDENTIAL_ENCRYPTION_KEY` no ambiente | ~1.5h |
| Endpoint de CNPJ lookup + 5 endpoints de Supplier alterados | ~2.5h |
| Frontend — `SupplierFormScreen.tsx` (4 seções, lookup debounced, validação condicional) | ~4h |
| Testes (baseline de regressão dos 16 existentes + ~18 cenários novos) | ~4h |
| **Total** | **~15.5h ≈ 8 pontos** |

### Riscos

- **`CREDENTIAL_ENCRYPTION_KEY` precisa existir também no ambiente de `catalog-service`** —
  mudança de infra (`docker-compose.yml`/`.env.example`/Secrets Manager Terraform), não só código —
  bloqueador de implementação, não risco a monitorar depois.
- **Migration em tabela já usada em produção** (`suppliers`, populada desde `ORD-182`) — `ADD
  COLUMN` nullable, sem backfill, baixo risco.
- **CPF opcional em `SupplierLegalRepresentative` diverge do padrão de `CompanyLegalRepresentative`**
  (lá `cpf_enc` é obrigatório) — divergência intencional e já justificada, mas merece comentário no
  código apontando pra decisão, pra quem comparar as duas tabelas não estranhar a assimetria.
- **Drift entre a cópia de `cnpj_lookup.py` em `catalog-service` e a referência em
  `services/shared/`** — mesmo risco já aceito conscientemente pra `auth.py`/`config.py`, não é
  novo, mas cresce em superfície com mais um arquivo copiado.

## Repasse por papel (antes de Ready)

| Papel | Achado | Ação |
|---|---|---|
| PM | Rastreabilidade Explorer → QA Explorer revisada, sem lacuna | Aprovado, sem achado |
| PM | Decisão em aberto sobre responsável legal parcial | Fechada: nome+telefone+email obrigatórios juntos quando a seção é tocada; CPF sempre opcional |
| QA | Cenário de responsável legal parcial ficou "em aberto" no QA Explorer original, precisava de asserção fixa após a decisão do Tech Explorer | 3 cenários reescritos com asserção fixa |
| QA | `SupplierOut`/listagem — Tech Explorer não deixou explícito se o payload cresce ou só a tela | Esclarecido: payload cresce (`SupplierOut`), tela não muda — 2 cenários novos |
| QA | Endpoint de CNPJ lookup sem cenário de auth próprio (desenhado depois do QA Explorer original) | 3 cenários novos (401, 403, sem filtro por company_id consciente) |
| QA | Estratégia de regressão do CRUD — suíte de `ORD-182` é pequena o suficiente pra dispensar baseline? | Não — 16 testes, mesma cerimônia de D1/D2 aplicada |
| Backend | "Promover pra `services/shared/`" não é buildável como promoção simples — build context de cada serviço é escopado à própria pasta | Corrigido: cópia local em `catalog-service`, `services/shared/` como referência, mesmo padrão de `auth.py`/`config.py` |
| Backend | Dependência nova de `cryptography` pra reaproveitar `encrypt_field`? | Não — já está em `requirements.txt` de catalog-service |
| Backend | `supplier_contacts.supplier_id` sem `unique=True`, inconsistente com payload de objeto único | Corrigido na migration |
| Backend | Lógica de upsert-ou-delete do responsável legal opcional não estava desenhada | Desenhada explicitamente, 3 estados de transição |

## Rastreabilidade ponta a ponta (checklist de Ready)

| Passo do Fluxo Principal | Critério de aceite | Cenário Gherkin | Endpoint/tela |
|---|---|---|---|
| 1. Abrir tela de novo/editar fornecedor | ✅ (implícito) | *Criação com todos os campos* | `SupplierFormScreen.tsx` |
| 2. CNPJ dispara consulta e pré-preenche | ✅ Critério 2 | *CNPJ válido dispara consulta...* | `GET /catalog/suppliers/cnpj-lookup/{cnpj}` |
| 3. CNPJ inativo → alerta, não bloqueia | ✅ Critério 4 | *CNPJ com situação diferente de ATIVA* | mesmo endpoint, `Alert` no frontend |
| 4. Admin completa dados/endereço/contato/responsável legal | ✅ Critério 1, 5 | *Criação com todos* / *só obrigatórios* / *responsável legal parcial* | `POST`/`PUT /catalog/suppliers` |
| 5. Confirma — fornecedor salvo | ✅ Critério 1 | *Criação com todos os campos preenchidos* | `POST /catalog/suppliers` |
| 6. Aparece na listagem, sem mudança visual | ✅ Critério 8 | *Payload cresce* / *Tela mantém colunas* | `GET /catalog/suppliers` |

Todas as linhas preenchidas — nenhum passo do Fluxo Principal ficou só em prosa sem virar critério,
cenário e endpoint/tela correspondente.

### Checklist final

- [x] Explorer — história, contexto, fluxo, dependências, critérios de aceite completos
- [x] UX/Frontend — desenho de tela revisado (formulário único seccionado, não wizard; Alert
      warning não-bloqueante; seção de responsável legal sempre visível)
- [x] QA Explorer — happy path, bordas, erros, rastreabilidade 1:1, aprovado por PM
- [x] Tech Explorer — serviços impactados, endpoints, migrations, estimativa, riscos
- [x] Repasse de PM — 2 achados aplicados (rastreabilidade confirmada, decisão de responsável legal fechada)
- [x] Repasse de QA — 3 achados aplicados (cenários novos de validação condicional, listagem, auth do lookup)
- [x] Repasse de Backend — 4 achados aplicados (mecânica de `services/shared/` corrigida, dependência confirmada, migration corrigida, lógica de upsert/delete desenhada)
- [x] Rastreabilidade ponta a ponta — tabela acima, sem célula vazia
- [x] Sem bloqueios não resolvidos

## Implementação — achados reais (2026-09-24)

1. **`CREDENTIAL_ENCRYPTION_KEY` já estava disponível em catalog-service** — o risco/bloqueador
   sinalizado no Tech Explorer/repasse de Backend (precisar adicionar a env var ao ambiente do
   serviço) era falso: `catalog-service` já usa `env_file: .env` no `docker-compose.yml`, que
   carrega **todo** o `.env` pro container, não só as variáveis listadas em `environment:`.
   Confirmado com `docker exec` antes de tocar em infra — nenhuma mudança de `docker-compose.yml`/
   `.env.example` foi necessária.
2. **`ForeignKey` sem `ON DELETE CASCADE` quebrava a exclusão de fornecedor com filhos, achado ao
   vivo contra o MySQL real** — `delete_supplier` chamando `db.delete(contact)`/`db.delete(rep)`/
   `db.delete(s)` na ordem "certa" ainda falhou com `IntegrityError` de FK
   (`supplier_legal_representatives_ibfk_1`), porque não há `relationship()` do SQLAlchemy
   configurada entre `Supplier` e seus filhos — o unit-of-work não tem grafo de dependência pra
   ordenar os `DELETE`s sozinho, só a ordem de chamada não garante nada no flush. Não pego pela
   suíte SQLite dos testes (SQLite não aplica FK por padrão nesse setup). Corrigido em duas
   camadas: `ON DELETE CASCADE` nas duas FKs (migration + modelo, defesa no banco) **e** um
   `await db.flush()` explícito entre apagar os filhos e apagar o pai no código da aplicação (pra
   funcionar de forma idêntica em SQLite/MySQL, sem depender só do CASCADE). Verificado ao vivo
   contra o MySQL real após a correção — `DELETE` retorna 204, filhos confirmados removidos via
   query direta no banco.
3. **Achado durante o teste ao vivo, fora de escopo desta história**: sessão `superadmin` recebe
   `400 Bad Request` (`"Parâmetro company_id é obrigatório para superadmin/admin"`) em qualquer
   endpoint de `Supplier`, incluindo o novo de CNPJ lookup — confirmado como **gap pré-existente**
   desde `ORD-182` (`SupplierListScreen.tsx`/`SupplierFormScreen.tsx` nunca usaram
   `useCatalogParams()`, ao contrário de outras telas do admin que suportam navegação de
   superadmin entre empresas). Não é regressão desta história — o endpoint novo só herdou o
   mesmo `Depends(resolve_company_id_write)` já usado no resto do arquivo. Registrado aqui pra não
   se perder, não corrigido (fora do escopo de ORD-202).
4. Testado ao vivo de ponta a ponta com sessão de tenant real (`role: owner`): CNPJ ativo
   (`11222333000181`) disparou a consulta, preencheu razão social/nome fantasia/endereço
   automaticamente, `Alert variant="success"`; criação com contato comercial completo; edição
   pré-carregando todos os campos corretamente (incluindo `contato` aninhado); exclusão
   confirmada 204 com filhos removidos do banco. `SupplierListScreen.tsx` exibindo
   telefone/e-mail a partir de `contato` corretamente (fallback pros campos legados confirmado
   no código, não testado ao vivo por falta de fornecedor pré-ORD-202 sem contato disponível pro teste).

Suíte completa: 533 testes em `catalog-service` (16 novos + 5 arquivos de teste pré-existentes
atualizados pra incluir `contato`, agora obrigatório: `test_ord182`, `test_ord194`, `test_ord195`
(3 call sites), `test_ord197` (2 call sites) — nenhuma lógica de teste mudou, só o payload de
setup). `ruff check services/catalog/` limpo. `tsc --noEmit` (frontend/admin) limpo. Migration
aplicada com sucesso contra o MySQL real de dev.
