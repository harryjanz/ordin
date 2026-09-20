---
id: ORD-182
status: Ready
estimativa: 3 pontos (backend + frontend)
fase: null
sprint: null
responsavel: Backend SR + Frontend
---

# ORD-182 — Cadastro de fornecedor

## Descrição
História **A6** do épico de estoque/ERP (`docs/estudo-modulo-estoque-erp.md`, Bloco A —
Fundação). Elevada da Fase 3 (gestão avançada de fornecedores) pro Bloco A por pedido explícito do
usuário, reforçado pela própria pesquisa técnica do épico: o vínculo automático por código do
fornecedor (história C1, mais adiante) precisa de fornecedor como entidade real, não um cadastro
criado de passagem durante a importação de XML. Escopo aqui é **cadastro simples**: nome, CNPJ,
contato — sem cotação, sem pedido de compra formal (isso continua na Fase 3).

## Persona
**Empresa** (owner/manager/admin que gerencia catálogo e compras) — mesmo escopo de papel de
"Catálogo" na sidebar, não é uma função exclusiva de superadmin/admin (diferente de "Comercial",
que é preço/plano da plataforma).

## Explorer

### História
Como **Empresa**, quero cadastrar meus fornecedores (nome, CNPJ, contato), para ter uma base
estruturada usada tanto na importação de notas fiscais de compra quanto no vínculo automático de
itens por código do fornecedor.

### Decisão de escopo — CNPJ obrigatório (revertido após checagem com o usuário)
`cnpj` é **obrigatório**, validado por checksum, único por empresa. Uma rodada anterior desta
história (revisão de PM) tinha tornado o campo opcional pra suportar "fornecedor informal" — o
usuário questionou essa decisão corretamente: o único motivo de `Supplier` existir como entidade
neste épico é alimentar B1 (importação de XML) e C1 (vínculo automático por código do fornecedor)
— ambos só fazem sentido pra fornecedor que **emite NF de verdade**. Um fornecedor informal (feira,
produtor local sem nota fiscal) nunca vai aparecer como emitente de XML, então não há propósito
funcional em cadastrá-lo aqui — quem quiser só anotar que "comprou de alguém" sem estrutura fiscal
já tem esse caminho na A2 (ajuste manual de estoque, que não depende de `Supplier`). Checagem rápida
de mercado antes de reverter: ERPs de propósito geral (Omie, sistemas Senior/ERPFlex) de fato
suportam fornecedor pessoa física ou sem documento — mas isso serve pra escopo mais amplo deles
(contas a pagar de qualquer contraparte), não é argumento pra replicar aqui, onde o escopo do
`Supplier` é deliberadamente mais estreito (só alimentar automação fiscal via NF).

### Decisão de escopo — onde a UI vive (posição e ícone corrigidos na revisão de PM)
Diferente de "Comercial" (que é preço/plano da plataforma, superadmin/admin only), fornecedor é
operação da própria empresa cliente — mesmo escopo de papel de "Catálogo". Item novo na sidebar
(`Sidebar.tsx`), **posicionado logo depois de "Catálogo" (linha 14) e antes de "Pedidos" (linha
15)** — agrupa as duas telas de gestão de cardápio/insumo antes das telas operacionais:
```
{ to: "/suppliers", label: "Fornecedores", icon: "box", roles: ["superadmin", "admin", "owner", "manager"] }
```
Ícone `box` (não `truck` — **confirmado que `icon-truck` não existe** no icon-font real do projeto,
`vendor/design-system/dist/core/icons/icons.css`; disponíveis: `archive`, `box`, `inbox`, `package`
— `package` já está em uso por "Catálogo", `box` é a opção mais próxima sem colidir).

Tela própria (`SupplierListScreen.tsx` + `SupplierFormScreen.tsx`), mesmo padrão de lista/formulário
já usado em `FiscalAddonPlanListScreen.tsx`/`FiscalAddonPlanFormScreen.tsx` — não uma aba dentro de
outra tela, porque hoje não existe nenhuma outra tela do domínio "Estoque" pra consolidar junto
(diferente do caso de "Comercial", que uniu duas telas já existentes). **Nota pra revisitar**:
quando B1 (notas de compra) e C2 (fila de pendência) existirem, vale reavaliar se "Fornecedores"
devia consolidar com elas sob um item de sidebar "Estoque" só — mesmo racional já aplicado em
"Comercial" (ORD-174) — mas não faz sentido adiantar essa consolidação agora com só 1 tela
existindo.

### Fluxo principal
1. Empresa acessa "Fornecedores" na sidebar.
2. Cria um fornecedor novo: nome, CNPJ (validado por checksum), telefone/e-mail (opcional).
3. Fornecedor aparece na lista, editável e excluível.

### Fluxos alternativos / exceções
- **CNPJ com checksum inválido**: bloqueado no cadastro, mesma UX de erro inline já usada em CPF/EAN.
- **CNPJ duplicado na mesma empresa**: erro de conflito, mesmo padrão de SKU/EAN.
- **CNPJ do mesmo fornecedor em empresas diferentes**: permitido — cada empresa cadastra seus
  próprios fornecedores de forma independente (mesmo princípio de multi-tenancy já usado em
  SKU/EAN).
- **Exclusão de fornecedor**: permitida sem restrição nesta história — ainda não existe nenhuma
  história que referencie `Supplier` por FK (B1/C1 vêm depois). Quando essas histórias existirem,
  vão precisar decidir se bloqueiam exclusão de fornecedor referenciado, mesmo padrão já usado em
  `PriceTable`/`FiscalAddonPlan` (`linked_companies_count` bloqueando edição/exclusão) — não é
  escopo desta história resolver isso preventivamente.

### Dependências
- **Nenhuma bloqueante.**
- **Histórias futuras que consomem esta**: B1 (fornecedor casado/criado a partir do XML), C1
  (tabela `supplier_product_code`, fornecedor + código → produto).

### Critérios de aceite funcionais
- [ ] `Supplier` aceita nome (obrigatório), CNPJ (**obrigatório**, validado por checksum, único por
      empresa), telefone e e-mail (opcionais)
- [ ] Cadastro sem CNPJ é rejeitado
- [ ] CNPJ com checksum inválido é rejeitado
- [ ] CNPJ duplicado na mesma empresa é rejeitado; em empresas diferentes, permitido
- [ ] Item "Fornecedores" aparece na sidebar (ícone `box`, entre "Catálogo" e "Pedidos") pros
      papéis superadmin/admin/owner/manager
- [ ] Lista, criação, edição e exclusão de fornecedor funcionam de ponta a ponta

## QA Explorer

### Cenários Gherkin

```gherkin
Feature: Cadastro de fornecedor
  Como Empresa
  Quero cadastrar meus fornecedores
  Para ter uma base estruturada de compras e vínculo futuro com notas fiscais

  Scenario: Cadastro de fornecedor com CNPJ numérico válido
    Dado que estou cadastrando um fornecedor novo
    Quando informo nome e um CNPJ numérico com checksum válido
    Então o fornecedor é salvo com sucesso

  Scenario: Cadastro de fornecedor com CNPJ alfanumérico válido
    Dado que estou cadastrando um fornecedor novo
    Quando informo nome e um CNPJ alfanumérico válido (ex.: raiz com letras, tipo "12ABC34500")
    Então o fornecedor é salvo com sucesso — a validação aceita letra maiúscula A-Z nas posições
    1 a 12, calculando o dígito verificador pelo valor ASCII menos 48

  Scenario: CNPJ alfanumérico informado em minúsculas é normalizado
    Dado que estou cadastrando um fornecedor
    Quando informo um CNPJ alfanumérico válido em minúsculas (ex.: "12abc34500...")
    Então o sistema normaliza pra maiúsculas antes de validar e salvar

  Scenario: CNPJ com letra numa posição de dígito verificador é rejeitado
    Dado que estou cadastrando um fornecedor
    Quando informo um CNPJ com letra nas posições 13 ou 14
    Então o cadastro é bloqueado — dígitos verificadores são sempre numéricos, mesmo no formato
    alfanumérico

  Scenario: Cadastro sem CNPJ é rejeitado
    Dado que estou cadastrando um fornecedor novo
    Quando informo apenas o nome, sem CNPJ
    Então o cadastro é bloqueado com mensagem "CNPJ é obrigatório"

  Scenario: CNPJ com checksum inválido é rejeitado
    Dado que estou cadastrando um fornecedor
    Quando informo um CNPJ com dígito verificador incorreto
    Então o cadastro é bloqueado com mensagem "CNPJ inválido"

  Scenario: CNPJ duplicado na mesma empresa é rejeitado
    Dado um fornecedor A da empresa X já cadastrado com CNPJ "11.222.333/0001-81"
    Quando tento cadastrar um fornecedor B da mesma empresa X com o mesmo CNPJ
    Então o backend rejeita o conflito

  Scenario: Mesmo CNPJ em empresas diferentes não conflita
    Dado um fornecedor da empresa X cadastrado com um CNPJ válido
    Quando um fornecedor da empresa Y é cadastrado com o mesmo CNPJ
    Então ambos são salvos sem erro

  Scenario: Nome vazio ou só espaços é rejeitado
    Dado que estou cadastrando um fornecedor
    Quando deixo o campo nome vazio ou só com espaços
    Então o cadastro é bloqueado

  Scenario: Isolamento multi-tenant na listagem
    Dado fornecedores cadastrados nas empresas X e Y
    Quando um usuário autenticado da empresa X lista fornecedores
    Então só os fornecedores da empresa X aparecem

  Scenario: Isolamento multi-tenant na edição/exclusão
    Dado um fornecedor pertencente à empresa Y
    Quando um usuário autenticado da empresa X tenta editar ou excluir esse fornecedor
    Então o sistema retorna 404

  Scenario: Cashier não consegue acessar a API de fornecedores diretamente
    Dado um usuário autenticado com role "cashier"
    Quando esse usuário chama a API de fornecedores diretamente (fora da sidebar)
    Então o sistema retorna 403, independente do que a sidebar esconde
```

### Critérios de aceite testáveis
- [ ] CNPJ obrigatório, validado por checksum e único por empresa
- [ ] Validação aceita CNPJ numérico **e** alfanumérico (achado pós-Ready, ver Tech Explorer) —
      letra maiúscula A-Z nas posições 1-12, dígitos verificadores sempre numéricos
- [ ] CNPJ em minúsculas é normalizado pra maiúsculas antes de validar/salvar
- [ ] Nome vazio/só espaços rejeitado
- [ ] Isolamento multi-tenant em listagem, edição e exclusão
- [ ] Role `cashier` bloqueado a nível de API (403), reaproveitando `_WRITE_ROLES`/
      `resolve_company_id_write` já existentes (linhas 52-84) — não só escondido na sidebar

### Confirmação da revisão de QA (não é pendência)
**Formato de e-mail**: sem validação rígida de formato — é metadado de contato, nenhuma automação
depende dele (diferente do CNPJ). Aceitar qualquer string é suficiente pro escopo desta história.

### O que ainda impede o avanço pro Tech Explorer
Nada bloqueante — revisão de QA aprovada com os critérios acima incorporados.

## Tech Explorer

### Reaproveitando o controle de role já existente (fecha a lacuna do QA)
`services/catalog/main.py` já tem exatamente o mecanismo certo — `_WRITE_ROLES` (linha 52) e
`require_write_role`/`resolve_company_id_write` (linhas 54-84) checam `current_user.role`, não só
escopo de empresa. Usar essas mesmas dependencies em **todos** os endpoints de fornecedor, inclusive
o `GET` de listagem (não só as escritas), garante que `cashier` recebe 403 mesmo chamando a API
direto — sem precisar criar nenhum mecanismo novo de autorização.

### Model (`services/catalog/main.py`, junto dos outros models de domínio)

```python
class Supplier(Base):
    __tablename__ = "suppliers"
    __table_args__ = (UniqueConstraint("company_id", "cnpj", name="uq_suppliers_company_cnpj"),)

    id         = Column(Integer, primary_key=True)
    company_id = Column(Integer, nullable=False, index=True)
    nome       = Column(String(120), nullable=False)
    cnpj       = Column(String(14), nullable=False)   # obrigatório — ver decisão de escopo revertida
    telefone   = Column(String(20), nullable=True)
    email      = Column(String(120), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
```

`cnpj` é `nullable=False` — não existe caso de "fornecedor sem CNPJ" neste épico (decisão revertida
após checagem com o usuário, ver seção Explorer). A `UniqueConstraint("company_id", "cnpj")`
funciona normalmente, sem precisar de nenhum tratamento especial de `NULL`.

### Validação de CNPJ — reaproveitar `services/company/domain/cnpj.py`, não reinventar

**Correção pós-Ready (2026-09-17), segunda rodada**: o usuário apontou que o cadastro de
cliente/empresa (`company-service`) **já resolveu exatamente esse problema** — `ORD-056` (cadastro),
`ORD-057` (consulta CNPJ na Receita), `ORD-064` (suporte a CNPJ alfanumérico, com vetores de teste
oficiais Receita/SERPRO) e `ORD-065` (unicidade) já produziram `services/company/domain/cnpj.py`,
testado (`test_ord064_cnpj_alfanumerico.py`) e correto. A versão anterior desta seção reinventava a
mesma lógica do zero (coincidentemente com o mesmo algoritmo) — **substituída por reaproveitar o
módulo já existente**, não duplicar:

```python
# services/company/domain/cnpj.py (já existe, já testado — ORD-056/057/064/065)
from cnpj import is_valid_cnpj, normalize_cnpj
```

**Recomendação de arquitetura**: `domain/cnpj.py` não depende de nada específico do
`company-service` (é lógica pura, sem I/O, sem SQLAlchemy) — é candidato natural pra virar
utilitário compartilhado (`services/shared/`, mesmo padrão já usado por `auth.py`/`config.py`,
"cada serviço copia ou importa esses utilitários", `CLAUDE.md`). Proposta: mover
`services/company/domain/cnpj.py` pra `services/shared/cnpj.py`, `company-service` continua
funcionando igual (só ajusta o import), `catalog-service` copia o mesmo arquivo pro seu diretório —
mesma convenção já estabelecida, sem duplicar a lógica de validação/normalização em dois lugares
com risco de um ficar desatualizado e o outro não (era exatamente isso que estava prestes a
acontecer aqui). Isso é um ajuste pequeno de organização, não uma reescrita — o algoritmo em si já
está correto e testado, só muda de endereço.

**Uso em `create_supplier`/`update_supplier`**:
```python
from cnpj import is_valid_cnpj, normalize_cnpj  # services/shared/cnpj.py, após a promoção

cnpj_normalizado = normalize_cnpj(body.cnpj)  # já remove máscara (./-) e uppercase — acima do que
                                                # a validação anterior fazia (só strip().upper())
if not is_valid_cnpj(cnpj_normalizado):
    raise HTTPException(400, detail="CNPJ inválido")
```

`normalize_cnpj` (já implementado) faz mais do que a normalização que eu tinha proposto — remove
também os caracteres de máscara (`.`, `/`, `-`), então um usuário pode digitar
`"12.345.678/0001-99"` ou `"12345678000199"` e ambos funcionam. Não precisava ter sido reinventado.

### Schemas

```python
class SupplierIn(BaseModel):
    nome: str
    cnpj: str
    telefone: str | None = None
    email: str | None = None

    @field_validator("nome")
    @classmethod
    def _nome_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("nome não pode ser vazio")
        return v

    @field_validator("cnpj")
    @classmethod
    def _cnpj_not_blank(cls, v: str) -> str:
        v = normalize_cnpj(v)  # services/shared/cnpj.py — remove máscara (./-) e uppercase
        if not v:
            raise ValueError("CNPJ é obrigatório")
        return v

class SupplierOut(BaseModel):
    id: int
    nome: str
    cnpj: str
    telefone: str | None
    email: str | None
    created_at: datetime

class SupplierListOut(BaseModel):
    suppliers: list[SupplierOut]
```

### Endpoints

```python
@app.get("/catalog/suppliers", response_model=SupplierListOut, tags=["Fornecedores"])
async def list_suppliers(
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),  # cashier não vê nem a lista
):
    result = await db.execute(select(Supplier).filter_by(company_id=company_id).order_by(Supplier.nome))
    return {"suppliers": result.scalars().all()}

@app.post("/catalog/suppliers", response_model=SupplierOut, status_code=201, tags=["Fornecedores"])
async def create_supplier(
    body: SupplierIn,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    if not is_valid_cnpj(body.cnpj):
        raise HTTPException(400, detail="CNPJ inválido")
    s = Supplier(company_id=company_id, nome=body.nome, cnpj=body.cnpj,
                 telefone=body.telefone, email=body.email)
    db.add(s)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(400, detail="CNPJ já cadastrado para esta empresa")
    await db.refresh(s)
    return s

@app.put("/catalog/suppliers/{supplier_id}", response_model=SupplierOut, tags=["Fornecedores"])
async def update_supplier(
    supplier_id: int,
    body: SupplierIn,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    s = (await db.execute(
        select(Supplier).filter_by(id=supplier_id, company_id=company_id)
    )).scalars().first()
    if not s:
        raise HTTPException(404)
    if not is_valid_cnpj(body.cnpj):
        raise HTTPException(400, detail="CNPJ inválido")
    s.nome, s.cnpj, s.telefone, s.email = body.nome, body.cnpj, body.telefone, body.email
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(400, detail="CNPJ já cadastrado para esta empresa")
    await db.refresh(s)
    return s

@app.delete("/catalog/suppliers/{supplier_id}", status_code=204, tags=["Fornecedores"])
async def delete_supplier(
    supplier_id: int,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    s = (await db.execute(
        select(Supplier).filter_by(id=supplier_id, company_id=company_id)
    )).scalars().first()
    if not s:
        raise HTTPException(404)
    await db.delete(s)
    await db.commit()
```

`IntegrityError` mapeado direto pra "CNPJ já cadastrado" (mesmo racional das linhas 1872/1948) —
como `Supplier` só tem **uma** `UniqueConstraint` (diferente de `Product`, que tem duas — SKU e
EAN), não precisa distinguir qual colidiu.

### Migration
`services/catalog/migrations/versions/YYYYMMDD_HHMM_suppliers.py` — cria `suppliers` com a
`UniqueConstraint("company_id", "cnpj")`.

### Riscos
Nenhum risco técnico relevante — CRUD isolado, sem tocar em fluxo de venda/pagamento, reaproveita
mecanismo de role já validado em produção **e** reaproveita a validação de CNPJ já testada contra
vetores oficiais Receita/SERPRO (`ORD-064`), em vez de uma implementação nova — reduz risco, não
aumenta.

### Estimativa
**3 pontos confirmados** — CRUD simples, mesmo porte de `FiscalAddonPlan`.

### O que ainda impede o avanço pro Ready
Nada bloqueante.

## Ready

Upstream repassado formalmente por papel (PM, QA, backend) — cada fase achou e corrigiu pelo menos
um problema real antes de aprovar a passagem pra próxima:

**Explorer:** [x] história · [x] decisão de escopo · [x] fluxo principal · [x] dependências
(nenhuma bloqueante) · [x] critérios de aceite. **Revisão de PM**: achou posição de sidebar e ícone
não especificados (corrigido: entre "Catálogo" e "Pedidos", ícone `box` — `truck` não existe no
icon-font real, confirmado). A mesma revisão de PM também tinha tornado o CNPJ opcional pra
suportar "fornecedor informal" — **decisão revertida depois pelo usuário**: checagem rápida de
mercado mostrou que ERPs gerais suportam fornecedor pessoa física, mas isso não se aplica ao escopo
estreito do `Supplier` neste épico (só alimenta B1/C1, que exigem NF de verdade) — CNPJ voltou a
ser **obrigatório**.

**QA Explorer:** [x] happy path · [x] bordas (CNPJ obrigatório, inválido, duplicado, nome vazio) ·
[x] isolamento multi-tenant · [x] controle de acesso por role · [x] cenários aprovados (cenários de
"fornecedor sem CNPJ" removidos após a reversão de escopo). **Revisão de QA**: achou que o controle
de role só tinha sido especificado na sidebar (UX), não no backend (segurança) — corrigido
reaproveitando `_WRITE_ROLES`/`resolve_company_id_write` já existentes.

**Tech Explorer:** [x] model, migration, validação de CNPJ, endpoints completos (list/create/
update/delete), schemas, tratamento de conflito · [x] riscos — nenhum relevante.

**Correção pós-Ready (2026-09-17)**: usuário pediu revisão específica sobre CNPJ alfanumérico —
achado real e urgente: a Receita Federal começou a emitir CNPJ alfanumérico em julho de 2026, antes
da data de hoje. A validação original (`_is_valid_cnpj`) assumia formato só numérico
(`cnpj.isdigit()`) e teria **rejeitado CNPJ alfanumérico válido**. Corrigido: validação agora aceita
letra maiúscula A-Z nas posições 1-12 (raiz + ordem/filial), calculando o dígito verificador pelo
valor ASCII menos 48 (retrocompatível com CNPJ numérico já existente); dígitos verificadores
(posições 13-14) continuam sempre numéricos; entrada normalizada pra maiúsculas antes de validar.
Nenhum código de produção tinha sido escrito ainda — correção feita só no documento, sem custo de
retrabalho de implementação.

**Status: Ready.** Terceira história do épico de estoque/ERP, sem dependência de A1/A2 — pode ser
feita em paralelo com qualquer uma delas.
