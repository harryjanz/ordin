---
id: ORD-171
status: Ready
estimativa: 8 pontos (6 backend + 2 frontend)
fase: null
sprint: null
responsavel: Backend SR + Frontend
---

# ORD-171 — Emissão de NFC-e no fluxo de pagamento

## Descrição
Quarta história do épico — a mais pesada, e a que resolve de vez a decisão de arquitetura que
ficou em aberto desde o C4 (`fiscal-service` novo vs. módulo do `payment-service`). Consome
NCM/CFOP/CEST (ORD-169) e os tokens Focus NFe (ORD-170) pra emitir a NFC-e de verdade logo depois
do pagamento aprovado no totem, seguindo o modelo de resiliência já desenhado (falha nunca trava
a venda — diagrama 03 do artifact C4 publicado nesta conversa).

**Testável tecnicamente só com o cliente-piloto real** (mesmo bloqueio de sempre) — mas todo o
código de payload/erro pode ser escrito e coberto por testes com mock da Focus NFe, só a validação
de ponta a ponta contra a API real depende do certificado A1 do cliente-piloto.

## Persona
**Cliente final comprando no totem** — a emissão acontece automaticamente, sem nenhuma ação
manual do cliente nem do operador; a persona aqui é quem sente o efeito (sai com o comprovante
fiscal junto do ticket), não quem aciona.

## Contexto
Decisões já fechadas relevantes: NCM/CFOP/CEST por produto (ORD-169), tokens por empresa
(ORD-170), CST/CSOSN nunca é campo — sempre derivado (`docs/estudo-nfce.md` §3.2), modelo de
resiliência assíncrono-tolerante (§2, e o diagrama 03 do artifact C4).

## Explorer

### Decisão de arquitetura: módulo dentro do `payment-service`, não um `fiscal-service` novo
Resolve a pendência que aparecia desde a seção 4 do levantamento e o C4 (fiscal-service
desenhado com borda tracejada "proposto"). Motivos:
1. `payment-service` já é o dono do ponto exato onde isso precisa acontecer — é ele quem hoje
   confirma o pagamento e notifica o order-service (`PATCH /internal/orders/{ref}/status`).
   Emissão fiscal é mais uma consequência do mesmo evento, não um novo domínio de negócio.
2. Um serviço novo pra uma integração com **um único provedor**, escopo **fechado só em NFC-e**,
   ainda em fase de piloto, é infraestrutura especulativa — o próprio princípio já seguido nesta
   sessão (não construir pra requisito hipotético). Se um dia o Ordin precisar de múltiplos
   provedores fiscais ou NF-e, separar em serviço próprio é um refactor bem entendido, não um
   retrabalho evitável agora.
3. Evita mais um hop de rede interna (`payment-service` → `fiscal-service`) exatamente no
   caminho mais sensível a latência do totem (pós-pagamento).

Isso **corrige o diagrama de contêineres publicado no artifact** — o `fiscal-service` da seção 02
deveria ter sido desenhado como módulo dentro do `payment-service`, não contêiner novo separado.
Fica registrado aqui como decisão fechada; o artifact pode ser atualizado numa próxima revisão
visual, não bloqueia esta história.

### História
Como **cliente final comprando no totem**, quero que a nota fiscal seja emitida automaticamente
quando meu pagamento é aprovado (se a empresa tiver o módulo fiscal ativo), para sair com o
comprovante fiscal junto do meu ticket, sem precisar fazer nada a mais.

### Dois controles novos, adicionados nesta história (não existiam nas anteriores)
As histórias 1 e 3 cuidaram de *dado* (certificado, CSC, cadastro na Focus NFe) — nenhuma delas
criou o **interruptor de emissão de verdade**. Esta história adiciona os dois campos que faltavam
em `CompanyFiscalConfig`:
- **`ativo`** (bool, default `false`) — só pode ser ligado depois de `focus_nfe_cadastrado=true`
  (ORD-170). É o opt-in comercial do cliente (`docs/estudo-nfce.md` §8 item 2) virando realidade
  técnica: enquanto `false`, a emissão nem é tentada, fluxo de pagamento roda exatamente como
  hoje.
- **`ambiente`** (`"homologacao"` | `"producao"`, default `"homologacao"`) — controla qual token/
  URL é usado pra emitir de verdade. Segurança operacional: um cliente novo nunca emite nota
  fiscal real por engano — precisa de uma troca explícita pra `"producao"` depois de validado.

### Fluxo principal
1. Pagamento é aprovado no totem (fluxo já existente, `payment-service`).
2. Antes (ou em paralelo a) notificar o order-service, `payment-service` checa se a empresa tem
   `CompanyFiscalConfig.ativo=true`. Se não, segue exatamente como hoje — nenhuma mudança de
   comportamento.
3. Se ativo: monta o payload do `POST /nfce` a partir dos itens do pedido (join com
   `catalog-service` pra pegar NCM/CFOP/CEST por produto) + dados da empresa (CNPJ, endereço,
   regime) + token do ambiente configurado (`ambiente`, token de produção ou homologação).
4. Chama a Focus NFe **com timeout curto** (poucos segundos — não pode segurar o checkout do
   totem esperando SEFAZ).
5a. **Autorizada**: grava `chave_nfe`, `caminho_danfe`, `qrcode_url`, status "autorizada" numa
    tabela nova `fiscal_documents` (no próprio `payment-service`). Pedido segue o fluxo normal —
    totem vai imprimir ticket + DANFE (história 5).
5b. **Erro ou timeout**: grava status "pendente" com o erro (se houver), sem chave/DANFE. Pedido
    segue o fluxo normal do mesmo jeito — totem vai imprimir só o ticket (história 5). Nota fica
    pendente de reconciliação (história 8, fora de escopo aqui).
6. Em nenhum dos dois casos o pagamento/pedido é bloqueado ou atrasado além do timeout curto do
   passo 4 — mesmo modelo já validado no diagrama de resiliência do C4.

### Derivação de CST/CSOSN (nunca é campo, sempre calculado)
```python
def compute_icms_situacao_tributaria(tax_regime: str, has_cest: bool) -> str:
    if tax_regime in ("simples_nacional", "mei"):
        return "500" if has_cest else "102"  # CSOSN
    return "060" if has_cest else "000"       # CST (lucro_presumido/lucro_real)
```
Usa `tax_regime` de `Company` (já existente) + presença de `Product.cest` (ORD-169) por item —
nenhum campo novo armazenado, só função pura chamada na montagem do payload.

### Fluxos alternativos / exceções
- **Empresa sem módulo ativo**: comportamento idêntico ao que existe hoje, zero mudança
  perceptível.
- **Produto do pedido sem NCM cadastrado**: não bloqueia a venda nem o pagamento — a emissão
  falha pra aquele item específico (erro de validação da própria Focus NFe), pedido segue como
  "pendente" (fluxo 5b), mesmo tratamento de qualquer outra falha de emissão.
- **Focus NFe fora do ar / timeout**: mesmo fluxo 5b — nunca trava a venda.
- **Empresa em ambiente "homologação"**: emite normalmente, mas o documento não tem validade
  fiscal real — UI do admin (história 3/aba Fiscal) deve deixar isso bem visível pra não passar a
  falsa impressão de nota fiscal válida durante testes.

### Dependências
- **payment-service**: novo módulo de emissão fiscal (dentro do serviço, não serviço novo),
  cliente HTTP pra Focus NFe (`POST /nfce`), tabela nova `fiscal_documents`.
- **catalog-service**: chamada interna nova (`GET /internal/products/{id}/fiscal` ou reaproveitar
  endpoint existente de detalhe) pra buscar NCM/CFOP/CEST no momento da emissão.
- **company-service**: chamada interna nova (`GET /internal/companies/{id}/fiscal-credentials`,
  já prevista como forward-looking desde a ORD-170) pra decifrar token+CNPJ+regime.
- **frontend/admin**: aba "Fiscal" (ORD-168/170) ganha os 2 controles novos (`ativo`, `ambiente`).
- **Histórias bloqueantes**: ORD-169 (Ready) e ORD-170 (Ready).
- **Histórias que dependem desta**: história 5 (impressão do DANFE consome `caminho_danfe`/
  `qrcode_url`), história 6 (cancelamento consome `chave_nfe`), história 8 (reconciliação consome
  os registros "pendente").

### Critérios de aceite funcionais
- [ ] Empresa com módulo inativo: fluxo de pagamento idêntico ao atual, sem nenhuma chamada à
      Focus NFe
- [ ] Empresa ativa, pagamento aprovado: NFC-e emitida com sucesso grava chave/DANFE/QR e não
      atrasa perceptivelmente o checkout
- [ ] Falha ou timeout na emissão nunca bloqueia nem atrasa o pedido além do timeout configurado
- [ ] CST/CSOSN é sempre calculado, nunca lido de um campo armazenado
- [ ] Troca de ambiente (homologação/produção) usa o token e o comportamento corretos

### Wireframe / Mockup
**Faltando** — os 2 controles novos (toggle "ativo" + seletor de ambiente) são extensão pequena
da aba "Fiscal" já desenhada; risco baixo.

## QA Explorer

### Sobre isolamento multi-tenant nesta história
Nada novo além do padrão já usado em todo o resto do pedido/pagamento — `company_id` isola tudo,
inclusive `fiscal_documents`.

### Cenários Gherkin

```gherkin
Feature: Emissão de NFC-e no fluxo de pagamento
  Como cliente final comprando no totem
  Quero que a nota fiscal seja emitida automaticamente quando o pagamento é aprovado
  Para sair com o comprovante fiscal sem precisar fazer nada a mais

  Background:
    Dado uma empresa "Burger House" com módulo fiscal cadastrado na Focus NFe (ORD-170)

  # --- Happy path ---

  Scenario: Emissão bem-sucedida com módulo ativo em produção
    Dado que o módulo fiscal está ativo e o ambiente é "producao"
    E um pedido com 2 itens, ambos com NCM/CFOP cadastrados
    Quando o pagamento desse pedido é aprovado
    Então a Focus NFe é chamada com o token de produção
    E a resposta autorizada grava chave_nfe, caminho_danfe e qrcode_url
    E o pedido segue o fluxo normal de conclusão

  Scenario: Módulo inativo não altera o fluxo existente
    Dado que o módulo fiscal está inativo
    Quando um pagamento é aprovado
    Então nenhuma chamada é feita à Focus NFe
    E o pedido segue exatamente como antes desta história existir

  # --- Bordas ---

  Scenario: Falha na emissão não bloqueia o pedido
    Dado que o módulo fiscal está ativo
    Quando o pagamento é aprovado e a Focus NFe retorna erro de autorização
    Então o pedido é registrado como "pendente" em fiscal_documents
    E o pedido segue o fluxo normal, sem travar nem atrasar além do timeout

  Scenario: Timeout na chamada à Focus NFe não bloqueia o pedido
    Dado que o módulo fiscal está ativo
    Quando a Focus NFe não responde dentro do timeout configurado
    Então o pedido é registrado como "pendente"
    E o checkout do totem não fica perceptivelmente mais lento

  Scenario: Item do pedido sem NCM cadastrado
    Dado um pedido com um item sem NCM cadastrado no catálogo
    Quando o pagamento é aprovado com módulo ativo
    Então a emissão falha só pra esse cenário, registrada como "pendente"
    E o pedido segue o fluxo normal

  Scenario: Ambiente de homologação não gera documento com validade fiscal real
    Dado que o módulo fiscal está ativo com ambiente "homologacao"
    Quando o pagamento é aprovado
    Então a NFC-e é emitida contra o ambiente de homologação
    E a UI do admin deixa claro que aquele documento não tem validade fiscal real

  # --- CST/CSOSN ---

  Scenario: CST/CSOSN calculado corretamente pro Simples Nacional sem ST
    Dado uma empresa com tax_regime "simples_nacional"
    E um item sem CEST cadastrado
    Quando a NFC-e é montada
    Então o item usa icms_situacao_tributaria "102"

  Scenario: CST/CSOSN calculado corretamente pro Simples Nacional com ST
    Dado uma empresa com tax_regime "simples_nacional"
    E um item com CEST cadastrado
    Quando a NFC-e é montada
    Então o item usa icms_situacao_tributaria "500"
```

### Critérios de aceite testáveis
- [ ] Módulo inativo: zero chamadas à Focus NFe, fluxo idêntico ao atual
- [ ] Emissão bem-sucedida grava chave/DANFE/QR, pedido segue normal
- [ ] Falha/timeout: pedido vira "pendente", nunca trava
- [ ] `compute_icms_situacao_tributaria` cobre os 4 casos (regime × CEST) corretamente
- [ ] Ambiente homologação/produção usa o token correto em cada caso

### O que ainda impede o avanço pro Tech Explorer
Nada bloqueante. Validação de ponta a ponta contra a Focus NFe real segue dependendo do
cliente-piloto (mesmo bloqueio já registrado), mas não impede fechar o Tech Explorer com mocks.

## Tech Explorer

### Serviços impactados
- **payment-service**: módulo novo de emissão fiscal (mesmo serviço, não `fiscal-service`
  separado — decisão do Explorer acima), tabela nova `fiscal_documents`, cliente HTTP Focus NFe.
- **catalog-service**: endpoint interno novo pra dado fiscal do produto.
- **company-service**: endpoint interno novo pra credenciais fiscais da empresa (previsto desde
  a ORD-170).
- **frontend/admin**: 2 controles novos na aba "Fiscal".

### Modelo de dados (novo, em `payment-service`)
```python
class FiscalDocument(Base):
    __tablename__ = "fiscal_documents"
    id = Column(Integer, primary_key=True)
    order_ref = Column(String(64), nullable=False, index=True)  # referência, não FK — cross-service
    company_id = Column(Integer, nullable=False, index=True)
    status = Column(String(20), nullable=False)  # "autorizada" | "pendente" | "erro"
    chave_nfe = Column(String(44), nullable=True)
    caminho_danfe = Column(String(255), nullable=True)
    qrcode_url = Column(String(255), nullable=True)
    erro_mensagem = Column(Text, nullable=True)
    ambiente = Column(String(12), nullable=False)  # "homologacao" | "producao", no momento da emissão
    criado_em = Column(DateTime, server_default=func.now())
```

### Extensão de `CompanyFiscalConfig` (company-service, ORD-168/170)
```python
    ativo = Column(Boolean, nullable=False, default=False)
    ambiente = Column(String(12), nullable=False, default="homologacao")
```

### Endpoints internos novos

#### `GET /internal/companies/{company_id}/fiscal-credentials`
**Header:** `X-Internal-Secret` · **Serviço:** company-service

Decripta e retorna tudo que o payment-service precisa pra montar e assinar a emissão:
```json
{
  "ativo": true,
  "ambiente": "producao",
  "cnpj": "12345678000199",
  "legal_name": "Burger House Ltda",
  "endereco": { "logradouro": "...", "numero": "100", "bairro": "...", "municipio": "...", "uf": "SP", "cep": "..." },
  "tax_regime": "simples_nacional",
  "token": "3qN4X6nfqMW4uZz6TRFiMefPiFfTlwp0",
  "csc": "ABCDEF123456",
  "id_token_csc": "1"
}
```
`token`/`csc` já decifrados no momento da chamada, nunca cacheados em texto puro fora da memória
da requisição — mesmo cuidado de segurança já aplicado a `internal_get_payment_config`.

#### `GET /internal/products/{product_id}/fiscal`
**Header:** `X-Internal-Secret` · **Serviço:** catalog-service

```json
{ "ncm": "21069090", "cfop": "5101", "cest": null }
```

### Montagem do payload `POST /nfce` (payment-service)
```python
async def build_nfce_payload(order, fiscal_creds, products_fiscal):
    items = []
    for i, item in enumerate(order.items, start=1):
        pf = products_fiscal[item.product_id]
        has_cest = bool(pf["cest"])
        items.append({
            "numero_item": str(i),
            "codigo_ncm": pf["ncm"],
            "codigo_produto": str(item.product_id),
            "descricao": item.product_name,
            "quantidade_comercial": item.quantity,
            "quantidade_tributavel": item.quantity,
            "cfop": pf["cfop"],
            "valor_unitario_comercial": item.unit_price,
            "valor_unitario_tributavel": item.unit_price,
            "valor_bruto": item.quantity * item.unit_price,
            "unidade_comercial": "un",   # fixo — pendência da ORD-169, resolvida aqui como default único
            "unidade_tributavel": "un",
            "icms_origem": "0",          # fixo — mercadoria nacional, sem exceção esperada no food service
            "icms_situacao_tributaria": compute_icms_situacao_tributaria(fiscal_creds["tax_regime"], has_cest),
            "cest": pf["cest"],          # opcional, None é aceito
        })
    return {
        "cnpj_emitente": fiscal_creds["cnpj"],
        "data_emissao": datetime.now(TZ).isoformat(),
        "presenca_comprador": "1",       # presencial, sempre — caso de uso do totem
        "modalidade_frete": "9",         # sem frete — venda presencial no balcão
        "local_destino": "1",            # operação interna (mesmo estado)
        "natureza_operacao": "VENDA AO CONSUMIDOR",
        "items": items,
        "formas_pagamento": [{
            "forma_pagamento": FOCUS_NFE_PAYMENT_CODE_MAP[order.payment_method],
            "valor_pagamento": order.total,
        }],
    }
```

### Mapeamento de forma de pagamento (tabela nacional SEFAZ, não específica da Focus NFe)
```python
FOCUS_NFE_PAYMENT_CODE_MAP = {
    "dinheiro": "01", "credito": "03", "debito": "04", "pix": "17",
}
```
**Pendência a confirmar antes da implementação**: esta é a tabela nacional padrão de formas de
pagamento do manual de NFC-e — não confirmamos com a Focus NFe se eles seguem exatamente esses
códigos ou têm alguma variação própria. Baixo risco (tabela é padrão de mercado), mas vale
validar no primeiro teste real com o cliente-piloto.

### Chamada e tratamento de erro
```python
async def emit_nfce(order, company_id) -> FiscalDocument:
    creds = await get_fiscal_credentials(company_id)  # chamada interna, company-service
    if not creds["ativo"]:
        return None  # módulo desligado, não tenta nada
    products_fiscal = await get_products_fiscal(order.items)  # chamada interna, catalog-service
    payload = await build_nfce_payload(order, creds, products_fiscal)
    base_url = PRODUCAO_URL if creds["ambiente"] == "producao" else HOMOLOGACAO_URL
    try:
        resp = await http_client.post(
            f"{base_url}/nfce", params={"ref": order.ref},
            auth=(creds["token"], ""), json=payload, timeout=8.0,
        )
    except (httpx.TimeoutException, httpx.ConnectError):
        return save_fiscal_document(order, company_id, status="pendente", erro="timeout/conexão")
    if resp.status_code == 200 and resp.json().get("status") == "autorizado":
        body = resp.json()
        return save_fiscal_document(order, company_id, status="autorizada",
            chave_nfe=body["chave_nfe"], caminho_danfe=body["caminho_danfe"], qrcode_url=body["qrcode_url"])
    return save_fiscal_document(order, company_id, status="pendente", erro=resp.text)
```
Chamada acontece **depois** da confirmação de pagamento, mas **antes** de retornar sucesso pro
totem — com timeout curto (8s) pra não segurar demais o checkout, porém síncrona o bastante pra
já poder imprimir o DANFE junto do ticket quando autorizada (história 5). Se preferir não
segurar o checkout nem esses 8s, alternativa é responder sucesso pro totem imediatamente e emitir
de forma assíncrona (fire-and-forget), imprimindo o DANFE separado quando/se ficar pronto — **essa
escolha entre síncrono-com-timeout-curto vs. assíncrono é uma decisão de UX que caberia revisar
com o QA/produto antes do downstream**, registrada aqui como ponto em aberto de baixo risco (não
muda o schema nem os endpoints, só o timing de quando o totem manda imprimir).

### Migrations
Duas: (1) `fiscal_documents` no payment-service; (2) `ativo`/`ambiente` em
`company_fiscal_configs` no company-service.

### Eventos de fila
Nenhum nesta história — síncrono. (Pode virar assíncrono via fila se a decisão acima for
revisada; não desenhado agora pra não especular além do necessário.)

### Impacto em outros serviços
company-service e catalog-service ganham endpoints internos novos (documentados acima).
order-service não muda — continua recebendo a notificação de pagamento aprovado exatamente como
hoje.

### Estimativa
- Backend: **~6 pontos** — módulo de emissão completo (payload, chamada HTTP real, tratamento de
  erro/timeout), 2 endpoints internos novos em 2 serviços diferentes, tabela nova, função de
  derivação de CST/CSOSN testada nos 4 casos — a maior superfície do épico até agora.
- Frontend: **~2 pontos** — 2 controles novos na aba já existente.
- **Total: ~8 pontos.**

### Riscos
1. **Decisão síncrono vs. assíncrono no checkout** (registrada acima) — mitigação: implementar
   síncrono com timeout curto primeiro (mais simples, sem fila nova), medir latência real com o
   piloto, migrar pra assíncrono depois se necessário — não é decisão que precisa estar perfeita
   de primeira.
2. **Mapeamento de forma de pagamento não confirmado com a Focus NFe** (pendência acima) — baixo
   risco, tabela é padrão nacional, mas testar no primeiro pedido real do piloto.
3. **`icms_origem` fixo em "0"** — simplificação deliberada (comida preparada/revendida nunca é
   mercadoria importada no caso de uso do Ordin); documentar a suposição explicitamente no código
   pra não virar bug silencioso se um caso de borda aparecer.
4. **Corrige o C4 publicado** (não é risco de implementação, é débito de documentação) — o
   diagrama de contêineres do artifact mostra `fiscal-service` como contêiner separado; esta
   história decide que é módulo do `payment-service`. Vale atualizar o artifact numa próxima
   revisão visual pra não ficar desalinhado com o que foi de fato decidido.

### O que ainda impede o avanço pro Ready
Nada bloqueante. Validação de ponta a ponta contra a Focus NFe real segue dependendo do
cliente-piloto — mesmo bloqueio já registrado, não impede Ready.

## Ready

**Explorer:** [x] história Como/quero/para · [x] decisão de arquitetura fechada
(`payment-service`, não serviço novo) · [x] dois controles novos identificados (`ativo`,
`ambiente`) e justificados · [x] fluxo principal (6 passos) · [x] derivação de CST/CSOSN
especificada · [x] dependências (bloqueada por ORD-169 e ORD-170, bloqueia 5/6/8) · [ ] wireframe
— não produzido, risco baixo · [x] critérios de aceite funcionais.

**QA Explorer:** [x] happy path (emissão com sucesso) · [x] bordas (módulo inativo, falha,
timeout, item sem NCM, ambiente homologação) · [x] cenários de CST/CSOSN cobrindo os 4 casos ·
[x] cenários aprovados.

**Tech Explorer:** [x] serviços impactados (3 serviços) · [x] modelo de dados (`FiscalDocument` +
extensão de `CompanyFiscalConfig`) · [x] 2 endpoints internos novos com payload completo · [x]
montagem do payload de emissão detalhada · [x] mapeamento de forma de pagamento com pendência de
validação registrada · [x] migrations (duas) · [x] eventos de fila — nenhum, síncrono por ora ·
[x] estimativa (8 pontos) · [x] riscos com mitigação, incluindo correção necessária no artifact
C4.

**Aprovação final:** [x] solução técnica revisada · [x] estimativa 8 pontos · [x] sem bloqueios
não resolvidos pro Ready (validação real depende do piloto, mesmo bloqueio de sempre, não
impede) · [ ] sprint específico — não atribuída ainda.

**Status: Ready.** É a implementação mais arriscada do épico até aqui — recomendo começar pelo
backend com testes usando mock da Focus NFe antes de qualquer teste real, e só depois validar
contra a API de verdade quando o cliente-piloto estiver pronto.
