---
id: ORD-085
status: Ready
fase: 6
sprint: null
responsavel: Frontend
estimativa: 2 pontos
---

# ORD-085 — Empresas: botão por linha pra ativar a empresa na sessão

## Descrição
Pedido direto do usuário, na sequência do ORD-084: cada linha da listagem de Empresas ganha um botão pra ativar aquela empresa na sessão compartilhada (`selectedCompanyId`, [[ORD-082]]) — mesma sessão que Configurações/Transações/Pedidos/Empresa/Dispositivos/Catálogo já leem e escrevem, com o badge "Empresa ativa" (canto superior, [[ORD-082]]/[[ORD-084]]) confirmando visualmente qual está selecionada. Hoje a única forma de selecionar uma empresa nessas telas é via `Dropdown` — a listagem de Empresas em si (a fonte mais natural pra escolher um cliente) não tinha esse atalho.

## Persona
**Superadmin/admin** (únicos que acessam `/companies`). Ganham um atalho de um clique pra "entrar no contexto" de uma empresa a partir da própria lista de clientes, sem precisar abrir um Dropdown separado em Configurações/Transações/etc. depois de já ter identificado a empresa certa na listagem.

## Explorer

### Fluxo principal
1. Superadmin/admin abre `/companies`, aplica filtros se quiser
2. Cada linha da tabela ganha uma coluna "Ação" com um botão "Ativar"
3. Clica no botão → `selectedCompanyId` passa a ser o `id` daquela linha, badge "Empresa ativa" aparece/atualiza no topo, mesmo comportamento de quando a seleção é feita via Dropdown em qualquer outra tela
4. A linha da empresa atualmente ativa na sessão mostra um indicador (tag "Ativa") no lugar do botão, em vez de um botão clicável redundante
5. Clicar no botão **não** navega para `/companies/{id}/contract` (comportamento já existente do clique na linha) — as duas ações ficam independentes

### Critérios de aceite
- [ ] Nova coluna "Ação" na tabela, com botão "Ativar" por linha
- [ ] Clicar em "Ativar" chama `setSelectedCompany(company.id)` (mesma store do ORD-082) e não navega pra `/companies/{id}/contract`
- [ ] A linha cuja empresa é a `selectedCompanyId` atual mostra uma tag "Ativa" (não interativa) no lugar do botão
- [ ] Badge "Empresa ativa" (topo da tela) reflete a mudança imediatamente, sem precisar recarregar a página — mesmo mecanismo já existente (store reativa)
- [ ] Nenhuma mudança nas colunas existentes nem no comportamento de clique na linha (continua navegando pro contrato)

## QA Explorer

```gherkin
Feature: Ativar empresa na sessão a partir da listagem

  Scenario: Ativar uma empresa pela lista
    Dado que o usuário superadmin/admin está em /companies
    Quando ele clica em "Ativar" na linha de uma empresa
    Então o badge "Empresa ativa" no topo passa a mostrar essa empresa
    E outras telas (Configurações, Transações, Pedidos, Catálogo, Empresa, Dispositivos) já abrem com essa empresa pré-selecionada

  Scenario: Botão de ativar não dispara a navegação da linha
    Dado que o usuário clica no botão "Ativar" de uma linha
    Então ele permanece em /companies (não é redirecionado pro contrato daquela empresa)

  Scenario: Linha da empresa ativa mostra indicador em vez de botão
    Dado que uma empresa já está ativa na sessão
    Quando o usuário olha a linha correspondente na tabela
    Então vê uma tag "Ativa" no lugar do botão "Ativar"

  Scenario: Trocar de empresa ativa
    Dado que a empresa A está ativa na sessão
    Quando o usuário clica em "Ativar" na linha da empresa B
    Então a empresa B passa a ser a ativa (badge atualiza) e a linha de A volta a mostrar o botão "Ativar"
```

## Tech Explorer

### Serviços impactados
- `frontend/admin/` — `CompanyListScreen.tsx` (única mudança; `store.ts`/`ActiveCompanyBadge` já existem do ORD-082/084, sem alteração)

### Direção técnica
Nova coluna na `columns: TableColumn<Company>[]`, mesma posição/padrão da coluna "Ação" de `PaymentsScreen.tsx` (botão condicional por linha):
```tsx
{
  key: "action", header: "Ação", render: (c) =>
    c.id === selectedCompanyId ? (
      <Tag variant="success">Ativa</Tag>
    ) : (
      <Button
        size="small"
        variant="secondary"
        onClick={(e) => { e.stopPropagation(); setSelectedCompany(c.id); }}
      >
        Ativar
      </Button>
    ),
},
```
`selectedCompanyId`/`setSelectedCompany` já vêm de `useStore` — precisam ser lidos em `CompanyListScreen.tsx` (hoje a tela não lê a store, só grava indiretamente via Dropdown de outras telas). `e.stopPropagation()` no `onClick` do botão evita que o `onRowClick` da linha (que navega pro contrato) também dispare — mesmo cuidado que outras telas com botão de ação dentro de linha clicável precisam ter (`PaymentsScreen` não precisou porque lá o clique na linha só expande/colapsa, não navega).

### Riscos
Risco muito baixo — reuso total da store e do badge já existentes e testados desde o ORD-082, única peça nova é a coluna e o `stopPropagation`.

### Estimativa
2 pontos.

## Ready

**Explorer:** [x] fluxo e critérios definidos · **QA Explorer:** [x] cenários Gherkin cobrindo ativação, troca, indicador visual e não-interferência com a navegação da linha · **Tech Explorer:** [x] solução técnica completa, reuso total de mecanismo existente · **Aprovação:** [x] pedido direto e sem ambiguidade do usuário (2026-08-11)

**Status: Ready** — pode começar a implementação.

---

## Downstream

- **To Do → In Progress:** branch `feature/ord-085-empresas-ativar-na-sessao` criada a partir de `main`.
- `CompanyListScreen.tsx`: lê `selectedCompanyId`/`setSelectedCompany` da store (`useStore`, mesma do ORD-082); nova coluna "Ação" com botão "Ativar" (`Tag variant="success"` "Ativa" quando `c.id === selectedCompanyId`), `e.stopPropagation()` no `onClick` pra não disparar a navegação da linha pro contrato.
- `tsc --noEmit` limpo. Rebuild do admin, container sobe e responde 200.
- Verificação visual no navegador **não realizada** — usuário optou por confiar em `tsc`/rebuild desta vez.
- PR aberta e mesclada em `main`.

**Status: Done**
