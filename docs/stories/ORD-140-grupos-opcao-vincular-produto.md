---
id: ORD-140
status: Ready
fase: 6
sprint: null
responsavel: Frontend
estimativa: 5 pontos
tipo: feature
---

# ORD-140 — Grupos de opção: vincular ao produto

## Descrição
Na tela de edição de produto (`ProductEditScreen`, ORD-136), o owner/manager passa a poder vincular um ou mais grupos de opção já cadastrados (ORD-139) ao produto — ex.: vincular "Sabores de refrigerante" ao produto "Refrigerante lata 350ml". Um produto pode ter zero, um ou mais grupos vinculados. Botão "+ Vincular grupo de opção" abre em **modal** (não painel lateral, não navegação pra tela nova) — decisão confirmada pelo usuário depois de ver o protótipo interativo.

**Correção pós-implementação (01/09):** o modal só vincula grupo já cadastrado — a aba "Criar novo" (criação rápida embutida) foi removida por decisão explícita do usuário depois de ver a tela implementada. Se não existe grupo ainda, o owner cria um primeiro em Catálogo > Opções (ORD-139) e volta pra vincular. Ver seção "Correção pós-implementação" no fim deste documento pro detalhe completo, incluindo o redesenho de `ProductEditScreen` que essa mudança motivou.

## Persona
Owner/manager da empresa, editando um produto existente pra adicionar variação.

## Contexto
Depende de ORD-138 (modelo/CRUD) e ORD-139 (precisa existir grupo cadastrado pra vincular — embora o modal também permita criar um novo grupo sem sair daqui, ver acima). Independente de ORD-141/142/143. Ver `docs/stories/ORD-137-grupos-opcao-produto.md` pra contexto da iniciativa completa, e o protótipo validado (link na conversa) pra referência visual exata do modal.

---

## Explorer

## História
Como **owner/manager da empresa**, quero vincular grupos de opção já cadastrados (ou criar um novo, rapidamente, sem sair da tela) a um produto que estou editando, para que esse produto passe a oferecer as variações (sabor, tamanho) no totem.

## Contexto e motivação
ORD-139 entregou onde os grupos são criados e mantidos, mas um grupo sem produto vinculado não aparece em lugar nenhum pro cliente — o vínculo é o que efetivamente ativa a funcionalidade pro negócio (ex.: só depois de vincular "Sabores de refrigerante" ao produto "Refrigerante lata 350ml" é que o totem passa a perguntar o sabor). Sem esta história, ORD-139 fica "esquecido" — grupos existem na biblioteca mas nunca chegam ao cliente final.

**Decisão de escopo (resolvida no Explorer, 01/09):** a aba "criar novo" do modal **não** reimplementa a tela completa de ORD-139 (que tem drag-and-drop de opções, upload de imagem por opção, modal aninhado por opção). Embutir toda essa complexidade dentro de um modal que já vive dentro da tela de produto criaria modal-dentro-de-modal e duplicaria lógica que já existe em `OptionGroupFormScreen`. Em vez disso, "criar novo" é uma **criação rápida**: nome do grupo, os dois radios (obrigatório/opcional × única/múltipla) e uma lista simples de opções com só label + acréscimo de preço (sem imagem, sem reordenação — segue a ordem em que foram digitadas). O grupo criado aqui já sai vinculado ao produto atual. Se o owner quiser adicionar imagem ou reordenar depois, edita o grupo pela tela dedicada (Catálogo > Opções > Editar) — a mesma tela de ORD-139, sem duplicação.

## Fluxo principal
1. Owner/manager está editando um produto em `ProductEditScreen` (`/catalog/products/{id}/edit`)
2. Vê uma nova seção "Opções do produto", painel de largura cheia abaixo do grid nome/preço/imagem — mostra os grupos já vinculados como cards (nome + badge obrigatório/opcional + badge seleção única/múltipla + pills de opção com o acréscimo de preço, delta=0 sem nenhum texto — nunca "grátis"/"sem custo", mesma regra validada no protótipo)
3. Clica em "+ Vincular grupo de opção" → abre **modal** com duas abas: "Usar existente" e "Criar novo"
4. **Aba "Usar existente"**: lista (com busca por nome) os grupos da empresa que ainda não estão vinculados a este produto, com checkbox de seleção múltipla; botão "Vincular" fecha o modal e persiste
5. **Aba "Criar novo"**: nome, radios de obrigatoriedade/seleção, lista simples de opções (label + acréscimo de preço, "+ Adicionar opção" some mais linhas); botão "Criar e vincular" cria o grupo (`POST /catalog/option-groups`) e, em seguida, adiciona esse novo id à lista de vínculos do produto
6. Ao confirmar (qualquer uma das abas): `PUT /catalog/products/{id}/option-groups` com a lista completa de ids (já vinculados + novos) — é replace completo, não incremental
7. Painel "Opções do produto" atualiza mostrando o(s) grupo(s) recém-vinculado(s)
8. Cada card de grupo vinculado tem um botão "Desvincular" — remove só esse id da lista e reenvia o `PUT` (replace completo com a lista menor)

## Fluxos alternativos / exceções
- **Vincular grupo que já está vinculado**: aba "Usar existente" já filtra pra não listar grupos já vinculados — impossível de duplicar pela UI
- **Desvincular grupo**: não exclui o grupo (ele continua na biblioteca de Opções, reutilizável por outros produtos) — só remove o vínculo com este produto específico
- **Criar novo grupo sem nenhuma opção**: botão "Criar e vincular" fica desabilitado até ter pelo menos 1 opção com label preenchido, mesma regra client-side de ORD-139
- **`option_group_ids` inválido (400)**: não deveria acontecer pela UI normal (ids vêm sempre de uma seleção ou de uma criação bem-sucedida), mas se a API retornar 400 (ex.: grupo excluído por outra sessão entre o carregamento e o salvar), a tela mostra a mensagem de erro da API e não perde o estado do modal — usuário pode tentar de novo
- **Produto sem nenhum grupo vinculado**: painel "Opções do produto" mostra estado vazio ("Nenhum grupo de opção vinculado") + o botão de vincular, sem tratamento especial

## Dependências
- Serviços envolvidos: **catalog-service** (consome `PUT /catalog/products/{id}/option-groups`, `GET /catalog/option-groups`, `POST /catalog/option-groups`, todos já prontos de ORD-138) e **frontend/admin**.
- Histórias bloqueantes: **ORD-138** (Ready, implementado), **ORD-139** (Ready, implementado — reaproveita o conceito de "opção" mas não a tela).
- Reaproveita: `Modal` (padrão categoria/produto de `CatalogScreen`), `Tabs`/`Tab` (dentro do modal), `CurrencyInput`, componentes de pill/badge do protótipo validado.
- Independente de ORD-141/142/143.

## Critérios de aceite funcionais
- [ ] `ProductEditScreen` ganha painel "Opções do produto" (largura cheia, abaixo do grid existente)
- [ ] Grupos vinculados aparecem como cards com badges de obrigatoriedade/seleção e pills de opção (delta=0 sem texto)
- [ ] "+ Vincular grupo de opção" abre modal com abas "Usar existente" / "Criar novo"
- [ ] Aba "Usar existente" só lista grupos da empresa ainda não vinculados a este produto, com busca por nome
- [ ] Aba "Criar novo" é criação rápida (nome + radios + opções só com label/preço, sem imagem/reorder) e vincula automaticamente ao salvar
- [ ] Confirmar em qualquer aba persiste via `PUT /catalog/products/{id}/option-groups` (replace completo) e atualiza o painel
- [ ] "Desvincular" num card remove só aquele grupo da lista de vínculos, sem excluir o grupo da biblioteca
- [ ] `Product` (types.ts) ganha o campo `option_groups`

## Wireframe / Mockup
Protótipo interativo (HTML/JS) validado pelo usuário já cobre este fluxo visualmente — painel "Opções do produto" com cards + pills, e o modal com as duas abas. Estrutura textual:

**Painel "Opções do produto":** título + botão "+ Vincular grupo de opção" alinhado à direita. Abaixo, um card por grupo vinculado: nome do grupo, badges (Obrigatório/Opcional, Única/Múltipla), pills de opção (nome + "+R$ X,XX" só quando delta>0), botão "Desvincular" no card.

**Modal (duas abas):** "Usar existente" — campo de busca + lista com checkbox por grupo + botão "Vincular". "Criar novo" — nome, dois grupos de radio, lista simples de opções (label + `CurrencyInput`, "+ Adicionar opção"), botão "Criar e vincular".

---

## QA Explorer

```gherkin
Feature: Vincular grupos de opção a um produto
  Como owner/manager da empresa
  Quero vincular (ou criar e vincular) grupos de opção a um produto
  Para que esse produto ofereça variações (sabor, tamanho) no totem

  Background:
    Dado que estou autenticado no admin como owner/manager da empresa "Burger House"
    E estou editando o produto "Refrigerante lata 350ml" em ProductEditScreen

  # ---------- Happy path ----------

  Scenario: Painel vazio quando o produto não tem nenhum grupo vinculado
    Dado que o produto "Refrigerante lata 350ml" não tem nenhum grupo de opção vinculado
    Então o painel "Opções do produto" mostra o estado vazio "Nenhum grupo de opção vinculado"
    E o botão "+ Vincular grupo de opção" está visível

  Scenario: Vincular um grupo já existente (aba "Usar existente")
    Dado que existe o grupo "Sabores de refrigerante" na biblioteca de Opções, ainda não vinculado a este produto
    Quando clico em "+ Vincular grupo de opção"
    E na aba "Usar existente" marco o checkbox de "Sabores de refrigerante"
    E clico em "Vincular"
    Então o modal fecha
    E o painel "Opções do produto" passa a mostrar um card para "Sabores de refrigerante" com suas opções em pills

  Scenario: Criar e vincular um grupo novo (aba "Criar novo")
    Quando clico em "+ Vincular grupo de opção"
    E abro a aba "Criar novo"
    E preencho o nome "Tamanho da porção", marco "Obrigatório" e "Seleção única"
    E adiciono a opção "Individual" com acréscimo "R$ 0,00" e a opção "Família" com acréscimo "R$ 8,00"
    E clico em "Criar e vincular"
    Então o grupo "Tamanho da porção" é criado na biblioteca de Opções
    E o modal fecha
    E o painel "Opções do produto" passa a mostrar um card para "Tamanho da porção", com a pill "Família +R$ 8,00" e a pill "Individual" sem nenhum texto de preço

  Scenario: Desvincular um grupo do produto
    Dado que o produto tem o grupo "Sabores de refrigerante" vinculado
    Quando clico em "Desvincular" no card de "Sabores de refrigerante"
    Então o card desaparece do painel "Opções do produto"
    E o grupo "Sabores de refrigerante" continua existindo normalmente na aba "Opções" de Catálogo

  # ---------- Bordas ----------

  Scenario: Aba "Usar existente" não lista grupo já vinculado
    Dado que o produto já tem o grupo "Sabores de refrigerante" vinculado
    E a empresa também tem o grupo "Tamanho da porção", não vinculado a este produto
    Quando clico em "+ Vincular grupo de opção" e abro a aba "Usar existente"
    Então a lista mostra "Tamanho da porção"
    E a lista NÃO mostra "Sabores de refrigerante"

  Scenario: Busca por nome filtra a lista da aba "Usar existente"
    Dado que a empresa tem os grupos "Sabores de refrigerante" e "Tamanho da porção", nenhum vinculado a este produto
    Quando abro a aba "Usar existente" e digito "sabor" no campo de busca
    Então a lista mostra só "Sabores de refrigerante"

  Scenario: "Criar e vincular" desabilitado sem nenhuma opção
    Quando abro a aba "Criar novo" e preencho só o nome "Molhos extras", sem adicionar nenhuma opção
    Então o botão "Criar e vincular" está desabilitado
    Quando adiciono uma opção com label preenchido
    Então o botão "Criar e vincular" fica habilitado

  # ---------- Erro ----------

  Scenario: PUT retorna 400 ao vincular grupo inválido ou de outra empresa
    Dado que, entre abrir o modal e confirmar, um dos grupos selecionados foi excluído por outra sessão
    Quando marco esse grupo na aba "Usar existente" e clico em "Vincular"
    E a API responde 400 com a mensagem de erro
    Então o modal permanece aberto com a seleção preservada
    E a mensagem de erro da API é exibida
    E o painel "Opções do produto" não muda até uma tentativa bem-sucedida

  # ---------- Isolamento multi-tenant ----------

  Scenario: Aba "Usar existente" não lista grupos de outra empresa
    Dado que estou editando um produto da empresa "Burger House"
    E a empresa "Pasta & Co" possui o grupo "Tipo de massa"
    Quando abro a aba "Usar existente"
    Então a lista mostra somente grupos de opção da empresa "Burger House"
    E "Tipo de massa" não aparece em nenhum estado da lista (inclusive na busca)

  # ---------- Regressão ----------

  Scenario: Demais seções de ProductEditScreen continuam funcionando
    Dado que estou editando o produto "Refrigerante lata 350ml"
    Quando altero nome, preço, categoria, descrições, calorias, SKU, tags e alérgenos
    E clico em "Salvar"
    Então as alterações são salvas normalmente, sem interferência da nova seção "Opções do produto"
    Quando envio uma nova imagem de produto
    Então o upload de imagem continua funcionando como antes
```

**Critério de saída atendido:** happy path, bordas, erro, isolamento multi-tenant e regressão cobertos. Pronto para avançar ao Tech Explorer.

---

## Tech Explorer

### Serviços impactados
- **frontend/admin**: única área impactada. Sem mudança de backend — ORD-138 já entrega os 3 endpoints necessários (`GET /catalog/option-groups`, `POST /catalog/option-groups`, `PUT /catalog/products/{id}/option-groups`), prontos e testados.

### Arquivos modificados
- `frontend/admin/src/screens/ProductEditScreen.tsx` (+ `.module.scss`) — painel "Opções do produto" (full-width, abaixo do grid existente) + `Modal` com `Tabs`/`Tab` internas ("Usar existente" / "Criar novo")
- `frontend/admin/src/types.ts` — `Product` ganha `option_groups: OptionGroupOut[]`

### Arquivos novos
Nenhum. A aba "Criar novo" é pequena o bastante (nome + 2 radios + lista label/preço) pra viver inline em `ProductEditScreen.tsx`, sem justificar um componente próprio — decisão consciente de não criar abstração pra um formulário usado numa única tela.

### Sequência de chamadas HTTP

**Aba "Usar existente" (Vincular):**
1. Ao abrir o modal: `GET /catalog/option-groups` (se ainda não carregado nesta sessão da tela) → filtra no cliente os grupos cujo id não está em `product.option_groups`
2. Ao clicar "Vincular": `PUT /catalog/products/{id}/option-groups` com `{option_group_ids: [...idsJáVinculados, ...idsSelecionados]}`
3. Response 200 retorna o `ProductOut` completo — substitui `option_groups` local pelo retornado (fonte da verdade, evita reconstruir manualmente)

**Aba "Criar novo" (Criar e vincular):**
1. `POST /catalog/option-groups` com `{name, min_selections, max_selections, options}` (mapeamento via `radiosToMinMax`, reaproveitado de ORD-139)
2. Response 201 retorna o grupo criado com `id`
3. `PUT /catalog/products/{id}/option-groups` com `{option_group_ids: [...idsJáVinculados, novoId]}`
4. Response 200 substitui `option_groups` local

**Falha parcial (passo 1 da aba "Criar novo" funciona, passo 3 falha):** o grupo **já existe** na biblioteca de Opções nesse ponto — não é desfeito (não existe endpoint de "criar e vincular atômico", e não vale a pena criar um só pra isso). A tela fecha o modal normalmente após o erro do PUT? **Não** — mantém o modal aberto (mesmo padrão de erro do "Usar existente", QA Explorer já define isso), mas troca pra aba "Usar existente" com o grupo recém-criado **já pré-selecionado** no checkbox (ele agora aparece lá, porque já existe na empresa) — assim o "tentar de novo" do QA Explorer vira literalmente clicar em "Vincular" outra vez, sem o owner precisar recriar o grupo do zero ou procurar manualmente por ele. Mensagem de erro explica: "O grupo '{nome}' foi criado, mas não vinculado — confirme abaixo para tentar vincular novamente."

**Desvincular:**
1. `PUT /catalog/products/{id}/option-groups` com `{option_group_ids: idsAtuais.filter(id => id !== idRemovido)}`
2. Response 200 substitui `option_groups` local

### Decisões técnicas
- **Sem endpoint incremental de vínculo** (ex.: `POST .../option-groups/{group_id}` pra adicionar 1 sem reenviar a lista toda): o backend já modela como replace completo (Tech Explorer de ORD-138), e o volume esperado (poucos grupos por produto) não justifica pedir um endpoint novo só por conveniência — a tela sempre calcula a lista completa antes de chamar o PUT.
- **`option_groups` recarregado a partir da response, não montado localmente**: evita o mesmo tipo de divergência já visto em ORD-138/139 (campo aditivo que precisa refletir exatamente o que o backend persistiu, não uma suposição do cliente).
- **Cache de `GET /catalog/option-groups` por sessão da tela** (carrega uma vez ao abrir o modal a primeira vez, reaproveita nas aberturas seguintes): evita round-trip repetido só pra popular a aba "Usar existente" quando o usuário abre/fecha o modal várias vezes editando o mesmo produto.

### Impacto em outros serviços
Nenhum. Consome só endpoints já prontos do catalog-service (ORD-138). Sem mudança em auth/company/order/payment.

### Estimativa
- Frontend: **5 pontos** (painel + modal com 2 abas + criação rápida de grupo + tratamento de falha parcial)

### Riscos
- **Grupo órfão após falha parcial** (criado mas não vinculado): mitigado pela UX descrita acima (pré-seleção na aba "Usar existente" pra retry de 1 clique); pior caso residual é o owner nunca tentar de novo e o grupo ficar esquecido na biblioteca — mesmo risco aceitável que já existe hoje (grupo criado em ORD-139 e nunca vinculado a nada).
- **Cache da lista de grupos ficar desatualizado** se o usuário criar um grupo em outra aba do navegador enquanto edita este produto: risco baixo (cenário raro, mono-usuário por sessão) e sem mitigação especial — mesmo padrão de "dados podem ficar obsoletos entre sessões" já aceito em outras listagens do admin.

---

## Ready

Checklist de saída conferido contra o conteúdo já escrito neste arquivo:

**Explorer**
- [x] História no formato Como/Quero/Para
- [x] Contexto e motivação documentados (inclui a decisão de escopo da aba "Criar novo" ser criação rápida, sem duplicar a tela de ORD-139)
- [x] Fluxo principal passo a passo (8 passos)
- [x] Dependências identificadas (ORD-138 e ORD-139, ambas Ready/implementadas; independente de ORD-141/142/143)
- [x] Wireframe/mockup descrito (painel de cards + modal de 2 abas, protótipo já validado)
- [x] Critérios de aceite funcionais escritos (8 itens)

**QA Explorer**
- [x] Happy path em Gherkin (4 cenários: painel vazio, vincular existente, criar+vincular, desvincular)
- [x] Cenários de borda (3 cenários: filtro de já-vinculado, busca por nome, botão desabilitado sem opção)
- [x] Cenário de erro (400 preserva estado do modal)
- [x] Isolamento multi-tenant coberto (aba "Usar existente" não vaza grupo de outra empresa)
- [x] Regressão das demais seções de ProductEditScreen coberta
- [x] Cenários aprovados pelo PM (usuário revisou a sequência completa)

**Tech Explorer**
- [x] Serviços impactados documentados (só frontend/admin — sem mudança de backend, ORD-138 já cobre os 3 endpoints necessários)
- [x] "Endpoints novos/alterados": N/A — reutiliza contratos já documentados e testados em ORD-138
- [x] "Migrations": N/A — história de frontend puro
- [x] "Eventos de fila": N/A — sem impacto assíncrono
- [x] Estimativa definida (5 pontos)
- [x] Riscos identificados (2, com mitigação: grupo órfão após falha parcial, cache de lista desatualizado)

**Aprovação final**
- [x] Time revisou e concordou com a solução técnica (usuário: "avança no upstream")
- [x] Estimativa acordada (5 pontos)
- [x] Sem bloqueios não resolvidos
- [x] Priorizada no sprint backlog

**Status final: Ready.**

---

## Correção pós-implementação (01/09)

Depois de implementado e testado, o usuário revisou a tela e pediu dois ajustes. Ambos já aplicados no código; esta seção documenta a decisão — as seções de Explorer/QA Explorer/Tech Explorer acima registram o que foi **planejado**, não o estado final.

**1. Aba "Criar novo" removida do modal.** O modal "Vincular grupo de opção" passa a fazer só uma coisa: buscar (por nome) e marcar grupos já cadastrados na biblioteca de Opções, com um botão "Vincular". Não existe mais criação de grupo embutida no modal — todo o estado e as funções da criação rápida (`newGroupName`, `newGroupRadios`, `newGroupRows`, `createAndLink`, o tratamento de "falha parcial" criar-mas-não-vincular, os componentes `Tabs`/`Tab`/`RadioGroup`/`RadioButton` importados só pra isso) foram removidos de `ProductEditScreen.tsx`. Se a busca não encontra nada porque a empresa ainda não tem nenhum grupo cadastrado, a lista mostra uma dica: "Nenhum grupo de opção cadastrado ainda — crie um em Catálogo > Opções." Isso simplifica a história: os critérios de aceite, cenários Gherkin e a sequência de chamadas HTTP referentes à aba "Criar novo" (POST + PUT em sequência, pré-seleção após falha parcial) não se aplicam mais — só sobra o fluxo "Usar existente" já descrito acima.

**2. Redesenho de `ProductEditScreen`.** O usuário classificou o resultado visual como "boxes dispersos, sem nexo" — a tela tinha 3 cards brancos soltos (painel de campos principais, painel de imagem ao lado, e o novo painel "Opções do produto" abaixo, cada um com sua própria borda e espaçamento). A correção consolida os campos "Informações básicas" e "Imagem" num único card (lado a lado, na mesma proporção 2:1 de antes, mas sem borda própria entre as colunas), separado por `Divider` das seções "Descrição" e "Detalhes" — todas com título `h2` no mesmo padrão já usado em `NewCompanyScreen` (`font('l-emphasys')`). "Opções do produto" continua como um segundo card (concentra uma ação/lista própria, com peso o bastante pra não precisar se espremer dentro do primeiro), mas agora com o título no mesmo estilo `h2` das outras seções — lê como a continuação natural da página, não como algo bolado à parte. Essa mudança está fora do escopo original de ORD-140 (o layout-base é do ORD-136), mas foi feita junto por ter sido causada pela adição do painel desta história.

**Impacto nos critérios de aceite:** o item "Aba 'Criar novo' é criação rápida..." e a menção a `Tabs`/`Tab` em Dependências não se aplicam mais. Os demais critérios seguem válidos.
