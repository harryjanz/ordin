---
id: ORD-094
status: Done
fase: 6
sprint: null
responsavel: Frontend
estimativa: 8 pontos
---

# ORD-094 — Configurações em abas (Segurança / PIN do totem / Aparência do totem)

## Descrição
Pedido do usuário (2026-08-17): a tela de Configurações está "encavalando vários temas" num único scroll (Minha segurança, Segurança da empresa, PIN do totem, Aparência do totem, todos empilhados) — proposta de separar em abas para ficar mais intuitivo e menos poluído. Durante o pedido, o usuário também reportou um bug ao vivo: ao ativar a política de duplo fator da empresa (opcional ou obrigatório), o card "Minha segurança" só reflete a mudança (e permite ler o QR code / executar as operações) depois de um refresh manual da tela.

## Persona
Todo usuário que acessa Configurações — `owner`/`manager`/`cashier` (empresa própria) e `superadmin`/`admin` (qualquer empresa selecionada, modo suporte).

## Contexto

### Estrutura atual
`SettingsScreen.tsx` renderiza 4 cards em sequência vertical, sem abas: "Minha segurança" (sempre visível, opera sobre o usuário logado), "PIN do totem", "Aparência do totem" e "Segurança da empresa" (esses 3 últimos só se `canManageCompany`, i.e. `owner`/`manager`/`superadmin`/`admin` — `cashier` só vê o primeiro).

### Causa raiz do bug confirmada no código
`myMfaCompanyPolicy` (estado que decide se o card "Minha segurança" mostra "duplo fator indisponível" ou o fluxo real de ativação/QR code) é preenchido por `refreshMyMfaStatus()`, chamado **só uma vez**, no `useEffect(refreshMyMfaStatus, [])` do mount (`SettingsScreen.tsx:214`). Quando o mesmo usuário muda a política de MFA da própria empresa pelo dropdown "Segurança da empresa" (`saveMfaPolicy`, linha 179-191), esse estado nunca é reinvalidado — só uma nova visita à tela (refresh) dispara o `useEffect` de novo e busca o valor atualizado. Isso bate exatamente com o relato: mudar a política pra opcional/obrigatório não atualiza o card "Minha segurança" sem F5.

**Observação de escopo:** isso só afeta quem está mudando a política da **própria** empresa (`owner`/`manager`, ou `superadmin`/`admin` cuja empresa selecionada é a própria empresa interna) — `myMfaCompanyPolicy` reflete o `mfa_policy` da empresa do usuário logado (via `/users/me/mfa/status`), não da empresa selecionada em modo suporte. Para `superadmin`/`admin` dando suporte a uma empresa cliente, os dois conceitos são independentes (não há bug ali, mas o refetch depois de salvar é inofensivo e simples de sempre disparar).

## Explorer

### História
Como usuário de Configurações, quero navegar entre "Segurança", "PIN do totem" e "Aparência do totem" em abas, em vez de rolar um único card gigante, para achar o que preciso mais rápido. Como usuário que acabou de mudar a política de duplo fator da minha empresa, quero que o card "Minha segurança" reflita isso na hora, sem precisar dar F5.

### Fluxo principal
1. Usuário abre Configurações
2. Vê 3 abas (quando tem permissão pra todas): **Segurança** (default/ativa), **PIN do totem**, **Aparência do totem**
3. Aba **Segurança** contém, empilhados: card "Minha segurança" (sempre) + card "Segurança da empresa" (só se `canManageCompany`)
4. Aba **PIN do totem** contém só o card de regenerar PIN
5. Aba **Aparência do totem** contém só o card de tema/modo/preview
6. `cashier` (não gerencia empresa) não vê a barra de abas — vai direto pro conteúdo de "Minha segurança", sem PIN/Aparência/Segurança da empresa (mesma regra de visibilidade de hoje, só sem embrulhar numa aba única)
7. Ao salvar a política de MFA da empresa em "Segurança da empresa", o card "Minha segurança" (na mesma aba, visível ou não no momento) atualiza sozinho — sem precisar trocar de aba nem dar refresh

### Fluxos alternativos / exceções
- Seletor de empresa (`superadmin`/`admin`) continua no topo da tela, fora das abas — não muda de comportamento, nem qual aba fica selecionada ao trocar de empresa
- `showEmptyState` (superadmin/admin sem empresa selecionada) continua bloqueando as abas "PIN do totem"/"Aparência do totem" com a mensagem atual; a aba "Segurança" continua acessível (o card "Minha segurança" não depende de empresa selecionada) — "Segurança da empresa" dentro dela mostra o mesmo empty state de hoje quando não há empresa selecionada
- Troca de aba não deve re-disparar requisições já carregadas (PIN/tema não recarregam ao voltar pra aba já visitada) — mesmo padrão de `CompanyScreen.tsx`, que só troca visibilidade, não desmonta

### Dependências
- Serviços envolvidos: nenhum (frontend puro, endpoints existentes reaproveitados)
- Histórias relacionadas: [[ORD-088]] (duplo fator), [[ORD-092]] (dispositivo confiável) — cards movidos de lugar, sem mudança de comportamento além do bug corrigido
- Sem histórias bloqueantes

### Critérios de aceite funcionais
- [ ] Configurações mostra 3 abas — Segurança / PIN do totem / Aparência do totem — pra quem tem acesso às 3
- [ ] `cashier` não vê barra de abas, vai direto ao conteúdo de Segurança (só "Minha segurança")
- [ ] Aba Segurança agrupa "Minha segurança" + "Segurança da empresa" (esta última só se `canManageCompany`)
- [ ] Aba ativa por padrão: Segurança
- [ ] Trocar a política de MFA da empresa atualiza o card "Minha segurança" sem F5
- [ ] Nenhuma regressão visual/funcional nos 4 cards existentes (PIN, aparência, segurança da empresa, minha segurança) — só reorganização em abas + o fix pontual
- [ ] `ConfirmDialog` de regenerar PIN continua funcionando igual

### Wireframe / Mockup
Sem mockup formal — reaproveita `Tabs`/`Tab` do design system, mesmo padrão já usado em `CompanyScreen.tsx` (`<Tabs activeTab={tab} onSelectTab={...}><Tab value="..." label="..." />...</Tabs>`, conteúdo renderizado condicionalmente abaixo por `tab === "..."`).

---

## QA Explorer

```gherkin
Feature: Configurações em abas

  Scenario: Owner vê as 3 abas com Segurança ativa por padrão
    Dado um owner autenticado abrindo Configurações
    Então vê as abas Segurança, PIN do totem e Aparência do totem
    E a aba Segurança está ativa por padrão

  Scenario: Cashier não vê barra de abas
    Dado um cashier autenticado abrindo Configurações
    Então nenhuma barra de abas aparece
    E o conteúdo exibido é só o card "Minha segurança"

  Scenario: Aba Segurança agrupa os dois cards de segurança
    Dado um owner na aba Segurança
    Então vê o card "Minha segurança" e o card "Segurança da empresa" empilhados

  Scenario: Aba PIN do totem isolada
    Dado um owner na aba PIN do totem
    Então vê só o card de regenerar PIN, sem os demais cards

  Scenario: Aba Aparência do totem isolada
    Dado um owner na aba Aparência do totem
    Então vê só o card de tema/modo/preview, sem os demais cards

  Scenario: Trocar política de MFA da empresa atualiza Minha segurança sem F5
    Dado um owner com duplo fator "desativado" na própria empresa, na aba Segurança
    Quando ele muda a política pra "opcional" ou "obrigatório"
    Então o card "Minha segurança" passa a mostrar o fluxo de ativação (botão "Ativar duplo fator")
    E isso acontece sem recarregar a página

  Scenario: Empresa não selecionada (superadmin/admin) bloqueia abas de empresa mas não Segurança
    Dado um superadmin sem nenhuma empresa selecionada
    Quando ele abre Configurações
    Então a aba Segurança mostra normalmente o card "Minha segurança"
    E as abas PIN do totem / Aparência do totem mostram o estado vazio pedindo pra selecionar uma empresa

  Scenario: Troca de aba não perde estado já carregado
    Dado um owner que já carregou o PIN gerado na aba PIN do totem
    Quando ele troca para Aparência do totem e volta para PIN do totem
    Então o PIN gerado anteriormente continua visível, sem nova chamada à API
```

---

## Tech Explorer

### Serviços impactados
- `frontend/admin/` apenas — nenhuma mudança de backend/API. `SettingsScreen.tsx` (reestruturação) + `SettingsScreen.module.scss` (estilos de abas, se necessário além do que `Tabs`/`Tab` já trazem).

### Endpoints
Nenhum alterado — reaproveita `GET/PUT /companies/{id}/security`, `GET /users/me/mfa/status`, `POST /users/me/mfa/setup|confirm|disable`, `GET/DELETE /users/me/trusted-devices`, `POST /companies/{id}/regenerate-pin`, `GET/PATCH /companies/{id}` (`appearance`), todos já existentes e sem mudança de contrato.

### Frontend — mudanças em `SettingsScreen.tsx`

**Estado novo:**
```tsx
const [tab, setTab] = useState<"security" | "pin" | "appearance">("security");
```

**Abas visíveis:** `canManageCompany` decide se as 3 abas aparecem ou se pula direto pro conteúdo de segurança sem `<Tabs>`:
```tsx
{canManageCompany ? (
  <Tabs activeTab={tab} onSelectTab={(v) => setTab(v as typeof tab)}>
    <Tab value="security" label="Segurança" />
    <Tab value="pin" label="PIN do totem" />
    <Tab value="appearance" label="Aparência do totem" />
  </Tabs>
) : null}

{(!canManageCompany || tab === "security") && (
  <>{/* card Minha segurança + card Segurança da empresa (se canManageCompany) */}</>
)}
{canManageCompany && tab === "pin" && (/* card PIN */)}
{canManageCompany && tab === "appearance" && (/* card Aparência */)}
```
Isso preserva o comportamento "sem abas pra cashier" pedido, sem duplicar a árvore de componentes — a mesma JSX de cada card só passa a ser condicionada por `tab` além de `canManageCompany`, exatamente como o padrão de troca-de-visibilidade-sem-desmontar de `CompanyScreen.tsx` (satisfaz o critério de não perder estado ao trocar de aba, já que os `useState` dos cards continuam no componente pai, não dentro de um filho que desmonta).

**Fix do bug (stale `myMfaCompanyPolicy`):** em `saveMfaPolicy`, depois do `PUT /companies/{id}/security` ter sucesso, chamar `refreshMyMfaStatus()` (já existe, só não é chamada ali):
```tsx
async function saveMfaPolicy(policy: string) {
  if (!companyId) return;
  setMfaPolicySaving(true);
  try {
    await api.put(`/companies/${companyId}/security`, { mfa_policy: policy });
    setMfaPolicy(policy);
    refreshMyMfaStatus();          // ← linha nova: revalida "Minha segurança" na hora
    makeToast("success", "Política de duplo fator atualizada.");
  } catch {
    makeToast("error", "Erro ao salvar a política. Tente novamente.");
  } finally {
    setMfaPolicySaving(false);
  }
}
```
Chamada incondicional (não só quando `companyId === ownCompanyId`) — pra `superadmin`/`admin` em modo suporte, é um refetch inofensivo do próprio status (não muda nada, já que a política alterada é de outra empresa), e evita bifurcar a lógica sem necessidade.

### Impacto em outros serviços
Nenhum.

### Eventos de fila
Não aplicável.

### Estimativa
- Frontend: 8 pontos (reestruturação de layout reaproveitando componente existente do design system + 1 fix de 1 linha)

### Riscos
- **Risco baixo:** nenhuma mudança de contrato de API, puramente reorganização de UI + 1 fix local de estado. Maior cuidado é visual/regressão de CSS ao mover os cards pra dentro de `<Tab>` — validar visualmente os 3 papéis (`owner`, `cashier`, `superadmin` com/sem empresa selecionada) antes de considerar pronto.

---

## Ready

**Explorer:** [x] fluxo, causa raiz do bug de `myMfaCompanyPolicy` e regra de visibilidade por papel documentados · **QA Explorer:** [x] 7 cenários Gherkin cobrindo abas, papéis, bug fix e persistência de estado ao trocar de aba · **Tech Explorer:** [x] mudança isolada em `SettingsScreen.tsx`, reaproveitando `Tabs`/`Tab` do design system (mesmo padrão de `CompanyScreen.tsx`) e o fix de 1 linha documentados · **Aprovação final:** [x] aprovado no chat pelo usuário (2026-08-17) — cashier sem barra de abas quando só tem acesso a Segurança (decisão confirmada via pergunta direta)

**Status: Ready** — pode começar a implementação.
