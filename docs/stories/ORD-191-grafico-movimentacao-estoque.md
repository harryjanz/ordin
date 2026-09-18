---
id: ORD-191
status: Ready
estimativa: 5 pontos (backend + frontend)
fase: null
sprint: null
responsavel: Backend SR + Frontend
---

# ORD-191 — Gráfico de nível de estoque (7 dias)

## Descrição
História **A9** do épico de estoque/ERP (`docs/estudo-modulo-estoque-erp.md`, Bloco F —
Visibilidade e custo, achado nos prints do Mercado Livre). Depende de A2 (`ORD-181`, Ready, ainda
sem código). É a mais barata das 3 histórias do Bloco F: `stock_movement` (`ORD-181`) já grava
`stock_item_id`/`tipo`/`quantidade` (com sinal aplicado)/`criado_em` de toda movimentação — dado
bruto suficiente pra reconstruir o gráfico sem nenhuma tabela nova.

## Persona
**Empresa** (owner/manager/admin que gerencia catálogo e estoque).

## Explorer

### História
Como **Empresa**, quero ver um gráfico do nível de estoque de um produto (ou opção) ao longo dos
últimos 7 dias, para entender a tendência de consumo sem precisar ler linha por linha do histórico
de movimentações.

### Decisão de escopo — gráfico de NÍVEL (linha), não de VOLUME (barra)
"Estoque essa semana" (o que o usuário viu no ML) é uma leitura de **quanto tinha em cada dia**, não
de "quanto entrou/saiu por dia" — são perguntas diferentes ("estou ficando sem?" vs. "quanto eu
movimentei?"). Decisão: gráfico de **linha**, eixo Y = `quantidade_atual` reconstruída ao final de
cada um dos últimos 7 dias.

**Como reconstruir sem snapshot diário armazenado**: parte-se da `quantidade_atual` **de agora**
(já conhecida em `stock_item`) e anda-se **para trás**, subtraindo o delta líquido de cada dia a
partir de hoje — 1 única query buscando todas as `stock_movement` da janela de 7 dias (ordenadas por
`criado_em`), agregadas por dia, sem precisar buscar o histórico completo desde sempre. Custo:
O(movimentações na janela), não O(todas as movimentações já registradas).

### Decisão de escopo — fuso horário na agregação por dia (achado da revisão de PM)
`StockMovement.criado_em` é gravado com `datetime.utcnow()` (`ORD-181`). Agregar por dia usando
fronteira UTC deslocaria o rótulo do dia em até 3h pra qualquer movimentação feita à noite em
horário de Brasília (UTC-3) — uma entrada às 21h de terça apareceria no gráfico como "quarta".
**Decisão**: a agregação por dia converte `criado_em` pra `America/Sao_Paulo` antes de agrupar —
não é opcional, é o que faz o rótulo do dia bater com o que a Empresa realmente vivenciou.

### Decisão de escopo — onde entra na UI
Mesma seção "Estoque" (`ORD-181`), **abaixo da tabela de histórico de movimentações** — complementa,
não substitui a tabela (a tabela já é a fonte de detalhe por evento; o gráfico é a leitura de
tendência).

### Decisão de escopo — dono-agnóstico por construção (G2/G3 já pagaram esse custo)
Como `stock_item`/`stock_movement` já são polimórficos (`ORD-181`/G2, `ORD-190`/G3 — aceitam
`Product` **ou** `Option`), o gráfico consome só `stock_item_id` já resolvido — não precisa de
nenhuma lógica condicional por tipo de dono. Nasce cobrindo produto **e** opção ao mesmo tempo, sem
custo extra, porque a fundação polimórfica já foi paga por G2/G3.

### Fluxo principal
1. Empresa abre a seção "Estoque" de um produto (ou opção) que já tem `stock_item`.
2. Abaixo do histórico de movimentações, vê um gráfico de linha com 7 pontos (um por dia), eixo Y
   = quantidade em estoque ao final daquele dia.

### Fluxos alternativos / exceções
- **Produto/opção sem `stock_item`**: gráfico não aparece (mesmo padrão condicional já usado pro
  resto da seção "Estoque").
- **`stock_item` existe, mas nenhuma movimentação na janela de 7 dias**: gráfico aparece com uma
  linha reta em `quantidade_atual` — informativo (confirma "nada mudou"), não um estado vazio.
- **`stock_item` criado há menos de 7 dias**: dias anteriores à criação não têm nenhuma
  movimentação possível — tratados como quantidade 0 antes da primeira entrada (não como "sem
  dado"), já que antes do `stock_item` existir o produto literalmente não tinha controle de
  estoque.

### Dependências
- **Depende de A2** (`ORD-181`, Ready).
- **Histórias futuras que consomem esta**: nenhuma.

### Critérios de aceite funcionais
- [ ] Gráfico de linha com 7 pontos, um por dia, quantidade reconstruída ao final de cada dia
- [ ] Agregação por dia usa fuso `America/Sao_Paulo`, não UTC
- [ ] Sem `stock_item`: gráfico não aparece
- [ ] Com `stock_item` e zero movimentação na janela: linha reta em `quantidade_atual`
- [ ] Funciona igualmente pra produto e para opção, sem código condicional por tipo de dono

## QA Explorer

### Esclarecimento: ajuste retroativo entra no dia em que foi REGISTRADO, não no dia "corrigido"
Achado ao revisar a Explorer: não existe (nem deveria existir) um campo "data do erro" em
`stock_movement` — só `criado_em`. Um ajuste que corrige uma contagem de 3 dias atrás entra no
delta do dia em que a Empresa **registrou** o ajuste, não do dia do erro original. Mesmo princípio
de imutabilidade já estabelecido na `ORD-184` ("histórico não é recalculado retroativamente") —
o gráfico reflete quando os eventos aconteceram no sistema, não uma reconstrução semântica do
passado "verdadeiro". Não é uma lacuna, é uma confirmação que precisa ficar explícita no critério
de aceite (evita dúvida de suporte "por que o gráfico não mostrou a correção no dia certo?").

### Cenários

```gherkin
Funcionalidade: Gráfico de nível de estoque (7 dias)

  Cenário: Reconstrução correta com movimentações em dias diferentes
    Dado um stock_item com quantidade_atual=50
    E uma entrada de 20 há 3 dias e uma saída (ajuste -10) há 1 dia
    Quando consulto o gráfico dos últimos 7 dias
    Então os pontos anteriores à entrada mostram a quantidade de antes (30)
    E o ponto do dia da entrada em diante mostra 50, até o ajuste
    E o ponto do dia do ajuste em diante mostra 40

  Cenário: Múltiplas movimentações no mesmo dia agregadas num só ponto
    Dado 3 movimentações registradas no mesmo dia (+10, +5, -3)
    Quando consulto o gráfico
    Então esse dia aparece como um único ponto refletindo o delta líquido do dia (+12)

  Cenário: Movimentação perto da meia-noite de Brasília cai no dia certo (teste direto do achado de fuso)
    Dado uma movimentação com criado_em="2026-09-15T23:50:00-03:00" (23:50 de 15/set em Brasília,
    que é "2026-09-16T02:50:00Z" em UTC)
    Quando consulto o gráfico
    Então essa movimentação é agregada no dia 15/set (horário de Brasília), NÃO no dia 16/set
    # é o teste que pegaria uma regressão se alguém trocar a agregação de volta pra UTC

  Cenário: stock_item criado há menos de 7 dias
    Dado um stock_item criado há 3 dias (primeira entrada de 10)
    Quando consulto o gráfico dos últimos 7 dias
    Então os 4 dias anteriores à criação mostram quantidade 0
    E os 3 dias seguintes mostram a evolução real a partir da primeira entrada

  Cenário: Sem movimentação na janela mostra linha reta
    Dado um stock_item com quantidade_atual=15, última movimentação há 20 dias
    Quando consulto o gráfico dos últimos 7 dias
    Então todos os 7 pontos mostram 15 (linha reta)

  Cenário: Sem stock_item o gráfico não aparece
    Dado um produto sem stock_item
    Quando abro a seção Estoque
    Então nenhum gráfico é renderizado

  Cenário: Funciona igual para Option (dono-agnóstico)
    Dado uma Option com stock_item próprio e movimentações na janela
    Quando consulto o gráfico dessa opção
    Então a reconstrução funciona exatamente como no cenário de Product acima, mesmo endpoint/lógica
```

### Lacunas encontradas

1. **Performance da reconstrução com alto volume**: a Explorer não especifica se a agregação por
   dia acontece em SQL (`GROUP BY` na query) ou em Python (buscar todas as linhas da janela e somar
   no código). Pra um produto de alto giro (centenas de movimentações em 7 dias), buscar todas as
   linhas e agregar em Python é desnecessariamente caro — **recomendo ao Tech Explorer** que a soma
   por dia aconteça em SQL (`GROUP BY DATE(criado_em AT TIME ZONE ...)` ou equivalente), trazendo já
   os deltas diários agregados, não uma linha por movimentação. Bloqueante pro Tech Explorer decidir
   a forma exata, não pra Explorer.
2. **Nenhum teste de isolamento multi-tenant dedicado é necessário aqui** (confirmação, não lacuna):
   o gráfico consome `stock_item_id` que já vem de um endpoint (`/stock`) já isolado por
   `company_id` via `_resolve_stock_owner` (G2/G4) — não introduz caminho de acesso novo.

## Tech Explorer

### Decisão técnica — agregação por dia em Python, não em SQL (revisa a recomendação de QA)
QA recomendou `GROUP BY` em SQL por performance. Investigação: fazer a conversão de fuso em SQL
exigiria `CONVERT_TZ` (sintaxe MySQL) — **SQLite (usado na suíte de testes local, mesmo padrão de
`test_ord180_cadastro_ean_produto.py`) não tem `CONVERT_TZ` nativo**, quebrando a suíte de testes
ou exigindo dois caminhos de query por dialect. **Decisão**: buscar as linhas da janela (uma query,
filtrada por `stock_item_id` + `criado_em >= início_da_janela`, **1 stock_item por vez** — nunca uma
lista de produtos) e agregar em **Python** com `zoneinfo`. Não é o mesmo problema de N+1 que motivou
a recomendação original de QA em outras histórias (`ORD-185`): aqui o volume é limitado a **uma
janela de 7 dias de um único dono** — mesmo um produto de altíssimo giro (algumas centenas de
movimentações/semana) é trivial de agregar em memória. Portabilidade entre SQLite (teste) e MySQL
(produção) pesa mais que a economia teórica de agregação em SQL nesta escala.

### Função de reconstrução (`services/catalog/main.py`, nova, perto de `_get_stock_state`)

```python
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

BR_TZ = ZoneInfo("America/Sao_Paulo")

async def _get_stock_history(db: AsyncSession, stock_item_id: int) -> list[dict]:
    item = (await db.execute(select(StockItem).filter_by(id=stock_item_id))).scalars().first()
    if item is None:
        return []

    hoje_br = datetime.now(BR_TZ).date()
    dias = [hoje_br - timedelta(days=i) for i in range(6, -1, -1)]  # mais antigo → mais recente

    inicio_janela_br = datetime.combine(dias[0], datetime.min.time(), tzinfo=BR_TZ)
    inicio_janela_utc = inicio_janela_br.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)

    result = await db.execute(
        select(StockMovement.criado_em, StockMovement.quantidade)
        .filter(StockMovement.stock_item_id == stock_item_id, StockMovement.criado_em >= inicio_janela_utc)
        .order_by(StockMovement.criado_em.asc())
    )
    rows = result.all()

    delta_por_dia: dict[date, Decimal] = {d: Decimal("0") for d in dias}
    total_janela = Decimal("0")
    for criado_em_utc, quantidade in rows:
        # criado_em é gravado ingênuo em UTC (datetime.utcnow(), ORD-181) — anexar tzinfo antes
        # de converter, senão astimezone() interpretaria como fuso local do servidor
        dia = criado_em_utc.replace(tzinfo=ZoneInfo("UTC")).astimezone(BR_TZ).date()
        if dia in delta_por_dia:
            delta_por_dia[dia] += quantidade
        total_janela += quantidade

    # saldo no INÍCIO da janela — se o stock_item nasceu dentro da janela, nenhuma movimentação
    # anterior existe pra capturar, então total_janela == quantidade_atual e saldo fecha em 0
    # automaticamente, sem precisar checar StockItem.created_at
    saldo = item.quantidade_atual - total_janela

    pontos = []
    for dia in dias:
        saldo += delta_por_dia[dia]
        pontos.append({"dia": dia.isoformat(), "quantidade": saldo})
    return pontos
```

**Por que o saldo pré-`stock_item` sai certo sem checagem especial**: se a janela começa antes do
`stock_item` existir, nenhuma movimentação anterior pode existir pra ele (impossível ter
movimentação antes da criação) — logo `total_janela` já é igual à soma de tudo que já aconteceu
com esse item, e `quantidade_atual - total_janela` fecha em exatamente `0`. O critério de aceite
"dias antes do `stock_item` existir = quantidade 0" sai de graça da aritmética, não de um `if`
dedicado.

### Endpoints — 2 finos, delegando pra `_get_stock_history`

```python
@app.get(
    "/catalog/products/{product_id}/stock/history",
    tags=["Catálogo"],
    summary="Histórico de nível de estoque de um produto nos últimos 7 dias",
)
async def get_product_stock_history(
    product_id: int, db: AsyncSession = Depends(get_db), company_id: int = Depends(resolve_company_id),
):
    await _resolve_stock_owner(db, company_id, product_id=product_id)  # 404/400 (G2/G4) reaproveitados
    item = (await db.execute(select(StockItem).filter_by(product_id=product_id))).scalars().first()
    return {"points": await _get_stock_history(db, item.id) if item else []}


@app.get(
    "/catalog/options/{option_id}/stock/history",
    tags=["Catálogo"],
    summary="Histórico de nível de estoque de uma opção nos últimos 7 dias",
)
async def get_option_stock_history(
    option_id: int, db: AsyncSession = Depends(get_db), company_id: int = Depends(resolve_company_id),
):
    await _resolve_stock_owner(db, company_id, option_id=option_id)
    item = (await db.execute(select(StockItem).filter_by(option_id=option_id))).scalars().first()
    return {"points": await _get_stock_history(db, item.id) if item else []}
```

Nenhuma lógica de isolamento nova — `_resolve_stock_owner` (G2/G3/G4) já cobre os dois donos.
`item is None` retorna `points: []`, que o frontend trata como "não renderizar o gráfico" (mesma
condição já usada pro resto da seção "Estoque").

### Frontend
`ProductEditScreen.tsx` e o modal de opção (`OptionGroupFormScreen.tsx`), seção "Estoque", abaixo
da tabela de histórico: componente de gráfico de linha novo, 7 pontos, eixo X com o dia (formatado
`dd/mm`), eixo Y a quantidade. **Risco de dependência**: não há confirmação de que o `frontend/admin`
já tem uma biblioteca de gráficos instalada — verificar `package.json` antes de implementar; se não
houver, escolher uma leve (ex. `recharts`) é decisão de implementação, não deste documento.

### Migration
Nenhuma — `StockItem`/`StockMovement` já existem (`ORD-181`). Endpoint novo, sem schema novo.

### Estimativa
**5 pontos confirmados** — algoritmo de reconstrução com fuso horário (não trivial, embora sem
tabela nova), 2 endpoints, componente de gráfico novo no frontend (possível dependência nova).

### Riscos
- **SQLite vs. MySQL**: resolvido pela decisão de agregar em Python — os dois bancos retornam a
  mesma sequência de linhas pra um `WHERE criado_em >= :x`, sem nenhuma função específica de
  dialect envolvida na query.
- **Biblioteca de gráfico não confirmada no frontend**: ver nota acima — não bloqueia o Tech
  Explorer, mas quem implementar precisa checar antes de estimar o trabalho de frontend com
  precisão.
- **Fuso horário fixo `America/Sao_Paulo`**: adequado pro escopo atual (produto brasileiro,
  single-region) — se o Ordin um dia operar fora do Brasil, isso precisaria virar configuração por
  empresa, fora de escopo aqui.

## Ready
Passou pelas 3 rodadas de revisão (PM, QA, Backend SR).

- **PM**: decidiu gráfico de NÍVEL (linha), não de volume; achou o gap real de fuso horário
  (`StockMovement.criado_em` é UTC, agregação por dia precisa converter pra `America/Sao_Paulo`
  senão o rótulo do dia fica errado pra movimentações noturnas); confirmou escopo dono-agnóstico
  de graça (G2/G3 já pagaram a fundação polimórfica).
- **QA**: cenários cobrindo reconstrução multi-dia, agregação no mesmo dia, o teste direto do
  achado de fuso horário, stock_item recente, sem movimentação, sem stock_item, e o caminho Option.
  Esclareceu que ajuste retroativo entra no dia do registro, não do "erro corrigido". Recomendou
  agregação em SQL por performance.
- **Backend SR**: **reverteu a recomendação de SQL da QA**, com justificativa registrada —
  `CONVERT_TZ` é MySQL-only, SQLite (suíte de testes) não suporta, e o volume por request é limitado
  a 1 dono × 7 dias, tornando agregação em Python tanto mais portável quanto suficientemente rápida.
  Algoritmo de reconstrução resolve o caso "antes do stock_item existir" por aritmética, sem `if`
  dedicado. Apontou risco de dependência de biblioteca de gráfico ainda não confirmada no frontend.
