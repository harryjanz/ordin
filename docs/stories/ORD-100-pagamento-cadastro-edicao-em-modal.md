---
id: ORD-100
status: Ready
fase: 6
sprint: null
responsavel: Frontend
estimativa: 3 pontos
---

# ORD-100 — Pagamento (aba /company): cadastro e edição em modal, mesmo padrão de Terminais/Usuários

## Descrição
Pedido direto do usuário, na sequência do [[ORD-098]]/[[ORD-099]]: a aba Pagamento é a última a destoar — cartões empilhados em vez de `Table`, formulário de nova configuração sempre visível na tela, edição de credenciais também inline. Modal precisa ser um pouco maior que o de Terminais/Usuários (480px) por ter mais campos por provider (Provider + Ambiente + até 2 campos de credencial + nota).

## Persona
**Owner/manager** — mesma persona do [[ORD-098]]/[[ORD-099]].

## Explorer

### Fluxo principal
1. Owner/manager abre `/company`, aba Pagamento
2. Listagem em `Table`: Provider, Ambiente, Credenciais (resumo, mesmo texto de hoje), Status, Ações
3. "+ Nova configuração" abre `Modal` (560px) com Provider, Ambiente, campos dinâmicos do provider selecionado + nota → Salvar/Cancelar
4. "Editar credenciais" na linha abre o mesmo `Modal`, só com os campos de credencial do provider daquela config (sem Provider/Ambiente, que não mudam) — mesmo comportamento de hoje: campo vazio, placeholder "deixe em branco para manter atual", nunca reexibe o valor salvo
5. "Ativar"/"Remover" seguem como ações de linha na tabela, sem mudança de comportamento

### Critérios de aceite
- [ ] Listagem em `Table` (mesmo componente de Usuários/Terminais)
- [ ] Cadastro em `Modal` (560px), campos dinâmicos por provider preservados
- [ ] Edição de credenciais no mesmo `Modal`, sem Provider/Ambiente, mesmo texto de placeholder de hoje
- [ ] Nenhuma mudança de endpoint/payload/comportamento de segurança (credenciais nunca são reexibidas)
- [ ] Mesmo contorno do bug de foco do `Modal` (ORD-098): campos de texto livre não-controlados via `ref`

## QA Explorer

```gherkin
Feature: Pagamento — cadastro e edição em modal

  Scenario: Nova configuração via modal
    Dado o owner na aba Pagamento
    Quando clica em "+ Nova configuração", escolhe provider Mercado Pago, preenche Access Token e Salva
    Então o modal fecha e a configuração aparece na listagem como inativa

  Scenario: Trocar provider no modal atualiza os campos
    Dado o modal de nova configuração aberto com Mercado Pago selecionado
    Quando o owner troca para PayGo
    Então os campos mudam para Chave Técnica/Senha Técnica

  Scenario: Editar credenciais não reexibe valor salvo
    Dado uma configuração existente
    Quando o owner clica em "Editar credenciais"
    Então os campos aparecem vazios, com placeholder indicando "deixe em branco para manter atual"

  Scenario: Ativar e remover continuam como ações de linha
    Dado uma configuração inativa na listagem
    Quando o owner clica em "Ativar"
    Então ela vira a ativa (sem abrir modal)
```

## Tech Explorer

### Serviços impactados
- `frontend/admin/src/screens/CompanyScreen.tsx`/`.module.scss` — só frontend, endpoints de `services/company` já existem e não mudam.

### Solução
- Mesmo padrão do [[ORD-098]]/[[ORD-099]]: `paymentModalOpen`/`editConfigId`/`paymentModalKey`, um único `Modal` (`width={560}`) pra criar e editar.
- Campos de credencial (dinâmicos por provider, `type="password"`/`"text"`) viram não-controlados: em vez de um `Record<string,string>` de state, um `useRef<Record<string, HTMLInputElement | null>>({})` com `ref` callback por `f.key` — necessário porque o conjunto de campos muda por provider (não dá pra ter um `ref` fixo por campo).
- Provider/Ambiente (Dropdowns) continuam controlados — seleção discreta, não dispara o bug de foco do Modal.
- Validação (campos obrigatórios na criação, ao menos um campo preenchido na edição) sai do `disabled` reativo do botão e vira checagem no submit com mensagem de erro — mesma mudança já feita em Terminal/Usuário no ORD-098/099.
- Listagem: `Table` com colunas Provider/Ambiente/Credenciais (reaproveita `credentialLines`)/Status/Ações.
- `flash()` (mensagem de sucesso/erro pós-ação) continua igual, fora do modal.

### Riscos
- Nenhum — mesmo padrão já validado duas vezes (ORD-098/099), endpoints inalterados.

### Estimativa
3 pontos — igual ao ORD-099, um pouco mais de superfície por causa dos campos dinâmicos por provider.

## Ready

**Explorer:** [x] **QA Explorer:** [x] **Tech Explorer:** [x] **Aprovação final:** [x] aprovado no chat pelo usuário (2026-08-20)

**Status: Ready** — pode começar a implementação.

---

## Downstream

- **`frontend/admin/src/screens/CompanyScreen.tsx` (`PaymentTab`):** cartões empilhados (`.item`/`.configItem`/`.configHead`/etc.) e os dois formulários inline (nova config + editar credenciais) removidos; listagem em `Table` (Provider/Ambiente/Credenciais/Status/Ações); `Modal` único (`width={560}`, mais largo que Terminal/Usuário por causa dos campos por provider) reaproveitado pra criar (`openNewConfig`) e editar (`openEditConfig`). Provider/Ambiente só aparecem no modal na criação — edição mantém o comportamento de sempre (só troca credenciais, nunca reexibe valor salvo).
- Campos de credencial viram `fieldRefs` (`useRef<Record<string, HTMLInputElement | null>>`) em vez de `fieldValues`/`editValues` controlados — necessário porque o conjunto de campos muda por provider, então não dá pra ter refs individuais fixos. Trocar o provider limpa `fieldRefs.current`.
- Validação saiu do `disabled` reativo (`isAddValid()` removida) e virou checagem no `handleSubmit` com `Alert` de erro — mesmo padrão do ORD-098/099.
- **`CompanyScreen.module.scss`:** `.item`, `.configItem`, `.configItemActive`, `.configHead`, `.configTags`, `.configActions`, `.configLabel` removidos (sem uso em nenhuma outra tela); `.configLines`/`.configNote` mantidos (ainda usados).
- `tsc --noEmit`: limpo. `vitest run`: **48 passed**, sem regressão.
- Nenhuma mudança de backend — endpoints, payloads e comportamento de segurança (credenciais nunca reexibidas) idênticos aos de antes.
- Container `admin` reconstruído; verificação ao vivo delegada ao usuário.

### Ajuste pós-verificação (pedido do usuário)

Faltava filtro por Provider/Ambiente/Status na listagem.

- Filtro **local** (não vai ao backend) — lista de configs por empresa é sempre pequena (poucos providers × 2 ambientes), diferente de Terminais/Usuários que justificam ida ao servidor.
- `filteredConfigs` calculado a partir de `configs` + `providerFilter`/`environmentFilter`/`statusFilter`, passado como `rows` da `Table`.
- Barra de filtros (`.filterBar`, mesmo cartão de Terminal/Usuário): Provider (`PROVIDER_FILTER_OPTIONS`, novo), Ambiente (`ENVIRONMENT_FILTER_OPTIONS`, reaproveitado do ORD-098), Status (`PAYMENT_STATUS_FILTER_OPTIONS`, novo — rótulos "Ativas/Inativas/Todas" concordando com "configuração", não reaproveita `STATUS_FILTER_OPTIONS` que é "Ativos/Inativos" masculino), "Limpar filtros" e "+ Nova configuração" (movido pra dentro da barra, mesma posição de Terminal/Usuário).
- **Default do Status é "Todas"**, diferente do padrão "Ativos" de Usuários/Terminais — decisão deliberada: só uma config fica ativa por vez, então esconder inativas por padrão esconderia a maioria das configs cadastradas (comportamento errado pra esse caso, ao contrário de usuário/terminal onde inativo é exceção).
- `tsc --noEmit` limpo, `vitest run`: 48 passed. Container `admin` reconstruído de novo.

### Bug real encontrado e corrigido (relato do usuário: "ativar e inativar não está atualizando a listagem")

Reproduzido ao vivo no Chrome: com Status filtrado em "Inativas", clicar "Ativar" na config inativa visível funcionava no backend (confirmado via reload manual), mas a linha simplesmente **sumia** da tabela — porque ela deixou de ser inativa e o filtro client-side a excluiu, sem nenhuma pista visual de que a ativação (e a desativação da config anterior) tinha acontecido. Parecia que "nada mudou" quando na verdade o filtro é que escondeu a mudança. `handleActivate` agora reseta `statusFilter` pra `"all"` depois de ativar — como a ação sempre afeta duas linhas ao mesmo tempo (a que ativa e a que desativa), voltar pra "Todas" é o único jeito de mostrar as duas mudanças na mesma tela. `handleDelete`/`handleSubmit` não precisaram do mesmo ajuste (remover e editar credenciais não mudam o `active` de nenhuma outra linha).
- `tsc --noEmit` limpo, `vitest run`: 48 passed. Container `admin` reconstruído e correção confirmada ao vivo no Chrome (Ativar/Desativar alternando entre duas configs com filtro "Todas" visível o tempo todo).
