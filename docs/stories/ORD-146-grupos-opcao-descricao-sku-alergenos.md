---
id: ORD-146
status: Done
fase: 6
sprint: null
responsavel: Backend SR
estimativa: 5 pontos (3 backend + 2 frontend)
tipo: feature
---

# ORD-146 — Grupos de opção: descrição, SKU e alérgenos em `Option`

## Descrição
Hoje `Option` (ORD-138/145: `label`, `price_delta`, `image_url`/`thumbnail_url`, `sort_order`, `active`) é mais pobre em dado do que `Product`, que desde ORD-075 tem `description`, `sku` e `allergens` além do básico. Uma opção como um sabor de pizza ou sabor de bebida é, na prática, quase um produto próprio — e carece dos mesmos três campos pelos mesmos motivos que já justificaram sua existência em `Product`: descrição pra clareza quando o nome não é autoexplicativo, SKU porque cada sabor/variante costuma ser uma unidade de estoque física distinta (ex.: Coca-Cola lata, Fanta lata e Guaraná lata dentro de "Refrigerante lata 350ml" são três SKUs diferentes, não um rótulo solto), e alérgenos porque um sabor pode introduzir um alergênico que o produto-base não tem (ex.: sabor de pizza com camarão).

Esta história cobre **cadastro e persistência** desses três campos em `Option` (dado + admin), reaproveitando a mesma lista oficial de alérgenos (`allergens`/`product_allergens`) e o mesmo padrão de SKU/descrição já usados em `Product` (ORD-075). **A exibição de alérgeno no totem para o cliente final fica fora do escopo** — decisão explícita do usuário, mesmo padrão que ORD-075 já aplicou ao alérgeno de `Product` (cadastrado desde então, mas nunca exibido no totem). Retomar isso é pendência separada, já registrada.

## Persona
**Owner/Manager** — cadastra opções de sabor/variante (bebida, pizza, etc.) e precisa da mesma riqueza de dado que já tem em produto: descrever a opção quando o nome não basta, informar SKU pra conciliação/controle de estoque por sabor, e declarar alérgeno por exigência legal quando o sabor introduz um alergênico específico.

**Cliente final (indireto, mas não nesta história)** — eventualmente se beneficia da descrição/alérgeno ao escolher a opção no totem, mas essa exibição é uma história futura, não esta.

## Contexto
Motivado pela análise de concorrência `docs/analise-atributos-opcao-totem.md` (2026-08-31): iFood modela a "option" com os mesmos campos de um item de catálogo completo (`description`, `externalCode`) porque ela referencia um produto próprio; Mogo dá a cada sabor de pizza um SKU com prefixo `S` e ficha técnica de ingredientes. O usuário confirmou a lacuna com um exemplo concreto (refrigerante lata com 3 sabores = 3 SKUs físicos) e decidiu fechar essa lacuna agora para descrição, SKU e alérgeno — mantendo calorias e tags fora (sem evidência de mercado no nível de opção) e mantendo a exibição de alérgeno no totem para depois (dependência represada desde ORD-075, que nunca foi resolvida nem para `Product`).

---

## Explorer

### História
Como **owner/manager**, quero **cadastrar descrição, SKU e alérgenos em cada opção de um grupo (Catálogo > Opções)**, para **ter o mesmo nível de detalhe que já existe em produto — clareza de texto, conciliação de estoque por sabor/variante e conformidade legal de alérgeno — sem precisar duplicar o sabor como um produto separado**.

### Contexto e motivação
`Option` (ORD-138/145) hoje é deliberadamente enxuta: `label`, `price_delta`, `image_url`/`thumbnail_url`, `sort_order`, `active`. Isso reflete o modelo "opção fina" que Goomer usa — mas a pesquisa de mercado (`docs/analise-atributos-opcao-totem.md`) mostrou que, quando a opção representa uma variante física real (sabor de bebida, sabor de pizza), o mercado trata a opção como um produto próprio: iFood dá `description`/`externalCode` a cada `option`; Mogo dá SKU (prefixo `S`) e ficha técnica a cada sabor.

O caso concreto que fechou a decisão: "Refrigerante lata 350ml" com opções Coca-Cola/Fanta/Guaraná — cada sabor é fisicamente um SKU de estoque diferente (código de barras, fornecedor, contagem própria), não um rótulo dentro do mesmo produto. O mesmo racional que já levou `Option` a ganhar `active` (ORD-145, pra representar "esse sabor específico acabou no estoque") agora pede um campo pra **identificar** esse sabor como unidade de estoque (SKU) e **descrevê-lo** quando o nome não basta (ex.: "Especial da Casa" sem detalhar o que é).

Alérgeno entra pelo mesmo motivo que motivou `Product.allergens` em ORD-075 — segurança alimentar, não é opcional — mas com um recorte importante: **esta história cadastra o dado, não o exibe no totem**. A exibição já ficou pendente desde ORD-075 pra `Product` (nunca implementada) e continua pendente aqui — decisão explícita do usuário, registrada em memória de projeto pra não ser esquecida.

### Fluxo principal
1. Owner/manager abre Catálogo > Opções, edita um grupo existente (ou cria um novo) e clica em "Adicionar opção" ou "Editar" numa opção existente — abre o modal de opção (ORD-139).
2. Preenche Label, Acréscimo de preço e Imagem (fluxo já existente, sem mudança).
3. Preenche o novo campo **Descrição** (textarea, contador "0/500" visível, mesmo padrão de `ProductEditScreen`) — campo opcional.
4. Preenche o novo campo **SKU** (input de texto, opcional).
5. Seleciona zero ou mais **Alérgenos** na multi-seleção (mesma lista oficial já usada em produto, vinda de `GET /catalog/allergens`) — campo opcional.
6. Salva a opção (ou salva o grupo, se a opção ainda não tinha `id`) — os três campos novos persistem junto com o resto, sem exigir uma ação separada.
7. Reabre a opção depois — os três campos aparecem preenchidos com o valor salvo (persistência confirmada).

### Fluxos alternativos / exceções
- **Opção sem nenhum dos três campos preenchidos**: comportamento idêntico ao de hoje — todos são opcionais, uma opção "mínima" (só label + preço) continua válida, mesmo padrão de criação mínima que `Product` já usa desde ORD-075.
- **Editar label/preço de uma opção sem mexer em descrição/SKU/alérgeno**: o replace completo do grupo (`PUT /catalog/option-groups/{id}/options`) precisa preservar os três campos das opções não alteradas — mesmo cuidado que ORD-145 já teve com `active` (`OptionIn` reenvia o valor atual de cada linha, não reseta pro default).
- **SKU duplicado**: erro de validação amigável, mesmo tratamento que `Product.sku` já dá hoje (a decidir no Tech Explorer se o unique constraint é por empresa, cobrindo produto+opção juntos, ou um espaço próprio de opção — ver ponto em aberto).
- **Alérgeno de uma opção diferente do alérgeno do produto-base**: comportamento esperado e correto — é exatamente o caso de uso (ex.: pizza-base sem camarão, mas o sabor "Camarão com Catupiry" declara o alergênico). Nenhuma regra de "herdar" ou "somar automaticamente" com o alérgeno do produto nesta história — cada nível declara o seu.

### Dependências
- **Serviços envolvidos:** catalog-service (schema/endpoints) + frontend/admin (modal de opção).
- **Histórias bloqueantes:** nenhuma — reaproveita infraestrutura já pronta de ORD-075 (`allergens`, endpoint `GET /catalog/allergens`) e ORD-138/139/145 (`Option`, modal de opção).
- **Sem impacto em:** ORD-141 (seleção no totem), ORD-142 (cálculo de preço), ORD-143 (ticket impresso) — nenhuma ainda implementada; esta história não decide se/como esses três campos aparecem lá, só os disponibiliza pro cadastro.
- **Fora de escopo, registrado à parte:** exibição de alérgeno (e dos demais campos) no totem — pendência represada desde ORD-075, mantida represada aqui por decisão do usuário.

### Critérios de aceite funcionais
- [ ] `Option` ganha `description` (texto, máx. 500 caracteres, opcional)
- [ ] `Option` ganha `sku` (texto, opcional)
- [ ] `Option` ganha vínculo N:N com `allergens` (multi-seleção, opcional, zero ou mais)
- [ ] Modal de opção (Catálogo > Opções) exibe os três campos novos, com contador de caracteres na descrição e a mesma multi-seleção de alérgeno já usada em produto
- [ ] Salvar uma opção nova ou editada persiste os três campos corretamente
- [ ] Editar outra opção do mesmo grupo (disparando o replace completo) preserva descrição/SKU/alérgeno das opções não alteradas
- [ ] Reabrir uma opção já salva mostra os três campos com o valor persistido
- [ ] Nenhuma mudança de comportamento no totem, balcão ou impressão — os três campos não são consumidos em nenhum outro serviço/tela nesta história
- [ ] Isolamento multi-tenant: alérgeno/SKU/descrição de opção de uma empresa não vaza nem é editável por outra empresa (mesmo padrão já testado em `allergens`/`product_allergens`)

### Wireframe / Mockup
Sem mockup novo — é uma extensão do modal de opção já existente (Catálogo > Opções, ORD-139), que hoje tem Label → Acréscimo de preço → Imagem. Os três campos novos entram nessa ordem, depois da Imagem: Descrição (textarea com contador) → SKU (input) → Alérgenos (multi-seleção), replicando visualmente a ordem e os componentes já usados no formulário de produto (`ProductEditScreen`) pros mesmos campos.

---

## QA Explorer

```gherkin
Feature: Descrição, SKU e alérgenos em Option
  Como owner/manager
  Quero cadastrar descrição, SKU e alérgenos em cada opção de um grupo
  Para ter o mesmo nível de detalhe que já existe em produto, sem duplicar o sabor como produto separado

  Background:
    Dado que existe uma empresa "Burger House" com um grupo de opção "Sabores de refrigerante" contendo a opção "Coca-Cola"
    E existe a lista oficial de alérgenos já seedada (RDC 727/2022)

  # Happy path

  Scenario: Cadastrar opção com descrição, SKU e alérgenos preenchidos
    Dado que estou editando a opção "Coca-Cola" no modal de opção
    Quando preencho a descrição "Refrigerante de cola, lata 350ml"
    E preencho o SKU "REF-COCA-350"
    E seleciono os alérgenos "Nenhum" (lista vazia, produto não tem alergênico declarado)
    E salvo a opção
    Então a opção é salva com description, sku e allergens persistidos
    E reabrir a opção mostra os três campos com os valores salvos

  Scenario: Cadastrar opção sem preencher nenhum dos três campos novos (mínima)
    Dado que estou adicionando uma nova opção "Guaraná" no grupo
    Quando preencho só o label e o acréscimo de preço, sem descrição, SKU ou alérgeno
    E salvo a opção
    Então a opção é salva normalmente, com description=null, sku=null e allergens=[]
    E nenhum erro de validação é exibido

  Scenario: Opção com múltiplos alérgenos selecionados salva todos
    Dado que estou editando a opção "Camarão com Catupiry" (sabor de pizza)
    Quando seleciono os alérgenos "Crustáceos" e "Leite de todos os mamíferos"
    E salvo a opção
    Então a opção é salva com os dois alérgenos vinculados
    E reabrir a opção mostra ambos marcados na multi-seleção

  # Bordas

  Scenario: Descrição no limite de 500 caracteres é aceita
    Dado que estou editando uma opção
    Quando preencho a descrição com exatamente 500 caracteres
    E salvo a opção
    Então a opção é salva com a descrição completa, sem truncamento

  Scenario: Descrição acima de 500 caracteres é bloqueada no cadastro
    Dado que estou editando uma opção
    Quando tento preencher a descrição com 501 caracteres
    Então o campo impede a digitação além do limite (mesmo comportamento do contador "0/500" já usado em Product)
    E a opção não pode ser salva com descrição acima de 500 caracteres

  Scenario: Editar label de uma opção preserva descrição/SKU/alérgeno das outras opções do mesmo grupo
    Dado que o grupo "Sabores de pizza" tem a opção "Calabresa" (sem dado novo preenchido) e a opção "Camarão com Catupiry" (com descrição, SKU e alérgeno "Crustáceos" preenchidos)
    Quando edito só o label de "Calabresa" para "Calabresa Especial" e salvo o grupo (replace completo)
    Então "Camarão com Catupiry" continua com a mesma descrição, SKU e alérgeno "Crustáceos" — nada foi resetado

  # Erro

  Scenario: SKU duplicado dentro da mesma empresa é rejeitado
    Dado que a opção "Coca-Cola" já tem o SKU "REF-COCA-350"
    Quando tento salvar a opção "Coca-Cola Zero" com o mesmo SKU "REF-COCA-350"
    Então recebo um erro de validação amigável ("SKU já cadastrado para esta empresa")
    E a opção "Coca-Cola Zero" não é salva com esse SKU
    E o restante dos campos da opção (label, preço) não é perdido — só o SKU precisa ser corrigido

  # Isolamento multi-tenant

  Scenario: Empresa A não vê nem edita descrição/SKU/alérgeno de opção de grupo da empresa B
    Dado que a empresa "Pasta & Co" tem uma opção "Molho Branco" com descrição, SKU e alérgeno "Leite de todos os mamíferos" preenchidos
    Quando a empresa "Burger House" tenta acessar ou editar essa opção (via PATCH ou pelo replace completo do grupo)
    Então a requisição retorna 404, sem vazar nenhum dos três campos
    E os dados da opção da "Pasta & Co" continuam inalterados

  # Regressão

  Scenario: Opção legada sem os três campos novos continua funcionando
    Dado que existe uma opção criada antes desta história, sem description, sku ou allergens
    Quando abro essa opção no modal de edição
    Então os três campos aparecem vazios/sem seleção, sem erro
    E consigo editar e salvar normalmente, com ou sem preencher os campos novos

  Scenario: Listagem de opções do grupo não quebra com os campos novos
    Dado que o grupo tem opções com e sem os três campos novos preenchidos
    Quando abro a tela de Catálogo > Opções para esse grupo
    Então a listagem carrega normalmente, mostrando label/acréscimo/status como hoje
    E nenhum erro ocorre por causa dos campos novos (mesmo os que não são exibidos na listagem, só no modal)
```

**Fora de escopo, não coberto aqui por decisão do Explorer:** exibição de descrição/SKU/alérgeno no totem, balcão ou impressão; calorias e tags em `Option`.

**Cenários aprovados pelo PM.**

---

## Solução Técnica

### Serviços impactados
- **catalog-service**: schema (`Option` ganha colunas, tabela nova `option_allergens`), lógica do replace completo (`_set_option_group_options`), serialização (`_get_option_group_options`), schemas Pydantic (`OptionIn`/`OptionOut`).
- **frontend/admin**: `OptionGroupFormScreen.tsx` (modal de opção), `types.ts`.
- Sem impacto em auth/company/order/payment/notification.

### Endpoints
**Nenhum endpoint novo.** `description`, `sku` e `allergen_ids` entram pelo mesmo caminho que `label`/`price_delta`/`active` já usam hoje: só via `OptionIn`, dentro do replace completo do grupo. `PATCH /catalog/options/{option_id}` (ORD-145) continua exclusivo pra `active` — não muda.

#### PUT /catalog/option-groups/{option_group_id}/options *(já existe, payload estendido)*
**Serviço:** catalog-service
**Auth:** JWT obrigatório | role: admin/owner/manager
**company_id:** extraído do JWT (`resolve_company_id_write`, sem mudança)

Request (campos novos em negrito conceitual, resto inalterado):
```json
{
  "options": [
    {
      "label": "Coca-Cola",
      "price_delta": 0,
      "active": true,
      "description": "Refrigerante de cola, lata 350ml",
      "sku": "REF-COCA-350",
      "allergen_ids": []
    }
  ]
}
```

Response 200 (`OptionGroupOut`, cada opção com os campos novos):
```json
{
  "id": 138,
  "name": "Sabores de refrigerante",
  "min_selections": 1,
  "max_selections": 1,
  "active": true,
  "options": [
    {
      "id": 501,
      "label": "Coca-Cola",
      "price_delta": 0,
      "image_url": null,
      "thumbnail_url": null,
      "sort_order": 0,
      "active": true,
      "description": "Refrigerante de cola, lata 350ml",
      "sku": "REF-COCA-350",
      "allergens": []
    }
  ]
}
```

Erros: 400 (SKU duplicado dentro da empresa, `allergen_ids` com id inexistente, lista de opções vazia), 404 (grupo não encontrado ou de outra empresa), 401 (sem auth), 403 (role insuficiente).

### Migrations
- Tabela `options`: adicionar coluna `description` (`VARCHAR(500)`, nullable) e `sku` (`VARCHAR(50)`, nullable) — mesmos tamanhos de `products.description`/`products.sku`, sem backfill (novas, tudo `NULL` pra opções existentes).
- Tabela nova `option_allergens`: `option_id` (FK `options.id`), `allergen_id` (FK `allergens.id`), PK composta `(option_id, allergen_id)` — cópia exata do padrão de `product_allergens`. **Sem `ON DELETE CASCADE` na FK** — ver decisão técnica #1 abaixo, o motivo de não usar cascade é deliberado, não esquecimento.

### Decisões técnicas

**1. Hard delete de `Option` no replace completo exige deleção explícita de `OptionAllergen` antes — não cascade de banco.**
`_set_option_group_options` remove e recria TODAS as opções do grupo a cada save (mesmo padrão já documentado no código pra imagem do bucket). Como nenhuma FK deste banco usa `ondelete=CASCADE` (confirmado: `product_allergens`, `product_option_groups`, `menu_products` também não usam) — e a Clean Architecture "alvo" do projeto favorece decisão explícita no código sobre comportamento implícito no schema —, a correção é adicionar `await db.execute(delete(OptionAllergen).where(OptionAllergen.option_id.in_(old_ids)))` **antes** do `delete(Option)` já existente, no mesmo bloco que hoje deleta as imagens do bucket. Sem isso, a primeira edição de uma opção com alérgeno vinculado (nem precisa ser a própria opção com alérgeno — qualquer opção do MESMO grupo, porque o replace é do grupo inteiro) estoura `IntegrityError` por violação de FK.

**2. SKU único por empresa via validação de aplicação, não constraint de banco.**
`Product.sku` tem `UniqueConstraint("company_id", "sku")` porque `company_id` mora na própria tabela. `Option` não tem `company_id` direto (isolamento via join com `OptionGroup`, ver `_get_option_scoped`) — adicionar uma coluna `company_id` desnormalizada só pra viabilizar um `UniqueConstraint` é desproporcional pra um único campo opcional. Decisão: validação em `_set_option_group_options`, em duas partes, ANTES de deletar/recriar qualquer opção:
  - **Duplicata dentro do próprio payload**: `skus = [o.sku for o in options if o.sku]`; se `len(skus) != len(set(skus))`, erro 400.
  - **Duplicata com opção de OUTRO grupo da mesma empresa**: `SELECT o.sku FROM options o JOIN option_groups g ON g.id = o.option_group_id WHERE g.company_id = :company_id AND o.option_group_id != :option_group_id AND o.sku IN (:skus)` — se retornar algo, erro 400 `"SKU já cadastrado para esta empresa"` (mesma mensagem de `Product`, pra consistência de UX). Não precisa excluir o próprio grupo dos "antigos": como o replace é do grupo inteiro, comparar contra os OUTROS grupos já resolve o caso "editei e mantive o mesmo SKU que a opção já tinha".
  - **Risco aceito**: sem constraint de banco, existe janela teórica de race condition (duas requisições concorrentes passando a validação antes de qualquer uma commitar). Mesmo perfil de risco de qualquer escrita administrativa deste serviço (baixíssima concorrência real — um admin por empresa editando catálogo, não um endpoint de alto tráfego).

**3. `_set_option_group_options` ganha parâmetro `company_id`.**
Assinatura muda de `(db, option_group_id, options)` pra `(db, option_group_id, company_id, options)` — o endpoint já busca `group` com `company_id` antes de chamar a função (linha do `set_option_group_options`), só precisa repassar. Necessário pra decisão técnica #2 (a query de SKU duplicado precisa do `company_id`).

**4. Ordem de operações dentro de `_set_option_group_options`:**
```
1. Validar SKUs duplicados (payload + outros grupos da empresa) — decisão #2
2. Validar allergen_ids existentes (mesmo padrão de _set_product_allergens)
3. Buscar ids das opções antigas do grupo
4. Deletar OptionAllergen dessas opções antigas — decisão #1
5. Deletar imagens do bucket (já existia)
6. Deletar as Options antigas (já existia)
7. Para cada opção nova: criar Option (label, price_delta, sort_order, active, description, sku)
8. db.flush() — pra obter o id gerado de cada Option nova
9. Para cada opção nova com allergen_ids: criar OptionAllergen(option_id, allergen_id)
```
O `flush()` no passo 8 é necessário porque `OptionAllergen` referencia o `id` gerado pelo banco — sem ele, o id do objeto Python ainda seria `None` no momento de criar o vínculo.

**5. Schemas:**
```python
class OptionIn(BaseModel):
    label: str
    price_delta: float = 0
    active: bool = True
    description: Optional[str] = None
    sku: Optional[str] = None
    allergen_ids: list[int] = []  # sempre lista completa — replace completo, não "não mexer"

class OptionOut(BaseModel):
    id: int
    label: str
    price_delta: float
    image_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    sort_order: Optional[int] = None
    active: bool = True
    description: Optional[str] = None
    sku: Optional[str] = None
    allergens: list[AllergenOut] = []
```
`_get_option_group_options` passa a chamar uma função nova `_get_option_allergens(db, option_id)` (cópia de `_get_product_allergens`, trocando `ProductAllergen`/`product_id` por `OptionAllergen`/`option_id`) por opção.

### Impacto em outros serviços
Nenhum — mudança isolada em `catalog-service` + `frontend/admin`. `GET /catalog/allergens` (já existe, sem mudança) é reaproveitado no frontend pro multi-select. Sem impacto em order/payment/totem/balcão/impressão (fora de escopo por decisão do Explorer).

### Estimativa
- Backend: 3 pontos (2 colunas + 1 tabela nova + migration, lógica de replace completo com validação de SKU e cascade manual de alérgeno, serialização, testes)
- Frontend: 2 pontos (3 campos novos no modal, reaproveitando componentes já existentes de `ProductEditScreen` — sem componente novo a construir)
- **Total: 5 pontos**

### Riscos
- **Esquecer a deleção explícita de `OptionAllergen` antes do `delete(Option)`** (decisão #1) — mitigado por ser bloqueante: sem isso, o teste de "editar label de uma opção preserva alérgeno de outra opção do grupo" (QA Explorer) falha com `IntegrityError` na primeira tentativa, não passa despercebido.
- **Race condition na validação de SKU** (decisão #2, sem constraint de banco) — aceito, baixíssima concorrência real neste fluxo administrativo.
- **N+1 de alérgeno por opção na listagem** — mesmo padrão já aceito hoje pra `Product` (`_get_product_allergens` chamado por produto); grupos tendem a ter poucas opções, sem indício de problema de performance real.
- **Nenhum risco de migração de dado** — colunas novas nullable, tabela nova vazia, sem backfill necessário.

---

## Ready

Checklist de saída conferido contra o conteúdo já escrito neste arquivo:

**Explorer**
- [x] História no formato Como/Quero/Para
- [x] Contexto e motivação documentados (paridade com `Product`/ORD-075, exemplo concreto do refrigerante lata com 3 sabores = 3 SKUs)
- [x] Fluxo principal passo a passo (7 passos, cadastro via modal existente)
- [x] Dependências identificadas (nenhuma bloqueante; reaproveita ORD-075/138/139/145; sem impacto em ORD-141/142/143)
- [x] Wireframe/mockup descrito (extensão do modal existente, mesma ordem/componentes de `ProductEditScreen`)
- [x] Critérios de aceite funcionais escritos (9 itens)

**QA Explorer**
- [x] Happy path em Gherkin (3 cenários: campos preenchidos, opção mínima, múltiplos alérgenos)
- [x] Cenários de borda (3 cenários: limite de 500 caracteres, acima do limite, preservação de campos de outras opções no replace completo)
- [x] Cenários de erro (1 cenário: SKU duplicado)
- [x] Isolamento multi-tenant coberto
- [x] Regressão coberta (opção legada sem os campos novos, listagem não quebra)
- [x] Cenários aprovados pelo PM

**Tech Explorer**
- [x] Serviços impactados documentados (catalog-service + frontend/admin)
- [x] Endpoint documentado (nenhum novo — payload estendido do `PUT` existente, request/response/erros detalhados)
- [x] Migration descrita (2 colunas nullable em `options` + tabela nova `option_allergens`, sem backfill)
- [x] "Eventos de fila": N/A — sem impacto assíncrono
- [x] Estimativa definida (5 pontos: 3 backend + 2 frontend)
- [x] Riscos identificados (3, todos com mitigação ou aceite explícito), incluindo o achado crítico do hard delete de `Option` exigindo deleção explícita de `OptionAllergen` antes

**Aprovação final**
- [x] Time revisou e concordou com a solução técnica (usuário pediu a implementação e aprovou seguir com o upstream completo)
- [x] Estimativa acordada (5 pontos)
- [x] Sem bloqueios não resolvidos
- [x] Priorizada no sprint backlog

**Status final: Ready.**
