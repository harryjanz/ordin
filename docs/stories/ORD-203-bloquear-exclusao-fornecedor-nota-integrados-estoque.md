---
id: ORD-203
status: Ready
estimativa: 3 pontos
---

# Bloquear exclusão de fornecedor e de nota de compra quando já integrados com estoque

## Descrição

Duas lacunas reais achadas no código, não uma feature nova do zero: (1) excluir um `Supplier` que
já tem qualquer `SupplierInvoice` associada quebra hoje com `IntegrityError` de FK (500 cru,
comportamento não intencional, nunca testado); (2) a regra de negócio "não deixar excluir nota que
já gerou entrada de estoque" foi decidida desde a revisão de B1 (`ORD-194`, 2026-09-21) e nunca
implementada — o comentário original em `delete_supplier_invoice` já dizia "adicionar a checagem
aqui quando C1 existir". C1 (`ORD-195`) e D1 (`ORD-198`) existem há tempo; a checagem nunca chegou
a ser escrita.

## Persona

Admin da empresa — gerencia fornecedores e notas de compra, não quer perder o rastro de auditoria
compra→venda ao tentar limpar cadastro.

## Contexto

Pedido direto do usuário durante revisão pós-ORD-202. Fecha as duas regras juntas (fornecedor e
nota) — bloquear só uma das duas deixaria a outra como rota de escape pro mesmo problema (dava pra
contornar o bloqueio do fornecedor excluindo a nota diretamente).

## Fluxo principal

1. Admin tenta excluir um fornecedor (`DELETE /catalog/suppliers/{id}`) ou uma nota de compra
   (`DELETE /catalog/supplier-invoices/{id}`).
2. Sistema verifica se existe pelo menos 1 item de nota com `link_source` real (`ean`/`gtin_alt`/
   `supplier_code`/`manual`) — pro fornecedor, olhando todas as notas dele; pra nota, olhando só os
   itens dela.
3. Se encontrar, a exclusão é rejeitada com `409 Conflict` e mensagem explicando a consequência.
4. Se não encontrar (fornecedor sem nota, ou só notas cujos itens nunca integraram — pendentes ou
   `ignorado`), a exclusão segue: apaga itens → notas → contato/responsável legal → fornecedor, em
   cascata numa transação só.

## Fluxos alternativos / exceções

- **Fornecedor sem nenhuma nota**: exclusão sempre permitida — comportamento já correto hoje.
- **Nota com todos os itens pendentes ou `ignorado`**: exclusão permitida — nenhuma entrada de
  estoque real aconteceu (`ignorado` é marcação explícita de "não controla estoque", C2, nunca
  conta como integração).
- **Fornecedor com múltiplas notas, só uma integrada**: bloqueado — basta 1 nota íntegra pra travar
  a exclusão do fornecedor inteiro.
- **Fornecedor com nota(s) sem integração**: exclusão permitida, apagando as notas e itens em
  cascata junto com o fornecedor — não é mais o 500 de FK de hoje.
- **Tentar excluir a nota travada diretamente, contornando o fornecedor**: também bloqueada — é o
  furo que esta história fecha.

## Dependências

- Serviços envolvidos: só `catalog` — os dois endpoints já vivem no mesmo arquivo.
- Histórias bloqueantes: nenhuma — C1 (`ORD-195`) e D1 (`ORD-198`), donas do dado usado na
  checagem, já mergeadas.

## Critérios de aceite funcionais

- [ ] Excluir fornecedor com qualquer nota tendo ao menos 1 item com `link_source IN ('ean',
      'gtin_alt', 'supplier_code', 'manual')` retorna `409`, não `500`.
- [ ] Excluir nota de compra com ao menos 1 item nessas condições retorna `409`.
- [ ] Fornecedor sem nota, ou só com notas sem nenhum item integrado (`link_source IS NULL` ou
      `'ignorado'`), continua excluível — apagando as notas e itens em cascata.
- [ ] Mensagem de erro fala da consequência (produtos já entraram no estoque, histórico seria
      perdido), sem expor nome de coluna/tabela.
- [ ] A mesma função de checagem é reaproveitada nos dois endpoints.

## Wireframe / Mockup

Nenhuma mudança visual — erro tratado só depois do clique em "Excluir", mesmo padrão de erro
pós-clique já usado no resto do admin (ex: CNPJ duplicado em `SupplierFormScreen.tsx`). Sem
desabilitar o botão proativamente.

## QA Explorer

### Rastreabilidade — Critério (Explorer) → Cenário

| # | Critério | Cenário(s) |
|---|---|---|
| 1 | Excluir fornecedor com nota integrada → 409 | *Fornecedor com nota vinculada por EAN* / *...manualmente* / *2 notas, só 1 integrada* |
| 2 | Excluir nota com item integrado → 409 | *Excluir nota diretamente com item integrado* |
| 3 | Sem nota / sem item integrado → excluível, cascata | *Fornecedor sem nenhuma nota* / *...com nota mas todos pendentes* / *...com item ignorado* / *Nota sem item integrado excluível* / *Cascata apaga a nota junto* / *Ordem da cascata robusta (MySQL real)* |
| 4 | Mensagem clara, sem expor coluna/tabela | *Mensagem fala da consequência, não do mecanismo interno* |
| 5 | Função compartilhada, olha todas as notas | *2 notas, só 1 integrada* |

### Cenários Gherkin

```gherkin
Feature: Bloquear exclusão de fornecedor e nota de compra integrados com estoque
  Como Admin da empresa
  Quero ser impedido de excluir um fornecedor ou nota que já geraram entrada de estoque
  Para nunca perder o rastro de auditoria entre o que foi comprado e o que está no estoque

  Background:
    Dado que estou autenticado como admin da empresa "Burger House" (company_id=1)

  # ── Regressão — comportamento hoje correto continua correto (Critério 3) ────

  Scenario: Fornecedor sem nenhuma nota continua excluível
    Dado um fornecedor sem nenhuma SupplierInvoice associada
    Quando excluo esse fornecedor
    Então a exclusão é confirmada (204)

  # ── Bloqueio — happy path (Critérios 1, 5) ───────────────────────────────────

  Scenario: Fornecedor com nota vinculada por EAN não pode ser excluído
    Dado um fornecedor com uma nota cujo item tem link_source="ean"
    Quando tento excluir esse fornecedor
    Então recebo 409
    E o fornecedor continua existindo

  Scenario: Fornecedor com nota vinculada manualmente (C2) não pode ser excluído
    Dado um fornecedor com uma nota cujo item tem link_source="manual"
    Quando tento excluir esse fornecedor
    Então recebo 409

  Scenario: Fornecedor com duas notas, só uma integrada, não pode ser excluído
    Dado um fornecedor com duas notas — a primeira sem nenhum item integrado (todos pendentes), a segunda com um item link_source="supplier_code"
    Quando tento excluir esse fornecedor
    Então recebo 409

  # ── Falsos positivos — não podem bloquear indevidamente (Critério 3) ────────

  Scenario: Fornecedor com nota cujos itens nunca chegaram a integrar (todos pendentes) é excluível
    Dado um fornecedor com uma nota cujo único item tem link_source=NULL e pendente_motivo="sem_estoque_iniciado"
    Quando excluo esse fornecedor
    Então a exclusão é confirmada (204)

  Scenario: Fornecedor com nota cujo item foi explicitamente ignorado (C2) é excluível
    Dado um fornecedor com uma nota cujo único item tem link_source="ignorado"
    Quando excluo esse fornecedor
    Então a exclusão é confirmada (204)

  # ── Cascata — confirma o que acontece com a nota, não só o status (achado do repasse de QA) ──

  Scenario: Excluir fornecedor com nota sem integração apaga a nota em cascata
    Dado um fornecedor com uma nota cujos itens estão todos pendentes (nunca integrados)
    Quando excluo esse fornecedor
    Então a exclusão é confirmada (204)
    E a nota de compra e seus itens também deixam de existir no banco

  Scenario: Ordem da cascata é robusta mesmo com FK aplicada (MySQL real)
    Dado um fornecedor com duas notas sem integração, cada uma com itens
    Quando excluo esse fornecedor rodando o teste contra o MySQL real de CI (não a suíte SQLite padrão)
    Então a exclusão é confirmada (204) sem IntegrityError de FK

  # ── Nota de compra — mesma regra no outro ponto de entrada (Critério 2) ─────

  Scenario: Excluir nota diretamente com item integrado é bloqueado
    Dado uma nota de compra com um item de link_source="ean"
    Quando tento excluir essa nota diretamente (sem passar pelo fornecedor)
    Então recebo 409

  Scenario: Excluir nota sem item integrado continua permitido
    Dado uma nota de compra cujos itens estão todos pendentes ou ignorados
    Quando excluo essa nota
    Então a exclusão é confirmada (204)

  # ── Mensagem de erro (Critério 4) ────────────────────────────────────────────

  Scenario: Mensagem de erro fala da consequência, não do mecanismo interno
    Dado um fornecedor com nota integrada
    Quando tento excluir e recebo 409
    Então a mensagem menciona que produtos já entraram no estoque e que o histórico seria perdido
    E não contém termos de implementação (ex: "vínculo", "link_source", nomes de tabela)

  # ── Isolamento multi-tenant ───────────────────────────────────────────────────

  Scenario: Checagem de integração não vaza dado de outra empresa
    Dado que a empresa "Pasta & Co" tem um fornecedor com nota integrada
    Quando eu, autenticado como admin da "Burger House", tento excluir um fornecedor meu
    Então o resultado depende só dos dados da minha empresa, nunca informação vazada da Pasta & Co
```

### Nota de execução de teste

Mesma estratégia de baseline de D1/D2/ORD-202: rodar `test_ord182_cadastro_fornecedor.py` e a
suíte de exclusão de nota antes/depois da mudança. O cenário de "ordem da cascata robusta" precisa
rodar contra o MySQL real de CI, não a suíte SQLite padrão (SQLite não aplica FK por padrão nesse
setup, mesmo achado já registrado em `ORD-202`).

## Tech Explorer

### Função compartilhada

```python
async def _has_stock_integrated_items(db: AsyncSession, invoice_ids: list[int]) -> bool:
    """ORD-203 — True se algum item de qualquer nota em invoice_ids teve
    entrada de estoque de verdade aplicada (link_source real, não pendente
    nem ignorado). link_source/pendente_motivo são mutuamente exclusivos
    por construção (main.py:5190-5200) — a checagem de pendente_motivo
    aqui é defesa a mais, não estritamente necessária."""
    if not invoice_ids:
        return False
    result = await db.execute(
        select(SupplierInvoiceItem.id)
        .where(
            SupplierInvoiceItem.supplier_invoice_id.in_(invoice_ids),
            SupplierInvoiceItem.link_source.in_(["ean", "gtin_alt", "supplier_code", "manual"]),
            SupplierInvoiceItem.pendente_motivo.is_(None),
        )
        .limit(1)
    )
    return result.scalars().first() is not None
```

### Endpoints alterados

#### DELETE /catalog/supplier-invoices/{invoice_id}

**Erros:** adiciona `409` aos já documentados (`404`).

```python
async def delete_supplier_invoice(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    invoice = await _get_owned_invoice(db, invoice_id, company_id)
    if await _has_stock_integrated_items(db, [invoice.id]):
        raise HTTPException(
            409,
            detail="Esta nota tem produtos que já entraram no seu estoque — excluir agora apagaria esse histórico de compra.",
        )
    await db.execute(delete(SupplierInvoiceItem).where(SupplierInvoiceItem.supplier_invoice_id == invoice.id))
    await db.delete(invoice)
    await db.commit()
```

#### DELETE /catalog/suppliers/{supplier_id}

**Erros:** adiciona `409` aos já documentados (`404`).

```python
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

    invoice_ids = (await db.execute(
        select(SupplierInvoice.id).filter_by(supplier_id=supplier_id)
    )).scalars().all()

    if await _has_stock_integrated_items(db, invoice_ids):
        raise HTTPException(
            409,
            detail="Este fornecedor tem notas de compra com produtos que já entraram no seu estoque — excluir agora apagaria esse histórico de compra.",
        )

    # Cascata — itens das notas -> notas -> contato/responsável legal -> fornecedor.
    # Core delete() executa na hora (não espera flush), garante ordem certa
    # antes das exclusões ORM de contato/responsável legal + flush final.
    if invoice_ids:
        await db.execute(delete(SupplierInvoiceItem).where(SupplierInvoiceItem.supplier_invoice_id.in_(invoice_ids)))
        await db.execute(delete(SupplierInvoice).where(SupplierInvoice.id.in_(invoice_ids)))

    contact = (await db.execute(select(SupplierContact).filter_by(supplier_id=supplier_id))).scalars().first()
    if contact:
        await db.delete(contact)
    rep = (await db.execute(select(SupplierLegalRepresentative).filter_by(supplier_id=supplier_id))).scalars().first()
    if rep:
        await db.delete(rep)
    await db.flush()
    await db.delete(s)
    await db.commit()
```

### Migrations

Nenhuma — sem tabela/coluna nova, só lógica de query e reordenação de exclusão.

### Impacto em outros serviços

Nenhum.

### Estimativa

| Frente | Estimativa |
|---|---|
| `_has_stock_integrated_items` + `delete_supplier_invoice` alterado | ~1h |
| `delete_supplier` alterado (checagem + cascata) | ~1.5h |
| Testes (13 cenários do QA Explorer/repasse + baseline de regressão) | ~2.5h |
| **Total** | **~5h ≈ 3 pontos** |

### Riscos

- **Mensagem de erro genérica** — não lista quais notas/itens especificamente bloqueiam; melhoria
  de UX futura, não bloqueador (admin já pode investigar abrindo o detalhe de cada nota).
- **Nenhum risco novo de isolamento multi-tenant** — `invoice_ids` já vem filtrado por
  `supplier_id` de um `Supplier` já validado contra `company_id`.
- **Cascata de exclusão em massa** — `DELETE ... WHERE id IN (...)` é uma operação em lote só, sem
  loop, sem risco de performance mesmo com muitas notas.

## Repasse de QA (antes de Ready)

| Achado | Ação |
|---|---|
| Achado técnico da cascata confirmado no Tech Explorer, mas sem cenário de teste explícito que confirme que a nota realmente some (só o 204 do fornecedor) | Cenário novo: *Excluir fornecedor com nota sem integração apaga a nota em cascata* |
| `.limit(1)` — risco de portabilidade SQLite/MySQL? | Confirmado sem risco — já é padrão estabelecido no arquivo (`main.py:1953` e outros 5 usos) |
| Mensagens de erro citavam "vinculados ao estoque"/"itens" — termo interno, não fala da consequência concreta | Reescritas pra falar da consequência ("produtos que já entraram no seu estoque... apagaria esse histórico de compra") |
| Ordem da cascata (itens→notas→fornecedor) só coberta implicitamente pelo teste de sucesso — SQLite da suíte padrão não aplica FK, não pegaria inversão de ordem | Cenário novo, rodado contra MySQL real de CI: *Ordem da cascata é robusta mesmo com FK aplicada* |

Aprovado, sem achado que mude escopo ou estimativa.

## Rastreabilidade ponta a ponta (checklist de Ready)

| Passo do Fluxo Principal | Critério de aceite | Cenário Gherkin | Endpoint |
|---|---|---|---|
| 1. Admin tenta excluir fornecedor ou nota | ✅ (implícito) | todos os cenários | `DELETE /catalog/suppliers/{id}` / `DELETE /catalog/supplier-invoices/{id}` |
| 2. Verifica item com link_source real em qualquer nota relevante | ✅ Critérios 1, 2, 5 | *Fornecedor com nota vinculada...* / *2 notas, só 1 integrada* / *Excluir nota diretamente...* | `_has_stock_integrated_items` |
| 3. Encontrou → 409 com mensagem | ✅ Critério 4 | *Mensagem de erro fala da consequência* | ambos os endpoints |
| 4. Não encontrou → cascata itens→notas→contato/rep→fornecedor | ✅ Critério 3 | *Fornecedor sem nenhuma nota* / *...todos pendentes* / *...ignorado* / *Cascata apaga a nota junto* / *Ordem robusta* | ambos os endpoints |

Todas as linhas preenchidas — nenhum passo do Fluxo Principal ficou só em prosa.

### Checklist final

- [x] Explorer — história, contexto, fluxo, dependências, critérios de aceite completos
- [x] QA Explorer — happy path, bordas, erros, rastreabilidade 1:1
- [x] Tech Explorer — função compartilhada, 2 endpoints alterados, sem migration, estimativa, riscos
- [x] Repasse de QA — 3 achados aplicados (cenário de cascata explícito, mensagens reescritas, cenário de ordem contra MySQL real)
- [x] Rastreabilidade ponta a ponta — tabela acima, sem célula vazia
- [x] Sem bloqueios não resolvidos

## Implementação — achados reais (2026-09-24)

Implementação seguiu o Tech Explorer sem desvio — `_has_stock_integrated_items` +
`delete_supplier_invoice`/`delete_supplier` alterados exatamente como desenhado. Nenhum achado
novo durante a codificação (diferente de ORD-202, onde o Tech Explorer tinha 2 bugs reais que só
apareceram ao vivo contra MySQL) — o repasse de QA já tinha antecipado o ponto de maior risco
(ordem da cascata só validável contra FK real, não SQLite).

Suíte nova (`test_ord203_bloquear_exclusao_fornecedor_nota_integrados_estoque.py`, 12 testes):
regressão (fornecedor sem nota), bloqueio nos dois pontos de entrada (EAN, manual, 2-notas-só-1-
integrada), falsos positivos (pendente, ignorado), cascata explícita (nota some de verdade),
ordem da cascata com 2 notas, mensagem sem jargão técnico, isolamento multi-tenant.

Verificado ao vivo contra o MySQL real de dev (não só a suíte SQLite): fornecedor com 2 notas sem
integração excluído com sucesso (204), notas e itens confirmados removidos via query direta no
banco; fornecedor e nota com item integrado corretamente bloqueados (409) com a mensagem exata
esperada, sem termo técnico. Dados de teste revertidos depois da verificação.

Suíte completa: 545 testes em `catalog-service` (12 novos), sem regressão. `ruff check
services/catalog/` limpo.
