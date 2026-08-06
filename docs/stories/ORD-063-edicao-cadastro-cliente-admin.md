---
id: ORD-063
status: Done
fase: 4
sprint: null
responsavel: Frontend
estimativa: 5 pontos
---

# ORD-063 — Edição de cadastro de cliente no admin panel

## Descrição
O `CompanyContractScreen` (ORD-060) já mostra os dados cadastrais de um cliente, mas só como leitura — corrigir um endereço errado, atualizar a razão social ou trocar o porte da empresa hoje exige `curl`/Swagger, o mesmo problema que o ORD-060 resolveu para criação. Esta história adiciona edição inline à tela de detalhe existente, consumindo o `PUT /companies/{id}` expandido do ORD-061.

## Persona
**Super admin**, mesma persona do ORD-060/061/062.

## Contexto
Levantamento do `CompanyContractScreen.tsx` (ORD-060) mostra que ele já busca `company`, `contacts` e `legalRep` via `getCompany`/`listContacts`/`getLegalRepresentative` e já exibe tudo isso em painéis (`S.panel`) — a informação já está na tela, só falta o modo de edição.

**Decisão de UX (registrada aqui, não é óbvia):** a edição **não reaproveita o `Stepper` de 5 passos** do wizard de criação (ORD-060). O wizard existe para *gatear* o avanço quando os dados ainda não existem ou não foram validados; na edição os dados já existem e já são válidos — forçar alguém a clicar "Continuar" 4 vezes só para corrigir um CEP seria pior UX, não igual. Em vez disso, a tela ganha um modo de edição com as mesmas seções visuais do wizard (mesmos painéis, mesmos `grid2`/`grid3`, mesmos rótulos e validação por campo) só que **todas visíveis ao mesmo tempo**, sem gating, com uma barra de ação fixa no rodapé ("Salvar alterações" / "Descartar"). Ver wireframe, tela 2.

Wireframe de referência (já publicado junto com ORD-061/062): **[ORD-061/062 — Listagem e edição de clientes (wireframe)](https://claude.ai/code/artifact/2eb261bb-6be2-4cec-99f7-bbe822472553)** — tela 2.

### Personas afetadas
- **Super admin**: corrige dados cadastrais sem depender de API direta
- **QA**: terceiro fluxo E2E no mesmo padrão do ORD-060/062

### Fluxo principal
1. Super admin está em `/companies/:id/contract` (tela do ORD-060)
2. Clica em "Editar cadastro" → painéis somem do modo leitura e entram em modo formulário (mesmos dados, agora editáveis)
3. Altera um ou mais campos → barra de rodapé mostra "N campos alterados" e habilita "Salvar alterações"
4. Salva → `PUT /companies/{id}` com os campos alterados → volta ao modo leitura com os dados atualizados
5. "Descartar" a qualquer momento reverte para os valores originais e sai do modo edição sem chamar a API

### Fluxos alternativos / exceções
- Campo CNPJ aparece **desabilitado** no modo edição, com indicação visual de que é imutável (ver ORD-061 — trocar CNPJ é recadastro, não edição)
- Erro 422 de validação (ex: CEP inválido) → mensagem no campo específico, mesmo parser `parseApiError` do ORD-060, não alerta genérico
- Sair da tela (navegação) com alterações não salvas → confirmação simples antes de descartar (evita perda silenciosa de edição)
- Usuário sem role `superadmin` → botão "Editar cadastro" nem aparece (a tela de detalhe em si já é restrita por role desde o ORD-060)

### Dependências
- **Bloqueante: ORD-061 precisa estar mergeado** — depende do `PUT /companies/{id}` expandido
- Não bloqueia nem depende de ORD-062 (podem ser implementadas em paralelo, ambas só dependem de ORD-061)

### Critérios de aceite funcionais
- [ ] Botão "Editar cadastro" alterna a tela de detalhe (ORD-060) para modo edição
- [ ] Todos os campos cadastrais e de endereço ficam editáveis, exceto CNPJ (desabilitado, com explicação visível)
- [ ] Alterações são detectadas e refletidas na barra de rodapé ("N campos alterados")
- [ ] "Salvar alterações" chama `PUT /companies/{id}` e volta ao modo leitura com os dados atualizados
- [ ] "Descartar" reverte sem chamar a API
- [ ] Erros 422 aparecem no campo correto, não como alerta genérico
- [ ] Navegar para fora com alterações pendentes pede confirmação
- [ ] Cobertura de teste: unitário/componente (detecção de campos alterados / dirty state) + E2E (editar → salvar → confirmar persistência)

---

## QA Explorer

```gherkin
Feature: Edição de cadastro de cliente no admin panel
  Como super admin
  Quero editar os dados cadastrais de um cliente já criado
  Para corrigir informações sem depender de chamadas manuais à API

  Background:
    Dado que estou logado no admin panel como super admin
    E estou na tela de detalhe de um cliente já cadastrado

  Scenario: Entrar e sair do modo edição sem alterar nada
    Quando clico em "Editar cadastro"
    Então os campos ficam editáveis com os valores atuais preenchidos
    Quando clico em "Descartar" sem alterar nada
    Então volto ao modo leitura sem nenhuma chamada de API

  Scenario: Editar e salvar com sucesso
    Dado que estou no modo edição
    Quando altero a razão social e o CEP
    E clico em "Salvar alterações"
    Então a tela volta ao modo leitura mostrando os novos valores
    E um GET subsequente confirma a persistência

  Scenario: CNPJ é somente leitura na edição
    Dado que estou no modo edição
    Então o campo CNPJ aparece desabilitado
    E não é possível editá-lo

  Scenario: Erro de validação aparece no campo certo
    Dado que informo um CEP inválido no modo edição
    Quando tento salvar
    Então a mensagem de erro aparece embaixo do campo CEP, não como alerta genérico

  Scenario: Descartar reverte alterações
    Dado que alterei o nome fantasia no modo edição
    Quando clico em "Descartar"
    Então o valor volta ao original exibido no modo leitura

  Scenario: Sair com alterações pendentes pede confirmação
    Dado que alterei um campo e não salvei
    Quando tento navegar para outra tela
    Então uma confirmação aparece antes de descartar a edição

  Scenario: Botão de editar some para quem não é superadmin
    Dado que estou logado como "owner" acessando a própria empresa
    Então não existe o botão "Editar cadastro" na tela de detalhe

  Scenario: E2E completo (Playwright)
    Dado o ambiente local rodando via docker compose
    Quando executo: login superadmin → abrir detalhe de um cliente → editar cadastro → alterar campos → salvar → confirmar persistência
    Então cada etapa é validada com screenshot
    E as evidências ficam salvas em docs/stories/ORD-063/evidencias/e2e/
```

**Aprovado pelo PM.** Cenário mais crítico pro QA: descartar/confirmação de saída com alterações pendentes — é o único fluxo novo que não tem equivalente no ORD-060 (o wizard de criação não tem conceito de "descartar", só "voltar" entre passos).

---

## Tech Explorer

### Serviços impactados
- **`frontend/admin`** apenas. Consome `PUT /companies/{id}` expandido (ORD-061, deve estar mergeado antes de começar).

### Arquivos alterados
```
frontend/admin/src/
  screens/CompanyContractScreen.tsx   → ganha modo edição (estado local `editing: boolean`)
  api/companies.ts                    → ganha updateCompany(id, patch) — reaproveita client do ORD-060
```
Nenhum arquivo novo de tela — a edição vive dentro da tela de detalhe já existente, não é uma rota separada (diferente do que o wireframe sugere como "tela 2" — na prática é um modo da mesma tela/rota `/companies/:id/contract`, não `/companies/:id/edit`; o wireframe separa visualmente só para clareza de apresentação).

### Estado de edição (dirty state)
```ts
const [editing, setEditing] = useState(false);
const [draft, setDraft] = useState<CompanyEditForm | null>(null); // snapshot editável
const dirtyFields = draft ? diffFields(company, draft) : [];       // função pura, testável isoladamente
```
`diffFields` é a mesma função coberta pelo teste unitário do critério de aceite — compara `company` (fonte da verdade, vinda do `GET`) com `draft` (estado local do formulário) campo a campo.

### Confirmação de saída
Verificado: `main.tsx` usa `<BrowserRouter>` puro (não `createBrowserRouter`/`RouterProvider`), e `useBlocker` do React Router v6 (instalado: 6.30.4) só funciona sob um data router — com `BrowserRouter` ele lança erro em runtime. Migrar o app inteiro pra data router só por causa desta história é escopo desproporcional. Solução adotada: bloqueio só via `beforeunload` (cobre fechar aba/recarregar) **mais** um guard manual nos pontos de navegação internos que a própria tela já controla — clique nos itens do `Sidebar` e no link "Voltar" — checando `dirtyFields.length > 0` antes de chamar `navigate()` e disparando `window.confirm` nesses pontos. Não cobre 100% dos casos (ex: usuário digita uma URL diferente na barra de endereço), mas cobre os caminhos reais de saída da tela; registrado como limitação conhecida, não como pendência.

### Testes
- **Unitário/componente**: `diffFields(original, draft)` — cobre nenhuma alteração, uma alteração, múltiplas, e o caso de reverter manualmente um campo de volta ao valor original (não deve continuar contando como "sujo").
- **E2E**: novo spec `frontend/admin/e2e/edicao-cadastro-cliente.spec.ts`, `outputDir` apontando para `docs/stories/ORD-063/evidencias/e2e/` via `ORD_ID=ORD-063`.

### Impacto em outros serviços
Nenhum.

### Riscos
- Reaproveitar `CompanyContractScreen` em vez de criar uma tela nova reduz duplicação, mas aumenta a complexidade desse componente (agora tem modo leitura E modo edição). Se crescer mais, extrair o formulário de edição pra um componente próprio (`CompanyEditForm.tsx`) é o corte natural — não decidido agora porque o escopo atual ainda cabe num componente só.
- `useBlocker`/bloqueio de navegação do React Router depende da versão instalada suportar a API (v6.beta+/v6.4+) — validar na implementação; se a versão não suportar, o fallback é confirmar só no `beforeunload` (cobre fechar aba, não cobre clique em outro item do menu) e registrar como débito.

### Estimativa
5 pontos — sem tela nova, mas com estado de formulário mais complexo (dirty tracking, confirmação de saída) do que qualquer tela existente hoje.

---

## Ready

**Explorer:** [x] história, contexto, decisão de UX (form único vs. wizard) justificada, wireframe compartilhado com ORD-061/062 · **QA Explorer:** [x] entrar/sair sem alterar, salvar, campo imutável, erro de campo, descartar, confirmação de saída, isolamento por role, E2E completo · **Tech Explorer:** [x] reuso de tela existente, dirty state testável, risco de versão do React Router documentado · **Aprovação final:** pendente — apresentada ao usuário junto com ORD-061 e ORD-062.

**Status: Ready** — bloqueada tecnicamente até ORD-061 ser mergeado em `main`. Pode ser feita em paralelo ao ORD-062 (nenhuma depende da outra).
