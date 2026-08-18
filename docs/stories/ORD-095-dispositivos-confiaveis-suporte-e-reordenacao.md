---
id: ORD-095
status: Ready
fase: 6
sprint: null
responsavel: Backend + Frontend
estimativa: 18 pontos
---

# ORD-095 — Remover dispositivo confiável na tela de Usuários + cascata ao desativar 2FA da empresa + reorganização da aba Segurança

## Descrição
Extensão do ORD-094, descoberta durante a verificação ao vivo da aba Segurança: quando `admin`/`superadmin` está em modo suporte (empresa cliente selecionada), o card "Minha segurança" mostra o status de 2FA da **própria conta administrativa** (empresa interna da plataforma, ORD-093) — irrelevante nesse contexto. Primeira proposta (revisada no chat, 2026-08-17) era criar uma tabela de "dispositivos confiáveis da empresa" dentro de Configurações; o usuário questionou se não fazia mais sentido ficar em outro lugar — decisão final: a ação de remover dispositivo confiável de outro usuário (`owner`/`manager` da própria equipe, `admin`/`superadmin` de qualquer empresa em modo suporte) fica na tela de **Usuários** (`CompanyScreen.tsx`), ao lado de "Desativar 2FA", não em Configurações. Configurações fica mais simples: em modo suporte, a mensagem de 2FA pessoal só some, sem ser substituída por nada.

**Dois detalhes adicionais confirmados no chat (2026-08-17) antes da implementação:**
1. Desativar o 2FA de um usuário (individualmente, pela tela de Usuários ou por `/platform-users`) já revoga os dispositivos confiáveis dele em cascata — **comportamento já existente** (`_clear_mfa`, ver Contexto), confirmado por leitura de código, sem necessidade de mudança.
2. **Novo nesta história:** desativar a política de 2FA de uma empresa inteira (`mfa_policy: "disabled"` em Configurações → Segurança da empresa) deve remover o 2FA e os dispositivos confiáveis de **todos os usuários daquela empresa em cascata** — hoje isso só muda a política, sem tocar no 2FA individual de ninguém, deixando usuários com 2FA configurado mesmo depois da empresa "desligar" o recurso. Como essa ação é destrutiva e afeta todo mundo de uma vez, precisa de um modal de confirmação (Confirmar/Cancelar) antes de aplicar.

## Persona
`owner`/`manager` (gerencia dispositivos confiáveis da própria equipe — hoje só o próprio usuário conseguia revogar o próprio dispositivo) e `superadmin`/`admin` em modo suporte (mesma ação, qualquer empresa).

## Contexto

### Por que não é a mesma ação que "Desativar 2FA"
`_clear_mfa` (`services/company/main.py:1686`) já revoga todos os dispositivos confiáveis do usuário como efeito colateral de desativar o 2FA — mas desativar o 2FA também apaga o segredo TOTP e os códigos de backup, obrigando a pessoa a configurar o 2FA do zero. O caso de uso aqui é mais estreito e mais comum na prática (achado nesta conversa): **notebook roubado/perdido, ou sessão de navegador comprometida** — a pessoa continua com 2FA ativo e configurado, só precisa provar a identidade de novo no próximo login naquele navegador. Precisa de uma ação nova, separada, que revoga só os dispositivos confiáveis, sem tocar no 2FA em si.

### Por que na tela de Usuários, não em Configurações
`owner`/`manager`/`admin`/`superadmin` já vão à aba Usuários pra gerenciar uma pessoa específica (editar, desativar, resetar 2FA) — colocar "remover dispositivo confiável" ali, condicionado a essa pessoa já ter um ativo, segue o mesmo padrão de affordance de `mfa_enabled`/"Desativar 2FA" já existente na mesma linha, em vez de criar uma segunda superfície de gestão em Configurações.

### Indicador `has_trusted_device`
`UserOut` não tem hoje nenhum campo que diga "este usuário tem um dispositivo confiável ativo" — precisa ser calculado (não é coluna de `User`, é derivado de `TrustedDevice`). Resolvido com uma query em lote (não N+1): busca todos os `user_id` com `TrustedDevice.revoked_at IS NULL` dentro do conjunto de usuários já filtrado/paginado, e monta um `set` pra checagem O(1) por linha.

### Fora de escopo (decisão consciente)
`PlatformUsersScreen.tsx` (usuários da própria plataforma, ORD-093) não ganha a ação de remover dispositivo confiável por linha nesta história — o pedido foi especificamente sobre gerenciar dispositivo confiável de usuários de empresas clientes. Pode virar história própria se necessário. (A cascata de desativar 2FA da empresa, item 2 acima, é sobre `Company.mfa_policy` — não tem equivalente de "política de empresa" pra usuários de plataforma, então não se aplica a `PlatformUsersScreen` de nenhuma forma.)

### Cascata ao desativar a política da empresa
`PUT /companies/{company_id}/security` hoje só grava `Company.mfa_policy` — não toca em nenhum usuário. Quando o valor novo é `"disabled"`, passa a buscar todos os usuários da empresa com `totp_enabled_at IS NOT NULL` (checagem em SQL — `mfa_enabled` é `@property` calculada, não coluna) e chama `_clear_mfa` pra cada um, reaproveitando exatamente a mesma função já usada nos resets individuais — sem duplicar lógica de limpeza.

---

## Explorer

### História
Como `owner`/`manager` da minha empresa, quero poder revogar o dispositivo confiável de um funcionário (ex: notebook perdido) sem precisar desativar o 2FA dele inteiro. Como `admin`/`superadmin` dando suporte a uma empresa cliente, quero a mesma ação, na mesma tela de Usuários que já uso pra outras ações administrativas. Como qualquer um desses papéis olhando Configurações em modo suporte, não quero ver informação sobre o 2FA da minha própria conta administrativa — irrelevante ali.

### Fluxo principal
1. `owner`/`manager` (própria empresa) ou `admin`/`superadmin` (qualquer empresa, modo suporte) abre a aba Usuários
2. Usuário com dispositivo confiável ativo mostra o botão "Remover dispositivo confiável" na coluna de ações, ao lado de "Desativar 2FA" (quando aplicável)
3. Clicar revoga **todos** os dispositivos confiáveis ativos daquele usuário (ação única, sem seletor de dispositivo individual — mesmo espírito de simplicidade do "Desativar 2FA")
4. Botão some da linha depois da ação (usuário não tem mais dispositivo confiável ativo)
5. Próximo login desse usuário no navegador antes confiável volta a exigir 2FA normalmente (se ele tiver 2FA ativo)
6. Em Configurações → aba Segurança, `admin`/`superadmin` com empresa selecionada não vê mais nenhuma menção ao 2FA da própria conta — só o card "Segurança da empresa"
7. `owner`/`manager`/`cashier` e `admin`/`superadmin` sem empresa selecionada continuam vendo "Minha segurança" (2FA pessoal) normalmente, com "Segurança da empresa" (quando aplicável) reordenada pra vir **antes**
8. Ao selecionar "Desativado" no dropdown "Segurança da empresa" (vindo de "opcional"/"obrigatório"), um `ConfirmDialog` avisa que isso remove o 2FA e os dispositivos confiáveis de todos os usuários da empresa, com Confirmar/Cancelar — só aplica a mudança se confirmado; "Cancelar" mantém a política como estava
9. Ao confirmar, a empresa passa a `mfa_policy: "disabled"` e todo usuário dessa empresa com 2FA ativo tem o TOTP/códigos de backup apagados e os dispositivos confiáveis revogados — mesmo efeito de um reset individual, só que pra empresa inteira de uma vez

### Fluxos alternativos / exceções
- Usuário sem dispositivo confiável ativo: nenhum botão aparece (mesmo padrão condicional de "Desativar 2FA" quando `!mfa_enabled`)
- Isolamento multi-tenant: `owner`/`manager` só revoga dispositivo de usuário da própria empresa; `admin`/`superadmin` de qualquer empresa, mas sempre validando que o usuário pertence à `company_id` da URL
- Cashier nunca vê essa ação (não gerencia outros usuários)

### Dependências
- Serviços envolvidos: `company` (1 endpoint novo, 1 campo derivado em `list_users`), `frontend/admin` (`CompanyScreen.tsx`, `SettingsScreen.tsx`)
- Histórias relacionadas: [[ORD-092]] (dispositivo confiável — base de dado, `_clear_mfa` reaproveitado como referência de revogação), [[ORD-094]] (abas — ainda não commitada, ORD-095 continua no mesmo branch/trabalho em andamento)
- Sem histórias bloqueantes

### Critérios de aceite funcionais
- [ ] `GET /companies/{id}/users` retorna `has_trusted_device` por usuário
- [ ] Botão "Remover dispositivo confiável" aparece na linha do usuário só quando `has_trusted_device === true`
- [ ] Ação revoga todos os dispositivos confiáveis ativos do usuário, sem alterar `mfa_enabled`/segredo TOTP/códigos de backup
- [ ] `owner`/`manager` só conseguem revogar dispositivo de usuário da própria empresa; tentativa cross-tenant retorna 404
- [ ] Lista atualiza sem F5 depois da ação (botão some)
- [ ] Configurações → aba Segurança: `admin`/`superadmin` com empresa selecionada não vê nenhum card/mensagem sobre o próprio 2FA
- [ ] Configurações → aba Segurança: "Segurança da empresa" renderizada antes de "Minha segurança" pra quem vê os dois
- [ ] Nenhuma regressão no fluxo de 2FA pessoal (ativar/desativar/backup codes) pra quem continua vendo o card "Minha segurança"
- [ ] Selecionar "Desativado" na política da empresa (vindo de outro valor) abre `ConfirmDialog` antes de salvar; "Cancelar" não muda nada
- [ ] Confirmar a desativação zera `totp_secret`/`totp_enabled_at`, apaga códigos de backup e revoga dispositivos confiáveis de todo usuário da empresa que tinha 2FA ativo
- [ ] Trocar entre "opcional" e "obrigatório" (sem passar por "desativado") não abre confirmação nem afeta usuários individuais — só muda a política

### Wireframe / Mockup
Sem mockup formal — botão novo segue exatamente o padrão visual/posicional dos botões já existentes na coluna de ações de `CompanyScreen.tsx` (`Button size="small" variant="secondary"`, mesmo `ConfirmDialog` da tela pra confirmação).

---

## QA Explorer

```gherkin
Feature: Remover dispositivo confiável na tela de Usuários

  Scenario: Botão aparece só quando o usuário tem dispositivo confiável ativo
    Dado um usuário da empresa sem nenhum dispositivo confiável ativo
    Quando um owner abre a aba Usuários
    Então o botão "Remover dispositivo confiável" não aparece na linha desse usuário

  Scenario: Owner remove dispositivo confiável de um cashier da própria equipe
    Dado um cashier da mesma empresa com um dispositivo confiável ativo
    Quando o owner clica em "Remover dispositivo confiável" na linha desse cashier
    Então o dispositivo é revogado
    E o botão some da linha sem precisar recarregar a página
    E o 2FA desse cashier continua ativo e configurado (segredo TOTP intacto)

  Scenario: Admin/superadmin fazem a mesma ação em modo suporte
    Dado um superadmin com uma empresa cliente selecionada, um usuário dessa empresa com dispositivo ativo
    Quando ele revoga o dispositivo confiável desse usuário pela aba Usuários
    Então a revogação funciona normalmente, mesmo padrão de autorização de outras ações administrativas

  Scenario: Isolamento multi-tenant
    Dado um usuário da empresa B com dispositivo confiável ativo
    Quando um owner da empresa A tenta revogar esse dispositivo via DELETE /companies/{id da empresa A}/users/{id do usuário da empresa B}/trusted-devices
    Então a requisição retorna 404

  Scenario: Configurações — modo suporte não mostra 2FA pessoal
    Dado um superadmin com uma empresa cliente selecionada
    Quando ele abre Configurações → aba Segurança
    Então nenhum card sobre o 2FA da própria conta administrativa aparece
    E o card "Segurança da empresa" aparece normalmente

  Scenario: Configurações — ordem dos cards
    Dado um owner na aba Segurança (vê os dois cards)
    Então "Segurança da empresa" aparece antes de "Minha segurança"

  Scenario: Configurações — usuário comum não é afetado
    Dado um owner, manager ou cashier autenticado (não é admin/superadmin em modo suporte)
    Quando ele abre a aba Segurança
    Então vê "Minha segurança" normalmente, sem nenhuma mudança de comportamento além da ordem dos cards

  Scenario: Desativar 2FA da empresa exige confirmação
    Dado uma empresa com política "obrigatório" e 2 usuários com 2FA ativo
    Quando um owner seleciona "Desativado" no dropdown de política
    Então um modal de confirmação aparece, sem a política ainda ter mudado

  Scenario: Cancelar a confirmação não muda nada
    Dado o modal de confirmação de desativação aberto
    Quando o owner clica em "Cancelar"
    Então a política da empresa continua "obrigatório"
    E nenhum usuário tem o 2FA alterado

  Scenario: Confirmar a desativação remove 2FA e dispositivos de todos os usuários
    Dado uma empresa com política "obrigatório" e 2 usuários com 2FA ativo (um deles também com dispositivo confiável ativo)
    Quando o owner confirma a desativação no modal
    Então a política da empresa vira "disabled"
    E os 2 usuários ficam com mfa_enabled=false, sem segredo TOTP nem códigos de backup
    E o dispositivo confiável que existia é revogado

  Scenario: Trocar entre opcional e obrigatório não abre confirmação
    Dado uma empresa com política "opcional"
    Quando um owner muda para "obrigatório"
    Então a mudança é aplicada direto, sem modal de confirmação

  Scenario: Reset individual de 2FA já revoga dispositivo em cascata (comportamento existente, sem mudança)
    Dado um usuário com 2FA ativo e um dispositivo confiável ativo
    Quando um owner desativa o 2FA desse usuário individualmente (ação já existente)
    Então o dispositivo confiável dele também é revogado, sem chamada adicional
```

---

## Tech Explorer

### Serviços impactados
- `services/company/` — `list_users` (campo derivado `has_trusted_device`), 1 endpoint novo de revogação em lote
- `frontend/admin/` — `CompanyScreen.tsx` (botão novo na tabela de Usuários), `SettingsScreen.tsx` (remove branch de "modo suporte" ficando sem conteúdo de 2FA pessoal, reordena cards)

### Endpoints

#### `GET /companies/{company_id}/users` (alterado)
`UserOut` ganha:
```python
class UserOut(BaseModel):
    ...
    has_trusted_device: bool = False
```
`list_users`, depois de buscar `users` paginados:
```python
user_ids = [u.id for u in users]
trusted_ids = set()
if user_ids:
    td = await db.execute(
        select(TrustedDevice.user_id).distinct()
        .where(TrustedDevice.user_id.in_(user_ids), TrustedDevice.revoked_at.is_(None))
    )
    trusted_ids = {row[0] for row in td.all()}
return {
    "users": [
        {**UserOut.model_validate(u).model_dump(), "has_trusted_device": u.id in trusted_ids}
        for u in users
    ],
    "total": total,
}
```

#### `PUT /companies/{company_id}/security` (alterado — cascata)
```python
co.mfa_policy = body.mfa_policy
if body.mfa_policy == "disabled":
    result = await db.execute(
        select(User).where(User.company_id == company_id, User.totp_enabled_at.isnot(None))
    )
    for u in result.scalars().all():
        await _clear_mfa(db, u)
await db.commit()
return {"ok": True, "mfa_policy": body.mfa_policy}
```
Roda sempre que o valor novo é `"disabled"` (idempotente — se ninguém tinha 2FA ativo, a query não retorna ninguém e não faz nada). Não precisa checar o valor anterior: reaplicar em cima de uma empresa já desativada não tem efeito colateral.

#### `DELETE /companies/{company_id}/users/{user_id}/trusted-devices` (novo)
**Auth:** `_require_company_admin` (mesmo padrão de `mfa/reset` administrativo)
```python
@app.delete(
    "/companies/{company_id}/users/{user_id}/trusted-devices",
    tags=["MFA"],
    summary="Revogar todos os dispositivos confiáveis de um usuário",
)
async def revoke_user_trusted_devices(
    company_id: int, user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_company_admin(current_user, company_id)
    u = await db.get(User, user_id)
    if not u or u.company_id != company_id:
        raise HTTPException(404, "Usuário não encontrado")
    await db.execute(
        update(TrustedDevice)
        .where(TrustedDevice.user_id == user_id, TrustedDevice.revoked_at.is_(None))
        .values(revoked_at=datetime.utcnow())
    )
    await db.commit()
    return {"ok": True}
```

### Frontend

**`CompanyScreen.tsx`** — coluna de ações da tabela de Usuários ganha:
```tsx
{u.has_trusted_device && (
  <Button size="small" variant="secondary" onClick={() => revokeUserDevices(u.id)}>
    Remover dispositivo confiável
  </Button>
)}
```
`revokeUserDevices` chama o `DELETE` novo e recarrega a lista de usuários (mesmo padrão de `resetUserMfa`/`deactivateUser` já existentes).

**`SettingsScreen.tsx`:**
- Novo derivado: `const inSupportMode = isPlatformAdmin && !!companyId;`
- Bloco do card "Minha segurança" passa a ser condicionado por `!inSupportMode` — em modo suporte, nada é renderizado no lugar (a aba Segurança fica só com "Segurança da empresa")
- Reordenação: "Segurança da empresa" antes de "Minha segurança" na árvore JSX
- Sem mudança nos endpoints de MFA pessoal (`/users/me/mfa/*`, `/users/me/trusted-devices`) nem na listagem/estilo dos dispositivos do próprio usuário — fica exatamente como já implementado no ORD-094 (fora de escopo migrar pra `Table` aqui; a lista pessoal já é pequena e não estava na crítica original)
- **Confirmação ao desativar:** novo estado `pendingMfaPolicy`/`confirmDisableMfa`; o `onValueSelected` do dropdown passa a chamar um handler que, se `opt.value === "disabled" && mfaPolicy !== "disabled"`, abre um `ConfirmDialog` novo (mesmo componente já usado pro PIN) em vez de chamar `saveMfaPolicy` direto. Confirmar chama `saveMfaPolicy("disabled")`; cancelar só fecha o modal, sem tocar em nada. Qualquer outra transição (`optional`↔`required`, ou selecionar o valor que já está ativo) continua chamando `saveMfaPolicy` direto, sem modal.

### Impacto em outros serviços
Nenhum.

### Eventos de fila
Não aplicável.

### Estimativa
- Backend: 5 pontos (1 endpoint novo simples + 1 campo derivado com query em lote)
- Frontend: 8 pontos (botão condicional novo em `CompanyScreen.tsx`, ajuste de `SettingsScreen.tsx` pra modo suporte + reordenação)

### Riscos
- **Risco baixo — superfície de revogação cross-user, mesmo padrão já aprovado no ORD-093/092:** `_require_company_admin` já é usado pra ações administrativas equivalentes (editar, desativar, resetar 2FA) — não é um padrão de autorização novo.
- **Risco baixo — query em lote de `has_trusted_device`:** uma query extra por página de usuários (não por linha) — custo desprezível, mesmo padrão de "resumo agregado" já usado em `list_orders`/`list_payments`.
