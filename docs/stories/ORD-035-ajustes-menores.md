---
id: ORD-035
status: Done
fase: 1
sprint: corrections
responsavel: Backend SR + Frontend
estimativa: 2 pontos
prioridade: P3
bugs: BUG-009, BUG-010, BUG-011
---

# ORD-035 — Ajustes menores: dashboard completedToday, PIN duplicado e seed frágil

## Explorer

**Como** time de produto,  
**quero** que o dashboard mostre dados reais, que o PIN apareça em apenas um lugar e que os testes não quebrem o PIN do totem,  
**para** que o sistema de demo seja confiável e sem redundâncias confusas.

### Contexto e motivação

Três pequenas inconsistências agrupadas por baixo impacto:

**BUG-009 — Dashboard "Concluídos hoje" sempre zero:**  
O card "Concluídos hoje" filtra `o.status === "completed"`, mas pedidos ficam em `paid` indefinidamente enquanto não há coleta no balcão. Em demo, o operador paga no totem e nunca coleta — então `completed` = 0. O card deveria considerar `paid` como "concluído do ponto de vista financeiro", ou exibir "Pagos hoje" como métrica mais precisa para o MVP.

**BUG-010 — Regenerar PIN em duas telas (CompanyScreen e SettingsScreen):**  
O botão "Regenerar PIN" está em `CompanyScreen` (seção acima das tabs, sempre visível) e em `SettingsScreen` (tela dedicada). Para o usuário, é confuso ter a mesma ação em dois lugares. A separação original fazia sentido em SaaS com múltiplos admins, mas para o MVP basta uma localização.

**BUG-011 — Seed frágil: testes apagam companies/terminals/users seed:**  
`pytest services/company/tests/` insere e deleta empresas de teste. Se o cleanup deletar registros com `id < 10` (que deveriam ser seed data), o PIN 1234 para de funcionar. O seed foi re-inserido manualmente na sessão anterior. A causa é que os testes de cobertura criam empresas com IDs fixos ou sem proteger os IDs do seed.

### Personas afetadas
- **Owner/Admin**: dashboard com métrica incorreta
- **Owner**: PIN duplicado gera dúvida
- **Desenvolvedor**: PIN quebra ao rodar testes

### Dependências
- `frontend/admin/src/screens/DashboardScreen.tsx`
- `frontend/admin/src/screens/CompanyScreen.tsx`
- `services/company/tests/test_coverage.py` — proteção dos seed IDs
- `init.sql` — seed resiliente

---

## QA Explorer

```gherkin
Feature: Ajustes menores — dashboard, PIN e seed

  # BUG-009
  Scenario: Dashboard mostra "Pagos hoje" com dados reais
    Given existem 3 pedidos com status "paid" criados hoje
    And 0 pedidos com status "completed"
    When o admin abre o Dashboard
    Then o card "Pagos hoje" exibe "3"
    And o label do card é "Pagos hoje" (não "Concluídos hoje")

  # BUG-010
  Scenario: Regenerar PIN existe apenas em Configurações
    When o admin navega para Empresa
    Then NÃO existe botão "Regenerar PIN" na tela Empresa
    When o admin navega para Configurações
    Then existe o botão "Regenerar PIN"
    And ao clicar, o novo PIN é exibido

  # BUG-011
  Scenario: Testes de company service não apagam seed data
    Given os seeds ids 1-3 existem (Burger House, Pasta & Co, Sweet Corner)
    When pytest services/company/tests/ roda até a conclusão
    Then os seeds ids 1-3 ainda existem no banco
    And o PIN 1234 (Burger House) continua funcionando no totem

  Scenario: Regressão — testes de company passam após proteção de seed
    When pytest services/company/tests/ roda
    Then todos os testes passam (sem falhas de integridade)
```

---

## Tech Explorer

### Fix BUG-009 — DashboardScreen.tsx

Substituir filtro por `completed` por `paid`:

```typescript
// antes
const completedToday = orders.filter((o) => {
  const d = new Date(o.created_at);
  const now = new Date();
  return (
    o.status === "completed" &&          // ← nunca é "completed" em demo
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}).length;

// depois — contar pedidos paid E completed hoje
const paidToday = orders.filter((o) => {
  const d = new Date(o.created_at);
  const now = new Date();
  return (
    (o.status === "paid" || o.status === "completed") &&
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}).length;
```

No JSX, trocar label e valor:

```tsx
<div style={S.card}>
  <div style={S.cardLabel}>Pagos hoje</div>
  <div style={S.cardValue}>{paidToday}</div>
</div>
```

### Fix BUG-010 — CompanyScreen.tsx

Remover o bloco `regeneratePin` e o botão correspondente de `CompanyScreen`. Manter apenas em `SettingsScreen`.

```typescript
// Remover de CompanyScreen.tsx:
// - função regeneratePin()
// - o bloco JSX com botão "Regenerar PIN"
// - o estado setMsg relacionado ao PIN
```

### Fix BUG-011 — `services/company/tests/test_coverage.py`

Proteção dos seed IDs: ao criar empresas de teste, usar IDs altos (≥ 100) para evitar colisão, e ao deletar, filtrar por ID > 10:

```python
# Ao criar empresa de teste
TEST_COMPANY_ID = 9001  # ID alto, fora da faixa de seeds

async def _create_test_company(db):
    import main as svc
    c = svc.Company(name="TestCo", slug="testco-cov", pin_hash="x",
                    plan="basic", active=True)
    db.add(c); await db.flush()
    return c

async def _cleanup_test_companies(db):
    import main as svc
    from sqlalchemy import delete as sa_delete
    # nunca deletar seeds (ids 1-3)
    await db.execute(
        sa_delete(svc.Company).where(svc.Company.id > 10)
    )
    await db.commit()
```

Alternativa mais robusta: usar `ROLLBACK` por transação (cada teste roda dentro de uma transação que é revertida). Mas dado o padrão atual do projeto (sem transações de rollback), a proteção por ID > 10 é suficiente.

### Impacto em outros serviços
- Nenhum.

### Estimativa
2 pontos — DashboardScreen (5 linhas) + CompanyScreen (remoção) + proteção de seed nos testes (10 linhas)

### Riscos
- BUG-011: se um teste existente criar empresa sem especificar ID e o banco auto-incrementar para ID < 10, o problema persiste. Verificar todos os inserts nos testes de company para garantir que usam IDs altos ou deixam auto-incrementar a partir do max+1 atual (que já é > 10 após as execuções anteriores).

---

## Ready ✅

- [x] User story documentada
- [x] BUG-009: label + filtro `paid|completed` em DashboardScreen
- [x] BUG-010: remover regenerar PIN de CompanyScreen
- [x] BUG-011: proteger seed IDs nos testes de company com filtro `id > 10`
- [x] Estimativa: 2 pontos
- [x] Sem bloqueadores
