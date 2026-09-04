---
id: ORD-152
status: Done
fase: 6
sprint: null
responsavel: Backend SR + Frontend
estimativa: 3 pontos (1 backend + 2 frontend)
tipo: feature
---

# ORD-152 — Sugerir reativação de combos ao ativar produto componente

## Descrição
Quando o admin reativa (`active: true`) um produto que é componente de um ou mais combos
inativos, o sistema deve sugerir reativar esses combos junto — sem forçar. Um modal lista os
combos relacionados, cada um com um checkbox marcado por padrão, e o admin decide quais
combos ativar (todos, alguns, ou nenhum) antes de confirmar. Complementa o `ORD-151`: aquela
história cobre desativar produto → avisa sobre combo ativo; esta cobre o caminho inverso —
ativar produto → sugere reativar combo inativo.

## Persona
Admin da empresa (dono/gerente) que gerencia o catálogo no painel administrativo — mesma
persona do `ORD-151`.

## Contexto
Pedido direto do usuário logo após validar o `ORD-151` em teste manual: parte do mesmo pacote
de melhorias no cadastro de produtos (fluxo de ativar/desativar produto vinculado a combo).
Hoje reativar um produto não avisa nada sobre combos que ficaram inativos quando ele foi
desativado (comportamento correto do `ORD-151` — reativar produto não reativa combo
automaticamente) — o admin precisa lembrar de ir na aba Combos e reativar cada um manualmente,
sem nenhum lembrete na hora. Essa história fecha esse ciclo com uma sugestão explícita, não
automática (diferente da cascata de desativação do `ORD-151`, que já é automática — aqui a
decisão fica sempre com o admin, por checkbox).

---

## Explorer

## História
Como **admin da empresa**, quero que o sistema me sugira reativar os combos que ficaram
inativos quando eu reativo um produto componente, para não esquecer de reativá-los
manualmente depois — mas sem que isso aconteça sozinho, porque a decisão de qual combo voltar
a vender é minha.

## Contexto e motivação
Fecha o ciclo aberto pelo `ORD-151`: aquela história garante que desativar produto nunca deixa
um combo ativo "quebrado" (avisa e cascata automática); mas ao reativar o produto depois, nada
lembra o admin de que existem combos esperando reativação manual. Sem essa sugestão, o produto
volta a vender avulso mas o combo continua invisível pro cliente até o admin lembrar sozinho —
fricção real de operação, não só estética.

Decisão de produto: **sugestão opt-in, nunca automática**. Diferente da cascata de desativação
(automática, porque desativar é a ação mais segura por padrão), aqui ativar um combo é uma
decisão comercial (preço, disponibilidade dos outros componentes) que só o admin deve tomar —
por isso checkbox marcado por padrão, não ativação automática.

## Fluxo principal
1. Admin reativa um produto (`active: true`) — a ativação do produto acontece normalmente,
   **sem bloqueio** (diferente do ORD-151, aqui não há confirmação prévia pro produto em si)
2. Backend verifica se esse produto é componente de algum combo **inativo** (não excluído) e
   inclui a lista (id + nome) na resposta da própria chamada de ativação
3. Se a lista vier vazia → nada muda na UI, fluxo idêntico ao de hoje
4. Se vier com 1+ combos → frontend abre um modal "Reativar combos relacionados?" listando cada
   combo com um checkbox **marcado por padrão**
5. Admin desmarca os que não quer reativar agora e confirma → frontend dispara uma chamada de
   ativação (`PATCH /catalog/combos/{id}`, endpoint já existente do ORD-112/151) só pros combos
   que ficaram marcados
6. Admin fecha o modal sem confirmar → produto continua ativado normalmente, nenhum combo é
   tocado

## Fluxos alternativos / exceções
- Produto vinculado só a combos **já ativos** → nenhuma sugestão (comportamento atual)
- Produto vinculado a combo excluído definitivamente (`deleted=true`) → nunca aparece na
  sugestão, mesmo filtro já usado em toda consulta de combo
- Um dos combos marcados tem **outro** produto componente também inativo → a tentativa de
  ativar esse combo específico esbarra no bloqueio do `ORD-151`
  (`set_combo_active` recusa com 409); o admin é avisado especificamente sobre esse combo, sem
  desfazer a ativação do produto nem dos outros combos marcados que deram certo
- Múltiplos produtos ativados em sequência — cada ativação gera sua própria sugestão
  independente, sem deduplicar entre chamadas

## Dependências
- Serviços envolvidos: `catalog-service` (`update_product` ganha campo extra na resposta,
  reaproveita `set_combo_active` já existente pra aplicar a escolha), `frontend/admin`
  (modal novo — checkbox múltiplo, diferente do `setConfirmState` binário do ORD-151)
- Histórias bloqueantes: nenhuma — `ORD-151` já implementado nesta mesma branch/pacote

## Critérios de aceite funcionais
- [ ] Ativar produto sem combo inativo vinculado continua sem nenhuma mudança de UI (regressão)
- [ ] Ativar produto com 1+ combos inativos vinculados retorna a lista desses combos na resposta
      da própria chamada de ativação (sem round-trip extra)
- [ ] Modal aparece só quando a lista vem não-vazia, com cada combo pré-marcado
- [ ] Confirmar com alguns desmarcados só ativa os marcados
- [ ] Fechar/cancelar o modal não ativa nenhum combo — produto permanece ativado normalmente
- [ ] Combo marcado que não pode ser ativado (outro produto ainda inativo) avisa
      especificamente sobre ele, sem desfazer o resto
- [ ] Isolamento multi-tenant: só considera combos da própria empresa do produto
- [ ] Combos excluídos definitivamente nunca aparecem na sugestão

## Wireframe / Mockup
Nenhum existente. Modal novo — precisa de lista com checkbox por item, diferente do
`setConfirmState` binário (mensagem + confirmar/cancelar) já usado no ORD-151. Tech Explorer
decide se generaliza `setConfirmState` pra aceitar itens selecionáveis ou cria componente à
parte.

---

## QA Explorer

Contrato de API assumido para os cenários abaixo (a confirmar no Tech Explorer):
`PUT /catalog/products/{id}` com `active: true` continua respondendo `200` sempre (nunca
bloqueia), e passa a incluir `inactive_combos: [{id, name}]` na resposta quando o produto for
componente de combo(s) inativo(s) — lista omitida/vazia nos demais casos. A ativação de cada
combo escolhido usa o `PATCH /catalog/combos/{id}` já existente (ORD-112/151), uma chamada por
combo marcado.

```gherkin
Feature: Sugerir reativação de combos ao ativar produto componente
  Como admin da empresa
  Quero que o sistema sugira reativar os combos que ficaram inativos quando eu reativo um
  produto componente
  Para não esquecer de reativá-los manualmente depois, mas sem que isso aconteça sozinho

  Background:
    Dado que a empresa 1 tem o produto "X-Burguer" (id=1), inativo
    E a empresa 1 tem o produto "Coca-Cola 350ml" (id=6), ativo
    E a empresa 1 tem o combo "Combo Clássico" (id=13), inativo, com os produtos [1, 6]

  # ── Happy path — regressão (sem combo inativo vinculado) ──────────────────

  Scenario: Ativar produto sem combo inativo vinculado não sugere nada
    Dado que a empresa 1 tem o produto "Sorvete" (id=8), inativo, sem nenhum combo vinculado
    Quando o admin envia PUT /catalog/products/8 com active=true
    Então a resposta é 200
    E o produto "Sorvete" fica com active=true
    E a resposta não traz inactive_combos (ou traz lista vazia)

  # ── Happy path principal — combo inativo vinculado ─────────────────────────

  Scenario: Ativar produto vinculado a combo inativo sugere reativação
    Quando o admin envia PUT /catalog/products/1 com active=true
    Então a resposta é 200
    E o produto "X-Burguer" fica com active=true (a ativação nunca é bloqueada)
    E a resposta traz inactive_combos com o combo "Combo Clássico" (id=13)

  Scenario: Confirmar a sugestão ativa o combo escolhido
    Dado o admin recebeu a sugestão do cenário anterior
    Quando o admin marca "Combo Clássico" e confirma
    E o frontend envia PATCH /catalog/combos/13 com active=true
    Então a resposta é 200
    E o combo "Combo Clássico" fica com active=true

  Scenario: Fechar o modal sem confirmar não ativa nenhum combo
    Dado o admin recebeu a sugestão de reativar "Combo Clássico"
    Quando o admin fecha o modal sem marcar/confirmar nada
    Então nenhuma chamada é feita a /catalog/combos
    E o combo "Combo Clássico" continua com active=false
    E o produto "X-Burguer" continua com active=true (já tinha sido ativado no passo anterior)

  # ── Cenários de borda ──────────────────────────────────────────────────────

  Scenario: Produto vinculado a múltiplos combos inativos lista todos
    Dado que o produto "X-Burguer" (id=1) também é componente do combo "Combo do Dia" (id=14),
      inativo
    Quando o admin envia PUT /catalog/products/1 com active=true
    Então a resposta traz inactive_combos com "Combo Clássico" e "Combo do Dia"

  Scenario: Admin desmarca um dos combos sugeridos — só o marcado é ativado
    Dado a sugestão trouxe "Combo Clássico" e "Combo do Dia", ambos inativos
    Quando o admin deixa só "Combo Clássico" marcado e confirma
    Então apenas PATCH /catalog/combos/13 é chamado
    E "Combo Clássico" fica com active=true
    E "Combo do Dia" continua com active=false

  Scenario: Combo sugerido não pode ser ativado por causa de outro produto inativo
    Dado que "Combo Clássico" (id=13) também tem o produto "Refrigerante" (id=20), inativo
    Quando o admin marca "Combo Clássico" e confirma
    E o frontend envia PATCH /catalog/combos/13 com active=true
    Então a resposta é 409 com "Refrigerante" citado no detail
    E o admin é avisado especificamente sobre esse combo
    E o produto "X-Burguer" (já ativado antes) continua com active=true

  Scenario: Combo excluído definitivamente nunca aparece na sugestão
    Dado que "Combo Clássico" (id=13) está com deleted=true
    Quando o admin envia PUT /catalog/products/1 com active=true
    Então a resposta não traz "Combo Clássico" em inactive_combos

  Scenario: Produto vinculado só a combos já ativos não sugere nada
    Dado que "Combo Clássico" (id=13) já está com active=true
    Quando o admin envia PUT /catalog/products/1 com active=true
    Então a resposta não traz inactive_combos (ou traz lista vazia)

  # ── Isolamento multi-tenant ────────────────────────────────────────────────

  Scenario: Sugestão nunca inclui combo de outra empresa
    Dado que o produto 1 (empresa 1) só pode ser componente de combos da própria empresa 1
      (isolamento garantido por FK — cenário de regressão, não ocorre na prática)
    Quando o admin da empresa 1 envia PUT /catalog/products/1 com active=true
    Então inactive_combos só traz combos com company_id da empresa 1
```

**Critério de saída — auto-avaliação:**
- [x] Happy path coberto (sem combo inativo — regressão; com combo inativo — sugestão + confirmação)
- [x] Cenários de borda cobertos (múltiplos combos, desmarcar um, combo com outro produto
      inativo, combo excluído, combos já ativos)
- [x] Cenário de erro coberto (409 ao tentar ativar combo com outro produto ainda inativo)
- [x] Cenário de isolamento multi-tenant incluído
- [x] Aprovação do PM — aprovado

---

## Tech Explorer

### Serviços impactados
- **catalog-service**: `update_product` (`main.py`) ganha uma consulta extra (não bloqueante)
  quando `active: true`, e `ProductOut` ganha um campo novo. Sem migration — reaproveita
  `Combo`/`ComboItem` e o `PATCH /catalog/combos/{id}` já existente (ORD-112/151).
- **frontend/admin**: `CatalogScreen.tsx` — reaproveita `ConfirmDialog` (já suporta `children`
  pra conteúdo extra, ver comentário no próprio componente) com um `<Checkbox>` (design-system,
  já usado em `ProductEditScreen.tsx`) por combo. **Sem componente novo.**

### Endpoints

#### PUT /catalog/products/{product_id} (alterado — resposta ganha campo novo)
**Serviço:** catalog-service
**Auth:** JWT obrigatório | role: `owner`/`admin`/`superadmin` (`require_write_role`, inalterado)
**company_id:** extraído do JWT via `resolve_company_id_write` (inalterado)

Request: inalterado (`ProductUpdate`, já tem `active: Optional[bool]`).

`ProductOut` ganha um campo novo, sempre presente (lista vazia por padrão — sem custo extra
pros outros endpoints que retornam `ProductOut`, como `list_products`/`get_product`, porque só
`update_product` popula com uma consulta de verdade):
```json
{
  "id": 1, "name": "X-Burguer", "active": true,
  "...": "... (demais campos inalterados)",
  "inactive_combos": [{"id": 13, "name": "Combo Clássico"}]
}
```

**Nova consulta, inserida em `update_product`, só quando `body.active is True`:**
```python
inactive_combos: list[tuple[int, str]] = []
if body.active is True:
    rows = (await db.execute(
        select(Combo.id, Combo.name)
        .join(ComboItem, ComboItem.combo_id == Combo.id)
        .filter(
            ComboItem.product_id == product_id,
            Combo.company_id == company_id,
            Combo.active == False, Combo.deleted == False,  # noqa: E712
        )
    )).all()
```
Nunca levanta exceção — a ativação do produto sempre acontece normalmente (diferente do
`ORD-151`, que bloqueia). O resultado só enriquece a resposta:
```python
result = await _serialize_product(db, p)
result["inactive_combos"] = [{"id": cid, "name": name} for cid, name in inactive_combos]
return result
```

Response 200: `ProductOut` com `inactive_combos` populado (lista vazia nos demais casos).
Erros: inalterados (`400`/`401`/`403`/`404`).

**Reaproveita sem alteração:** `PATCH /catalog/combos/{combo_id}` (ORD-112/151) — o frontend
chama esse endpoint já existente uma vez por combo marcado. Se o combo tiver outro produto
ainda inativo, o bloqueio 409 do `ORD-151` já cobre esse caso — nenhuma mudança de backend
adicional necessária ali.

### Migrations
Nenhuma. `Combo`/`ComboItem` já existem desde `ORD-112`; `PATCH /catalog/combos/{id}` já existe
desde `ORD-112`, com o bloqueio de vínculo desde `ORD-151`.

### Eventos de fila
Nenhum — mesmo padrão síncrono já usado em todo o fluxo de ativar/desativar produto/combo.

### Impacto em outros serviços
Nenhum. `order-service`/totem continuam lendo `active` do combo em `GET /catalog/combos` — não
precisam de nenhuma mudança pra refletir a reativação (ou não) de um combo.

### Frontend — fluxo de UI
1. `activateProduct(id)` chama `PUT /catalog/products/{id}` com `{active: true}` (like hoje)
2. Resposta bem-sucedida: se `inactive_combos.length > 0`, abre `ConfirmDialog` com
   `message="Reativar os combos relacionados?"` e `children` = lista de `<Checkbox>`, um por
   combo, todos `checked: true` por padrão (estado local `useState<Set<number>>` com os ids
   inicialmente marcados)
3. Se `inactive_combos.length === 0` → `loadProducts()` direto, nenhuma mudança de UI
   (comportamento atual preservado)
4. Admin desmarca alguns, clica "Confirmar" → dispara `PATCH /catalog/combos/{id}` com
   `{active: true}` só pros ids que sobraram marcados, em paralelo (`Promise.allSettled`, não
   `Promise.all` — um combo falhar com 409 não deve impedir os outros de ativarem)
5. Resultado misto (alguns ok, algum 409): `makeToast` de sucesso pros que ativaram +
   `makeToast("error", ...)` nomeando qual combo falhou e por quê (mensagem da API já vem
   pronta, mesmo padrão de `parseApiError`)
6. `loadProducts()` **e** `loadCombos()` no final, sucesso total ou parcial
7. Admin fecha o modal sem confirmar → `loadProducts()` já rodou no passo 3 (produto já estava
   ativo desde a resposta original), nenhum combo é tocado

### Estimativa
- Backend: 1 ponto (consulta + campo novo na resposta, sem endpoint novo, sem migration)
- Frontend: 2 pontos (estado de seleção do modal + `Promise.allSettled` + toasts de resultado
  misto — um pouco mais que o ORD-151 porque aqui pode ter sucesso parcial)

### Riscos
- **Sucesso parcial (alguns combos ativam, outro dá 409)**: já coberto no fluxo de UI acima —
  `Promise.allSettled` + toast específico por falha, sem desfazer os que deram certo. Sem risco
  de estado inconsistente, só de UX confusa se a mensagem não for clara — atenção no texto do
  toast na implementação.
- **Corrida entre abas**: mesmo caso já aceito no `ORD-151` (no-op seguro, `PATCH` num combo já
  ativo não quebra nada). Não bloqueia.

---

## Ready

### Checklist de entrada

**Explorer (PM + Produto)**
- [x] História no formato Como/Quero/Para
- [x] Contexto e motivação documentados (fecha o ciclo aberto pelo ORD-151)
- [x] Fluxo principal descrito passo a passo
- [x] Dependências identificadas (nenhuma bloqueante — ORD-151 já implementado nesta branch)
- [x] Wireframe/mockup — N/A, resolvido no Tech Explorer (reaproveita ConfirmDialog + Checkbox)
- [x] Critérios de aceite funcionais escritos

**QA Explorer (QA)**
- [x] Happy path em Gherkin (sem combo inativo = regressão; com combo inativo = sugestão +
      confirmação seletiva)
- [x] Cenários de borda (múltiplos combos, desmarcar um, combo excluído, combos já ativos)
- [x] Cenários de erro (combo com outro produto ainda inativo → 409 nomeado, sem desfazer o resto)
- [x] Cenário de isolamento multi-tenant incluído
- [x] Cenários aprovados pelo PM

**Tech Explorer (Backend + Frontend)**
- [x] Serviços impactados documentados (catalog-service, frontend/admin)
- [x] Endpoint alterado com payload request/response (`PUT /catalog/products/{id}` ganha
      `inactive_combos` na resposta; reaproveita `PATCH /catalog/combos/{id}` sem alteração)
- [x] Migrations — nenhuma necessária
- [x] Eventos de fila — N/A
- [x] Estimativa definida (1 ponto backend, 2 pontos frontend)
- [x] Riscos identificados (sucesso parcial — resolvido com Promise.allSettled; corrida entre
      abas — no-op seguro)

### Aprovação final
- [x] Time revisou e concordou com a solução técnica
- [x] Estimativa acordada
- [x] Sem bloqueios não resolvidos
- [x] ✅ História priorizada — pode entrar em implementação
