---
id: ORD-194
status: Ready
estimativa: 13 pontos (backend + frontend)
fase: null
sprint: null
responsavel: Backend SR + Frontend
---

# ORD-194 — Upload de XML de NF de compra com prévia

## Descrição
História **B1** do épico de estoque/ERP (`docs/estudo-modulo-estoque-erp.md`, Bloco B —
Importação de XML). Primeira história do bloco, depende só de A6 (`ORD-182`, mergeada). Permite à
Empresa importar o XML de uma nota fiscal de compra recebida de um fornecedor, ver uma prévia dos
dados extraídos antes de confirmar, e guardar a nota importada — sem digitar item por item.

## Persona
**Empresa** (owner/manager/admin que faz a gestão de compras/estoque).

## Explorer

### História
Como **Empresa**, quero importar o XML de uma nota fiscal de compra que recebi do meu fornecedor,
ver uma prévia dos dados antes de confirmar, para não precisar digitar cada item manualmente.

### Contexto e motivação
Hoje toda entrada de estoque é manual (A2/`ORD-181`) — pra quem compra de poucos fornecedores em
baixo volume isso é suficiente, mas pra quem recebe várias notas por semana, digitar item por item
é lento e sujeito a erro de digitação. Toda nota fiscal eletrônica (NF-e) já chega em formato XML
estruturado, com todos os dados que hoje são digitados na mão — a Empresa só precisa arrastar o
arquivo.

### Decisão de escopo — B1 só importa e guarda, não dá entrada em estoque
**Importante, fechando ambiguidade da pesquisa original do épico**: B1 faz upload → prévia →
confirmar → guarda a nota importada (fornecedor + itens brutos do XML, com `cProd`/`cEAN`
originais preservados). B1 **não** vincula os itens da nota a produtos do catálogo, nem dá entrada
automática em estoque — isso é o vínculo automático (**C1**, história seguinte do bloco), que
ainda tem uma pendência formal em aberto (como cruzar EAN entre `Product` e `Option`, registrada
desde G1/`ORD-188`). B1 sozinho já entrega valor (substitui digitar nota por confirmar nota), mas
"o estoque sobe sozinho ao importar" só existe a partir de C1/C2.

### Decisão de escopo — fluxo em dois passos, prévia sem estado no servidor
1. Empresa faz upload do XML → `POST /catalog/supplier-invoices/preview` **parseia e retorna a
   prévia sem persistir nada** (nem a nota, nem o fornecedor).
2. Empresa revisa a prévia (fornecedor, itens, total) e confirma → `POST /catalog/supplier-invoices`
   **reenvia o mesmo arquivo** (não um id de uma prévia em cache) e aí sim persiste.

Prévia sem estado (stateless) evita cache de prévia expirando, invalidação, ou nota "meio
importada" se o navegador fechar entre os dois passos — o único estado de verdade é o que foi
confirmado. Custo: o arquivo é parseado duas vezes (prévia + confirmação), aceitável — XMLs de NF-e
são pequenos (a pesquisa técnica abaixo encontrou exemplos reais de 5 KB a 68 KB).

### Decisão de escopo — fornecedor casado por CNPJ, criado automaticamente se não existir
O CNPJ do emitente do XML (`emit/CNPJ`) é comparado com os fornecedores já cadastrados (A6,
`ORD-182`) da empresa. Se bater, a prévia mostra qual `Supplier` existente será usado. Se não
bater, a prévia indica que um `Supplier` novo será criado (nome vindo de `emit/xNome`) — sem
bloquear o fluxo pedindo cadastro manual antes. A confirmação cria o `Supplier` automaticamente
nesse caso.

### Decisão de escopo — nota fica guardada, sem editar itens na prévia (v1)
A prévia é só leitura — a Empresa não edita valores/quantidades antes de confirmar nesta versão.
Se o XML estiver errado, a correção é no próprio fornecedor (pedir XML corrigido) ou via ajuste
manual de estoque depois (A2), não editando o documento fiscal importado. Simplifica o escopo e
evita o produto mentir sobre o que a nota fiscal realmente diz.

### 🔎 Achado técnico — massa de teste realista e cuidado com encoding (pedido explícito do usuário)
Antes de fechar o Tech Explorer, o usuário levantou duas preocupações que mudam decisões técnicas
reais, não só cobertura de teste:

1. **XML de teste precisa ser próximo de um modelo real, não inventado.** Pesquisa encontrou duas
   fontes prontas: o [nfephp-org/nfephp](https://github.com/nfephp-org/nfephp) (PHP, biblioteca
   madura de NFe) tem XMLs de exemplo reais autorizados em homologação; mais relevante ainda, a
   biblioteca **Python** [`akretion/nfelib`](https://github.com/akretion/nfelib) (ver Tech Explorer)
   vendoriza **16 XMLs reais de nota autorizada** nos próprios testes dela
   (`tests/nfe/v4_00/leiauteNFe/`), cobrindo várias UFs, tamanhos de 5 KB a 68 KB, e os dois
   formatos de envelope que interessam pra B1 (`*-nfe.xml` cru e `*-procNFe.xml` com protocolo de
   autorização). MIT — pode ser vendorizado direto como fixture de teste.
2. **Encoding não pode ser assumido como UTF-8.** NF-e emitida por sistema legado frequentemente
   vem em ISO-8859-1/Latin-1. O parser precisa ler o arquivo como **bytes crus** e respeitar o
   `encoding` declarado no prólogo do XML (`<?xml version="1.0" encoding="..."?>`) — nunca decodificar
   pra string assumindo um encoding fixo antes de parsear, senão corrompe nome de produto/fornecedor
   com acento (mojibake).

Achados adicionais de uma nota real inspecionada durante a pesquisa (grounding real, não suposição):
- A raiz que o fornecedor manda costuma ser `<nfeProc>` (envelope com `<NFe>` + `<protNFe>` de
  autorização), não só `<NFe>` solto — o parser precisa aceitar os dois formatos.
- `<cEAN/>` **vazio** é comum de verdade (fornecedor sem código de barras cadastrado) — não pode
  assumir que sempre vem preenchido.
- Unidade (`uCom`) aparece com capitalização inconsistente no mesmo arquivo ("Rl" e "RL") — exibir
  cru na prévia, sem tentar normalizar nesta história (normalização de unidade é escopo de A5/G3,
  não desta).
- Bloco `<cobr><dup>` (duplicata/parcela) já está presente em notas reais e bate exatamente com o
  que a B2 (história seguinte) vai precisar — B1 não usa esse bloco, mas confirma que ele existe de
  verdade no formato esperado pela B2.

### Fluxo principal
1. Empresa acessa a tela de fornecedores (ou uma nova tela de "Notas de compra") e escolhe importar
   um XML.
2. Faz upload do arquivo → prévia mostra: fornecedor (existente ou "será criado"), número/série da
   nota, data de emissão, lista de itens (código do fornecedor, EAN se houver, descrição, unidade,
   quantidade, valor unitário, valor total), valor total da nota.
3. Empresa confirma → nota é guardada, aparece na listagem de notas importadas.

### Fluxos alternativos / exceções
- **Nota já importada antes** (mesma chave de acesso, mesma empresa): confirmação rejeitada com
  conflito — nunca duplica.
- **Arquivo não é um XML válido, ou é XML mas não é uma NF-e**: rejeitado com mensagem clara, nada
  persistido — nem na prévia, nem na confirmação.
- **Fornecedor do XML não bate com nenhum cadastrado**: criado automaticamente na confirmação, sem
  bloquear o fluxo.

### Dependências
- **Depende de A6** (`ORD-182`, mergeada) — fornecedor como entidade real.
- **Histórias futuras que consomem esta**: B2 (conta a pagar opcional a partir da nota importada,
  usa o bloco `cobr`/`dup` do XML); C1 (vínculo automático por EAN/`cProd`, consome
  `supplier_invoice_item` pra saber o que ainda não foi vinculado a um produto).

### Critérios de aceite funcionais
- [ ] Upload de XML válido gera prévia sem persistir nada
- [ ] Confirmar a prévia persiste a nota, criando o fornecedor automaticamente se o CNPJ não bater
      com nenhum já cadastrado
- [ ] Confirmar a mesma chave de acesso duas vezes é rejeitado, sem duplicar
- [ ] XML mal formado ou que não é NF-e é rejeitado com mensagem clara, sem persistir nada
- [ ] Prévia e confirmação funcionam corretamente com XML em UTF-8 e em ISO-8859-1
- [ ] Item com `cEAN` vazio aparece normalmente na prévia, sem erro

## QA Explorer

### Cenários Gherkin

```gherkin
Feature: Upload de XML de NF de compra com prévia
  Como Empresa
  Quero importar o XML de uma nota fiscal de compra
  Para não precisar digitar cada item manualmente

  Scenario: Upload de NF-e real válida gera prévia correta
    Dado um XML de NF-e real e válido (fixture vendorizado de nfelib), com fornecedor e 5 itens
    Quando faço upload do XML pra prévia
    Então a prévia mostra o fornecedor, todos os 5 itens na ordem do XML e o valor total correto
    E nada é persistido no banco

  Scenario: Fornecedor já cadastrado é reconhecido pelo CNPJ
    Dado um fornecedor já cadastrado com o mesmo CNPJ do emitente do XML
    Quando faço upload do XML pra prévia
    Então a prévia indica esse fornecedor existente, sem sugerir criar um novo

  Scenario: Fornecedor novo é criado automaticamente na confirmação
    Dado um XML cujo CNPJ do emitente não bate com nenhum fornecedor cadastrado
    Quando faço upload pra prévia (indica "será criado") e confirmo
    Então um Supplier novo é criado com o nome do emitente (xNome), sem bloquear o fluxo

  Scenario: Confirmar a mesma nota duas vezes é rejeitado (dedup por chave de acesso)
    Dado uma nota já confirmada e importada com sucesso
    Quando tento confirmar o mesmo XML (mesma chave de acesso) de novo
    Então o sistema rejeita com conflito, e nenhuma nota duplicada é criada

  Scenario: Item com código de barras vazio aparece normalmente
    Dado um XML com um item cujo cEAN é vazio (comum em fornecedor sem EAN cadastrado)
    Quando faço upload pra prévia
    Então o item aparece na lista com ean vazio/nulo, sem erro nem item faltando

  Scenario: XML em UTF-8 com acentuação preserva os caracteres corretamente
    Dado um XML declarado como UTF-8, com nome de produto e fornecedor contendo acentos (ex:
    "Ração", "José & Cia")
    Quando faço upload pra prévia
    Então os nomes aparecem exatamente como no XML, sem qualquer caractere corrompido

  Scenario: XML em ISO-8859-1 com acentuação preserva os caracteres corretamente
    Dado um XML declarado como ISO-8859-1/Latin-1, com os mesmos nomes acentuados do cenário acima
    Quando faço upload pra prévia
    Então os nomes aparecem exatamente iguais ao cenário UTF-8 — sem mojibake, mesmo com encoding
    diferente

  Scenario: Arquivo que não é XML é rejeitado
    Dado um arquivo PDF ou binário qualquer
    Quando tento fazer upload pra prévia
    Então o sistema rejeita com mensagem clara, sem tentar interpretar como nota fiscal

  Scenario: XML válido mas que não é uma NF-e é rejeitado
    Dado um XML bem formado, mas de outro documento fiscal (ex: CT-e) ou XML genérico qualquer
    Quando tento fazer upload pra prévia
    Então o sistema rejeita com mensagem clara, distinguindo de "arquivo corrompido"

  Scenario: Prévia é sempre sem estado — repetir a prévia não cria nada
    Dado um XML válido
    Quando chamo a prévia duas vezes seguidas com o mesmo arquivo
    Então as duas respostas são idênticas, e nenhuma linha é criada no banco em nenhuma das duas

  Scenario: Isolamento multi-tenant na importação
    Dado uma nota já importada pela empresa X com uma chave de acesso específica
    Quando a empresa Y importa uma nota diferente, de outro fornecedor
    Então a importação da empresa Y funciona normalmente, sem qualquer conflito com a nota da
    empresa X, mesmo que Y também tenha um fornecedor com CNPJ parecido

  Scenario: Role sem permissão de escrita é bloqueado
    Dado um usuário autenticado sem papel de escrita (ex: kiosk)
    Quando esse usuário chama a API de prévia ou confirmação diretamente
    Então o sistema retorna 403, independente do que a tela esconde
```

### Lacunas encontradas
1. **Massa de teste com XML real, não inventado** (achado do usuário) — resolvido: vendorizar
   subconjunto dos 16 XMLs reais de `akretion/nfelib` (MIT) como fixtures, mais uma variante gerada
   manualmente em ISO-8859-1 a partir de um desses (mesmo conteúdo, encoding diferente, com
   acentuação real) pro cenário de encoding.
2. **Encoding não pode ser assumido** (achado do usuário) — resolvido: `nfelib`/`xsdata` opera sobre
   bytes crus e respeita o encoding declarado no prólogo do XML; Tech Explorer documenta a regra
   explícita de nunca decodificar a string antes de parsear.
3. **Chave de acesso tem dígito verificador próprio** (achado desta revisão): a chave de 44 dígitos
   tem um dígito verificador (`cDV`) calculado por mod-11 sobre os 43 primeiros — vale validar esse
   dígito como defesa extra contra XML corrompido/adulterado, mesmo que a lib de parsing já garanta
   estrutura válida (estrutura válida ≠ conteúdo íntegro).

### O que ainda impede o avanço pro Tech Explorer
Nada bloqueante — revisão de QA aprovada com os cenários acima, incorporando as duas preocupações
do usuário como cenários formais (não só nota de rodapé).

## Tech Explorer

### Decisão de arquitetura — usar `nfelib` (Python), não parsing manual
[`nfelib`](https://github.com/akretion/nfelib) (PyPI: `nfelib`, MIT, Python ≥3.8, mantida
ativamente) gera bindings tipados a partir do XSD oficial da Receita/SEFAZ via `xsdata`. Em vez de
escrever parsing manual com `lxml`/`ElementTree` e extração campo a campo (risco de divergir do
schema real em casos de borda), a nota vira um objeto Python tipado:

```python
from nfelib.nfe.bindings.v4_0.proc_nfe_v4_00 import NfeProc

nfe_proc = NfeProc.from_bytes(raw_bytes)  # aceita bytes crus — respeita encoding do prólogo
inf_nfe = nfe_proc.NFe.infNFe
emit_cnpj = inf_nfe.emit.CNPJ
itens = inf_nfe.det  # lista, cada um com .prod.cProd/.cEAN/.xProd/.uCom/.qCom/.vUnCom/.vProd
```

`from_bytes` (a confirmar o nome exato do método na versão pinada — `xsdata`-based parsers
expõem essa API, mas verificar na implementação) evita o erro clássico de encoding: nunca decodificar
a string em Python antes de entregar pro parser.

**Aceitar os dois formatos de envelope**: alguns fornecedores mandam só `<NFe>`, outros mandam
`<nfeProc>` (com `<protNFe>`). Tentar parsear como `NfeProc` primeiro; se falhar, tentar como `NFe`
solto. B1 só precisa dos dados de `infNFe` em qualquer um dos dois casos — o protocolo de
autorização (`protNFe`) não é usado por esta história.

### Validação de chave de acesso — reaproveitar o mesmo racional de checksum já usado no projeto
Chave de acesso: 44 dígitos, últimos 1 = dígito verificador (`cDV`), calculado por mod-11 sobre os
43 primeiros — mesma família de algoritmo já usada em CNPJ (`services/catalog/cnpj.py`, ORD-182) e
EAN (`_is_valid_gtin`, ORD-180). Validar o dígito antes de aceitar a nota é defesa em profundidade
contra XML corrompido, mesmo que a estrutura já tenha passado pelo parser.

### Models (`services/catalog/main.py`)

```python
class SupplierInvoice(Base):
    __tablename__ = "supplier_invoices"
    __table_args__ = (
        UniqueConstraint("company_id", "chave_acesso", name="uq_supplier_invoices_company_chave"),
    )
    id             = Column(Integer, primary_key=True)
    company_id     = Column(Integer, nullable=False, index=True)
    supplier_id    = Column(Integer, ForeignKey("suppliers.id"), nullable=False)
    chave_acesso   = Column(String(44), nullable=False)
    numero         = Column(String(20), nullable=True)   # ide/nNF
    serie          = Column(String(10), nullable=True)   # ide/serie
    data_emissao   = Column(DateTime, nullable=True)      # ide/dhEmi
    valor_total    = Column(Numeric(12, 2), nullable=False)  # total/ICMSTot/vNF
    xml_raw        = Column(Text, nullable=False)  # XML original, preservado pra auditoria/reprocessamento
    imported_by    = Column(Integer, nullable=False)  # user_id do JWT
    imported_at    = Column(DateTime, default=datetime.utcnow)

class SupplierInvoiceItem(Base):
    __tablename__ = "supplier_invoice_items"
    id                   = Column(Integer, primary_key=True)
    supplier_invoice_id  = Column(Integer, ForeignKey("supplier_invoices.id"), nullable=False, index=True)
    n_item               = Column(Integer, nullable=False)    # det/@nItem
    c_prod               = Column(String(60), nullable=True)  # prod/cProd — código do fornecedor
    c_ean                = Column(String(14), nullable=True)  # prod/cEAN — pode ser vazio/None
    x_prod               = Column(String(200), nullable=False) # prod/xProd
    ncm                  = Column(String(8), nullable=True)
    cfop                 = Column(String(4), nullable=True)
    unidade              = Column(String(10), nullable=True)   # prod/uCom, cru — sem normalizar (fora de escopo)
    quantidade           = Column(Numeric(15, 4), nullable=False)  # prod/qCom
    valor_unitario       = Column(Numeric(15, 4), nullable=False)  # prod/vUnCom
    valor_total           = Column(Numeric(15, 2), nullable=False)  # prod/vProd
    # Sem FK pra Product/Option nesta história — vínculo é escopo de C1.
```

Sem tabela pra `<cobr><dup>` (parcelas) — B1 não usa; B2 vai ler direto do `xml_raw` guardado
quando existir, ou parsear de novo com `nfelib` a partir do `xml_raw` persistido (decisão de reuso
que evita duplicar schema pra um dado que só a B2 consome).

### Endpoints

```python
@app.post("/catalog/supplier-invoices/preview", tags=["Fornecedores"])
async def preview_supplier_invoice(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    """Parseia e retorna a prévia — não persiste nada."""
    raw = await file.read()
    parsed = _parse_nfe(raw)  # levanta HTTPException(400) se não for XML/NF-e válido
    existing_supplier = await _find_supplier_by_cnpj(db, company_id, parsed.emit_cnpj)
    already_imported = await _invoice_already_imported(db, company_id, parsed.chave_acesso)
    return {
        "chave_acesso": parsed.chave_acesso,
        "already_imported": already_imported,
        "fornecedor": {
            "existing_supplier_id": existing_supplier.id if existing_supplier else None,
            "cnpj": parsed.emit_cnpj,
            "nome": existing_supplier.nome if existing_supplier else parsed.emit_nome,
            "sera_criado": existing_supplier is None,
        },
        "numero": parsed.numero, "serie": parsed.serie, "data_emissao": parsed.data_emissao,
        "valor_total": parsed.valor_total,
        "itens": [item.__dict__ for item in parsed.itens],
    }

@app.post("/catalog/supplier-invoices", status_code=201, tags=["Fornecedores"])
async def create_supplier_invoice(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
    company_id: int = Depends(resolve_company_id_write),
):
    """Confirma — reenvia o mesmo arquivo (fluxo sem estado, ver Explorer)."""
    raw = await file.read()
    parsed = _parse_nfe(raw)
    if await _invoice_already_imported(db, company_id, parsed.chave_acesso):
        raise HTTPException(409, detail="Nota já importada anteriormente")
    supplier = await _find_supplier_by_cnpj(db, company_id, parsed.emit_cnpj)
    if supplier is None:
        supplier = Supplier(company_id=company_id, nome=parsed.emit_nome, cnpj=parsed.emit_cnpj)
        db.add(supplier)
        await db.flush()  # garante supplier.id antes do SupplierInvoice
    invoice = SupplierInvoice(
        company_id=company_id, supplier_id=supplier.id, chave_acesso=parsed.chave_acesso,
        numero=parsed.numero, serie=parsed.serie, data_emissao=parsed.data_emissao,
        valor_total=parsed.valor_total, xml_raw=raw.decode(parsed.encoding),
        imported_by=int(current_user.sub),
    )
    db.add(invoice)
    await db.flush()
    db.add_all([SupplierInvoiceItem(supplier_invoice_id=invoice.id, **item.__dict__) for item in parsed.itens])
    await db.commit()
    return {"id": invoice.id, "supplier_id": supplier.id}
```

`_parse_nfe(raw: bytes)` centraliza o uso de `nfelib` + a tentativa `NfeProc` → fallback `NFe` +
validação do dígito verificador da chave — usada pelos dois endpoints, nunca duplicada.

`resolve_company_id_write`/`_WRITE_ROLES` — mesmo padrão já usado em A6 (`ORD-182`): cashier/kiosk
bloqueados a nível de API.

### Migration
`services/catalog/migrations/versions/YYYYMMDD_HHMM_supplier_invoices.py` — cria `supplier_invoices`
(com a `UniqueConstraint`) e `supplier_invoice_items`.

### Nova dependência
`services/catalog/requirements.txt` ganha `nfelib` — única dependência nova desta história.

### Frontend (`frontend/admin`)
Tela nova `SupplierInvoiceUploadScreen.tsx` (ou aba dentro da tela de Fornecedores — decisão de UX
menor, não crítica): dropzone de upload → chama `/preview` → mostra os dados extraídos (fornecedor,
itens em tabela, total) → botão "Confirmar importação" chama `/supplier-invoices` reenviando o
mesmo arquivo. Erro de "já importada" ou "XML inválido" mostrado inline, sem travar a tela.

### Massa de teste (endereça a preocupação do usuário)
`services/catalog/tests/fixtures/nfe/` — vendorizar 3–4 XMLs reais de
`akretion/nfelib/tests/nfe/v4_00/leiauteNFe/` (MIT), escolhidos pra cobrir: um `-nfe.xml` cru, um
`-procNFe.xml` com protocolo, um pequeno (poucos itens) e um maior (vários itens). Mais um fixture
gerado manualmente: o mesmo conteúdo de um desses, salvo em ISO-8859-1 com acentuação real
(`Ração`, `José`), pro cenário de encoding.

### Riscos
- **API exata de `nfelib` pra bytes crus com encoding não-UTF-8** — confirmar no início da
  implementação (não achado nesta pesquisa: qual método exato aceita bytes vs. exige decodificação
  prévia). Se a API pública não expuser isso diretamente, fallback é resolver o encoding manualmente
  a partir do prólogo antes de entregar pro parser (`xml.dom.minidom`/regex no prólogo pra achar
  `encoding="..."` sem decodificar o corpo primeiro).
- **Layouts antigos (3.10) vs atual (4.00)**: `nfelib` cobre os dois, mas B1 só precisa dos campos
  que existem em ambos (`det/prod`, `emit`, `ide`) — sem uso de campo específico de uma versão só.
- Nenhum outro risco relevante — endpoint aditivo, sem tocar `order-service`/`payment-service`.

### Estimativa
**13 pontos confirmados** (mesmo valor já antecipado no board do épico) — schema em duas tabelas
novas, dependência externa nova, parsing com casos de borda reais (encoding, envelope duplo,
digito verificador), fluxo de dois passos (prévia sem estado + confirmação), e tela nova no admin.

### O que ainda impede o avanço pro Ready
Nada bloqueante.

## Ready

Upstream repassado formalmente por papel (PM, QA, backend), incorporando duas preocupações trazidas
diretamente pelo usuário como achados formais, não como nota de rodapé:

**Explorer:** [x] história · [x] decisão de escopo (B1 só importa/guarda, não vincula a produto nem
dá entrada em estoque — isso é C1) · [x] fluxo em dois passos sem estado no servidor · [x]
fornecedor casado por CNPJ ou criado automaticamente · [x] dependências (A6, satisfeita) · [x]
critérios de aceite. **Achado técnico do usuário incorporado na Explorer**: massa de teste precisa
vir de XML real (resolvido com fixtures de `akretion/nfelib`, MIT) e encoding não pode ser assumido
como UTF-8 (resolvido com leitura em bytes crus).

**QA Explorer:** [x] happy path com nota real de 5 itens · [x] fornecedor existente vs. criado
automaticamente · [x] dedup por chave de acesso · [x] item com EAN vazio · [x] cenário dedicado de
UTF-8 **e** de ISO-8859-1 com os mesmos nomes acentuados (validação cruzada dos dois) · [x] arquivo
não-XML e XML que não é NF-e rejeitados com mensagens distintas · [x] prévia sem estado (idempotente)
· [x] isolamento multi-tenant · [x] bloqueio de role sem permissão de escrita. **Achado desta
revisão**: chave de acesso tem dígito verificador próprio (mod-11) — validar como defesa extra.

**Tech Explorer:** [x] decisão de usar `nfelib` (Python, MIT, gerada do XSD oficial) em vez de
parsing manual — resolve estrutura, envelope duplo (`NFe`/`nfeProc`) e encoding de uma vez · [x]
models (2 tabelas novas, sem FK pra `Product`/`Option` de propósito) · [x] endpoints (prévia sem
estado + confirmação) · [x] migration · [x] massa de teste concreta (fixtures reais vendorizados +
1 variante ISO-8859-1 gerada) · [x] riscos — API exata de bytes/encoding do `nfelib` a confirmar na
implementação, sem bloquear o desenho.

**Status: Ready.** Primeira história do Bloco B — desbloqueia B2 (conta a pagar opcional) e é
pré-requisito de C1 (vínculo automático por EAN/`cProd`).
