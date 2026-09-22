---
id: ORD-198
status: Tech Explorer
estimativa: 5 pontos (confirma a estimativa original do épico — ver seção Estimativa)
---

# D1 — Baixa automática de estoque na aprovação do pagamento

## Descrição

Quando um pagamento é aprovado no totem (`POST /payments` confirma sucesso), o estoque dos
produtos vendidos com CFOP 5102 (revenda pura — ex: bebidas) precisa descer sozinho, sem exigir
ajuste manual da Empresa depois. A baixa acontece no momento da aprovação, não na criação do
pedido nem na coleta do ticket — pedido criado mas nunca pago não deve afetar estoque nenhum.
Produtos CFOP 5101 (produção própria) ficam de fora desta história — só ganham baixa automática
quando a ficha técnica (Bloco E) existir; até lá continuam sob controle manual (`active`).

## Persona

Empresa (dona do estabelecimento) — hoje precisa dar entrada e ajustar estoque manualmente pra
cada venda de produto revendido; quer que o saldo fique confiável sozinho depois de cada pagamento
aprovado, sem trabalho extra repetido.

## Contexto

É o gargalo real do épico de estoque/ERP: dos 120 pontos originais, 83 já estão em produção
(Blocos A, F, G, B1, C), mas nenhum deles entrega o efeito prático de "estoque desce quando
vende" — só entrada manual/automática por NF de compra existe até aqui. D1 (com D2, o estorno
automático, história separada) é o que destrava o Bloco E (ficha técnica, 24 pontos), que por sua
vez é o motivo de ser do módulo pro caso de uso principal do Ordin (comida preparada, CFOP 5101) —
sem D1/D2, o módulo só serve pra quem revende pronto, deixando a maior parte do valor represada.

A pesquisa anterior (`docs/estudo-modulo-estoque-erp.md`) já resolveu as decisões de arquitetura
mais arriscadas desta história (momento da baixa, concorrência via `SELECT FOR UPDATE`, por que
não dá pra "bloquear" um pagamento que a maquininha TEF já debitou fisicamente). Ficam
explicitamente em aberto pro Explorer resolver: o que fazer com produto sem `estoque_controlado`
(nunca teve entrada) vendido nesse meio-tempo, e a fronteira exata entre D1 (decremento) e D2
(estorno, história separada) quando a baixa falha.

## História

Como Empresa (dona do estabelecimento), quero que o estoque de produtos revendidos (CFOP 5102)
desça sozinho quando um pagamento é aprovado no totem, para manter o saldo confiável sem precisar
registrar ajuste manual pra cada venda.

## Contexto e motivação

83 dos 120 pontos do épico de estoque/ERP já estão em produção (Blocos A, F, G, B1, C), mas nenhum
entrega o efeito prático de "estoque desce quando vende" — só entrada (manual ou por NF de compra)
existe até aqui. D1 é o gargalo real: junto com D2 (estorno automático, história separada),
destrava o Bloco E inteiro (ficha técnica, 24 pontos) — o motivo de ser do módulo pro caso de uso
principal do Ordin (comida preparada, CFOP 5101). Sem D1/D2, o módulo só serve hoje pra quem
revende pronto.

A pesquisa anterior (`docs/estudo-modulo-estoque-erp.md`) já fechou as decisões de maior risco
arquitetural: momento da baixa (na aprovação, não na criação do pedido), concorrência (reutilizada
via padrão já existente no `catalog-service`, ver Tech Explorer), e por que não existe "bloquear"
um pagamento que a maquininha TEF já debitou fisicamente do cliente. Esta Explorer fecha duas
decisões que ficaram em aberto e formaliza a solução em cima do código real do
`payment-service`/`order-service`/`catalog-service`.

## Fluxo principal

1. Cliente paga no totem, TEF aprova — `POST /payments` do `payment-service` confirma
   `status: approved` (`main.py:879`, mesmo bloco que já chama `_notify_order`/
   `emit_nfce_if_active`/`_publish("payment.approved")`).
2. `payment-service` busca os itens do pedido (`_get_order_with_items`, já existente) e a
   classificação fiscal de cada produto em lote (`_get_products_fiscal`, já existente).
3. Pra cada item cujo produto tem CFOP 5102 **e** não veio de uma opção de grupo (ver Fluxos
   alternativos — escopo desta história), `payment-service` chama um endpoint novo no
   `catalog-service`, `POST /internal/stock/decrement`, informando `order_ref`, `product_id` e
   `quantity`.
4. `catalog-service` decrementa a quantidade do `stock_item` correspondente com `UPDATE` atômico
   (ver Tech Explorer), grava um `StockMovement` novo (`tipo="saida"`) associado ao `order_ref`, e
   retorna sucesso — mesmo que o saldo resultante fique negativo (ver Fluxos alternativos).
5. Chamada é idempotente por `order_ref`: se `payment-service` reenviar (timeout+retry),
   `catalog-service` reconhece que aquele `order_ref` já decrementou aquele `stock_item` e não
   aplica de novo.
6. Se a chamada falhar de verdade (indisponibilidade, timeout, erro 5xx — não "saldo ficou
   negativo", que é sucesso), `payment-service` propaga esse sinal de falha pra quem chamou (D2,
   história separada, decide o que fazer — não implementado aqui).

## Fluxos alternativos / exceções

- **Produto sem `estoque_controlado`** (nunca teve entrada de estoque) vendido: decremento é
  pulado silenciosamente — não existe `stock_item` pra decrementar, e o produto continua se
  comportando exatamente como antes desta história (decisão 11 do estudo, já fechada). Não é erro,
  não gera log de falha.
- **Produto CFOP 5101** (produção própria): fora de escopo desta história por definição — continua
  sob controle manual (`active`) até o Bloco E existir.
- **Item vendido veio de uma opção escolhida** (produto guarda-chuva com grupo de opções, ex:
  "Refrigerante Lata 350ml" → Coca-Cola): **fora de escopo desta história**. Achado na Explorer:
  `OrderItemOption` (`services/order/main.py:113`) é denormalizado — guarda só o texto do rótulo
  escolhido (`option_label`), nunca o `option_id` real do catalog-service. Sem esse dado chegando
  ao `payment-service`, não há como saber qual opção (com seu próprio estoque, Bloco G) decrementar.
  Esta lacuna já estava registrada em abstrato no estudo ("Pendência separada... propagar
  `option_id`... via `OrderItemOption`") — fica formalmente associada a D1 agora, como bloqueio de
  escopo, não pendência solta.
- **Concorrência real — dois pagamentos aprovados simultaneamente pro último item**: o `UPDATE`
  atômico serializa as duas chamadas; a segunda decrementa mesmo assim, resultando em saldo
  negativo. Isso é **sucesso**, não falha — não existe mecanismo pra "recusar" um pagamento que a
  maquininha já debitou fisicamente (decisão 9 revisada, já fechada). O saldo negativo fica visível
  pra Empresa investigar depois; alertar sobre isso é fora de escopo.
- **`catalog-service` indisponível ou erro real na chamada**: isto sim é falha — `payment-service`
  precisa saber que a baixa não aconteceu, pra sinalizar (log estruturado) — D2, quando existir,
  reaproveita esse ponto. D1 não pode engolir a exceção como `emit_nfce_if_active` faz (módulo
  fiscal é best-effort por natureza; estoque precisa deixar rastro).
- **Retry por timeout de rede**: chamada idempotente por `order_ref` — reenviar não decrementa duas
  vezes o mesmo `stock_item` pro mesmo pedido.

## Dependências

- Serviços envolvidos: `payment` (chamador), `catalog` (endpoint novo + schema novo).
- Histórias bloqueantes: nenhuma — `A2`/`A3`/`A4` (fundação de estoque) e `G1`-`G4` (opções) já
  `Ready`/mergeadas.
- **Fronteira explícita com D2** (história separada, ainda não aberta): D2 trata *o que fazer*
  quando D1 sinaliza falha real (estorno automático via `_try_cancel_fiscal_document`). D1 só
  decrementa e sinaliza — não implementa nenhuma lógica de estorno.
- **Dependência não-numerada, fora do épico**: decrementar estoque de item vendido via opção
  (produto guarda-chuva) depende da propagação de `option_id` até o `payment-service` (trabalho já
  registrado como pendência separada, dependente de `G1`, sem história própria ainda) — D1 não
  resolve isso, só documenta o bloqueio.

## Critérios de aceite funcionais

- [ ] Pagamento aprovado de item com produto CFOP 5102, com `estoque_controlado=true` e sem opção
      selecionada, gera um `StockMovement` (`tipo="saida"`) decrementando a quantidade correta.
- [ ] O decremento acontece na aprovação do pagamento (`status: approved`), nunca na criação do
      pedido nem na coleta do ticket.
- [ ] Produto CFOP 5101 nunca é decrementado por esta história.
- [ ] Produto sem `estoque_controlado` (nunca teve entrada) vendido não gera erro nem decremento —
      comportamento idêntico ao anterior a esta história.
- [ ] Item vendido com opção selecionada nunca é decrementado por esta história (fora de escopo,
      documentado, não falha silenciosa disfarçada de sucesso).
- [ ] Dois pagamentos aprovados simultaneamente pro último item do mesmo produto resultam em duas
      movimentações de saída gravadas, mesmo que o saldo final fique negativo — nenhuma das duas é
      bloqueada ou rejeitada.
- [ ] Reenviar a mesma chamada de decremento pro mesmo `order_ref`+`stock_item` não decrementa duas
      vezes (idempotência).
- [ ] Falha real na chamada (indisponibilidade, timeout, erro 5xx do catalog-service) é sinalizada
      de volta pro chamador em `payment-service` — nunca engolida silenciosamente.
- [ ] Isolamento multi-tenant: `product_id`/`option_id` são PKs globais nunca reaproveitadas entre
      empresas — garantia estrutural, verificada por teste, não checagem explícita de `company_id`
      no endpoint interno (ver Tech Explorer, achado 3).

## Wireframe / Mockup

Nenhuma mudança visual — história inteiramente de backend (endpoint interno novo + hook numa
chamada já existente). Nenhuma tela nova, nenhum componente novo.

## QA Explorer

### Rastreabilidade — Critério (Explorer) → Cenário

| # | Critério | Cenário(s) que cobrem |
|---|---|---|
| 1 | Pagamento aprovado (CFOP 5102, `estoque_controlado`, sem opção) gera `StockMovement` `saida` correto | *Pagamento aprovado decrementa o estoque do produto vendido* |
| 2 | Decremento só na aprovação, nunca na criação do pedido nem na coleta do ticket | *Criar pedido não decrementa estoque*, *Coletar ticket não decrementa estoque* |
| 3 | CFOP 5101 nunca decrementado | *Produto CFOP 5101 nunca é decrementado por esta história* |
| 4 | Produto sem `estoque_controlado` vendido → sem erro, sem decremento | *Produto nunca controlado (sem 1ª entrada) vendido não gera decremento nem erro* |
| 5 | Item com opção selecionada nunca decrementado, não é erro | *Item vendido com opção selecionada não decrementa, pagamento segue normal* |
| 6 | Concorrência: dois pagamentos simultâneos pro último item — ambos gravados, nenhum bloqueado | *Dois pagamentos simultâneos pro último item — ambas as movimentações são gravadas* |
| 7 | Idempotência por `order_ref` | *Reenviar a mesma chamada de decremento não duplica a movimentação* |
| 8 | Falha real (indisponibilidade/timeout/5xx) → sinalizada, nunca engolida | *Catalog-service indisponível — falha é sinalizada de volta pro chamador* |
| 9 | Isolamento multi-tenant (garantia estrutural) | *Isolamento multi-tenant — decremento nunca afeta stock_item de outra empresa* |

Cenário adicional sem numeração 1:1 direta, reforçando a distinção mais arriscada da história (não
confundir falha real com saldo negativo por concorrência legítima): *Saldo negativo por concorrência
é sucesso, não gera o mesmo sinal de falha que indisponibilidade real*.

### Cenários Gherkin

```gherkin
Feature: Baixa automática de estoque na aprovação do pagamento (D1)
  Como Empresa
  Quero que o estoque de produtos revendidos desça sozinho quando um pagamento é aprovado
  Para manter o saldo confiável sem ajuste manual pra cada venda

  Background:
    Dado que existe um produto "Coca-Cola Lata 350ml" com CFOP "5102" e estoque_controlado=true, com 10 unidades em estoque
    E existe um pedido no totem contendo 1 unidade desse produto

  # ── Happy path (Critério 1, 2) ────────────────────────────────────────────

  Scenario: Pagamento aprovado decrementa o estoque do produto vendido
    Dado que o pedido ainda não foi pago
    Quando o pagamento é aprovado pela maquininha TEF
    Então é gravado um StockMovement do tipo "saida" pro produto, com a quantidade vendida
    E o saldo do produto cai de 10 para 9

  Scenario: Criar pedido não decrementa estoque
    Dado que o pedido acabou de ser criado no totem
    Quando consulto o saldo de estoque do produto
    Então o saldo continua 10, sem nenhuma movimentação de saída registrada

  Scenario: Coletar ticket não decrementa estoque
    Dado que o pagamento já foi aprovado e o estoque já decrementou pra 9
    Quando o operador de balcão coleta o ticket desse pedido
    Então o saldo continua 9 — a coleta não gera nenhuma movimentação de estoque adicional

  # ── Escopo CFOP (Critério 3) ────────────────────────────────────────────

  Scenario: Produto CFOP 5101 nunca é decrementado por esta história
    Dado que existe um produto "X-Burger" com CFOP "5101" e estoque_controlado=true
    E existe um pedido contendo 1 unidade desse produto
    Quando o pagamento é aprovado
    Então nenhum StockMovement é gerado pra esse item
    E o produto continua sob controle manual (active), sem nenhuma mudança de comportamento

  # ── Rollout — produto nunca controlado (Critério 4) ─────────────────────

  Scenario: Produto nunca controlado (sem 1ª entrada) vendido não gera decremento nem erro
    Dado que existe um produto CFOP "5102" que nunca teve nenhuma entrada de estoque (estoque_controlado=false)
    E existe um pedido contendo 1 unidade desse produto
    Quando o pagamento é aprovado
    Então o pagamento é confirmado normalmente
    E nenhum StockMovement é gerado pra esse item
    E nenhum erro é retornado nem logado — comportamento idêntico ao anterior a esta história

  # ── Fora de escopo: item com opção selecionada (Critério 5) ──────────────

  Scenario: Item vendido com opção selecionada não decrementa, pagamento segue normal
    Dado que existe um produto guarda-chuva "Refrigerante Lata 350ml" com a opção "Coca-Cola" escolhida no carrinho
    E a opção "Coca-Cola" tem CFOP "5102" e estoque próprio com 5 unidades
    Quando o pagamento é aprovado
    Então o pagamento é confirmado normalmente, sem nenhum erro reportado ao cliente nem à Empresa
    E nenhum StockMovement é gerado pra esse item (option_id não chega até o payment-service nesta história)
    E o saldo da opção "Coca-Cola" continua 5, inalterado

  # ── Concorrência (Critério 6) ─────────────────────────────────────────────

  Scenario: Dois pagamentos simultâneos pro último item — ambas as movimentações são gravadas
    Dado que o produto "Coca-Cola Lata 350ml" tem exatamente 1 unidade em estoque
    E existem dois pedidos diferentes, cada um contendo 1 unidade desse produto
    Quando os dois pagamentos são aprovados simultaneamente (UPDATE atômico serializa)
    Então são gravados 2 StockMovements do tipo "saida", um por pedido
    E nenhum dos dois pagamentos é bloqueado, recusado ou revertido por esta história
    E o saldo final do produto fica negativo (-1), sem gerar erro nem alerta — reconciliação é fora de escopo

  # ── Idempotência (Critério 7) ─────────────────────────────────────────────

  Scenario: Reenviar a mesma chamada de decremento não duplica a movimentação
    Dado que o pagamento de um pedido já foi aprovado e o decremento já foi aplicado com sucesso
    Quando a chamada POST /internal/stock/decrement é reenviada pro mesmo order_ref (ex: retry por timeout de rede)
    Então nenhum StockMovement novo é gravado
    E o saldo do produto permanece o mesmo da primeira aplicação

  # ── Falha real vs. saldo negativo (Critério 8, e cenário extra de distinção) ──

  Scenario: Catalog-service indisponível — falha é sinalizada de volta pro chamador
    Dado que o catalog-service está indisponível (timeout ou erro 5xx) no momento da aprovação do pagamento
    Quando o payment-service tenta chamar POST /internal/stock/decrement
    Então a falha é logada de forma estruturada, associada ao order_ref
    E o pagamento em si continua aprovado (a falha de estoque não desfaz o débito já feito na maquininha)

  Scenario: Saldo negativo por concorrência é sucesso, não gera o mesmo sinal de falha que indisponibilidade real
    Dado o cenário de concorrência acima (saldo final negativo, ambas movimentações gravadas com sucesso)
    Quando comparo a resposta dessas duas chamadas de decremento com a resposta de uma chamada que encontrou o catalog-service indisponível
    Então as duas chamadas de concorrência retornam sucesso (200), nenhuma sinalização de falha
    E só a chamada que encontrou o catalog-service indisponível gera o log de falha que D2 vai reaproveitar

  # ── Isolamento multi-tenant (Critério 9) ──────────────────────────────────

  Scenario: Isolamento multi-tenant — decremento nunca afeta stock_item de outra empresa
    Dado que a empresa "Burger House" e a empresa "Pasta & Co" têm, cada uma, um produto próprio (product_id distintos, PK global)
    Quando um pagamento da empresa "Burger House" é aprovado
    Então só o stock_item da empresa "Burger House" é decrementado
    E o stock_item do produto da empresa "Pasta & Co" permanece inalterado
```

## Decisão de arquitetura — síncrono vs. assíncrono (discussão com o usuário)

O usuário levantou, durante a Tech Explorer, se a baixa deveria ser assíncrona via fila, pensando em
volume futuro. Investigação em código real antes de decidir: `IMessageBroker`
(`services/payment/domain/interfaces/message_broker.py`) só tem `publish()`/`close()` — **nenhum
método de consumo existe hoje em lugar nenhum do projeto**. `RabbitMQBroker` publica de verdade
(exchange `ordin.events`, fila `payment.events` declarada e vinculada, mas nunca lida por nada) e
`SQSBroker` de produção é um **stub que só loga**, nunca implementado de verdade. Nenhum serviço do
Ordin tem hoje um processo consumidor de fila — é infraestrutura só de publish. Não existe simulador
de SQS local (`docker-compose.yml` só tem `rabbitmq` real) e o log de auditoria em MongoDB
(`save_audit`, `payment-service`) é escrita síncrona direta, não passa por fila.

**Decisão**: implementar D1 síncrono agora (`payment-service` chama `catalog-service` via HTTP
interno). A lógica de decremento fica isolada numa função própria (`_decrement_stock_for_sale`,
ver Tech Explorer) desacoplada do transporte HTTP — se o volume um dia justificar migrar pra
consumidor de fila, a função é reaproveitada sem mudança, só troca quem a invoca. Construir a
infraestrutura de consumo (interface + implementação RabbitMQ real + SQS real + processo de
background em `catalog-service`, hoje inexistentes) fica registrado como possível história de
plataforma futura, não como pré-requisito de D1.

## Tech Explorer

**Correções aplicadas ao Explorer/QA Explorer (achados de código real)**:

1. **Concorrência**: reaproveita o padrão já existente e provado em `_create_stock_movement` pro
   caminho "entrada" (`main.py:3117-3120`) — `UPDATE` atômico incondicional
   (`quantidade_atual = quantidade_atual - delta`), sem `SELECT FOR UPDATE`. O lock de linha do
   InnoDB durante o `UPDATE` já serializa concorrência — `SELECT FOR UPDATE` é do `order-service`
   (ticket, `ORD-017/118`), nunca foi usado nesta tabela, e adicionar um padrão novo aqui seria
   inconsistência sem ganho.
2. **`tipo="saida"` não entra no `Literal` público** (`StockMovementIn.tipo`, `main.py:2962`, usado
   pelo ajuste manual do admin) — schema interno separado, função interna separada.
3. **Sem checagem explícita de `company_id`** no endpoint novo — mesmo padrão já estabelecido em
   `/internal/products/{id}/fiscal` (`main.py:4165`): `product_id` é PK global, nunca reaproveitada
   entre empresas, a garantia é estrutural. O cenário de QA Explorer de "isolamento multi-tenant"
   vira verificação dessa garantia estrutural, não uma trava nova a escrever.

### Serviços impactados

- `catalog`: endpoint interno novo, schema interno novo, migration nova (coluna + índice),
  `criado_por` vira nullable.
- `payment`: um hook novo dentro de `create_payment`, reaproveitando `_get_order_with_items`/
  `_get_products_fiscal` já existentes, sem mudança de schema neles.

### Endpoints

#### POST /internal/stock/decrement

**Serviço:** catalog · **Auth:** `X-Internal-Secret` (`require_internal`, sem JWT) · **company_id:**
não recebido — isolamento estrutural via `product_id` global (ver achado 3)

Request:
```json
{
  "order_ref": "ORD-20260922-0042",
  "items": [
    {"product_id": 17, "quantity": 2}
  ]
}
```

Response 200 (sempre — mesmo com saldo negativo):
```json
{"processed": 1, "skipped": 0}
```
`skipped` conta itens sem `estoque_controlado` (nenhum `stock_item` existe) ou já processados
nesse `order_ref` (idempotência) — não é erro.

Erros: `503`/timeout só por indisponibilidade real (DB fora do ar) — nunca por saldo insuficiente,
que não existe como conceito de erro aqui.

```python
class InternalStockDecrementItem(BaseModel):
    product_id: int
    quantity: int  # sempre positivo — sinal é aplicado internamente

class InternalStockDecrementIn(BaseModel):
    order_ref: str
    items: list[InternalStockDecrementItem]


async def _decrement_stock_for_sale(
    db: AsyncSession, order_ref: str, items: list[InternalStockDecrementItem],
) -> dict:
    """Função isolada do transporte HTTP de propósito — se um dia a baixa
    virar consumidor de fila, essa função é reaproveitada sem mudança,
    só troca quem a chama (endpoint vs. handler de mensagem)."""
    processed = skipped = 0
    for it in items:
        stock_item = (await db.execute(
            select(StockItem).filter_by(product_id=it.product_id, option_id=None)
        )).scalars().first()
        if stock_item is None:
            skipped += 1
            continue  # nunca controlado — Critério 4, não é erro

        existing = (await db.execute(
            select(StockMovement).filter_by(stock_item_id=stock_item.id, order_ref=order_ref)
        )).scalars().first()
        if existing:
            skipped += 1
            continue  # já processado — idempotência, Critério 7

        await db.execute(
            update(StockItem).where(StockItem.id == stock_item.id)
            .values(quantidade_atual=StockItem.quantidade_atual - it.quantity)
        )
        db.add(StockMovement(
            stock_item_id=stock_item.id, tipo="saida", quantidade=-it.quantity,
            order_ref=order_ref, motivo=f"Venda — pedido {order_ref}", criado_por=None,
        ))
        await db.commit()
        processed += 1
    return {"processed": processed, "skipped": skipped}


@app.post("/internal/stock/decrement", include_in_schema=False)
async def internal_decrement_stock(
    body: InternalStockDecrementIn, db: AsyncSession = Depends(get_db), _: None = Depends(require_internal),
):
    return await _decrement_stock_for_sale(db, body.order_ref, body.items)
```

### Hook em `payment-service` (`main.py:879`)

```python
if result.status == TransactionStatus.approved:
    await _notify_order(body.order_ref, "paid")
    await emit_nfce_if_active(current_user.company_id, body.order_ref, body.method, body.amount)
    await _decrementar_estoque_venda(current_user.company_id, body.order_ref)  # NOVO
    await _publish("payment.approved", ...)
```

```python
async def _decrementar_estoque_venda(company_id: int, order_ref: str) -> None:
    """Filtra por CFOP 5102 e exclui item com opção selecionada (Critério 3, 5
    — option_id não chega até aqui, fora de escopo de D1). Nunca deixa o
    pagamento falhar por causa disso — a cobrança já aconteceu fisicamente."""
    try:
        order = await _get_order_with_items(order_ref)
        if not order:
            return
        products_fiscal = await _get_products_fiscal([it["product_id"] for it in order["items"]])
        items = [
            {"product_id": it["product_id"], "quantity": it["quantity"]}
            for it in order["items"]
            if products_fiscal.get(it["product_id"], {}).get("cfop") == "5102"
        ]
        if not items:
            return
        async with httpx.AsyncClient(timeout=5) as c:
            resp = await c.post(f"{CATALOG_SVC}/internal/stock/decrement",
                                 json={"order_ref": order_ref, "items": items}, headers=INTERNAL_HEADERS)
            resp.raise_for_status()
    except (httpx.HTTPError, httpx.TimeoutException) as exc:
        # Gap conhecido e aceito até D2 existir: loga estruturado, não estorna
        # ainda. D2 (história separada) vai reaproveitar esse ponto de falha.
        logger.error("Decremento de estoque falhou pra order_ref=%s: %s", order_ref, exc)
```

Nota: itens com opção selecionada nunca chegam a `items` porque `_get_order_with_items` hoje não
retorna `option_id` nenhum — todo item de `order["items"]` é resolvido só por `product_id`, e
produto guarda-chuva nunca tem `stock_item` próprio (G4), então cairia em `skipped` mesmo se
chegasse. Redundante mas inofensivo — não precisa de filtro explícito extra.

### Migrations

- Tabela `stock_movements`:
  - Coluna `order_ref` (`String(64)`, nullable).
  - Índice único composto `(stock_item_id, order_ref)` — MySQL trata múltiplos `NULL` como
    não-colidentes, então "entrada"/"ajuste" (sempre `order_ref=NULL`) nunca colidem entre si; só
    duas "saida" pro mesmo `stock_item_id`+`order_ref` colidiriam, que é exatamente a idempotência
    que queremos.
  - `criado_por` vira `nullable=True` — `NULL` significa "gerado pelo sistema", nunca usado por
    endpoint manual (admin sempre grava um `user_id` real).

### Impacto em outros serviços

- `payment-service` chama `catalog-service` via HTTP interno (`X-Internal-Secret`), mesmo padrão já
  usado por `emit_nfce_if_active`/`_get_products_fiscal`.

### Eventos de fila

Nenhum — decisão desta rodada foi manter síncrono (ver seção "Decisão de arquitetura" acima).
`payment.approved` continua publicado como já é hoje, sem novo consumidor.

### Estimativa

| Frente | Estimativa |
|---|---|
| Schema interno + `_decrement_stock_for_sale` + endpoint | ~2h |
| Migration (coluna + índice) | ~0.5h |
| Hook em `payment-service` + filtro CFOP | ~1.5h |
| Testes (happy path, CFOP 5101 excluído, sem estoque_controlado, opção excluída, concorrência via 2 chamadas paralelas, idempotência, falha real vs. saldo negativo, criação de pedido/coleta de ticket não decrementam) | ~4h |
| **Total** | **~8h ≈ 5 pontos** (confirma a estimativa original do épico) |

### Riscos

- **Gap conhecido, aceito conscientemente**: sem D2, uma falha real de decremento (catalog-service
  indisponível no instante exato) fica só logada — não há estorno nem retry automático ainda.
  Mitigação: log estruturado com `order_ref` reconhecível, pra D2 (quando existir) ou uma
  investigação manual conseguir reconciliar.
- **Escopo de opção (guarda-chuva) fora desta história** — documentado, não é bug, é dependência
  não-numerada já registrada no épico.
- **Migration em tabela já usada em produção por A9 (gráfico)** — `ADD COLUMN` nullable + índice,
  sem backfill, baixo risco. Convenção de sinal (`quantidade` negativa em "saida") preserva
  `_get_stock_history` funcionando sem tocar o código dela.
