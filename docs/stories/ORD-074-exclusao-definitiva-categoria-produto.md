---
id: ORD-074
status: Done
fase: 5
sprint: null
responsavel: Backend SR + Frontend
estimativa: 5 pontos
---

# ORD-074 — Exclusão definitiva de categoria/produto (irreversível, com cascata)

## Descrição
O botão "Excluir" de categoria sempre foi soft-delete (`active=False`, reversível via reativação) — os produtos da categoria nunca eram afetados, apesar da mensagem de confirmação antiga dizer o contrário ("os produtos serão desativados", o que nunca aconteceu de fato). Usuário identificou um cenário real: com muitas categorias/produtos cadastrados, é preciso um jeito de limpar o catálogo de vez (item de teste, produto descontinuado) sem acumular lixo desativado pra sempre.

Solução: campo `deleted` novo e ortogonal ao `active` existente, em `categories` e `products`. `active` continua sendo o toggle reversível de sempre (visível/oculto do totem, reativável). `deleted=True` é **irreversível** — a linha nunca mais aparece em nenhuma consulta (nem com `include_inactive=true`), mas continua no banco pra manter o vínculo com vendas já realizadas.

> **Nota de processo:** história escrita retroativamente, implementada e testada nesta sessão antes de formalização — mesma situação do ORD-073. Ver [[project_ordin_roadmap]].

## Persona
**Owner/Manager** — quer tirar de vez um item de teste ou produto descontinuado do catálogo, sem que ele fique acumulando como "inativo pra sempre" na tela de gestão.

## Contexto

### Por que um campo novo (`deleted`) e não reaproveitar `active`
`active=False` já significa "oculto, mas reversível" — é usado pra sazonalidade, pausa temporária, etc. Misturar "oculto temporariamente" com "não existe mais" no mesmo campo perderia a reversibilidade do primeiro caso. Os dois são ortogonais: o registro tem `active` (visível ou não) e `deleted` (existe ou não, pra sempre).

### Cascata: categoria excluída leva os produtos junto
Excluir uma categoria com `permanent=true` marca `deleted=True` (e `active=False`) na categoria **e em todos os produtos dela** — decisão explícita do usuário: "se excluir a categoria, ela não retorna mais e seus produtos também". Produto excluído individualmente (sem via categoria) não afeta os outros produtos da mesma categoria.

### Vendas não são afetadas
`deleted=True` nunca faz um DELETE de verdade no banco — a linha continua existindo, só passa a ser filtrada em toda consulta. Pedidos/tickets já criados referenciam `product_id` direto (não fazem JOIN condicionado a `deleted=False`), então histórico de vendas continua íntegro mesmo depois da exclusão definitiva.

### Sem variant "danger" no design-system
O `Button` do DS não tem uma variant de perigo/destrutiva (só `primary`/`secondary`/`inverse`). Resolvido com `style={{ color: "var(--error-base)" }}` inline no texto do botão "Excluir" — o mesmo motivo de sempre pra usar `style` em vez de `className` num `Button` (ver [[project_ordin_design_system_gotchas]]).

### Confirmação com `<Alert>` em vez de texto puro
Por pedido do usuário, a confirmação de exclusão definitiva usa o componente `<Alert variant="warning" icon="alert-triangle">` do design-system em vez do texto simples do `ConfirmDialog` padrão — mais destaque visual pra uma ação irreversível. Implementado estendendo `ConfirmDialog` com props opcionais `alertVariant`/`alertIcon`; quando definidas, o `Alert` é renderizado no slot `template.icon` do `Modal` (o slot `text` só aceita string puro, não componente — o `icon` é o único slot de `ReactNode` livre que renderiza antes dos botões).

## Explorer

### Fluxo principal
1. Owner/manager clica "Excluir" numa categoria ou produto
2. Modal de confirmação com `<Alert>` de aviso: nome do item, ação irreversível, produtos da categoria também somem, vendas não são afetadas
3. Confirma → `DELETE .../{id}?permanent=true` → item (e produtos, se for categoria) somem de todas as telas, inclusive com "mostrar inativos" ligado

### Critérios de aceite
- [x] `DELETE .../categories/{id}?permanent=true` marca `deleted=True` na categoria e em todos os seus produtos
- [x] `DELETE .../products/{id}?permanent=true` marca `deleted=True` só no produto individual, sem afetar outros produtos da categoria
- [x] Item com `deleted=True` nunca aparece em nenhuma listagem, mesmo com `include_inactive=true`
- [x] Operações subsequentes (GET, PUT, upload de imagem) num item excluído retornam 404
- [x] Exclusão definitiva de produto limpa a imagem do bucket (mesma limpeza do "remover imagem")
- [x] Soft delete (sem `permanent=true`) continua funcionando exatamente como antes — reversível, não afeta produtos da categoria
- [x] Botão "Excluir" com destaque visual (cor de erro) e confirmação com `<Alert>` de aviso forte
- [x] Mensagem de confirmação da categoria corrigida (antes prometia desativar produtos e nunca fazia isso)

## QA Explorer

```gherkin
Feature: Exclusão definitiva de categoria/produto

  Scenario: Excluir categoria definitivamente leva os produtos junto
    Dado uma categoria com 2 produtos ativos
    Quando excluo a categoria com permanent=true
    Então a categoria e os 2 produtos ficam com deleted=True e active=False

  Scenario: Item excluído nunca mais aparece
    Dado uma categoria excluída definitivamente
    Quando listo categorias com include_inactive=true
    Então a categoria não está na lista

  Scenario: Excluir produto individualmente não afeta a categoria
    Dado uma categoria com 2 produtos
    Quando excluo definitivamente só 1 produto
    Então o outro produto continua normal (deleted=False)

  Scenario: Soft delete continua reversível
    Dado uma categoria ativa
    Quando excluo sem permanent=true
    Então active=False mas deleted=False, e os produtos não são afetados

  Scenario: Exclusão definitiva de produto limpa o bucket
    Dado um produto com imagem enviada
    Quando excluo definitivamente
    Então os objetos (imagem e thumbnail) não existem mais no S3/MinIO
```

**Suíte automatizada:** `test_exclusao_definitiva.py` — 12 casos (cascata categoria→produtos, invisibilidade mesmo com include_inactive, 404 em operações subsequentes num item excluído, limpeza do bucket, regressão do soft delete). Suíte completa do catalog-service: **59 passed**, sem regressão.

## Tech Explorer

### Serviços impactados
- **`services/catalog/migrations/versions/20260807_1000_exclusao_definitiva.py`** — coluna `deleted` (boolean, default false, not null) em `categories` e `products`
- **`services/catalog/main.py`**:
  - `Category.deleted` / `Product.deleted` no model
  - `deleted=False` adicionado a **toda** query de leitura (list/get) e a toda query de "achar antes de escrever" (update/delete/upload de imagem) — 8 pontos de filtro no total
  - `DELETE /catalog/categories/{id}` e `DELETE /catalog/products/{id}` ganham query param `permanent: bool = False`
  - Cascata da categoria implementada dentro do próprio endpoint (busca todos os produtos da categoria com `deleted=False`, marca cada um)
- **`frontend/admin/src/components/ConfirmDialog.tsx`** — props `alertVariant`/`alertIcon` opcionais
- **`frontend/admin/src/screens/CatalogScreen.tsx`** — `deleteCategoryPermanently`/`deleteProductPermanently`, botão "Excluir" com `DANGER_BTN_STYLE`

### Design: por que `permanent` é query param e não endpoint separado
Mantém a mesma URL (`DELETE /catalog/categories/{id}`) pros dois casos, consistente com o verbo HTTP já usado pro soft delete — evita duplicar rota só pra mudar um comportamento que já é uma variação do mesmo "excluir". Único ponto de atenção: `permanent=true` sem intenção (erro de digitação no admin, por exemplo) é irreversível — mitigado pela confirmação forte no frontend, não pelo desenho da API em si.

### Riscos
- Sem endpoint de "restaurar" um item `deleted=True` — decisão consciente (é o propósito da feature: ser irreversível). Se um dia precisar reverter por engano, só via acesso direto ao banco.
- Categorias/produtos `deleted=True` continuam ocupando linha na tabela pra sempre (por design, pro vínculo com vendas) — sem impacto de performance relevante no volume atual, mas vale lembrar se o catálogo crescer muito com o tempo.

### Estimativa
5 pontos — schema novo, cascata, 8 pontos de filtro no código existente, UI de confirmação com componente de alerta.

---

## Ready

**Explorer:** [x] fluxo e cascata validados · **QA Explorer:** [x] 12 testes automatizados cobrindo cascata, invisibilidade e regressão do soft delete · **Tech Explorer:** [x] pontos de filtro, design da API e riscos documentados · **Aprovação final:** aprovado no chat pelo usuário, incluindo a decisão de campo `deleted` ortogonal a `active` e cascata pros produtos.

**Status: Done** — aplicado, testado (automatizado) e rodando em ambiente local. Escrita retroativamente.
