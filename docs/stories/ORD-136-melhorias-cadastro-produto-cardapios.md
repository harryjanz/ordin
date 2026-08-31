---
id: ORD-136
status: Ready
fase: 6
sprint: null
responsavel: Frontend
estimativa: 5 pontos
tipo: melhoria
---

# ORD-136 — Melhorias no cadastro de produto e na estrutura de cardápios

## Descrição
Tirar o cadastro/edição de **produto** e de **cardápio** de dentro de modal e colocar cada um em **tela exclusiva**, com mais espaço — em ambos os casos o modal já está no limite hoje e vai piorar (produto: mais campos previstos em breve; cardápio: composição de categorias/produtos é hoje "ruim de fazer" dentro do espaço apertado do modal). Na tela de cardápio, além do espaço, trocar o mecanismo de composição de categoria/produto por algo com **busca + dropdown**, no lugar do padrão atual. Pré-requisito antes de avançar com combo/bundle (ORD-112) — o usuário definiu essa ordem explicitamente.

## Persona
**Admin da empresa** (dono/gestor) — é quem cadastra produtos, categorias e cardápios em Empresa > Catálogo.

## Contexto
Investigação preliminar de PM identificou combo/bundle (ORD-112) como alavanca de receita a implementar, mas o usuário optou por primeiro amadurecer as bases sobre as quais o combo seria construído — cadastro de produto e estrutura de cardápios — em vez de empilhar uma feature nova sobre um fluxo que ainda não está no ponto desejado.

Pain points concretos, confirmados pelo usuário:

1. **Cadastro de produto:** a estratégia de ter poucos campos no cadastro é deliberada e **continua** — não é isso que muda. O problema é de **espaço**: o modal de edição já está comprometido hoje, e mais campos estão previstos pra um futuro breve. Solução pedida: tirar a edição do modal, colocar numa **tela exclusiva** com mais espaço (hoje é `productModalOpen`/`openEditProduct` em `frontend/admin/src/screens/CatalogScreen.tsx:401-459`).

2. **Cardápios (criação e edição):** a composição do cardápio — associar categorias inteiras e produtos avulsos — está ruim de fazer no espaço do modal atual. Hoje (`CatalogScreen.tsx:1187-1281`) o modal empilha verticalmente: nome, horário início/fim, dias da semana (`CheckboxMultiselect`), categorias inteiras (`CheckboxMultiselect`), busca de produto avulso (`InputBase`) + lista de produtos avulsos (`CheckboxMultiselect`) — tudo checkbox-list dentro de um modal pequeno. Solução pedida: (a) tela exclusiva, fora do modal, com mais espaço; (b) trocar o mecanismo de composição de categoria/produto por **busca com dropdown**, no lugar dos `CheckboxMultiselect` atuais — usuário pediu explicitamente pra avaliar a melhor forma de fazer isso (fica pro Explorer/wireframe propor o padrão exato: dropdown com busca + chips dos selecionados, ou outro).

## Dependência de sequenciamento
Esta história é pré-requisito do **ORD-112** (combo/bundle no totem), hoje parada em `Explorer` por decisão do usuário. ORD-112 não deve avançar antes desta ser concluída.

---

## Explorer

## História
Como **admin da empresa cadastrando/editando produtos e cardápios em Empresa > Catálogo**, quero editar produto e compor cardápio em telas dedicadas (não em modal), com um jeito de busca + dropdown pra associar categorias e produtos ao cardápio, para não ficar limitado pelo espaço apertado do modal atual — hoje já incomoda, e vai piorar com mais campos de produto chegando.

## Contexto e motivação
Duas dores concretas, já confirmadas pelo usuário (não hipóteses de PM):

1. **Produto:** poucos campos é estratégia deliberada e continua — o problema não é volume de campo, é espaço físico do modal, que já está no limite hoje (`CatalogScreen.tsx:401-459`, campos atuais do `Product`: nome, descrição curta, descrição longa, preço, imagem, categoria, tags, calorias, SKU, ativo) e vai piorar com mais campos previstos em breve.
2. **Cardápio:** compor categorias inteiras + produtos avulsos hoje é feito com três blocos de `CheckboxMultiselect` empilhados dentro do modal (`CatalogScreen.tsx:1187-1281`) — nome, horário início/fim, dias da semana, categorias inteiras, busca de produto avulso + lista de produtos avulsos. Pra uma empresa com catálogo grande, rolar uma lista de checkbox dentro de um modal pequeno é o que o usuário descreveu como "ruim de fazer".

Investiguei o design system vendorizado (`frontend/admin/vendor/design-system/dist/components/`) atrás de um componente pronto de multi-select com busca — não existe. O que existe:
- `Dropdown`: single-select, um `value` só (`DropdownOptions | null`), não serve puro pra multi-seleção
- `TagInput`: multi-valor (`value: string[]`), mas é campo de texto livre — usuário digita tags, não escolhe de uma lista de opções existentes (categorias/produtos do catálogo)
- `CheckboxMultiselect` (já em uso hoje): funciona, mas não tem busca embutida — daí a dor relatada

Nenhum componente pronto cobre "busca + seleção múltipla a partir de uma lista fixa de opções" — a composição proposta abaixo é montada a partir de peças existentes (`Dropdown` + lista de selecionados renderizada à parte com botão de remover), não um componente novo do design system.

## Fluxo principal — Produto
**Só a edição muda — criação continua igual.** `openNewProduct`/`saveNewProduct` já usa só 3 campos (nome, preço, categoria), que é exatamente a estratégia "poucos campos" que o usuário confirmou que continua — fica no modal rápido atual, sem mudança. Só `openEditProduct`/`saveEditProd` (formulário pesado: descrição curta, descrição longa, calorias, SKU, tags, alérgenos, imagem) é que sai do modal.

1. Admin clica "Editar" numa linha da tabela de Produtos
2. Em vez de abrir modal, navega pra uma rota dedicada (ex.: `/catalog/products/:id/editar`)
3. Tela cheia com os campos atuais do formulário de edição, com mais espaço de respiro — sem mudança de campos nesta história, só de container/layout
4. Salvar volta pra listagem de Produtos (aba Produtos), com o produto atualizado
5. "+ Novo produto" continua abrindo o modal existente, sem mudança

## Fluxo principal — Cardápio
1. Admin clica "Editar" numa linha da tabela de Cardápios (ou "+ Novo cardápio")
2. Navega pra rota dedicada (ex.: `/catalogo/cardapios/:id/editar` ou `/catalogo/cardapios/novo`)
3. Tela cheia com nome, horário início/fim, dias da semana (mantém `CheckboxMultiselect`, não é o que incomoda) — layout com mais espaço
4. **Composição de categorias/produtos redesenhada:** campo de busca com dropdown (`Dropdown` do design system, filtrando por texto) pra localizar uma categoria ou produto por vez; ao selecionar, o item entra numa lista abaixo (chip ou linha com nome + botão remover); repete pra adicionar mais itens. Duas listas separadas — "Categorias inteiras" e "Produtos avulsos" — cada uma com seu próprio campo de busca + dropdown, mantendo a distinção que já existe hoje (categoria inteira herda produtos futuros; produto avulso é fixo)
5. Salvar volta pra listagem de Cardápios (aba Cardápios)

## Fluxos alternativos / exceções
- **Catálogo vazio ou pequeno** (poucas categorias/produtos): dropdown de busca funciona igual, só com menos itens — sem necessidade de UI alternativa
- **Item já selecionado aparece de novo na busca:** dropdown deve filtrar/desabilitar itens já adicionados à lista, pra evitar duplicata (mesmo padrão de "terminal já em uso" do ORD-133 — desabilitar em vez de deixar duplicar e falhar depois)
- **Sair da tela sem salvar:** confirmar antes de descartar alterações (mesmo padrão esperado de qualquer formulário de tela cheia — a confirmar exatamente qual UX no Tech Explorer/implementação, ex.: beforeunload ou dialog de confirmação)
- **Cardápio ou produto excluído por outra aba/sessão enquanto a tela está aberta:** ao salvar, tratar 404 do backend com mensagem clara, sem crash

## Dependências
- Serviços envolvidos: **catalog-service** não muda (nenhum endpoint novo necessário — mesmos dados, muda só a apresentação); **frontend/admin** é o único impactado
- Sem mudança de schema/migration
- Sem impacto em totem, balcão ou outros serviços
- Depende logicamente de nada além do catálogo atual (categorias/produtos/cardápios já existentes, ORD-023/075/124-128)

## Critérios de aceite funcionais
- [ ] Edição de produto abre em tela dedicada, não em modal
- [ ] Criação de produto **continua** no modal atual, sem mudança (fora de escopo — estratégia de poucos campos se mantém)
- [ ] Edição de cardápio abre em tela dedicada, não em modal
- [ ] Criação de cardápio abre em tela dedicada, não em modal
- [ ] Composição de categorias inteiras no cardápio usa busca + dropdown, não `CheckboxMultiselect` sem busca
- [ ] Composição de produtos avulsos no cardápio usa busca + dropdown, não `CheckboxMultiselect` sem busca
- [ ] Item já adicionado à composição não aparece mais (ou aparece desabilitado) na busca, evitando duplicata
- [ ] Salvar (produto ou cardápio) volta pro admin na aba/listagem correta
- [ ] Nenhum campo de dado novo nesta história — é só mudança de layout/mecanismo de seleção

## Wireframe / Mockup
Sem mockup visual formal — descrição funcional:

**Tela de edição de produto:** mesmo conjunto de campos do modal atual (nome, categoria, descrição curta, descrição longa, preço, imagem, tags, calorias, SKU, ativo), reorganizados em layout de página cheia em vez de coluna única de modal — provavelmente duas colunas (dados principais à esquerda, imagem/preview à direita), com botões Salvar/Cancelar fixos no rodapé ou topo da página.

**Tela de edição de cardápio:** topo com nome + horário início/fim + dias da semana (like hoje). Abaixo, duas seções lado a lado ou empilhadas — "Categorias inteiras" e "Produtos avulsos" — cada uma com: campo de busca (`Dropdown` filtrando por nome, mostrando resultado conforme digita), e abaixo dele a lista dos já selecionados (chip ou linha com nome + botão "x" remover). Botões Salvar/Cancelar no rodapé.

---

**Confirmado, não é mais pergunta aberta:** o admin já usa React Router (`frontend/admin/src/App.tsx`), com precedente direto de rota dedicada de criação (`/companies/new` → `NewCompanyScreen`). Rotas tipo `/catalog/products/:id/editar` e `/catalog/menus/novo` seguem o mesmo padrão já estabelecido — não introduz roteamento novo no admin.

**Pontos que ficam para o QA Explorer decidir com mais rigor:**
- Exato comportamento de "descartar alterações" ao sair sem salvar (dialog vs. beforeunload vs. nada)

**Critério de saída atendido:** história Como/Quero/Para, contexto, fluxo principal (produto e cardápio, separados), fluxos alternativos, dependências e critérios de aceite documentados; wireframe descrito textualmente. Pronto para avançar ao **QA Explorer**.

---

## QA Explorer

### Decisão de produto (ponto em aberto resolvido)
"Descartar alterações sem salvar" **não ganha confirmação nova nesta história**. Nenhuma tela do admin hoje tem esse tipo de guarda (`NewCompanyScreen`, `CompanyScreen` — sem `beforeunload`, `confirm()` ou dirty-tracking em nenhuma delas). Introduzir isso agora seria abrir escopo além do que foi pedido (o pedido é sobre espaço/mecanismo de composição, não sobre proteção de navegação) e quebraria consistência com o resto do admin. Sair da tela sem salvar simplesmente descarta, igual a qualquer outra tela hoje.

```gherkin
Feature: Edição de produto e cardápio em tela dedicada, com composição por busca + dropdown
  Como admin da empresa
  Quero editar produto e compor cardápio em telas dedicadas, com busca + dropdown pra associar categorias/produtos
  Para não ficar limitado pelo espaço do modal atual

  Background:
    Dado que a empresa 1 tem categorias e produtos cadastrados no catálogo
    E o admin está autenticado como owner/manager da empresa 1

  Scenario: Editar produto abre em tela dedicada, não em modal
    Quando o admin clica em "Editar" numa linha da tabela de Produtos
    Então a navegação vai para uma rota dedicada (não abre modal sobre a tela de listagem)
    E os campos do produto (nome, categoria, descrição curta, descrição longa, preço, imagem, tags, calorias, SKU, ativo) aparecem preenchidos

  Scenario: Criar produto continua no modal (sem mudança)
    Quando o admin clica em "+ Novo produto"
    Então o modal atual abre normalmente, com os 3 campos de sempre (nome, preço, categoria)
    E não navega para nenhuma rota dedicada

  Scenario: Salvar produto volta para a listagem
    Dado que o admin está na tela de edição de um produto existente
    Quando altera o preço e clica em "Salvar"
    Então a navegação volta para a aba Produtos
    E o produto aparece na tabela com o preço atualizado

  Scenario: Editar cardápio abre em tela dedicada, não em modal
    Quando o admin clica em "Editar" numa linha da tabela de Cardápios
    Então a navegação vai para uma rota dedicada
    E nome, horário início/fim, dias da semana, categorias inteiras e produtos avulsos aparecem preenchidos

  Scenario: Compor categoria inteira via busca + dropdown
    Dado que o admin está na tela de edição de um cardápio
    Quando digita parte do nome de uma categoria no campo de busca de "Categorias inteiras"
    E seleciona a categoria no dropdown filtrado
    Então a categoria aparece na lista de selecionadas, com opção de remover

  Scenario: Compor produto avulso via busca + dropdown
    Dado que o admin está na tela de edição de um cardápio
    Quando digita parte do nome de um produto no campo de busca de "Produtos avulsos"
    E seleciona o produto no dropdown filtrado
    Então o produto aparece na lista de selecionados, com opção de remover

  Scenario: Item já selecionado não aparece de novo na busca
    Dado que uma categoria já foi adicionada à composição do cardápio
    Quando o admin busca pelo nome dessa mesma categoria de novo
    Então ela não aparece nas opções do dropdown (ou aparece desabilitada)

  Scenario: Remover item já selecionado da composição
    Dado que um produto avulso já está na lista de selecionados
    Quando o admin clica no botão de remover desse item
    Então o item some da lista de selecionados
    E volta a aparecer como opção de busca no dropdown

  Scenario: Salvar cardápio volta para a listagem
    Dado que o admin compôs um cardápio novo com nome, horário, dias da semana e ao menos uma categoria ou produto
    Quando clica em "Salvar"
    Então a navegação volta para a aba Cardápios
    E o cardápio novo aparece na tabela

  Scenario: Tentar salvar cardápio sem categoria nem produto selecionado
    Dado que o admin preencheu nome, horário e dias da semana, mas não adicionou nenhuma categoria nem produto
    Quando clica em "Salvar"
    Então o comportamento é o mesmo já validado hoje pelo backend (sem mudança de regra nesta história — cardápio sem nenhum vínculo é tecnicamente salvo, mas não aparece pra ninguém no totem)

  Scenario: Sair sem salvar simplesmente descarta
    Dado que o admin alterou campos na tela de edição de produto ou cardápio
    Quando navega pra outra tela sem clicar em "Salvar"
    Então as alterações são descartadas sem nenhuma confirmação — mesmo comportamento de qualquer outra tela do admin hoje

  Scenario: Produto excluído por outra sessão enquanto a tela está aberta
    Dado que o admin abriu a tela de edição de um produto
    E, enquanto isso, o produto foi excluído em outra aba/sessão
    Quando o admin clica em "Salvar"
    Então o backend retorna 404
    E a tela mostra uma mensagem de erro clara, sem crash, sem perder os dados digitados
```

**Cenários revisados e aprovados pelo PM.**

---

## Tech Explorer

### Serviços impactados
- **frontend/admin apenas.** Confirmado que `catalog-service` já tem todos os endpoints necessários — nenhuma mudança de backend:
  - `POST /catalog/products`, `PUT /catalog/products/{id}` — já existem, payload não muda
  - `POST /catalog/menus`, `PUT /catalog/menus/{id}`, `DELETE /catalog/menus/{id}` — já existem
  - `PUT /catalog/menus/{id}/composition` (`{category_ids, product_ids}`) — já existe, é o que a tela de cardápio vai continuar chamando
  - `GET /catalog/products/{id}/menus` — já existe, usado hoje pro bloco read-only "a quais cardápios este produto pertence"

### Rotas novas (`frontend/admin/src/App.tsx`)
Seguindo o padrão já usado em `/companies/new` e `/companies/:id/contract` (`useNavigate`/`useParams`, ambos já em uso no admin):
```
<Route path="/catalog/products/:id/edit" element={<ProtectedRoute path="/catalog/products/:id/edit" element={<ProductEditScreen />} />} />
<Route path="/catalog/menus/new"         element={<ProtectedRoute path="/catalog/menus/new"         element={<MenuFormScreen />} />} />
<Route path="/catalog/menus/:id/edit"    element={<ProtectedRoute path="/catalog/menus/:id/edit"    element={<MenuFormScreen />} />} />
```
`MenuFormScreen` serve criação e edição (mesmo componente, `:id` ausente = criando) — mesma forma como `openNewMenu`/`openEditMenu` já compartilham o mesmo `menuForm` state hoje, só muda o transporte (rota em vez de modal state). Produto não precisa de rota de criação — continua no modal.

### Componentes novos
- **`frontend/admin/src/screens/ProductEditScreen.tsx`** — extrai o corpo de `editProd`/`saveEditProd`/upload de imagem (`CatalogScreen.tsx:428-509` e o JSX do form de edição, hoje dentro do modal em `~948-1111`). Carrega o produto via `GET /catalog/products/{id}` no mount (hoje o estado vem só do que já estava carregado em memória via `openEditProduct(p: Product)` — como tela dedicada é acessada por URL direta também, precisa buscar os dados, não só receber via prop/state de navegação).
- **`frontend/admin/src/screens/MenuFormScreen.tsx`** — extrai `menuForm`/`saveMenu`/`openNewMenu`/`openEditMenu` (`CatalogScreen.tsx:631-697`) e o JSX do form (`~1187-1281`). Mesma lógica de fetch-on-mount quando `:id` presente.
- **`frontend/admin/src/components/SearchMultiSelect.tsx`** (novo, compartilhado) — usado duas vezes dentro de `MenuFormScreen` (categorias inteiras; produtos avulsos). Montado a partir de `Dropdown` (filtro de texto já embutido nele, via `InputBase`) + lista de itens selecionados renderizada abaixo (nome + botão remover). Props: `options: {value, label}[]`, `selectedIds: string[]`, `onChange(ids: string[])`, `emptyMessage`. Filtra `options` excluindo os já presentes em `selectedIds` antes de passar pro `Dropdown` — resolve o critério de "item já selecionado não aparece de novo na busca" sem precisar de lógica de `disabled` por item.

### Mudanças em `CatalogScreen.tsx`
- Botão "Editar" da tabela de Produtos: troca `onClick={() => openEditProduct(p)}` por `onClick={() => navigate(`/catalog/products/${p.id}/edit`)}`
- Remove do arquivo: `editProd`, `saveEditProd`, `editProdMenus`, e o bloco JSX de edição dentro do modal — o modal de produto fica só com o formulário de criação (`newProd`/`saveNewProduct`, inalterado)
- Botão "+ Novo cardápio" e "Editar" da tabela de Cardápios: trocam por `navigate("/catalog/menus/new")` e `navigate(`/catalog/menus/${m.id}/edit`)`
- Remove do arquivo: `menuModalOpen`, `editingMenuId`, `menuForm`, `menuProductSearch`, `menuFormError`, `menuSaving`, `openNewMenu`, `openEditMenu`, `saveMenu`, e o bloco JSX do modal de cardápio (`~1187-1281`) inteiro — `loadMenus()` continua existindo, só passa a ser chamado também no retorno da navegação (`useEffect` de foco/mount, ou state passado via `navigate(..., { state: { refresh: true } })`, a decidir na implementação)

### Migrations
Nenhuma — sem mudança de schema em nenhum serviço.

### Eventos de fila
Não aplicável — mudança é só de apresentação no admin.

### Impacto em outros serviços
Nenhum — totem, balcão, order-service, payment-service não são afetados. `catalog-service` não muda.

### Testes
- **Unitário/componente:** `SearchMultiSelect` merece teste próprio (é peça nova, reutilizada 2x) — cobrir: filtra já-selecionados, chama `onChange` correto ao adicionar/remover
- **E2E (Playwright):** cobrir os cenários Gherkin do QA Explorer — navegação pra tela dedicada ao editar produto, criação de produto continua em modal, composição de cardápio via busca+dropdown (adicionar, remover, evitar duplicata), salvar volta pra listagem, 404 ao salvar produto excluído por outra sessão. Evidências (screenshots/vídeos) em `docs/stories/ORD-136/evidencias/`, `ORD_ID=ORD-136 npx playwright test`, por regra permanente do projeto.

### Estimativa
- Frontend: 5 pontos (2 telas novas + 1 componente compartilhado + remoção de código do modal + testes e2e)

### Riscos
- **Baixo** — mudança é de apresentação, não de contrato de API; backend não muda, então não há risco de quebrar totem/balcão
- **Médio, mitigado:** `ProductEditScreen`/`MenuFormScreen` acessados por URL direta (não só por clique dentro do admin) precisam buscar dados no mount em vez de receber via state de navegação — se alguém favoritar/recarregar a URL, tem que funcionar igual. Resolvido pelo fetch-on-mount já descrito acima, mas é o ponto onde um bug de "tela em branco se acessada direto" pode aparecer se não for testado explicitamente
- **Baixo:** remoção de código morto (`editProd`, `menuModalOpen`, etc.) de um arquivo de 1310 linhas — risco de deixar alguma referência solta; mitigado por `tsc`/build falhar se sobrar import ou variável não usada referenciando código removido

---

## Ready

### Checklist de entrada

**Explorer (PM + Produto)**
- [x] História no formato Como/Quero/Para
- [x] Contexto e motivação documentados (pain points reais, confirmados pelo usuário)
- [x] Fluxo principal descrito passo a passo (produto e cardápio, separados)
- [x] Dependências identificadas (nenhuma — só frontend/admin)
- [x] Wireframe/mockup — descrito textualmente
- [x] Critérios de aceite funcionais escritos

**QA Explorer (QA)**
- [x] Happy path em Gherkin (edição de produto, criação/edição de cardápio)
- [x] Cenários de borda (item duplicado, remover item, sair sem salvar)
- [x] Cenário de erro (404 por exclusão concorrente)
- [x] Decisão de produto documentada (sem confirmação de descarte — consistente com o resto do admin)
- [x] Cenários aprovados pelo PM

**Tech Explorer (Frontend)**
- [x] Serviços impactados documentados (frontend/admin apenas, backend confirmado sem mudança)
- [x] Mudanças de código com localização exata (arquivos e linhas atuais referenciados)
- [x] Migrations necessárias descritas (nenhuma)
- [x] Eventos de fila documentados (nenhum aplicável)
- [x] Estimativa de esforço definida (5 pontos)
- [x] Riscos identificados com mitigação

**Aprovação final**
- [x] Time (usuário) revisou e aprovou a solução técnica ("aprovado")
- [x] Estimativa acordada (5 pontos)
- [x] Sem bloqueios não resolvidos
- [x] Priorização no sprint — aprovada para implementação imediata pelo solicitante

**Status: Ready** — apta para implementação.
