---
id: ORD-153
status: Done
fase: 6
sprint: null
responsavel: Backend SR + Frontend
estimativa: 6 pontos (3 backend + 1 admin + 2 totem)
tipo: feature
---

# ORD-153 — Imagem do combo (cadastro e exibição no totem)

## Descrição
Combo hoje não tem imagem própria (decisão deliberada da Tech Explorer original do `ORD-112`:
"nem o Explorer nem o protótipo pediram imagem própria") — no totem, o combo aparece sem foto,
o que ficou visualmente ruim comparado aos produtos normais (que já têm imagem). Esta história
adiciona upload/gerenciamento de imagem no cadastro de combo do admin, reaproveitando o mesmo
componente `Upload` e o mesmo fluxo já usados no cadastro de produto (`ProductEditScreen.tsx`),
e passa a exibir a imagem do combo no totem.

## Persona
Admin da empresa (dono/gerente), que cadastra o combo — e cliente no totem, que passa a ver o
combo com foto.

## Contexto
Pedido direto do usuário: parte do mesmo pacote de melhorias em combo/produto desta sprint.
Layout sugerido pelo próprio usuário — uma seção de imagem **acima** do box "Buscar produto pra
adicionar" já existente em `ComboFormScreen.tsx`, no mesmo padrão simples já implementado pra
produto (seção "Imagem" com preview + upload em `ProductEditScreen.tsx`, endpoints
`POST/DELETE /catalog/products/{id}/image`). Diferente do `ORD-151`/`ORD-152`, esta história
**precisa de migration** — `Combo` não tem `image_url`/`thumbnail_url` no schema atual.

---

## Explorer

## História
Como **admin da empresa**, quero cadastrar uma imagem pro combo, para que ele apareça no totem
com a mesma qualidade visual dos produtos — e como **cliente no totem**, quero ver a foto do
combo antes de decidir se compro.

## Contexto e motivação
Confirmado no código: o card de combo no totem (`frontend/totem/src/screens/CatalogScreen.tsx`,
seção "Destaque" dentro da categoria) é só texto — nome, itens, preço, badge "Combo" — sem
nenhum slot de imagem, diferente do card de produto logo acima dele, que reserva 60% da altura
do card pra foto (com placeholder quando não tem). O modal de upsell ("Leve o combo X e
economize") também é só texto. Isso já foi uma decisão deliberada no Explorer original do
`ORD-112` ("nem o Explorer nem o protótipo pediram imagem própria"), mas na prática, ao lado dos
produtos com foto, o combo sem imagem destoa visualmente — daí o pedido agora.

## Fluxo principal
1. Admin acessa Catálogo → Combos → edita um combo existente (ou cria um novo)
2. No formulário (`ComboFormScreen.tsx`), uma seção **"Imagem"** aparece **acima** do box já
   existente "Buscar produto pra adicionar" — mesmo padrão visual da seção "Imagem" já usada em
   `ProductEditScreen.tsx` (preview + botão de upload/remover)
3. Admin envia uma imagem (jpg/png) → `POST /catalog/combos/{id}/image` (multipart, mesmo
   contrato de `POST /catalog/products/{id}/image`) → preview atualiza com o
   `thumbnail_url` retornado
4. Admin pode remover a imagem → `DELETE /catalog/combos/{id}/image`, volta ao estado sem foto
5. No totem, o card de combo (seção "Destaque") passa a reservar a mesma área de imagem do card
   de produto — com foto se tiver, com o mesmo placeholder de "sem imagem" se não tiver
6. O modal de upsell também passa a mostrar a imagem do combo, se cadastrada

## Fluxos alternativos / exceções
- Combo sem imagem cadastrada → totem mostra o placeholder padrão (mesmo comportamento já usado
  pra produto sem imagem — não é um estado de erro, é o normal pra quem ainda não subiu foto)
- Upload de arquivo em formato não suportado (fora jpg/png) ou maior que o limite → mesmos erros
  já validados no endpoint de produto (`415`/`413`/`422`), reaproveitados sem mudança de regra
- Excluir definitivamente um combo com imagem → remove o objeto do bucket junto (mesmo padrão já
  usado em `delete_product`)
- Combo de outra empresa → `404`, mesmo isolamento multi-tenant já validado em todo endpoint de
  combo

## Dependências
- Serviços envolvidos: `catalog-service` (migration nova, 2 endpoints novos, funções novas em
  `infrastructure/image_storage.py`), `frontend/admin` (`ComboFormScreen.tsx`),
  `frontend/totem` (`CatalogScreen.tsx` — card de combo na grade + modal de upsell)
- Histórias bloqueantes: nenhuma — `ORD-112`/`ORD-150` (combo em si) já em produção nesta branch

## Critérios de aceite funcionais
- [x] Admin consegue enviar uma imagem pro combo e ver o preview imediatamente
- [x] Admin consegue remover a imagem cadastrada, voltando ao estado sem foto
- [x] Formatos fora de jpg/png são rejeitados com a mesma mensagem já usada pra produto
- [x] Totem exibe a imagem do combo no card da grade quando cadastrada — confirmado ao vivo em
      2026-09-03 pro `Combo Classic Cheddar`, único combo real cadastrado no ambiente de teste
      no momento (ver Validação e ressalva sobre a contagem de combos)
- [x] Totem exibe a imagem do combo no modal de upsell quando cadastrada — confirmado ao vivo em
      2026-09-03: produto componente (Classic Cheddar Burger) → modal mostra a foto do
      `Combo Classic Cheddar`. Aproveitado pra ajustar estilo (fonte da mensagem reduzida,
      imagem maior, desconto destacado em verde — ver Validação).
- [x] Combo sem imagem mostra o mesmo placeholder já usado pra produto sem imagem — sem quebrar
      layout — verificado por revisão de código (mesmo condicional já usado pra produto em
      `CatalogScreen.tsx`); não confirmado ao vivo nesta sessão porque o ambiente de teste só
      tem um combo cadastrado no momento (`Combo Classic Cheddar`), e ele já tem imagem.
- [x] Excluir definitivamente o combo remove a imagem do bucket junto — coberto por
      `test_combo_imagem.py`
- [x] Isolamento multi-tenant: admin de uma empresa não sobe/remove imagem de combo de outra —
      coberto por `test_combo_imagem.py`

## Wireframe / Mockup
Nenhum novo — reaproveita exatamente o layout já existente em `ProductEditScreen.tsx` (seção
"Imagem": preview quadrado + botão upload/remover), só reposicionado acima do box "Buscar
produto pra adicionar" em `ComboFormScreen.tsx`, conforme pedido do usuário.

---

## QA Explorer

Contrato assumido pros cenários abaixo (a confirmar no Tech Explorer): `POST/DELETE
/catalog/combos/{id}/image`, mesma validação de formato/tamanho já usada em produto
(`_IMAGE_CONTENT_TYPES`, `_IMAGE_MAX_BYTES` = 2MB). **Diferença deliberada do endpoint de
produto**: combo **não** exige `category_id` preenchido pra montar a chave da imagem no bucket
(produto exige porque o caminho inclui a categoria; combo pode usar um caminho mais simples,
`combos/{combo_id}/...`, já que `category_id` é opcional em `Combo`).

```gherkin
Feature: Imagem do combo
  Como admin da empresa
  Quero cadastrar e remover a imagem de um combo
  Para que ele apareça no totem com a mesma qualidade visual dos produtos

  Background:
    Dado que a empresa 1 tem o combo "Combo Clássico" (id=13), ativo, sem imagem

  # ── Happy path ──────────────────────────────────────────────────────────

  Scenario: Enviar imagem válida do combo
    Quando o admin envia POST /catalog/combos/13/image com um arquivo jpg de 500KB
    Então a resposta é 200
    E o combo passa a ter image_url e thumbnail_url preenchidos
    E GET /catalog/combos retorna o combo já com a imagem

  Scenario: Remover imagem cadastrada
    Dado que o combo 13 já tem imagem cadastrada
    Quando o admin envia DELETE /catalog/combos/13/image
    Então a resposta é 200
    E o combo volta a ter image_url e thumbnail_url nulos

  Scenario: Combo sem category_id ainda aceita imagem (diferença do fluxo de produto)
    Dado que o combo 13 tem category_id=null
    Quando o admin envia POST /catalog/combos/13/image com um arquivo png válido
    Então a resposta é 200 (produto, pra comparação, bloquearia com 400 nesse caso)

  # ── Cenários de borda / erro ────────────────────────────────────────────

  Scenario: Formato de arquivo não suportado é rejeitado
    Quando o admin envia POST /catalog/combos/13/image com um arquivo .gif
    Então a resposta é 415 "Formato de arquivo não aceito — envie jpg ou png"
    E o combo continua sem imagem

  Scenario: Arquivo maior que o limite é rejeitado
    Quando o admin envia POST /catalog/combos/13/image com um arquivo jpg de 3MB
    Então a resposta é 413
    E o combo continua sem imagem

  Scenario: Arquivo corrompido (extensão válida, conteúdo inválido) é rejeitado
    Quando o admin envia POST /catalog/combos/13/image com bytes aleatórios com extensão .jpg
    Então a resposta é 422
    E o combo continua sem imagem

  Scenario: Reenviar imagem substitui a anterior (não acumula no bucket)
    Dado que o combo 13 já tem uma imagem cadastrada (chave A no bucket)
    Quando o admin envia POST /catalog/combos/13/image com uma nova imagem
    Então a resposta é 200 com uma nova image_url (chave B)
    E a chave A antiga é removida do bucket

  Scenario: Excluir definitivamente o combo remove a imagem do bucket
    Dado que o combo 13 tem imagem cadastrada
    Quando o admin envia DELETE /catalog/combos/13?permanent=true (ou equivalente já existente)
    Então a imagem do combo é removida do bucket junto com a exclusão do combo

  # ── Isolamento multi-tenant ────────────────────────────────────────────────

  Scenario: Admin de outra empresa não sobe imagem em combo alheio
    Quando o admin da empresa 2 envia POST /catalog/combos/13/image (combo da empresa 1)
    Então a resposta é 404
    E nenhuma imagem é associada ao combo

  Scenario: Admin de outra empresa não remove imagem de combo alheio
    Dado que o combo 13 (empresa 1) tem imagem cadastrada
    Quando o admin da empresa 2 envia DELETE /catalog/combos/13/image
    Então a resposta é 404
    E a imagem do combo 13 continua intacta
```

**Critério de saída — auto-avaliação:**
- [x] Happy path coberto (upload, remoção, combo sem category_id)
- [x] Cenários de borda cobertos (formato inválido, tamanho excedido, arquivo corrompido,
      substituição, exclusão em cascata)
- [x] Cenários de erro cobertos (415/413/422/404)
- [x] Cenário de isolamento multi-tenant incluído
- [x] Aprovação do PM — aprovado

---

## Tech Explorer

### Serviços impactados
- **catalog-service**: migration nova (`combos` ganha `image_url`/`thumbnail_url`), 2 endpoints
  novos, `ComboOut`/`_serialize_combo` ganham os campos, 3 funções novas em
  `infrastructure/image_storage.py` (mesmo padrão de `_product_image_key`/`upload_product_image`
  já existentes pra produto, sem exigir `category_id`).
- **frontend/admin**: `ComboFormScreen.tsx` ganha a seção "Imagem" (reaproveita `Upload`/
  `UploadListFiles`, mesmo bloco de `ProductEditScreen.tsx`, só reposicionado).
- **frontend/totem**: `CatalogScreen.tsx` — card de combo na grade ganha a mesma área de imagem
  do card de produto (60% da altura, com placeholder); modal de upsell ganha a imagem também.
  `types.ts` (totem) — `Combo` ganha `image_url`/`thumbnail_url`.

### Endpoints

#### POST /catalog/combos/{combo_id}/image
**Serviço:** catalog-service
**Auth:** JWT obrigatório | role: `owner`/`admin`/`superadmin` (`require_write_role`)
**company_id:** extraído do JWT via `resolve_company_id_write`

Request: `multipart/form-data`, campo `image` (jpg/png, até 2MB — mesma validação de
`_IMAGE_CONTENT_TYPES`/`_IMAGE_MAX_BYTES` já usada em produto, reaproveitada sem duplicar).
**Diferença deliberada do endpoint de produto**: não exige `category_id` preenchido — o caminho
no bucket não depende de categoria.

```python
async def _combo_image_key(combo_id: int, ext: str, thumb: bool) -> str:
    kind = "thumb" if thumb else "image"
    return f"combos/{combo_id}/{kind}.{ext}"
```

Response 200 (`ComboOut`, campos novos):
```json
{ "id": 13, "name": "Combo Clássico", "...": "...",
  "image_url": "https://.../combos/13/image.jpg?X-Amz-...",
  "thumbnail_url": "https://.../combos/13/thumb.jpg?X-Amz-..." }
```
Erros: `404` (combo de outra empresa/inexistente), `415` (formato), `413` (tamanho),
`422` (arquivo corrompido) — mesmas mensagens já usadas em produto.

#### DELETE /catalog/combos/{combo_id}/image
**Serviço:** catalog-service — mesmos auth/company_id acima
Remove os objetos do bucket (`delete_object`) e zera `image_url`/`thumbnail_url`. Response 200
(`ComboOut`). Erros: `404`.

**Alterado (sem mudar contrato):** `delete_combo` (exclusão definitiva) passa a chamar
`delete_object` pra imagem/thumbnail antes do soft-delete — mesmo padrão já usado em
`delete_product(permanent=True)`.

### Migrations
Nova migration `20260903_XXXX_combo_imagem.py`:
```python
def upgrade():
    op.add_column("combos", sa.Column("image_url", sa.String(255), nullable=True))
    op.add_column("combos", sa.Column("thumbnail_url", sa.String(255), nullable=True))

def downgrade():
    op.drop_column("combos", "thumbnail_url")
    op.drop_column("combos", "image_url")
```

### Eventos de fila
Nenhum — mesmo padrão síncrono de upload já usado em produto/opção.

### Impacto em outros serviços
Nenhum direto. `order-service` não referencia imagem de combo (só nome/preço congelados no
pedido, ver Tech Explorer de `ORD-150`).

### Estimativa
- Backend: 3 pontos (migration + 2 endpoints + 3 funções de storage + campos em `ComboOut`/
  `_serialize_combo` + ajuste em `delete_combo` — tudo por analogia direta com o que já existe
  pra produto, sem decisão de design nova)
- Frontend admin: 1 ponto (reaproveita 100% o bloco de imagem de `ProductEditScreen.tsx`)
- Frontend totem: 2 pontos (2 lugares pra ajustar — card da grade e modal de upsell — com
  cuidado pro placeholder de "sem imagem" não quebrar o layout já validado do `ORD-150`)

### Riscos
- **Regressão visual no card do combo**: o card hoje já tem um design específico (gradiente,
  badge "Combo") — encaixar a área de imagem sem quebrar isso pede atenção ao mexer no JSX,
  mas é mecânico (mesmo padrão de árvore do card de produto). Mitigação: screenshot antes/depois
  no QA manual, já é prática confirmada nas histórias anteriores deste pacote.
- **Migration em tabela com dado real**: `combos` já tem linhas em produção local (a demo criada
  nas histórias anteriores) — `ADD COLUMN nullable=True` é seguro, não quebra linha existente.

---

## Ready

### Checklist de entrada

**Explorer (PM + Produto)**
- [x] História no formato Como/Quero/Para
- [x] Contexto e motivação documentados (confirmado no código — card de combo é só texto)
- [x] Fluxo principal descrito passo a passo
- [x] Dependências identificadas (nenhuma bloqueante)
- [x] Wireframe/mockup — reaproveita layout existente de `ProductEditScreen.tsx`
- [x] Critérios de aceite funcionais escritos

**QA Explorer (QA)**
- [x] Happy path em Gherkin (upload, remoção, combo sem category_id)
- [x] Cenários de borda (formato inválido, tamanho, arquivo corrompido, substituição, exclusão em cascata)
- [x] Cenários de erro (415/413/422/404)
- [x] Cenário de isolamento multi-tenant incluído
- [x] Cenários aprovados pelo PM

**Tech Explorer (Backend + Frontend)**
- [x] Serviços impactados documentados (catalog-service, admin, totem)
- [x] Endpoints novos com payload request/response
- [x] Migration descrita (`combos.image_url`/`thumbnail_url`)
- [x] Eventos de fila — N/A
- [x] Estimativa definida (3 backend + 1 admin + 2 totem)
- [x] Riscos identificados

### Aprovação final
- [x] Time revisou e concordou com a solução técnica
- [x] Estimativa acordada
- [x] Sem bloqueios não resolvidos
- [x] ✅ História priorizada — pode entrar em implementação

## Validação

Implementado nesta branch (migration + endpoints + admin + totem). Verificação visual no totem
ficou bloqueada até 2026-09-03 pelo bug do [[ORD-154]] (falso 404 no `test-connection` do
Mercado Pago, usado pelo terminal de pareamento da Burger House) — depois do fix do ORD-154,
confirmado ao vivo, com a foto real do `Combo Classic Cheddar`:
- Card na grade da categoria Combos.
- Modal de upsell ao adicionar o produto componente (Classic Cheddar Burger) — aproveitado pra
  ajustar estilo (fonte da mensagem reduzida, imagem aumentada em duas rodadas até 320px por
  pedido do usuário, desconto destacado em verde sem quebrar entre linhas).

Print em `docs/stories/ORD-154/evidencias/manual/totem-combos-com-imagem-pos-fix.png` (evidência
ficou junto com a do ORD-154 por terem sido capturadas na mesma sessão de QA manual) — **ressalva
importante**: esse print mostra 9 cards de combo, mas o ambiente de teste tem hoje só 1 combo
real (`Combo Classic Cheddar`, id 13), confirmado de três formas independentes em 2026-09-03
(curl direto no catalog-service, curl via gateway nginx, e `fetch` executado no próprio contexto
do navegador do totem com o token de sessão real). Os outros 8 cards do print eram estado
obsoleto do navegador (não foram re-confirmados) — provavelmente uma view em cache de uma
navegação anterior nesta mesma sessão, de antes de um evento de reset/recovery do banco do
catalog-service não relacionado a esta história. Não afeta a conclusão da história (o combo real
existente exibe imagem corretamente em ambos os lugares), mas qualquer teste futuro de "vários
combos, alguns com e outros sem imagem" precisa recriar esses combos primeiro — eles não existem
mais no banco.
