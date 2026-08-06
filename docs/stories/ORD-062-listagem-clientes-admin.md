---
id: ORD-062
status: Done
fase: 4
sprint: null
responsavel: Frontend
estimativa: 5 pontos
---

# ORD-062 — Tela de listagem de clientes no admin panel

## Descrição
Depois do ORD-060 (cadastro) e do ORD-061 (filtros/edição no backend), continua não existindo nenhuma forma de **encontrar** um cliente já cadastrado pelo admin panel — o super admin teria que saber o `id` de cor ou voltar ao Swagger. Esta história cria a tela `/companies`, primeira listagem com filtros do projeto, usando os query params de `q`, `document` e `contract_status` do ORD-061.

## Persona
**Super admin**, mesma persona do ORD-060/061.

## Contexto
Não existe ainda nenhum padrão de tabela/lista no admin panel — todas as telas hoje (`DashboardScreen`, `CatalogScreen`, `OrdersScreen`) mostram dados de uma única empresa selecionada, nunca uma lista paginável e filtrável entre empresas. Esta história introduz esse padrão pela primeira vez.

Wireframe de referência (já publicado junto com o ORD-061): **[ORD-061/062 — Listagem e edição de clientes (wireframe)](https://claude.ai/code/artifact/2eb261bb-6be2-4cec-99f7-bbe822472553)** — tela 1. Reaproveita os tokens visuais do tema `ordin` (roxo `#9900ff`, painel `#1d1434`, chips de status já usados no `CompanyContractScreen` do ORD-060) e o padrão de `data-testid` já estabelecido.

### Personas afetadas
- **Super admin**: encontra qualquer cliente cadastrado sem depender de API direta
- **QA**: ganha um segundo fluxo E2E no mesmo padrão do ORD-060

### Fluxo principal
1. Super admin acessa "Empresas → Clientes" (novo item de menu, junto de "Novo cliente")
2. Tela carrega a primeira página (50 registros, `GET /companies` sem filtro)
3. Super admin digita em "Razão social ou nome fantasia" → após debounce, `GET /companies?q=...`
4. Super admin preenche CNPJ e/ou seleciona status do contrato → filtros se combinam (`AND`), mesma chamada re-disparada
5. Contador acima da tabela mostra "N clientes encontrados" refletindo o filtro ativo
6. Clique em qualquer linha (ou no botão "Ver / Editar") navega para `/companies/:id/contract` (tela do ORD-060, que passa a ganhar o modo de edição do ORD-063)

### Fluxos alternativos / exceções
- Nenhum resultado para o filtro → estado vazio com mensagem clara + botão "Limpar filtros" (não um texto genérico "sem dados")
- Erro de rede/API → mensagem de erro no lugar da tabela, mesmo padrão de `parseApiError` já usado em `NewCompanyScreen`/`CompanyContractScreen`
- Mais de 50 resultados → paginação simples (Anterior/Próxima), usando `skip`/`limit` do backend
- Usuário sem role `superadmin` → item de menu "Clientes" nem aparece (mesmo padrão de `Sidebar.tsx` já usado)

### Dependências
- **Bloqueante: ORD-061 precisa estar mergeado** — a tela depende dos query params `q`, `document`, `contract_status` em `GET /companies`
- Reaproveita `Company` (tipo já existe em `types.ts`, usado por `CompanyContractScreen`)

### Critérios de aceite funcionais
- [ ] Lista todas as empresas ativas paginada, sem filtro nenhum aplicado por padrão
- [ ] Filtro por razão social/nome fantasia com debounce (mesmo padrão de 500ms do lookup de CNPJ)
- [ ] Filtro por CNPJ (aceita com ou sem máscara)
- [ ] Filtro por status do contrato (Pendente/Enviado/Assinado/Todos)
- [ ] Filtros combináveis simultaneamente
- [ ] Estado vazio tratado (sem resultados) e estado de erro tratado (API fora)
- [ ] Paginação funcional quando há mais de 50 resultados
- [ ] Clique na linha navega para o detalhe da empresa (`/companies/:id/contract`)
- [ ] Menu "Clientes" só aparece para `superadmin`
- [ ] Cobertura de teste: unitário/componente (parse de filtros → query params) + E2E (buscar, filtrar, navegar ao detalhe)

---

## QA Explorer

```gherkin
Feature: Listagem de clientes no admin panel
  Como super admin
  Quero listar e filtrar os clientes cadastrados
  Para encontrar rapidamente qualquer empresa sem depender de API direta

  Background:
    Dado que estou logado no admin panel como super admin
    E existem clientes cadastrados com nomes, CNPJs e status de contrato variados

  Scenario: Listagem inicial sem filtro
    Dado que acesso "Empresas → Clientes"
    Então vejo a lista de clientes ativos, paginada
    E o contador mostra o total real

  Scenario: Busca por razão social ou nome fantasia
    Quando digito "sabor" no campo de busca
    Então, após o debounce, a lista mostra só clientes cujo nome ou razão social contém "sabor"

  Scenario: Filtro por CNPJ
    Quando digito um CNPJ válido (mascarado ou não) no campo CNPJ
    Então a lista mostra só o cliente com esse CNPJ

  Scenario: Filtro por status do contrato
    Quando seleciono "Enviado" no filtro de status
    Então a lista mostra só clientes com contrato enviado

  Scenario: Filtros combinados
    Quando preencho busca por nome E status "Pendente" ao mesmo tempo
    Então só aparecem clientes que atendem os dois critérios

  Scenario: Nenhum resultado
    Dado um filtro que não corresponde a nenhum cliente
    Então vejo uma mensagem de "nenhum cliente encontrado" com opção de limpar filtros

  Scenario: Navegação para o detalhe
    Quando clico em uma linha da tabela
    Então sou levado para a tela de detalhe/contrato daquele cliente

  Scenario: Menu "Clientes" só aparece para superadmin
    Dado que estou logado como "owner"
    Então não existe a opção "Empresas / Clientes" no menu

  Scenario: E2E completo (Playwright)
    Dado o ambiente local rodando via docker compose
    Quando executo: login superadmin → Clientes → busca por nome → filtro de status → clique na linha
    Então cada etapa é validada com screenshot
    E as evidências ficam salvas em docs/stories/ORD-062/evidencias/e2e/
```

**Aprovado pelo PM.** Cenário mais crítico pro QA: filtros combinados e o estado vazio — é a primeira tela do projeto com paginação e filtro real, sem precedente pra copiar.

---

## Tech Explorer

### Serviços impactados
- **`frontend/admin`** apenas. Consome `GET /companies?q=&document=&contract_status=&skip=&limit=` (ORD-061, deve estar mergeado antes de começar).

### Novos arquivos
```
frontend/admin/src/
  screens/CompanyListScreen.tsx   → tabela + filtros + paginação
  api/companies.ts                → ganha listCompanies(filters) — reaproveita client já criado no ORD-060
```

### Roteamento
- `App.tsx`: nova rota `/companies` (distinta de `/companies/new`), liberada só para `ROLE_ROUTES.superadmin`
- `Sidebar.tsx`: novo item "Clientes" no menu, mesmo grupo visual de "Novo cliente"

### Filtros → query params
Estado local (`q`, `document`, `contractStatus`, `skip`) sincronizado com a chamada via `useEffect` com debounce de 500ms no campo de texto (`q`) — mesmo padrão do `useEffect` de lookup de CNPJ em `NewCompanyScreen.tsx:114-145`. Filtro de `contract_status` e paginação disparam a busca imediatamente (sem debounce), só o campo de texto livre precisa de debounce.

### Paginação
`limit` fixo em 50 (mesmo default do backend). Estado `skip` incrementa/decrementa em blocos de 50. Sem componente de paginação numerada — Anterior/Próxima é suficiente pro volume atual (dezenas de empresas), consistente com a decisão de não indexar full-text no ORD-061.

### Máscara e validação
Reaproveita `formatCnpj`/`normalizeCnpj` de `lib/masks.ts`/`lib/validators.ts` (já existem, ORD-060) — sem novo código de validação, só reuso.

### Testes
- **Unitário/componente**: função pura que monta os query params a partir do estado de filtro (ex: `buildCompanyListQuery({q, document, contractStatus, skip})`) — testável sem montar o componente inteiro.
- **E2E**: novo spec `frontend/admin/e2e/listagem-clientes.spec.ts`, `outputDir` apontando para `docs/stories/ORD-062/evidencias/e2e/` via `ORD_ID=ORD-062` (mesmo mecanismo do `playwright.config.ts` do ORD-060, já genérico por `ORD_ID`).

### Impacto em outros serviços
Nenhum.

### Riscos
- Sem componente de tabela reutilizável existente no projeto — esta história define o padrão (`tablewrap`/`chip`/`rowaction`, ver wireframe) que ORD-063 e telas futuras (ex. listagem de terminais) devem seguir, para não divergir visualmente.

### Estimativa
5 pontos — tela nova + padrão de tabela/filtro nunca usado no projeto, mas sem complexidade de fluxo multi-etapa (diferente do wizard do ORD-060).

---

## Ready

**Explorer:** [x] história, contexto, fluxo completo, wireframe compartilhado com ORD-061/063 · **QA Explorer:** [x] busca, filtros isolados e combinados, estado vazio, navegação, isolamento por role, E2E completo · **Tech Explorer:** [x] arquivos novos, contrato de API (depende de ORD-061), estratégia de teste, riscos de padrão de tabela documentados · **Aprovação final:** pendente — apresentada ao usuário junto com ORD-061 e ORD-063.

**Status: Ready** — bloqueada tecnicamente até ORD-061 ser mergeado em `main`.
