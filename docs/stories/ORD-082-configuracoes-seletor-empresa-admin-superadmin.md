---
id: ORD-082
status: Done
fase: 6
sprint: null
responsavel: Frontend
estimativa: 5 pontos
---

# ORD-082 — Configurações: seletor de empresa pra admin/superadmin, botão "Salvar aparência" no padrão do design system

## Descrição
Pedido do usuário: hoje `superadmin`/`admin` acessam `/settings` (Config.) sem nenhum jeito de escolher **qual** empresa estão configurando — o PIN e a aparência do totem que a tela mostra/edita são sempre da mesma empresa, silenciosamente. Objetivo: adicionar um seletor de empresa (mesmo padrão de Transações/Pedidos) pra esses dois roles poderem administrativamente gerar PIN e trocar aparência do totem de qualquer empresa cliente. Pedido também: ajustar o botão "Salvar aparência" pro padrão do design system, e busca de melhorias de UX na tela como um todo.

**Achado crítico não pedido, descoberto na investigação:** o mecanismo de "empresa selecionada" **já existe** no código (`store.ts` — `selectedCompanyId`/`setSelectedCompany`) e já é consumido por **três telas** (`SettingsScreen.tsx:79`, `CompanyScreen.tsx:385`, `PairScreen.tsx:9`, todas com `useStore((s) => s.selectedCompanyId ?? s.companyId)`) — mas nenhuma delas tem um seletor próprio. A única tela que tenta oferecer esse seletor é o `DashboardScreen.tsx:55`, e ele está atrás de `role === "admin"` (`DashboardScreen.tsx:16,55`) — role que, confirmado nesta mesma sessão (investigação do PIN), **não existe em nenhum usuário real do seed** e não é o mesmo conceito de "gestão da plataforma" que este projeto adotou (`docs/ARQUITETURA.md` §1.2: `superadmin`/`admin` equivalentes). Ou seja: o seletor de empresa nunca funcionou de verdade pra ninguém — as três telas (Config., Empresa, Dispositivos) sempre operaram silenciosamente sobre a própria `company_id` do token de quem está logado (para superadmin, `company_id=1`/Burger House, artefato do seed), sem forma de trocar. Mesma classe de bug silencioso já corrigida duas vezes nesta sessão (cancelamento de transação, listagem de pedidos) — aqui afeta três telas de uma vez, pela mesma causa raiz.

## Persona
**Superadmin/admin** (gestão da plataforma) precisam, no dia a dia de suporte, gerar/regenerar o PIN de uma empresa cliente específica ou ajustar a aparência do totem dela — sem esse seletor, isso hoje só é possível fazendo login como um usuário daquela empresa (não deveria ser necessário, já que esses dois roles existem justamente pra administrar a plataforma). **Owner/manager** não são afetados — continuam vendo só a própria empresa, sem seletor (correto, é o comportamento já esperado).

## Contexto

### Achado 1 — sem seletor, `companyId` sempre a própria empresa do token
`SettingsScreen.tsx:79` — `const companyId = useStore((s) => s.selectedCompanyId ?? s.companyId);` — sem nenhuma UI que chame `setSelectedCompany`, `selectedCompanyId` fica `null` pra sempre (exceto o valor inicial copiado do próprio JWT no login, `store.ts:53`), então o fallback `?? s.companyId` sempre vence. Pra superadmin, isso é `company_id=1` (Burger House, artefato do seed) — nunca outra empresa.

### Achado 2 — o seletor "existe", mas está morto (`DashboardScreen`)
`DashboardScreen.tsx:16` (`if (role === "admin")`) e `:55` (`{role === "admin" && companies.length > 0 && (...)}`) — o único lugar que chama `setSelectedCompany` (`:61`) está condicionado a um role que não corresponde a nenhum usuário real. Corrigir só esse `if` já destravaria as três telas (`Company`, `Pair`, `Settings`) — mas isso resolveria via Dashboard, não diretamente em Configurações como pedido. Ver decisão técnica abaixo.

### Achado 3 — "Salvar aparência" não usa o componente `Button`
`SettingsScreen.tsx:210-222` — `<button className={styles.saveBtn} style={{...cores do tema do totem...}}>` — HTML cru, sem o comportamento de `loading` que o design system já dá de graça (usado duas linhas acima, no botão "Regenerar PIN": `SettingsScreen.tsx:145`, `<Button ... loading={pinLoading}>`). Duplica manualmente o texto "Salvando…" (`:221`) em vez de usar o spinner nativo do `Button`. É uma inconsistência **dentro da mesma tela** — dois botões, dois padrões.

### Achado 4 — emoji ☀️/🌙 de novo, dessa vez no toggle de modo do totem
`SettingsScreen.tsx:197` — `{m === "light" ? "☀️ Claro" : "🌙 Escuro"}` — mesmo padrão de emoji nativo que o `ORD-076` corrigiu no sidebar/login do próprio admin (trocado pelo componente `Toggle` do design system). Aqui é conceitualmente diferente (é o modo do **totem**, não do admin), mas é a mesma violação visual: emoji colorido misturado com o resto da interface monocromática do DS.

### Achado 5 — copy desatualizada (achada durante a investigação do PIN, sessão anterior)
`SettingsScreen.tsx:142` — "O PIN de 4 dígitos é usado **pelos clientes** para acessar o cardápio no quiosque" — impreciso, o PIN é usado pelo operador/staff da loja pra logar o totem, não pelo cliente final. `:160` — "O totem aplica a configuração automaticamente após o login com PIN" — desatualizado, hoje o login padrão do totem é pareamento por QR/código (ORD-042), PIN é fallback.

### Por que não apareceu antes
Ninguém testou como superadmin gerenciando uma empresa que não fosse a `company_id` do próprio token — o seed só tem um superadmin, artificialmente amarrado à Burger House. O bug do `role === "admin"` no Dashboard provavelmente é resíduo de uma nomenclatura de roles anterior à separação atual `superadmin`/`admin`/`owner`/`manager`/`cashier`.

---

## Explorer

### História
Como **superadmin/admin**, quero escolher qual empresa estou configurando na tela de Configurações, para gerar/regenerar PIN e ajustar aparência do totem de qualquer empresa cliente sem precisar logar como um usuário dela.

### Fluxo principal
1. Superadmin/admin abre `/settings`
2. Vê um seletor de empresa no topo da tela (mesmo padrão visual de Empresa em Transações/Pedidos)
3. Escolhe uma empresa — os cards de PIN e Aparência passam a refletir os dados dela
4. Gera/regenera PIN ou salva aparência normalmente, agora explicitamente escopado à empresa escolhida
5. Owner/manager não veem esse seletor — comportamento inalterado

### Critérios de aceite
- [x] Seletor de empresa (`Dropdown` + `listCompanies()`, mesmo padrão de `PaymentsScreen`/`OrdersScreen`) visível só pra `superadmin`/`admin`
- [x] Selecionar uma empresa chama `setSelectedCompany` (store global) — `CompanyScreen`/`PairScreen` passam a refletir a mesma escolha automaticamente, de graça, sem tocar nesses dois arquivos
- [x] Sem empresa selecionada, mostra estado vazio claro (não card de PIN/aparência de uma empresa arbitrária sem o usuário saber qual)
- [x] `DashboardScreen.tsx:16,55` corrigido de `role === "admin"` pra `isPlatformAdmin` (mesmo padrão de `PaymentsScreen`/`OrdersScreen` desta sessão) — mesma causa raiz do Achado 2, resolve o seletor do Dashboard junto
- [x] Botão "Salvar aparência" migra pro componente `Button` do design system, com `loading={saving}` — **ajustado em revisão ao vivo:** usuário pediu o mesmo visual padrão de "Regenerar PIN", sem cor custom do tema do totem (removida a prop `style` que preservava a cor)
- [x] Toggle de modo claro/escuro do totem usa o componente `Toggle` do design system em vez de emoji — **confirmado no código:** `themes.ts:23`, `modes: Record<ThemeMode, ThemeTokens>` obriga TypeScript a exigir claro E escuro em todo tema; os 3 temas do registro têm os dois completos, sem exceção mono-modo. `Toggle` binário encaixa sem ressalva.
- [x] Copy corrigida: "usado pelos clientes" → referência à equipe da loja; menção a "login com PIN" generalizada pra "próximo login" (cobre pareamento também)
- [x] Owner/manager continuam sem seletor, comportamento idêntico ao atual

**Critérios adicionados em revisão ao vivo (escopo ampliado pelo usuário depois de testar a primeira entrega):**
- [x] `CompanyScreen`/`PairScreen` mostram o nome da empresa ativa (subtítulo) — usuário reportou que a sessão "não fazia diferença" ao navegar; investigado: a leitura já funcionava, só não havia nenhuma indicação visual de qual empresa estava ativa em nenhuma das duas telas
- [x] `PaymentsScreen`/`OrdersScreen` migrados de `useState` local pra `selectedCompanyId`/`setSelectedCompany` — a sessão agora vale nos dois sentidos entre as 5 telas (Configurações/Empresa/Dispositivos/Transações/Pedidos), não só Configurações → Empresa/Dispositivos como na primeira entrega
- [x] Badge fixo no canto superior direito (`ActiveCompanyBadge`, novo componente), visível em toda a área autenticada, mostrando a empresa ativa com opção de remover a sessão (`setSelectedCompany(null)`)

### Wireframe / Mockup
Não desenhei protótipo novo — reaproveita a estrutura de filtro de empresa já aprovada em `PaymentsScreen.tsx`/`OrdersScreen.tsx` (`.field` com `Dropdown`), adaptada pra um único campo no topo da página em vez de uma barra de filtros completa (aqui não há lista/tabela pra filtrar, é seleção de contexto pra edição).

---

## QA Explorer

```gherkin
Feature: Seletor de empresa em Configurações

  Scenario: Superadmin/admin veem o seletor de empresa
    Dado que o usuário logado é superadmin ou admin
    Quando ele abre /settings
    Então vê um campo de seleção de empresa no topo da tela

  Scenario: Owner/manager não veem o seletor
    Dado que o usuário logado é owner ou manager
    Quando ele abre /settings
    Então não vê nenhum campo de seleção de empresa
    E os cards de PIN/aparência mostram a própria empresa, como hoje

  Scenario: Trocar de empresa atualiza PIN e aparência
    Dado que o superadmin selecionou a empresa "Pasta & Co"
    Quando ele clica em "Regenerar PIN"
    Então o PIN gerado é da Pasta & Co, não da empresa anterior

  Scenario: Seleção de empresa é compartilhada entre telas
    Dado que o superadmin selecionou "Pasta & Co" em Configurações
    Quando ele navega pra "Empresa" ou "Dispositivos"
    Então essas telas já mostram a Pasta & Co selecionada, sem precisar escolher de novo

  Scenario: Sem empresa selecionada
    Dado que o superadmin ainda não escolheu nenhuma empresa
    Quando ele abre /settings
    Então vê um estado vazio explícito, não os dados de uma empresa arbitrária

  Scenario: Botão "Salvar aparência" mostra loading nativo
    Quando o usuário clica em "Salvar aparência"
    Então o botão mostra o spinner de loading do design system (não o texto "Salvando…")
    E fica desabilitado durante o salvamento
```

---

## Tech Explorer

### Serviços impactados
- `frontend/admin/` apenas — `SettingsScreen.tsx`, `SettingsScreen.module.scss`, `DashboardScreen.tsx` (fix de 2 linhas). Zero mudança de backend (os endpoints já aceitam `company_id` via path param, `/companies/{id}/regenerate-pin` e `/companies/{id}/appearance` já existem e já funcionam pra qualquer empresa — só o frontend nunca deixou escolher qual).

### Diagnóstico técnico (confirmado no código)
| Achado | Evidência |
|---|---|
| Sem seletor em Settings/Company/Pair | `SettingsScreen.tsx:79`, `CompanyScreen.tsx:385`, `PairScreen.tsx:9` — todos `selectedCompanyId ?? companyId`, nenhum com UI de seleção própria |
| Único seletor existente está morto | `DashboardScreen.tsx:16,55` — `role === "admin"`, role sem usuário real no seed (confirmado na investigação do PIN, mesma sessão) |
| "Salvar aparência" não é `Button` | `SettingsScreen.tsx:210-222` — `<button className={styles.saveBtn}>` cru |
| Emoji no toggle de modo | `SettingsScreen.tsx:197` |

### Direção técnica proposta

**Seletor de empresa em `SettingsScreen.tsx`:**
```tsx
const role = useStore((s) => s.role);
const isPlatformAdmin = role === "superadmin" || role === "admin";
const selectedCompanyId = useStore((s) => s.selectedCompanyId);
const setSelectedCompany = useStore((s) => s.setSelectedCompany);
const companyId = isPlatformAdmin ? selectedCompanyId : useStore((s) => s.companyId);

const [companies, setCompanies] = useState<Company[]>([]);
useEffect(() => {
  if (isPlatformAdmin) listCompanies({ limit: 200 }).then((r) => setCompanies(r.companies)).catch(() => null);
}, [isPlatformAdmin]);
```
Mesmo padrão de `listCompanies`/`Dropdown` já usado em `PaymentsScreen`/`OrdersScreen`. Diferença chave: aqui a seleção escreve no **store global** (`setSelectedCompany`), não num `useState` local — é o que propaga automaticamente pra `CompanyScreen`/`PairScreen` sem tocar nesses arquivos.

**`DashboardScreen.tsx` — fix de causa raiz:**
```diff
- if (role === "admin") {
+ if (role === "superadmin" || role === "admin") {
    api.get("/companies")...
  }
...
- {role === "admin" && companies.length > 0 && (
+ {(role === "superadmin" || role === "admin") && companies.length > 0 && (
```
Duas linhas, mesma causa raiz do Achado 2 — resolve o Dashboard de brinde.

**Botão "Salvar aparência":**
```tsx
<Button
  onClick={saveAppearance}
  disabled={!companyId}
  loading={saving}
  style={{ background: previewTheme.btn, color: previewTheme.btnText, boxShadow: previewTheme.glow }}
>
  Salvar aparência
</Button>
```
`Button` aceita `style` (não `className`, gotcha já documentado) — preserva a cor do tema do totem sem perder o comportamento nativo de loading/disabled do design system.

### Riscos
- Migrar `setSelectedCompany` pra ser setado a partir de Settings (não só do Dashboard) é uma mudança de comportamento pequena mas real — qualquer lugar que hoje dependa implicitamente de `selectedCompanyId` ficar `null` até o Dashboard ser visitado passa a poder ser setado direto de Settings. Não identifiquei nenhum lugar que dependa disso ficar `null`, mas vale o QA conferir Company/Pair depois da mudança.
- Fix do `DashboardScreen` é isolado e de baixíssimo risco (2 linhas, mesma condição em 2 lugares).

### Estimativa
5 pontos — seletor novo (reuso de padrão já validado) + fix de 2 linhas no Dashboard + migração do botão pro `Button` + troca do toggle de modo pro `Toggle` do DS.

---

## Sugestões de UX pra revisão do usuário

1. **Seletor de empresa — decidido com o usuário (2026-08-11), escopo ampliado depois de testar a primeira entrega:** cada tela mantém autonomia total de UI/layout pro próprio seletor (sem componente visual compartilhado tipo `CompanyContextBar`) — mas todas leem/escrevem o **mesmo valor de sessão** (`selectedCompanyId`/`setSelectedCompany` do store), não um `useState` local isolado. Na entrega inicial, só `SettingsScreen` usava a sessão (`CompanyScreen`/`PairScreen` já liam, de graça). Ao testar, o usuário pediu que `PaymentsScreen`/`OrdersScreen` também passassem a usar a sessão nos dois sentidos — feito: as 5 telas agora compartilham `selectedCompanyId`, cada uma com seu próprio Dropdown/filtro, sem componente forçado em comum. Também pediram um indicador sempre visível (badge no canto superior direito) em vez de depender só do subtítulo por tela — implementado como componente novo (`ActiveCompanyBadge`), com opção de remover a seleção.
2. **Modo claro/escuro do totem — `Toggle` do DS.** Confirmado: todos os temas suportam os dois modos (`themes.ts:23`), então o `Toggle` encaixa sem ressalva — mesmo ganho de consistência do ORD-076, aplicado agora à aparência do totem.
3. **Estado vazio "nenhuma empresa selecionada"** — hoje, sem seletor, a tela sempre mostra dados de alguma empresa (mesmo que "errada"). Com o seletor, existe pela primeira vez a possibilidade de não ter nada selecionado. Sugiro um estado vazio explícito ("Selecione uma empresa para gerenciar PIN e aparência") em vez de deixar os cards em branco ou com erro de request — mais claro que a tela está funcionando, só esperando uma escolha.
4. **Preview ao vivo já é um ponto forte da tela** — não mexi nisso, só registro que é um bom padrão (mudança reflete no preview antes de salvar) que outras telas do admin não têm; não é uma sugestão de mudança, é um elogio ao que já existe.

---

## Ready

**Explorer:** [x] fluxo, persona e critérios de aceite definidos, achado crítico do seletor morto documentado · **QA Explorer:** [x] cenários cobrindo os dois roles, propagação entre telas, estado vazio e comportamento do botão · **Tech Explorer:** [x] diagnóstico com evidência de código, direção técnica com diffs propostos, dúvida do Toggle resolvida direto no código (`themes.ts`) · **Aprovação final:** [x] aprovado no chat pelo usuário (2026-08-11) — seletor com autonomia visual por tela mas valor de sessão compartilhado (`selectedCompanyId`), escopo desta história limitado a `SettingsScreen` (Payments/Orders ficam pra depois, a critério do usuário)

**Status: Ready** — pode começar a implementação.

---

## Downstream

Fluxo simplificado de dev único, sem revisor formal nem branch protection (ver `docs/WORKFLOW.md`).

- Branch `feature/ord-082-settings-company-selector` criada a partir de `main`.
- Implementação em 4 commits, refletindo o ciclo real de revisão ao vivo do usuário:
  1. Seletor em `SettingsScreen` + fix do `DashboardScreen` + `Button`/`Toggle` do DS + copy corrigida
  2. Ajuste do botão "Salvar aparência" pro mesmo padrão visual de "Regenerar PIN" (sem cor custom)
  3. Nome da empresa ativa em `CompanyScreen`/`PairScreen` — usuário reportou que a sessão "não fazia diferença" ao navegar; causa raiz era falta de indicação visual, não bug de estado
  4. Escopo ampliado: `PaymentsScreen`/`OrdersScreen` migrados pra sessão compartilhada + `ActiveCompanyBadge` (indicador fixo global com opção de remover a seleção)
- `tsc --noEmit` limpo em todos os commits.
- Verificado ao vivo pelo usuário no navegador, com 2 rodadas de ajuste no mesmo ciclo (botão, depois indicação visual + escopo ampliado).
- PR aberta e mesclada em `main`.

**Status: Done**
