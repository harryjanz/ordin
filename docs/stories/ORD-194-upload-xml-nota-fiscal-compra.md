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
dados extraídos antes de confirmar, e guardar a nota importada — sem digitar cabeçalho e itens da
nota na mão.

## Persona
**Empresa** (owner/manager/admin que faz a gestão de compras/estoque).

## Explorer

### História
Como **Empresa**, quero importar o XML de uma nota fiscal de compra que recebi do meu fornecedor,
ver uma prévia dos dados antes de confirmar, para ter um histórico estruturado das minhas compras
sem digitar cabeçalho e itens na mão.

**Correção pós-revisão de PM**: a redação original prometia "não precisar digitar cada item
manualmente" de um jeito que sugeria que B1 substitui a entrada de estoque (A2) — não substitui.
B1 só guarda a nota importada (fornecedor + itens brutos do XML); dar entrada de estoque a partir
dela continua manual até **C1** (vínculo automático) existir. O valor real e imediato de B1 é
**histórico estruturado de compras** — não "elimina digitação de estoque".

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
2. Empresa revisa a prévia (fornecedor, itens, total) e clica em "Confirmar importação".

**Correção pós-revisão de PM — clareza de UX, não mudança de comportamento**: "o segundo passo
reenvia o mesmo arquivo" é detalhe de implementação (o `File` já escolhido no passo 1 fica em
memória no navegador; o clique em "Confirmar" só faz um segundo `POST` com esse mesmo objeto, pra
`/catalog/supplier-invoices`), **não uma ação nova da Empresa** — ela nunca vê um segundo diálogo
de escolher arquivo, nem precisa saber que o XML foi enviado duas vezes ao servidor. A versão
anterior deste doc estava ambígua nesse ponto o suficiente pra alguém implementar errado (pedindo
o arquivo de novo na tela).

Prévia sem estado (stateless) evita cache de prévia expirando, invalidação, ou nota "meio
importada" se o navegador fechar entre os dois passos — o único estado de verdade é o que foi
confirmado. Custo: o arquivo é parseado duas vezes no backend (prévia + confirmação), aceitável —
XMLs de NF-e são pequenos (a pesquisa técnica abaixo encontrou exemplos reais de 5 KB a 68 KB).

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

### Decisão de escopo — só NF-e de compra normal, modelo 55 (achado da revisão de PM)
NF-e carrega dois campos em `ide` que decidem se o documento é o que B1 espera: `mod` (modelo —
**55** é NF-e, **65** é NFC-e, o documento que o próprio Ordin já emite pro cliente final na venda,
`ORD-171`) e `finNFe` (finalidade — 1=normal, 2=complementar, 3=ajuste, **4=devolução/retorno**).
Sem checar os dois, dois erros silenciosos são possíveis: um cliente sobe por engano a **própria
NFC-e de venda** (modelo 65) achando que é nota de compra; ou sobe uma nota de **devolução**
(mercadoria saindo, não entrando) que fica indistinguível de uma compra normal na listagem.
**Decisão**: `mod != "55"` ou `finNFe != "1"` são rejeitados na prévia, com mensagem específica
("este XML não é uma NF-e de compra normal") — não silenciosamente aceitos como se fossem compra.
Complementar/ajuste/devolução ficam fora de escopo desta história, sem prazo definido pra cobrir.

### Limitação conhecida — fornecedor criado a partir de CNPJ errado (achado da revisão de PM)
Se o CNPJ do emitente no XML estiver digitado errado pelo próprio fornecedor (acontece, embora
raro — CNPJ tem dígito verificador que pega a maioria dos erros), a confirmação cria um `Supplier`
novo em vez de reconhecer um já existente. Não é bloqueante pra v1 — detectar fornecedor "parecido"
(nome similar, CNPJ quase igual) é sofisticação de C1, não desta história — mas fica registrado
como limitação conhecida, não descoberta tardia. Mitigação disponível hoje: a Empresa pode editar
manualmente o `Supplier` criado (ORD-182 já tem edição) pra corrigir o CNPJ depois.

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
- **Regra pendente pra C1 (achado em teste manual do usuário, 2026-09-21)**: `DELETE
  /catalog/supplier-invoices/{id}` existe desde B1 e hoje é exclusão normal, sem trava — seguro
  porque B1 não vincula nada a estoque ainda. A partir de C1, excluir uma nota cujos itens já
  geraram estoque **vendido** (baixa efetivada) precisa ser bloqueado — quebraria o rastro de
  auditoria entre a compra e a venda. Detalhe completo da regra em
  `docs/estudo-modulo-estoque-erp.md`, seção "Regra de negócio fechada com o usuário (2026-09-21)".

### Critérios de aceite funcionais
- [ ] Upload de XML válido gera prévia sem persistir nada
- [ ] Confirmar a prévia persiste a nota, criando o fornecedor automaticamente se o CNPJ não bater
      com nenhum já cadastrado
- [ ] Confirmar a mesma chave de acesso duas vezes é rejeitado, sem duplicar
- [ ] XML mal formado ou que não é NF-e é rejeitado com mensagem clara, sem persistir nada
- [ ] Prévia e confirmação funcionam corretamente com XML em UTF-8 e em ISO-8859-1
- [ ] Item com `cEAN` vazio aparece normalmente na prévia, sem erro
- [ ] XML com `mod` diferente de "55" (ex: NFC-e, modelo 65) é rejeitado com mensagem específica
- [ ] XML com `finNFe` diferente de "1" (complementar/ajuste/devolução) é rejeitado com mensagem específica

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

  Scenario: NFC-e (modelo 65) é rejeitada — não é nota de compra
    Dado um XML de NFC-e válida (ide/mod = "65"), como as que o próprio Ordin emite na venda
    Quando tento fazer upload pra prévia
    Então o sistema rejeita com mensagem específica ("não é uma NF-e de compra"), distinta do erro
    de "não é XML"/"não é NF-e nenhuma"

  Scenario: Nota de devolução (finNFe=4) é rejeitada
    Dado um XML de NF-e válida com ide/finNFe = "4" (devolução/retorno — mercadoria saindo, não
    entrando)
    Quando tento fazer upload pra prévia
    Então o sistema rejeita com mensagem específica, sem confundir com uma compra normal

  Scenario: Chave de acesso com dígito verificador adulterado é rejeitada
    Dado um XML estruturalmente válido (passa no parser), mas com o chNFe/Id da infNFe alterado de
    propósito de forma que o dígito verificador (mod-11) não bate com os 43 dígitos anteriores
    Quando tento fazer upload pra prévia
    Então o sistema rejeita com mensagem de integridade, mesmo a estrutura XML sendo válida —
    "bem formado" não é o mesmo que "íntegro"

  Scenario: Nota com valor total zero é aceita normalmente
    Dado uma NF-e válida com vNF = 0.00 (ex: amostra grátis, bonificação do fornecedor)
    Quando faço upload pra prévia e confirmo
    Então a nota é importada normalmente, sem nenhuma validação de "valor precisa ser positivo"
    bloqueando o fluxo — valor zero é um dado fiscal válido, não um erro

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
   subconjunto dos 16 XMLs reais de `akretion/nfelib` (MIT) como fixtures. **Nota desta revisão**:
   o fixture ISO-8859-1 é **derivado**, não outro "real" — nenhum dos 16 XMLs vendorizados foi
   confirmado como Latin-1; pega-se um dos reais (UTF-8) e re-codifica manualmente com acentuação
   real, preservando o conteúdo. Deixar isso explícito evita que a implementação perca tempo
   caçando um "real" ISO-8859-1 que pode nem existir no conjunto vendorizado.
2. **Encoding não pode ser assumido** (achado do usuário) — resolvido: `nfelib`/`xsdata` opera sobre
   bytes crus e respeita o encoding declarado no prólogo do XML; Tech Explorer documenta a regra
   explícita de nunca decodificar a string antes de parsear.
3. **Chave de acesso tem dígito verificador próprio** (achado da revisão anterior) — **fechado
   nesta revisão**: agora tem cenário Gherkin próprio (chave adulterada rejeitada), não fica mais
   só registrado como nota sem teste correspondente.
4. **Critérios de aceite `mod`/`finNFe` (achado da revisão de PM) não tinham cenário** — **fechado
   nesta revisão**: 2 cenários novos (NFC-e modelo 65 rejeitada; devolução finNFe=4 rejeitada).
5. **Valor total zero** (achado desta revisão): caso real (amostra grátis/bonificação) que uma
   validação ingênua de "valor > 0" rejeitaria por engano — cenário novo garante que é aceito.
6. **Volume de itens** (autoavaliação, não é gap): "poucos itens" vs. "muitos itens" já está coberto
   implicitamente pela escolha de fixtures de tamanhos diferentes (Tech Explorer já pede 1 pequeno +
   1 maior entre os 16 reais) — não precisa de cenário Gherkin dedicado, cobertura de tamanho vem
   dos fixtures escolhidos, não de um caso de teste a mais.

### O que ainda impede o avanço pro Tech Explorer
Nada bloqueante — revisão de QA aprovada com os cenários acima. Os 3 achados da revisão anterior que
ainda não tinham cenário correspondente (dígito verificador, mod, finNFe) foram fechados nesta
passada — nenhum "achado" fica só registrado sem virar teste.

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

### Validação de chave de acesso — mod-11, mas **pesos diferentes** do CNPJ (achado da revisão de backend)
Chave de acesso: 44 dígitos, último = dígito verificador (`cDV`), mod-11 sobre os 43 primeiros —
mesma família de algoritmo de CNPJ/EAN, mas **não é a mesma função**: CNPJ usa uma lista fixa de
pesos (`services/catalog/cnpj.py`); a chave de acesso usa pesos **cíclicos de 2 a 9**, aplicados da
direita pra esquerda, resto 0 ou 1 → dígito 0, senão `11 - resto` — confirmado via pesquisa
(algoritmo documentado publicamente na literatura técnica de NF-e), não suposição. Precisa de uma
função nova e pequena (`_valida_chave_acesso`), não dá pra reaproveitar `cnpj.py`/`_is_valid_gtin`
como uma função só — a família é a mesma (mod-11), o peso não.

### Ordem de validação em `_parse_nfe` (achado da revisão de backend — faltava no doc anterior)
1. **Estrutura via `nfelib`** (`NfeProc.from_bytes` → fallback `NFe.from_bytes`) — se nenhum dos
   dois parsear, `HTTPException(400, "arquivo não é um XML de NF-e válido")`. Falha aqui cobre
   tanto "não é XML" quanto "é XML mas não tem a forma de uma NF-e".
2. **Dígito verificador da chave de acesso** (`_valida_chave_acesso`) — estrutura válida não
   garante conteúdo íntegro; roda logo depois do parser, antes de interpretar qualquer campo de
   negócio. Falha → `HTTPException(400, "chave de acesso inválida")`.
3. **`ide/mod == "55"`** — senão `HTTPException(400, "não é uma NF-e de compra (verifique se não é
   uma NFC-e)")`.
4. **`ide/finNFe == "1"`** — senão `HTTPException(400, "só notas normais são aceitas — devolução/
   complementar/ajuste não são suportadas nesta versão")`.
5. Extrai os campos de negócio (`emit`, `det[]`, `total/ICMSTot/vNF`) — **sem** validar `vNF > 0`;
   zero é um valor fiscal legítimo (amostra grátis/bonificação), não um erro (achado de QA).

Validar estrutura → integridade → classificação (mod/finNFe) → extrair, nessa ordem: cada passo só
faz sentido se o anterior passou, e mensagens de erro específicas por camada (não um "XML inválido"
genérico pros quatro casos) ajudam a Empresa a entender o que corrigir.

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

`_parse_nfe(raw: bytes)` centraliza as 4 validações da seção acima (estrutura → dígito verificador
→ `mod` → `finNFe`) — usada pelos dois endpoints, nunca duplicada.

`resolve_company_id_write`/`_WRITE_ROLES` — mesmo padrão já usado em A6 (`ORD-182`): cashier/kiosk
bloqueados a nível de API.

**Corrida na dedup por chave de acesso** (achado da revisão de backend, não é gap novo): o
`SELECT` em `_invoice_already_imported` antes do `INSERT` tem uma janela de corrida teórica entre
duas confirmações simultâneas do mesmo XML — sem `try/except IntegrityError` ao redor do
`db.commit()`. **Mesmo padrão já aceito conscientemente** pra conflito de SKU/EAN neste arquivo: a
`UniqueConstraint("company_id", "chave_acesso")` no banco já é a rede de segurança real; o
pré-check via `SELECT` só melhora a mensagem de erro no caso comum (não-concorrente). Frequência de
concorrência real aqui é baixíssima (confirmar a MESMA nota duas vezes ao mesmo tempo exige ação
humana duplicada em paralelo) — não introduzir tratamento novo só pra esta história quando o
padrão já existente não trata o mesmo caso pra SKU/EAN.

### Migration
`services/catalog/migrations/versions/YYYYMMDD_HHMM_supplier_invoices.py` — cria `supplier_invoices`
(com a `UniqueConstraint`) e `supplier_invoice_items`.

### Nova dependência
`services/catalog/requirements.txt` ganha `nfelib` — única dependência nova desta história.

### Frontend (`frontend/admin`) — decisão de posição fechada (achado da revisão de PM)
A versão anterior deste doc deixou "tela nova ou aba dentro de Fornecedores" como "decisão de UX
menor, não crítica" — não é menor: é exatamente o gatilho já registrado como pendência (ver decisão
de projeto sobre consolidar telas de estoque sob um item de sidebar só, adiada de propósito até B1
existir — "Fornecedores" sozinha não justificava abas, uma segunda tela relacionada justifica).

**Decisão**: sidebar ganha um item **"Estoque"** (substitui o item solo "Fornecedores" já existente
de A6/`ORD-182`), com abas internas — mesmo padrão já usado em `CommercialScreen.tsx` (`ORD-174`):
"Fornecedores" (tela já existente, só perde o próprio título — vira conteúdo da aba) e "Notas de
compra" (tela nova desta história: dropzone de upload → chama `/preview` → mostra os dados
extraídos em tabela → botão "Confirmar importação" chama `/supplier-invoices` reenviando o mesmo
`File` já selecionado, sem pedir o arquivo de novo). Erro de "já importada" ou "XML não é NF-e de
compra válida" mostrado inline, sem travar a tela. Migração do item de sidebar existente é
mecânica — mesmo escopo do diff que fez a consolidação de `Comercial` (~90 linhas, sem tocar lógica
das telas). Complexidade interna da tela nova (upload/prévia/confirmação) não muda o tamanho desse
diff — o wrapper de abas só decide qual componente renderizar, mesma forma em qualquer um dos dois.

**Componentes reaproveitados, confirmado no código-fonte do design-system (achado da revisão de
frontend, faltava no doc anterior)**:
- **Upload**: mesmo `Upload`/`UploadListFiles` já usado pra imagem de produto
  (`ProductEditScreen.tsx`, linha ~678) — nenhum dos dois componentes tem lógica interna de preview
  de imagem ou suposição de tipo de arquivo; `types` é só um filtro de MIME
  (`types={["image/jpeg", "image/png"]}` vira `types={["text/xml", "application/xml"]}`). Zero
  componente novo necessário.
- **Tabela da prévia**: `Table.tsx` não tem paginação/scroll embutido — nota com muitos itens
  precisa do mesmo wrapper já usado em 3 lugares do projeto (`ComboFormScreen.module.scss`,
  `ProductEditScreen.module.scss` ×2): `max-height` + `overflow-y: auto` em volta da tabela, não a
  página inteira rolando.

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

Upstream repassado **duas vezes**: uma primeira passada de escrita (eu, sozinho, incorporando as
duas preocupações trazidas pelo usuário — massa de teste real e encoding), e um repasse formal
de verdade por papel (skills de PM/QA/backend-sr/frontend, cada uma relendo o que já estava escrito
como se fosse a primeira vez, não confirmando o que já existia). O repasse achou **8 problemas
reais** que a primeira passada sozinha não tinha pego — registrado aqui pra não virar prática de
"autodeclarar Ready sem revisão de papel de verdade":

**Explorer (revisão de PM):** achou que a motivação superestimava o que B1 resolve (corrigido — B1
entrega histórico estruturado de compras, não elimina a entrada manual de estoque, que continua
até C1 existir); achou que "reenviar o XML" no fluxo de 2 passos estava ambíguo o suficiente pra
sugerir que a Empresa escolhe o arquivo duas vezes (corrigido — é detalhe de implementação, o
`File` fica em memória no navegador); achou 2 validações de negócio faltando, `ide/mod` (rejeitar
NFC-e) e `ide/finNFe` (rejeitar devolução/complementar/ajuste); achou "onde a tela vive" registrado
como "decisão menor, não crítica" quando era exatamente o gatilho já esperado pra consolidar
Fornecedores + Notas de compra sob um item de sidebar "Estoque" (fechado).

**QA Explorer (revisão de QA):** achou que os 2 critérios novos do PM (`mod`/`finNFe`) não tinham
nenhum cenário Gherkin correspondente (adicionados); achou que "chave de acesso tem dígito
verificador" — um achado já registrado numa revisão anterior — nunca tinha virado um cenário
testável (fechado, achado registrado sem teste é loop quebrado); achou que valor total zero
(amostra grátis/bonificação) não estava coberto e podia ser rejeitado por engano por uma validação
ingênua (cenário novo garantindo que é aceito). Confirmou que o cenário ISO-8859-1 depende de
fixture derivado (não outro "real"), e que cobertura de volume de itens já vem dos tamanhos de
fixture escolhidos, sem precisar de cenário dedicado.

**Tech Explorer (revisão de backend-sr):** **pesquisou de verdade** (não assumiu) se o dígito
verificador da chave de acesso usa o mesmo algoritmo do CNPJ — não usa: pesos cíclicos de 2 a 9,
diferente da lista fixa do CNPJ, confirmado via fonte pública, não suposição — precisa de função
nova, não reaproveita `cnpj.py`. Definiu a ordem exata das 4 validações em `_parse_nfe` (estrutura
→ dígito verificador → `mod` → `finNFe` → extrai campos, sem validar `vNF > 0`). Avaliou o risco de
corrida na dedup por chave de acesso e confirmou que é o mesmo padrão já aceito conscientemente
pra SKU/EAN neste projeto — não introduziu tratamento novo assimétrico.

**Frontend (revisão de frontend):** confirmou no código-fonte (não assumiu) que `Upload`/
`UploadListFiles` do design-system não têm nenhuma lógica interna de imagem — servem pra XML só
trocando a prop `types`, zero componente novo. Achou que `Table.tsx` não tem paginação/scroll
embutido e que a tabela de itens da prévia (nota pode ter muitos itens) precisava do wrapper
`max-height` + `overflow-y: auto` já usado em 3 lugares do projeto — não estava no doc.

**Status: Ready.** Primeira história do Bloco B — desbloqueia B2 (conta a pagar opcional) e é
pré-requisito de C1 (vínculo automático por EAN/`cProd`).
