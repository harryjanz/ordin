---
id: ORD-099
status: Done
fase: 6
sprint: null
responsavel: Frontend
estimativa: 3 pontos
---

# ORD-099 — Usuários (aba /company): cadastro e edição em modal, mesmo padrão de Terminais

## Descrição
Pedido direto do usuário, na sequência do [[ORD-098]]: depois de mover o cadastro/edição de Terminais pra modal, a aba Usuários ficou destoando — é a única aba de `/company` com formulário sempre visível na tela (convite + edição), enquanto o resto do app (Terminais, Catálogo) usa modal. Poucos campos em ambos os formulários (Nome/E-mail/Papel na criação, Nome/Papel na edição), então a troca é puramente de padrão visual, sem mudança de comportamento.

## Persona
**Owner/manager** — mesma persona do [[ORD-086]]/[[ORD-089]].

## Explorer

### Fluxo principal
1. Owner/manager abre `/company`, aba Usuários
2. Barra de filtros (Nome/E-mail/Papel/Status) ganha o botão "+ Novo usuário" ao lado de "Limpar filtros" — mesma posição do "+ Novo terminal" no ORD-098
3. Clica em "+ Novo usuário" → abre `Modal` com Nome completo, E-mail, Papel (+ aviso "sem senha aqui...") → Salvar ou Cancelar
4. Ação "Editar" na tabela abre o mesmo `Modal`, sem o campo E-mail (não é editável — mesmo comportamento de hoje, `saveEditUser` só manda `name`/`role`)

### Critérios de aceite
- [ ] Formulário de convite (Nome/E-mail/Papel) sai da tela, vira `Modal`
- [ ] Formulário de edição (Nome/Papel) sai da tela, vira o mesmo `Modal` (sem E-mail)
- [ ] Botão "+ Novo usuário" na barra de filtros, mesma posição do padrão de Terminais
- [ ] Nenhuma mudança de comportamento nos endpoints chamados (`POST`/`PUT /companies/{id}/users`, payloads idênticos aos de hoje)
- [ ] Mesmo contorno do bug de foco do `Modal` (ORD-098): campos de texto livre não-controlados via `ref`

## QA Explorer

```gherkin
Feature: Usuários — cadastro e edição em modal

  Scenario: Convidar usuário via modal
    Dado o owner na aba Usuários
    Quando clica em "+ Novo usuário", preenche Nome/E-mail/Papel e Salva
    Então o modal fecha e o usuário aparece na listagem como "Convite pendente"

  Scenario: Cancelar não convida ninguém
    Dado o modal de novo usuário aberto com campos preenchidos
    Quando o owner clica em Cancelar
    Então nenhum usuário novo é criado

  Scenario: Editar usuário via modal, sem campo de e-mail
    Dado um usuário existente
    Quando o owner clica em "Editar"
    Então o modal abre com Nome e Papel preenchidos, sem campo de E-mail
    E ao salvar, só nome/papel são atualizados
```

## Tech Explorer

### Serviços impactados
- `frontend/admin/src/screens/CompanyScreen.tsx`/`.module.scss` — só frontend, endpoints de `services/company` já existem e não mudam.

### Solução
- Reaproveita exatamente o padrão do [[ORD-098]]: `userModalOpen`/`editingUserId`/`userModalKey` (contador incrementado a cada abertura, força remontar os campos não-controlados) + `Modal` único pra criar/editar.
- Nome (texto livre) vira input não-controlado (`ref` + `defaultValue`), mesmo contorno do bug de foco do `Modal` do design system já documentado no ORD-098.
- E-mail (só aparece na criação) também não-controlado.
- Papel (Dropdown) continua controlado — seleção discreta, não dispara o bug.
- Remove `newUser`/`editUserId`/`editUserValues`/`editUserSaving` e o JSX de `.inviteUserRow`/`.editUserRow`; `.form`/`.inviteUserRow`/`.editUserRow` no SCSS ficam órfãos e são removidos junto (não usados em nenhuma outra tela).

### Riscos
- Nenhum — mesmo padrão já validado e testado no ORD-098, endpoints inalterados.

### Estimativa
3 pontos — menor que o ORD-098 (não precisa de mudança de backend nem filtro novo, só aplicar o padrão de modal já pronto).

## Ready

**Explorer:** [x] **QA Explorer:** [x] **Tech Explorer:** [x] **Aprovação final:** [x] aprovado no chat pelo usuário (2026-08-20)

**Status: Ready** — pode começar a implementação.

---

## Downstream

- **`frontend/admin/src/screens/CompanyScreen.tsx`:** removidos `newUser`/`editUserId`/`editUserValues`/`editUserSaving`, `addUser`/`saveEditUser` e o JSX de `.inviteUserRow`/`.editUserRow`; novo `Modal` único (`userModalOpen`/`editingUserId`/`userModalKey`) reaproveitado pra criar (`openNewUser`) e editar (`openEditUser`), `saveUser` unificando os dois `POST`/`PUT`. Nome e E-mail não-controlados via `ref` (mesmo contorno do bug de foco do `Modal` do ORD-098); Papel continua controlado. Campo E-mail só aparece na criação — edição segue mandando só `name`/`role`, sem mudança de payload. Botão "+ Novo usuário" entrou na `.filterBar`, ao lado de "Limpar filtros" (mesma posição do "+ Novo terminal" no ORD-098).
- **`CompanyScreen.module.scss`:** `.inviteUserRow`/`.editUserRow` removidos (sem uso em nenhuma outra tela).
- `tsc --noEmit`: limpo. `vitest run`: **48 passed**, sem regressão.
- Nenhuma mudança de backend — endpoints e payloads idênticos aos de antes.
- Container `admin` reconstruído; verificação ao vivo desta rodada delegada ao usuário (mesmo formato do ajuste anterior no ORD-098).

### Regressão encontrada e corrigida (relato do usuário: "quebrou o cadastro em /platform-users")

A afirmação acima — "`.inviteUserRow`/`.editUserRow` removidos (sem uso em nenhuma outra tela)" — estava **errada**: `PlatformUsersScreen.tsx` (ORD-093) reaproveita de propósito o mesmo `CompanyScreen.module.scss` (comentário no topo do arquivo: "clone estrutural da aba Usuários, sem duplicar classes CSS") e ainda usa as duas classes no formulário inline de convite/edição de usuário de plataforma, que eu não tinha conferido antes de remover. Corrigido restaurando as duas classes no `CompanyScreen.module.scss` (com comentário explicando a dependência cruzada, pra não repetir o erro), sem tocar em `PlatformUsersScreen.tsx`. Conferido também que nenhuma das classes removidas no ORD-100 (`.item`/`.configItem`/etc.) tinha o mesmo problema — checagem cruzada de todas as classes usadas por `PlatformUsersScreen.tsx` contra o stylesheet, sem nenhuma faltando. `tsc`/`vitest` limpos, verificado ao vivo em `/platform-users`.
