---
id: ORD-139
status: Ready
fase: 6
sprint: null
responsavel: Frontend
estimativa: 8 pontos
tipo: feature
---

# ORD-139 — Grupos de opção: cadastro no admin

## Descrição
Nova aba em Empresa > Catálogo pra criar e gerenciar grupos de opção reutilizáveis (ex.: "Sabores de refrigerante", "Tamanho de batata") — nome, obrigatório/opcional, seleção única/múltipla, e as opções dentro do grupo com preço próprio (delta, pode ser zero), imagem própria e ordem reordenável. Segue o padrão de tela dedicada já estabelecido em ORD-136 (não modal, mesmo espírito de `ProductEditScreen`/`MenuFormScreen`).

**Requisito confirmado pelo usuário (31/08):** cada opção precisa de upload de imagem (mesmo componente `Upload` + preview já usado em `ProductEditScreen` pra imagem de produto) e reordenação drag-and-drop (mesmo mecanismo via Pointer Events já usado em `Table.tsx` pra reordenar categoria/produto, não `SearchMultiSelect` — esse componente serve pra *selecionar de uma lista existente*, não pra *montar/ordenar/enriquecer* uma lista de opções com imagem própria, que é o caso aqui). É essa complexidade (imagem + reorder por opção) que confirma a necessidade de aba/tela dedicada em vez de campo simples embutido em outro formulário.

## Persona
Owner/manager da empresa, cadastrando grupos de opção pela primeira vez.

## Contexto
Depende de ORD-138 (modelo de dado/CRUD já existir no catalog-service). Ver `docs/stories/ORD-137-grupos-opcao-produto.md` pra contexto da iniciativa completa.

**Nota de UX confirmada em ORD-142 (31/08):** o campo de preço de cada opção é um **acréscimo** sobre o preço-base do produto (delta incremental), não "o preço da opção" — a regra de cálculo (soma dos deltas das opções escolhidas, ver ORD-142) só funciona corretamente se quem cadastra entender essa diferença. O rótulo do campo no formulário precisa deixar isso explícito (ex.: "Acréscimo de preço", não só "Preço"), pra não confundir com o modelo de "cada opção tem preço absoluto próprio" que alguns concorrentes usam (Mogo, ver `docs/analise-mogo-fluxo-pizza.md`) e que o Ordin **não** adota.

---

## Explorer

## História
Como **owner/manager da empresa**, quero uma tela dedicada em Empresa > Catálogo pra criar, editar e gerenciar grupos de opção reutilizáveis (nome, obrigatoriedade, seleção única/múltipla, e as opções com preço, imagem e ordem), para poder montar variações de produto (sabor, tamanho) sem depender de API/Swagger — hoje ORD-138 só existe como backend puro.

## Contexto e motivação
ORD-138 entregou o modelo de dado e os endpoints, mas não há nenhuma forma de um owner/manager usar isso sem chamar a API diretamente. Sem esta história, os grupos de opção continuam inacessíveis pra quem realmente precisa cadastrar "Sabores de bebida" ou "Tamanho da porção" no dia a dia.

O protótipo interativo validado pelo usuário já fixou boa parte da UX (título em H1, breadcrumb, pills de opção com delta de preço — silencioso quando zero, nunca "grátis"), mas focava no fluxo de VINCULAR grupo a um produto (isso é ORD-140). Esta história é a ponta que falta antes: **onde o grupo é criado e mantido em si**, independente de qual produto vai usá-lo — mesmo padrão de Alérgenos (master data reaproveitada, mas aqui por empresa, não global) e mesmo padrão estrutural de Categorias/Produtos/Cardápios já existentes em `CatalogScreen.tsx`.

## Fluxo principal
1. Owner/manager abre Empresa > Catálogo e vê uma 4ª aba, "Opções", ao lado de Categorias/Produtos/Cardápios (mesmo componente `Tabs`/`Tab` já em uso)
2. A aba mostra uma tabela (mesmo componente `Table.tsx` das outras abas) com os grupos de opção da empresa: nome, badge obrigatório/opcional, badge seleção única/múltipla, contagem de opções, botão Editar
3. Owner clica em "+ Novo grupo" → navega pra tela dedicada `OptionGroupFormScreen` (padrão `MenuFormScreen`: título H1, breadcrumb "Catálogo › Opções › Novo grupo", Voltar/Salvar)
4. Preenche nome, marca obrigatório/opcional (radio), marca seleção única/múltipla (radio)
5. Clica em "+ Adicionar opção" → abre um **modal** (não inline) com o cadastro completo de UMA opção: label, "Acréscimo de preço" (`CurrencyInput`, default R$ 0,00) e imagem opcional (componente `Upload` + preview, mesmo padrão de `ProductEditScreen`). A lista principal mostra só o essencial (miniatura, label, acréscimo) — **correção de UX pós-implementação (31/08)**: a primeira versão cravava tudo (drag handle + upload + label + preço) numa linha só, ficando visualmente espremida, principalmente o widget de upload sem espaço pra exibir o próprio texto. Modal dá espaço de sobra e também abre margem pra opção ganhar mais campos no futuro sem precisar reapertar a linha
6. Reordena as opções por drag-and-drop na lista principal (reaproveita o `Table.tsx` — mesmo mecanismo de Pointer Events já usado em Categorias/Produtos, extraído para o hook `useDragReorder` compartilhado)
7. Salva — `POST /catalog/option-groups` na criação (nome + min/max + lista de opções numa chamada só) ou, na edição, `PUT /catalog/option-groups/{id}` (dados do grupo) seguido de `PUT /catalog/option-groups/{id}/options` (replace completo das opções) quando a lista mudou
8. Volta pra listagem (`/catalog?tab=options`, mesmo padrão `?tab=` do ORD-136)

## Fluxos alternativos / exceções
- **Editar grupo já vinculado a produto(s)**: permitido sem aviso — mudança de regra/opções vale pra todos os produtos que usam o grupo (comportamento já confirmado como intencional no Tech Explorer de ORD-138, "grupo reutilizável, edição propaga")
- **Editar a lista de opções de um grupo que já tinha imagens cadastradas**: o replace completo do backend (`PUT .../options`) recria as opções do zero, perdendo a imagem de opções que não mudaram de nada — limitação conhecida, documentada no Tech Explorer de ORD-138. A tela precisa avisar visualmente antes de salvar se detectar que há imagem em risco (ex.: "Salvar vai exigir reenviar as imagens das opções"), pra não ser uma surpresa muda
- **Tentar salvar grupo sem nenhuma opção**: botão Salvar fica desabilitado até ter pelo menos 1 opção — mesmo padrão de "Adiciona pelo menos uma opção" do protótipo, evita depender só do erro 422 do backend
- **Tentar excluir grupo vinculado a produto**: backend retorna 409 nomeando o(s) produto(s) — a tela mostra essa mensagem tal como veio da API (não reformula), consistente com o padrão de erro já usado em outras exclusões bloqueadas do admin
- **Upload de imagem com formato/tamanho inválido**: mesma mensagem de erro já usada em `ProductEditScreen` (JPG/PNG, até 2MB)
- **Sair da tela sem salvar**: descarta sem confirmação — mesma decisão de produto já tomada no ORD-136 (QA Explorer daquela história), consistente com o resto do admin

## Dependências
- Serviços envolvidos: **catalog-service** (consome os endpoints do ORD-138, já prontos) e **frontend/admin**.
- Histórias bloqueantes: **ORD-138** (Ready, implementado).
- Reaproveita componentes existentes: `Tabs`/`Tab`, `Table.tsx` (listagem + drag-and-drop), `Upload` (imagem), `CurrencyInput` (acréscimo de preço), `Breadcrumb` (ORD-136), padrão `?tab=` de navegação (ORD-136).
- Sem dependência de ORD-140/141/142/143 — esta história funciona sozinha (grupo criado mas não vinculado a nenhum produto ainda é um estado válido).

## Critérios de aceite funcionais
- [ ] Nova aba "Opções" em Empresa > Catálogo, listando os grupos da empresa em tabela
- [ ] "+ Novo grupo" abre tela dedicada de criação (não modal)
- [ ] "Editar" na tabela abre a mesma tela em modo edição, pré-preenchida
- [ ] Formulário do grupo: nome, obrigatório/opcional, seleção única/múltipla
- [ ] "+ Adicionar opção" e "Editar" (por opção) abrem um modal com label, campo rotulado "Acréscimo de preço" (não "Preço") e upload de imagem opcional — cadastro de opção não é inline
- [ ] Lista principal de opções mostra só o essencial (miniatura, label, acréscimo) e é reordenável por drag-and-drop
- [ ] Salvar bloqueado (botão desabilitado) enquanto não houver ao menos 1 opção
- [ ] Excluir grupo vinculado a produto mostra a mensagem 409 da API, nomeando o(s) produto(s)
- [ ] Voltar da tela do grupo preserva a aba "Opções" ativa na listagem (`?tab=options`)

## Wireframe / Mockup
Sem mockup visual formal — descrição funcional, análoga ao protótipo já validado:

**Aba "Opções" (listagem):** mesma estrutura visual de Categorias/Produtos/Cardápios — filtro de nome, botão "+ Novo grupo" no canto, tabela com colunas Nome / Obrigatório·Opcional / Seleção única·múltipla / Nº de opções / Ações (Editar, Excluir).

**Tela de grupo (criação/edição):** breadcrumb "Catálogo › Opções › Novo grupo" (ou "Editar grupo"), H1, Voltar/Salvar no topo. Painel 1: nome + dois grupos de radio (obrigatório/opcional, seleção única/múltipla). Painel 2: cabeçalho "Opções" + botão "+ Adicionar opção" alinhado à direita; abaixo, uma tabela simples (mesmo `Table.tsx`, com drag-and-drop) com miniatura, label, acréscimo de preço e ações Editar/Remover por linha — sem edição inline.

**Modal de opção (criar/editar uma opção):** título "Nova opção"/"Editar opção", campo label, `CurrencyInput` "Acréscimo de preço", seção de imagem (preview + "Remover imagem", ou dropzone `Upload` de largura cheia quando não há imagem), ações "Adicionar"/"Salvar" + "Cancelar". Mesmo padrão visual dos modais de categoria/produto já existentes em `CatalogScreen`.

---

## QA Explorer

```gherkin
Feature: Cadastro de grupos de opção no admin
  Como owner/manager da empresa
  Quero criar, editar e gerenciar grupos de opção numa tela dedicada
  Para montar variações de produto (sabor, tamanho) sem depender de API/Swagger

  Background:
    Dado que estou autenticado no admin como owner/manager da empresa "Burger House"
    E estou na tela Empresa > Catálogo

  # ---------- Happy path ----------

  Scenario: Listar grupos de opção na aba "Opções"
    Quando clico na aba "Opções"
    Então a URL reflete "?tab=options"
    E vejo uma tabela com os grupos de opção da empresa, cada linha mostrando nome, badge obrigatório/opcional, badge seleção única/múltipla e número de opções

  Scenario: Criar grupo de opção com sucesso
    Dado que estou na aba "Opções"
    Quando clico em "+ Novo grupo"
    Então navego para uma tela dedicada com breadcrumb "Catálogo › Opções › Novo grupo" e título H1 "Novo grupo"
    Quando preencho o nome "Sabores de refrigerante"
    E marco "Obrigatório"
    E marco "Seleção única"
    E clico em "+ Adicionar opção" e preencho label "Coca-Cola" com acréscimo de preço "R$ 0,00"
    E clico em "+ Adicionar opção" e preencho label "Fanta Laranja" com acréscimo de preço "R$ 0,00"
    E anexo uma imagem válida (JPG, 500KB) na opção "Coca-Cola"
    E clico em "Salvar"
    Então o grupo é criado com sucesso
    E sou levado de volta para a listagem com "?tab=options"
    E o grupo "Sabores de refrigerante" aparece na tabela com 2 opções

  Scenario: Editar grupo de opção existente
    Dado que existe o grupo "Tamanho de batata" com as opções "P", "M" e "G"
    Quando clico em "Editar" na linha do grupo "Tamanho de batata"
    Então navego para a mesma tela de formulário, pré-preenchida com nome, obrigatoriedade, tipo de seleção e as 3 opções
    Quando altero o acréscimo de preço da opção "G" de "R$ 6,00" para "R$ 7,00"
    E clico em "Salvar"
    Então a alteração é salva com sucesso
    E volto para a listagem com "?tab=options"

  Scenario: Reordenar opções por drag-and-drop
    Dado que estou editando o grupo "Tamanho de batata" com as opções na ordem "P, M, G"
    Quando arrasto a opção "G" para a primeira posição usando a alça de arrastar
    Então a ordem exibida na tela passa a ser "G, P, M"
    Quando clico em "Salvar"
    Então a nova ordem "G, P, M" é persistida e refletida ao reabrir a tela de edição

  Scenario: Navegar Catálogo → Opções → Novo grupo → Salvar → volta pra listagem
    Dado que estou na tela Empresa > Catálogo com a aba "Categorias" ativa
    Quando clico na aba "Opções"
    E clico em "+ Novo grupo"
    E preencho um grupo válido com ao menos 1 opção
    E clico em "Salvar"
    Então retorno para Empresa > Catálogo com a aba "Opções" ativa (URL "?tab=options")
    E o breadcrumb da tela de listagem mostra "Catálogo › Opções"

  # ---------- Bordas ----------

  Scenario: Botão Salvar desabilitado sem nenhuma opção
    Dado que estou na tela "Novo grupo"
    E preenchi o nome "Sabores de sorvete" mas não adicionei nenhuma opção
    Então o botão "Salvar" está desabilitado
    Quando clico em "+ Adicionar opção" e preencho ao menos o label
    Então o botão "Salvar" fica habilitado

  Scenario: Upload de imagem com formato inválido é rejeitado
    Dado que estou editando as opções de um grupo
    Quando tento anexar um arquivo ".pdf" numa opção
    Então a imagem é rejeitada com a mensagem de erro padrão de formato inválido (mesma de ProductEditScreen)
    E a opção permanece sem imagem

  Scenario: Upload de imagem acima do tamanho máximo é rejeitado
    Dado que estou editando as opções de um grupo
    Quando tento anexar uma imagem JPG de 5MB numa opção
    Então a imagem é rejeitada com a mensagem de erro padrão de tamanho máximo excedido (2MB, mesma de ProductEditScreen)
    E a opção permanece sem imagem

  Scenario: Aviso visual ao editar opções de um grupo que já tinha imagem
    Dado que existe o grupo "Sabores de refrigerante" com a opção "Coca-Cola" já com imagem cadastrada
    Quando entro na tela de edição desse grupo
    E altero o label ou preço de qualquer opção da lista
    Então vejo um aviso visual antes de salvar informando que salvar vai exigir reenviar as imagens das opções
    Quando confirmo e clico em "Salvar"
    Então as opções são salvas e a imagem que não foi reenviada aparece como removida (placeholder)

  # ---------- Erro ----------

  Scenario: Excluir grupo vinculado a produto é bloqueado
    Dado que existe o grupo "Sabores de refrigerante" vinculado ao produto "Refrigerante lata 350ml"
    Quando clico em "Excluir" na linha desse grupo na listagem
    Então a exclusão é bloqueada
    E vejo a mensagem de erro retornada pela API (409), nomeando o produto "Refrigerante lata 350ml"
    E o grupo continua aparecendo normalmente na listagem

  # ---------- Isolamento multi-tenant ----------

  Scenario: Usuário da empresa A não vê grupos de opção da empresa B
    Dado que estou autenticado como owner da empresa "Burger House"
    E a empresa "Pasta & Co" possui um grupo de opção chamado "Tipo de massa"
    Quando abro a aba "Opções" em Empresa > Catálogo
    Então a tabela mostra somente os grupos de opção da empresa "Burger House"
    E o grupo "Tipo de massa" não aparece em nenhum estado da tela (listagem, busca, cache local)

  # ---------- Regressão ----------

  Scenario: Abas existentes continuam funcionando após adicionar a aba "Opções"
    Dado que estou em Empresa > Catálogo
    Quando clico na aba "Categorias"
    Então a listagem de categorias funciona normalmente, sem alteração de comportamento
    Quando clico na aba "Produtos"
    Então a listagem de produtos funciona normalmente, incluindo criação/edição de produto
    Quando clico na aba "Cardápios"
    Então a listagem de cardápios funciona normalmente
```

**Critério de saída atendido:** happy path, bordas, erro, isolamento multi-tenant e regressão cobertos. Pronto para avançar ao Tech Explorer.

---

## Tech Explorer

### Serviços impactados
- **frontend/admin**: única área impactada. Sem mudança de backend — ORD-138 já entrega todos os endpoints necessários, prontos e testados.

### Arquivos novos
- `frontend/admin/src/screens/OptionGroupListScreen.tsx` (+ `.module.scss`) — listagem de grupos (padrão `Table.tsx`, mesmo espírito das outras 3 abas)
- `frontend/admin/src/screens/OptionGroupFormScreen.tsx` (+ `.module.scss`) — criação/edição, espelha `MenuFormScreen.tsx` (H1, `Breadcrumb`, Voltar/Salvar)
- `frontend/admin/src/lib/optionGroupMapping.ts` — funções puras `radiosToMinMax()` / `minMaxToRadios()` (ver seção de mapeamento abaixo), isoladas pra serem testáveis sem montar componente

### Arquivos modificados
- `frontend/admin/src/screens/CatalogScreen.tsx` — adicionar a 4ª `Tab` ("Opções"), roteando para `OptionGroupListScreen` quando `?tab=options`
- `frontend/admin/src/components/Table.tsx` — extrair o hook de drag-and-drop (ver decisão técnica abaixo)

### Mapeamento radio (obrigatório/opcional × única/múltipla) → min/max_selections
A tela simplifica pra 2 radios; o backend só entende `min_selections`/`max_selections`. Regra de conversão:

| Obrigatoriedade | Tipo de seleção | `min_selections` | `max_selections` |
|---|---|---|---|
| Obrigatório | Única | 1 | 1 |
| Obrigatório | Múltipla | 1 | nº de opções cadastradas no grupo |
| Opcional | Única | 0 | 1 |
| Opcional | Múltipla | 0 | nº de opções cadastradas no grupo |

**Nota:** "múltipla" hoje não expõe um campo de "quantidade máxima" customizável na UI — `max_selections` é sempre derivado do total de opções (equivalente a "pode escolher quantas quiser dentro da lista"). Um campo explícito de "máximo de seleções" (útil pro caso pizza, ver ORD-142/`docs/analise-mogo-fluxo-pizza.md`) fica fora do escopo desta história — **gap documentado, não é regressão**: hoje o dado já existe no backend (`max_selections` é livre), só não há input pra ele nesta tela. Se necessário, é uma história pequena futura de adicionar 1 campo numérico condicional a "Múltipla".

Ao carregar um grupo existente pra edição (`minMaxToRadios`), a leitura é o inverso: `min_selections === 0` → Opcional, senão Obrigatório; `max_selections === 1` → Única, senão Múltipla. Caso o grupo tenha sido criado via API com uma combinação fora dessas 4 (ex.: `min=2, max=5`, que a UI não sabe representar), a tela cai num modo "avançado" somente leitura do min/max numérico bruto — não trava a tela, só não permite edição pelos radios simplificados (risco documentado abaixo).

### Sequência de chamadas HTTP

**Criação de grupo novo (com imagem pendente em memória):**
1. Usuário monta o formulário: nome, radios → min/max, lista de opções (label, price_delta, arquivo de imagem opcional guardado como `File` em estado local, ainda não enviado)
2. Ao clicar Salvar: `POST /catalog/option-groups` com `{name, min_selections, max_selections, options: [{label, price_delta}, ...]}` (sem imagem — options ainda não têm id)
3. Response 201 retorna o grupo criado com `options[].id` preenchido, na mesma ordem enviada
4. Para cada opção que tinha um `File` pendente: `POST /catalog/options/{id}/image` (multipart), em paralelo (`Promise.all`)
5. Se qualquer upload de imagem falhar nesse passo 4: o grupo e as opções **já existem** (passo 2 teve sucesso) — a tela não desfaz a criação, mostra erro pontual "Grupo criado, mas a imagem da opção X não foi salva" e deixa o usuário tentar reenviar entrando em modo de edição do grupo recém-criado

**Edição de grupo existente:**
1. `PUT /catalog/option-groups/{id}` com `{name, min_selections, max_selections}` — sempre, se nome/obrigatoriedade/tipo mudou
2. Se a lista de opções mudou (adição, remoção, edição de label/preço, reordenação): `PUT /catalog/option-groups/{id}/options` (replace completo) com a lista atual — **isso é o gatilho do aviso de perda de imagem** (passo QA Explorer). Response retorna as opções recriadas com novos ids.
3. Para opções que tinham `File` pendente (novo upload feito durante a edição): `POST /catalog/options/{id}/image` usando o id retornado no passo 2 (nunca o id antigo — o replace completo gera ids novos)
4. Se só a reordenação mudou (sem edição de label/preço/imagem): usa `PUT /catalog/option-groups/{id}/options/reorder` em vez do replace completo — **evita perder imagens desnecessariamente**. A tela precisa distinguir "só reordenei" de "mudei conteúdo" pra escolher o endpoint certo e não disparar o aviso de perda de imagem à toa.

### Decisão técnica: hook de drag-and-drop
Extrair a lógica de Pointer Events do `Table.tsx` para um hook `useDragReorder<T>(items: T[], onReorder: (next: T[]) => void)` em `frontend/admin/src/lib/useDragReorder.ts`, reaproveitado tanto por `Table.tsx` (linhas) quanto pelo novo `OptionGroupFormScreen.tsx` (cards de opção). Justificativa: a lógica de swap por posição do ponteiro é idêntica, só muda o que é renderizado (`<tr>` vs `<div class="option-card">`); duplicar o listener de Pointer Events em dois lugares é o tipo de duplicação que gera bug divergente (um lugar corrige e o outro não). Risco de regressão no `Table.tsx` é mitigado pelos testes E2E já existentes de reorder de categoria/produto (ORD-136), que continuam cobrindo o comportamento depois da extração.

### Impacto em outros serviços
Nenhum. Consome só endpoints já prontos do catalog-service (ORD-138). Sem mudança em auth/company/order/payment.

### Estimativa
- Frontend: **8 pontos** (2 telas novas + extração de hook + lógica de upload em duas fases + mapeamento radio↔min/max + aviso de perda de imagem)

### Riscos
- **Perda de imagem em replace completo**: já mitigado parcialmente por só disparar `PUT .../options` quando o conteúdo (não só ordem) mudou, e por avisar visualmente antes de salvar — risco residual aceito (documentado desde o Tech Explorer de ORD-138), não bloqueia esta história.
- **Falha parcial na criação (grupo criado, imagem não)**: mitigado por mensagem de erro pontual + possibilidade de retry via edição, não deixa a tela em estado inconsistente.
- **Combinações de min/max fora do que os radios representam** (ex.: dado legado ou criado via API/Swagger com `min=2, max=5`): mitigado por modo somente-leitura do min/max bruto nesse caso raro, evita a tela quebrar ou reescrever silenciosamente uma configuração que não entende.
- **Extração do hook de drag-and-drop pode introduzir regressão no `Table.tsx`**: mitigado pela suíte E2E já existente de reorder (ORD-136) rodando contra o `Table.tsx` refatorado antes de considerar a história concluída.

---

## Ready

Checklist de saída conferido contra o conteúdo já escrito neste arquivo:

**Explorer**
- [x] História no formato Como/Quero/Para
- [x] Contexto e motivação documentados
- [x] Fluxo principal passo a passo (8 passos)
- [x] Dependências identificadas (ORD-138, Ready/implementado; sem dependência de ORD-140/141/142/143)
- [x] Wireframe/mockup descrito (listagem + tela de formulário)
- [x] Critérios de aceite funcionais escritos (9 itens)

**QA Explorer**
- [x] Happy path em Gherkin (5 cenários)
- [x] Cenários de borda (3 cenários: salvar desabilitado, upload inválido ×2 formatos, aviso de perda de imagem)
- [x] Cenário de erro (exclusão bloqueada 409)
- [x] Isolamento multi-tenant coberto (listagem não vaza grupo de outra empresa)
- [x] Regressão das 3 abas existentes coberta
- [x] Cenários aprovados pelo PM (usuário revisou o fluxo completo ao longo da sessão)

**Tech Explorer**
- [x] Serviços impactados documentados (só frontend/admin — sem mudança de backend, ORD-138 já cobre)
- [x] "Endpoints novos/alterados": N/A nesta história — consome contratos já documentados e testados em ORD-138, referenciados explicitamente (não repetidos)
- [x] "Migrations": N/A — história de frontend puro
- [x] "Eventos de fila": N/A — sem impacto assíncrono
- [x] Estimativa definida (8 pontos)
- [x] Riscos identificados (4, todos com mitigação: perda de imagem em replace, falha parcial na criação, combinações de min/max fora dos radios, regressão no `Table.tsx`)

**Aprovação final**
- [x] Time revisou e concordou com a solução técnica (usuário: "avançar")
- [x] Estimativa acordada (8 pontos)
- [x] Sem bloqueios não resolvidos
- [x] Priorizada no sprint backlog

**Status final: Ready.**
