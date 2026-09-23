---
id: ORD-199
status: Ready
estimativa: 3 pontos (fast-track — ajuste pequeno sobre C2/ORD-196 já em produção)
---

# Seleção múltipla e ignorar em lote na tela Pendências

## Descrição

A tela "Pendências" (`PendingItemsScreen.tsx`, C2/`ORD-196`) só resolve item por item hoje —
abrindo o modal de resolução um de cada vez. Quando a Empresa tem dezenas de itens que ela sabe de
cara que "não controla estoque" (ex: descartáveis, embalagens), precisar abrir e confirmar um por
um é atrito desnecessário. Precisa de seleção múltipla (checkbox por linha + "selecionar todos
desta página") e uma ação "ignorar selecionados" em lote.

## Persona

Admin da empresa — mesma persona de C2, no mesmo fluxo de resolução de pendências.

## Contexto

Achado pelo usuário revisando o épico, registrado como ajuste a fazer antes de qualquer
implementação nova do Bloco D. Fast-track (confirmado pelo usuário) — ajuste pequeno e localizado
sobre uma tela já em produção, não upstream completo.

**Diferença do mecanismo já existente**: `POST /catalog/supplier-invoices/items/retroactive/apply`
(C2) já suporta `action: "ignore"` em lote, mas só pra candidatos retroativos — itens que
compartilham o mesmo critério (`c_ean`/`c_prod`+fornecedor) de um item de origem já resolvido. Esta
história é mais geral: qualquer seleção arbitrária de linhas na tela, sem relação de critério entre
elas.

## Solução técnica

### Backend (`catalog-service`)

Endpoint novo, reaproveitando a lógica já existente de `ignore_pending_item` (`main.py:5483`) —
mesmo padrão de falha parcial não derruba os outros já usado em `apply_retroactive` (cada item é
independente, sem relação entre si, então não há motivo pra atomicidade cross-item):

```python
class BulkIgnoreIn(BaseModel):
    item_ids: list[int]

class BulkIgnoreOut(BaseModel):
    ignorados: int
    ja_resolvidos: int  # já tinham link_source — pulados, não é erro

@app.post(
    "/catalog/supplier-invoices/items/bulk-ignore",
    response_model=BulkIgnoreOut,
    tags=["Fornecedores"],
    summary="Ignorar múltiplos itens pendentes de uma vez (seleção livre, sem critério em comum)",
)
async def bulk_ignore_pending_items(
    body: BulkIgnoreIn, db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    ignorados = ja_resolvidos = 0
    for item_id in body.item_ids:
        item = await _get_pending_item_scoped(db, item_id, company_id)  # 404 se outra empresa
        if item.link_source is not None:
            ja_resolvidos += 1
            continue
        item.link_source = "ignorado"
        item.pendente_motivo = None
        ignorados += 1
    await db.commit()
    return {"ignorados": ignorados, "ja_resolvidos": ja_resolvidos}
```

Isolamento multi-tenant: `_get_pending_item_scoped` já filtra por `company_id` e levanta 404 pra
item de outra empresa — mesma garantia de todo endpoint de C2, sem checagem nova.

### Frontend (`PendingItemsScreen.tsx`)

- `TableColumn.header` muda de `string` pra `ReactNode` (mudança de tipo, retrocompatível — toda
  string já satisfaz `ReactNode`; nenhum uso existente de `Table` quebra).
- Coluna nova, `key: "select"`, sem afetar as colunas existentes: checkbox por linha (`design-system`
  `Checkbox`) + checkbox no header pra selecionar/desmarcar todos os itens da página atual.
- Barra de ação em lote, visível só quando `selectedIds.size > 0`: contador + botão "Ignorar
  selecionados (N)" + link "Limpar seleção".
- `ConfirmDialog` (já existente, reaproveitado) antes de confirmar — mesma cautela de toda ação em
  lote/irreversível já usada no restante do admin.
- Seleção é só da página atual (`Set<number>` de `item.id`) — não persiste entre páginas, resetada
  ao trocar filtro ou página (mesmo padrão simples de UI, sem estado global desnecessário).
- Depois de confirmar: refetch da lista, limpa seleção, toast de sucesso com contagem.

## Critérios de aceite

- [ ] Checkbox por linha e checkbox "selecionar todos" no cabeçalho, restrito à página atual.
- [ ] Botão "Ignorar selecionados" só aparece com ao menos 1 item selecionado.
- [ ] Confirmação explícita (`ConfirmDialog`) antes de aplicar — nunca ignora direto no clique.
- [ ] Itens de empresas diferentes nunca se misturam (garantia herdada de `_get_pending_item_scoped`).
- [ ] Item já resolvido nesse meio-tempo (outra aba, outro operador) é pulado sem erro — contabilizado
      separado (`ja_resolvidos`), não quebra o lote inteiro.
- [ ] Depois de confirmar, lista atualiza e reflete os itens removidos da fila.
