---
id: ORD-151
status: Done
fase: 6
sprint: null
responsavel: Backend SR + Frontend
estimativa: 3 pontos (2 backend + 1 frontend)
tipo: bugfix
---

# ORD-151 — Alertar ao desativar produto vinculado a combo ativo

## Descrição
Hoje `PUT /catalog/products/{id}` permite desativar (`active: false`) um produto sem checar se ele
é componente de algum combo ativo (`ComboItem`) — confirmado em `update_product`
(`services/catalog/main.py:1237`), que não tem nenhuma validação de vínculo. O combo continua
`active: true` mesmo com um produto componente inativo por baixo, sem nenhum aviso pro admin. Esta
história cobre alertar o admin nesse momento, com confirmação explícita antes de prosseguir.

## Persona
Admin da empresa (dono/gerente) que gerencia o catálogo no painel administrativo.

## Contexto
Descoberto na prática durante a reconstrução do catálogo de demonstração da Burger House
(2026-09-02): ao desativar dois produtos que eram componentes de um combo recém-criado, nada
bloqueou nem avisou — o combo ficou ativo e visível com um componente inativo por baixo, o que é
inconsistente pro cliente ver na tela. `ORD-112` (cadastro de combo) cobre ativar/desativar o
**combo em si**, mas não trata o caminho inverso (desativar um **produto componente** enquanto
vinculado a um combo ativo) — lacuna nova, não uma decisão já tomada e adiada.

Decisão de produto a confirmar no Explorer: bloquear a desativação (erro) vs. permitir com
confirmação explícita e desativar o combo em cascata vs. permitir e só avisar sem cascata.

## Stakeholder
Admins de empresa que usam combos — evita cardápio inconsistente sem que o admin perceba.

---

## Explorer

## História
Como **admin da empresa**, quero ser avisado e precisar confirmar explicitamente antes de
desativar um produto que é componente de um combo ativo, para não deixar o cardápio com um combo
ativo apontando pra um produto que já não está mais disponível avulso.

## Contexto e motivação
Descoberto na prática (ver `## Contexto` acima): hoje é possível desativar um produto componente
de combo sem nenhum aviso, deixando o combo ativo e visível com um produto por baixo que não
aparece mais no cardápio avulso — inconsistência que só é percebida se alguém checar manualmente.

Decisão de produto (resolvida neste Explorer, era o ponto em aberto do New): **permitir a
desativação, mas exigir confirmação explícita, e desativar o(s) combo(s) vinculados em cascata**
— não bloquear (diferente do padrão já usado em `delete_option_group`, que bloqueia com 409 se
houver produto ativo vinculado). Bloquear aqui puniria um fluxo legítimo (produto saiu de linha,
os combos que o usavam também devem sair); a saída certa é deixar claro o efeito colateral antes
de confirmar, não impedir a ação.

## Fluxo principal
1. Admin acessa Catálogo → Produtos e edita um produto ativo
2. Admin desmarca "Ativo" (ou clica em "Desativar") e salva
3. Backend verifica se o produto é `product_id` de algum `ComboItem` cujo `Combo.active = true`
4. Havendo vínculo: backend recusa a alteração direta e retorna a lista de combos afetados (nome
   + id); frontend exibe modal de confirmação: *"Desativar [produto] também vai desativar os
   combos: [lista]. Confirmar?"*
5. Admin confirma → nova chamada explícita desativa o produto **e** os combos listados, em uma
   única operação atômica
6. Admin cancela → nada muda, produto continua ativo, modal fecha

## Fluxos alternativos / exceções
- Produto vinculado a múltiplos combos ativos → todos aparecem listados no alerta, todos
  desativados junto
- Produto vinculado só a combos **já inativos** → nenhum alerta, desativa normalmente
  (comportamento atual inalterado — regressão a proteger)
- Produto sem nenhum vínculo com combo → nenhum alerta, desativa normalmente (regressão a
  proteger)
- Reativar o produto depois **não** reativa os combos automaticamente — evita reativação em
  massa não intencional; admin reativa cada combo manualmente se quiser
- Chamada direta à API (fora da tela do admin, ex: script) — mesma regra vale, é validação de
  backend, não só de UI; API retorna a lista de combos afetados em vez de aplicar silenciosamente

## Dependências
- Serviços envolvidos: `catalog-service` (regra de negócio + endpoint), `frontend/admin` (modal
  de confirmação na tela de Produtos)
- Histórias bloqueantes: nenhuma — `ORD-112` (Combo/ComboItem) já commitado e em produção

## Critérios de aceite funcionais
- [ ] Desativar produto **sem** vínculo com combo ativo continua funcionando sem alerta (regressão)
- [ ] Desativar produto vinculado a 1+ combos ativos exibe confirmação listando os combos afetados
      antes de aplicar qualquer mudança
- [ ] Confirmar a desativação desativa o produto **e** todos os combos ativos vinculados, numa
      operação só (sem estado intermediário inconsistente)
- [ ] Cancelar a confirmação não altera nada — produto permanece ativo, nenhum combo é tocado
- [ ] Reativar o produto depois **não** reativa os combos automaticamente
- [ ] Isolamento multi-tenant: só considera combos da própria empresa do produto
- [ ] Chamada direta à API sem passar pela tela de confirmação também respeita a regra (não dá
      pra contornar via API)

## Wireframe / Mockup
Nenhum existente. Reaproveitar o componente de modal de confirmação já usado no admin (hoje só
usado para confirmações simples, ex.: excluir categoria) — aqui precisa listar os nomes dos
combos afetados dentro do corpo da mensagem. Tech Explorer decide o componente exato.

---

## QA Explorer

Contrato de API assumido para os cenários abaixo (a confirmar no Tech Explorer): primeira
chamada `PUT /catalog/products/{id}` com `active: false` recusa com `409` e lista os combos
afetados quando há vínculo ativo; segunda chamada, explícita, com
`active: false, confirm_deactivate_combos: true` aplica a desativação em cascata. Sem o vínculo,
`active: false` continua funcionando em uma chamada só, sem mudança de contrato.

```gherkin
Feature: Alertar e confirmar antes de desativar produto vinculado a combo ativo
  Como admin da empresa
  Quero ser avisado e confirmar explicitamente antes de desativar um produto que é componente de
  um combo ativo
  Para não deixar um combo ativo apontando pra um produto que não está mais disponível avulso

  Background:
    Dado que a empresa 1 tem o produto "X-Burguer" (id=1) ativo
    E a empresa 1 tem o produto "Coca-Cola 350ml" (id=6) ativo
    E a empresa 1 tem o combo "Combo Clássico" (id=13) ativo, com os produtos [1, 6]

  # ── Happy path — regressão (sem vínculo) ──────────────────────────────────

  Scenario: Desativar produto sem vínculo com combo continua sem alerta
    Dado que a empresa 1 tem o produto "Sorvete" (id=8) ativo, sem nenhum combo vinculado
    Quando o admin envia PUT /catalog/products/8 com active=false
    Então a resposta é 200
    E o produto "Sorvete" fica com active=false
    E nenhum combo é afetado

  # ── Happy path principal — vínculo com combo ativo ────────────────────────

  Scenario: Tentar desativar produto vinculado sem confirmar retorna os combos afetados
    Quando o admin envia PUT /catalog/products/1 com active=false (sem confirm_deactivate_combos)
    Então a resposta é 409
    E o corpo lista o combo "Combo Clássico" (id=13) como afetado
    E o produto "X-Burguer" continua com active=true
    E o combo "Combo Clássico" continua com active=true

  Scenario: Confirmar a desativação aplica em cascata no produto e no combo
    Quando o admin envia PUT /catalog/products/1 com active=false, confirm_deactivate_combos=true
    Então a resposta é 200
    E o produto "X-Burguer" fica com active=false
    E o combo "Combo Clássico" fica com active=false
    E nenhum outro produto do combo (ex: "Coca-Cola 350ml") é alterado

  Scenario: Cancelar a confirmação não altera nada
    Dado que o admin recebeu o aviso 409 do cenário anterior
    Quando o admin fecha o modal sem reenviar a chamada com confirm_deactivate_combos
    Então o produto "X-Burguer" continua com active=true
    E o combo "Combo Clássico" continua com active=true

  # ── Cenários de borda ──────────────────────────────────────────────────────

  Scenario: Produto vinculado a múltiplos combos ativos lista todos no aviso
    Dado que o produto "X-Burguer" (id=1) também é componente do combo "Combo do Dia" (id=14), ativo
    Quando o admin envia PUT /catalog/products/1 com active=false (sem confirmar)
    Então a resposta é 409
    E o corpo lista "Combo Clássico" e "Combo do Dia"
    Quando o admin confirma com confirm_deactivate_combos=true
    Então ambos os combos ficam com active=false

  Scenario: Produto vinculado só a combo já inativo desativa sem alerta
    Dado que o combo "Combo Clássico" (id=13) já está com active=false
    Quando o admin envia PUT /catalog/products/1 com active=false (sem confirmar)
    Então a resposta é 200
    E o produto "X-Burguer" fica com active=false
    E nenhum aviso 409 é retornado

  Scenario: Reativar o produto depois não reativa os combos automaticamente
    Dado o estado do cenário "Confirmar a desativação aplica em cascata..." (produto e combo inativos)
    Quando o admin envia PUT /catalog/products/1 com active=true
    Então a resposta é 200 e o produto "X-Burguer" fica com active=true
    E o combo "Combo Clássico" continua com active=false

  Scenario: Chamada direta à API sem passar pela tela de confirmação respeita a mesma regra
    Quando um script externo envia PUT /catalog/products/1 com active=false, sem
      confirm_deactivate_combos, direto na API (fora do admin)
    Então a resposta é 409, igual ao fluxo pela UI
    E nada é alterado até uma chamada explícita com confirm_deactivate_combos=true

  # ── Isolamento multi-tenant ────────────────────────────────────────────────

  Scenario: Combo de outra empresa nunca aparece na lista nem é afetado
    Dado que a empresa 2 tem um combo ativo que por engano compartilha o mesmo product_id=1
      (cenário hipotético de teste — não ocorre na prática por isolamento de FK)
    Quando o admin da empresa 1 envia PUT /catalog/products/1 com active=false
    Então apenas combos da empresa 1 aparecem no aviso 409
    E nenhum dado da empresa 2 é lido, alterado ou vaza na resposta

  # ── Erros ──────────────────────────────────────────────────────────────────

  Scenario: Desativar produto de outra empresa retorna 404
    Quando o admin da empresa 2 envia PUT /catalog/products/1 (produto da empresa 1) com active=false
    Então a resposta é 404
    E nada é alterado na empresa 1
```

**Critério de saída — auto-avaliação:**
- [x] Happy path coberto (sem vínculo — regressão; com vínculo — aviso e confirmação)
- [x] Cenários de borda cobertos (múltiplos combos, combo já inativo, reativação não cascateia,
      chamada direta via API)
- [x] Cenários de erro cobertos (produto de outra empresa → 404)
- [x] Cenário de isolamento multi-tenant incluído
- [x] Aprovação do PM — aprovado

---

## Tech Explorer

### Serviços impactados
- **catalog-service**: `update_product` (`main.py:1237`) ganha a checagem de combo vinculado —
  sem migration, reaproveita `Combo`/`ComboItem` já existentes desde `ORD-112`.
- **frontend/admin**: `CatalogScreen.tsx` — reaproveita o componente `setConfirmState` já
  existente (mesmo usado hoje em `deleteOptionGroup`, linha ~535), sem componente novo.

### Endpoints

#### PUT /catalog/products/{product_id} (alterado)
**Serviço:** catalog-service
**Auth:** JWT obrigatório | role: `owner`/`admin`/`superadmin` (mesma `require_write_role` já em uso)
**company_id:** extraído do JWT via `resolve_company_id_write` (inalterado)

`ProductUpdate` ganha um campo novo, todos os demais inalterados:
```json
{
  "active": false,
  "confirm_deactivate_combos": false
}
```
`confirm_deactivate_combos: Optional[bool] = None` — default `None`/`False`, só precisa ser
enviado explicitamente como `true` na segunda chamada (pós-confirmação).

**Nova regra, inserida antes do `setattr`/commit já existente:**
```python
if body.active is False:
    affected = (await db.execute(
        select(Combo.id, Combo.name)
        .join(ComboItem, ComboItem.combo_id == Combo.id)
        .filter(
            ComboItem.product_id == product_id,
            Combo.company_id == company_id,
            Combo.active == True, Combo.deleted == False,  # noqa: E712
        )
    )).all()
    if affected and not body.confirm_deactivate_combos:
        names = ", ".join(name for _, name in affected)
        raise HTTPException(409, detail=f"Produto vinculado ao(s) combo(s) ativo(s): {names}")
```
Mesmo padrão de `delete_option_group` (`detail` como string simples, já nomeando os afetados —
não um objeto estruturado; consistência com o único outro 409 de vínculo que já existe no
serviço). Depois do `setattr`/commit do produto, se `affected` não-vazio e
`confirm_deactivate_combos=true`, desativa os combos na mesma transação:
```python
if body.active is False and body.confirm_deactivate_combos and affected:
    await db.execute(
        update(Combo).where(Combo.id.in_([cid for cid, _ in affected])).values(active=False)
    )
```
Um único commit cobre produto + combos — sem estado intermediário inconsistente (critério de
aceite do QA Explorer).

Response 200: `ProductOut` (inalterado — combos afetados não entram na resposta do produto, só no
409 da tentativa anterior).

Erros: `400` (validação, inalterado), `401`/`403` (inalterado), `404` (produto de outra empresa,
inalterado), **`409` (novo — combo ativo vinculado, sem confirmação)**.

### Migrations
Nenhuma. `Combo`/`ComboItem`/`ComboItem.product_id` já existem desde `ORD-112`
(`20260901_XXXX` — migration original do combo). Só lógica de aplicação.

### Eventos de fila
Nenhum. Desativação de produto/combo é síncrona, não publica evento hoje (mesmo padrão do
`active` toggle já existente em Product/Category/Combo).

### Impacto em outros serviços
Nenhum direto. `order-service`/`totem` já resolvem disponibilidade de combo pela flag `active` do
combo no momento da consulta (`GET /catalog/combos`) — não precisam de nenhuma mudança pra parar
de mostrar um combo que esta história desativou.

### Frontend — fluxo de UI
Reaproveita `setConfirmState` (já usado em `deleteOptionGroup`, `CatalogScreen.tsx:534`), sem
componente novo:
1. Admin desmarca "Ativo" no formulário de produto e salva → `PUT` sem `confirm_deactivate_combos`
2. Catch do `409` → `setConfirmState({ message: parseApiError(err).message, alertVariant:
   "warning", alertIcon: "alert-triangle", onConfirm: <reenviar PUT com
   confirm_deactivate_combos: true> })` — mesmo padrão exato da linha 534-550
3. Confirmar → reenvia `PUT`, sucesso → `loadProducts()` **e** `loadCombos()` (pra refletir o
   combo desativado na aba Combos sem precisar recarregar a página)
4. Cancelar → fecha modal, nada muda (o form já não tinha mandado nada de fato — só o primeiro
   `PUT` que veio 409, que não altera nenhum dado)

### Estimativa
- Backend: 2 pontos (regra + 3-4 testes novos em `test_combos.py`, cobrindo os cenários do QA
  Explorer — sem migration, sem endpoint novo)
- Frontend: 1 ponto (reaproveita componente existente, só o encadeamento de duas chamadas)

### Riscos
- **Corrida entre duas abas/sessões**: se o admin tiver o form aberto em duas abas e confirmar em
  uma enquanto a outra já desativou o combo por outro caminho, a segunda confirmação é um no-op
  seguro (produto já inativo, `UPDATE ... WHERE active=True` já não afeta nada) — sem risco de
  dado inconsistente, só UX levemente redundante. Não bloqueia.
- **Inconsistência de contrato com `delete_option_group`**: ambos os 409 de vínculo usam `detail`
  como string simples — decisão deliberada de manter os dois 409 de "vínculo ativo" no mesmo
  formato, em vez de estruturar só este. Se o time quiser estruturar (objeto com lista de ids +
  nomes) no futuro, fica como decisão de arquitetura pra revisar nos dois endpoints juntos, não
  só neste.

---

## Ready

### Checklist de entrada

**Explorer (PM + Produto)**
- [x] História no formato Como/Quero/Para
- [x] Contexto e motivação documentados (achado real durante a reconstrução do catálogo demo)
- [x] Fluxo principal descrito passo a passo
- [x] Dependências identificadas (nenhuma bloqueante — `ORD-112` já em produção)
- [x] Wireframe/mockup — N/A, resolvido no Tech Explorer (reaproveita componente existente)
- [x] Critérios de aceite funcionais escritos

**QA Explorer (QA)**
- [x] Happy path em Gherkin (sem vínculo = regressão; com vínculo = aviso 409 + confirmação)
- [x] Cenários de borda (múltiplos combos, combo já inativo, reativação não cascateia, chamada
      direta via API)
- [x] Cenários de erro (produto de outra empresa → 404)
- [x] Cenário de isolamento multi-tenant incluído
- [x] Cenários aprovados pelo PM

**Tech Explorer (Backend + Frontend)**
- [x] Serviços impactados documentados (catalog-service, frontend/admin)
- [x] Endpoint alterado com payload request/response (`PUT /catalog/products/{id}` +
      `confirm_deactivate_combos`)
- [x] Migrations — nenhuma necessária (confirmado, `Combo`/`ComboItem` já existem)
- [x] Eventos de fila — N/A
- [x] Estimativa definida (2 pontos backend, 1 ponto frontend)
- [x] Riscos identificados (corrida entre abas — no-op seguro; inconsistência de formato de erro
      com `delete_option_group` — decisão deliberada)

### Aprovação final
- [x] Time revisou e concordou com a solução técnica
- [x] Estimativa acordada
- [x] Sem bloqueios não resolvidos
- [x] ✅ História priorizada — pode entrar em implementação
