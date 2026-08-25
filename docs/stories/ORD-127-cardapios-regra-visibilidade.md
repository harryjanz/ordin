---
id: ORD-127
status: Done
fase: null
sprint: null
responsavel: Backend
estimativa: 5 pontos
---

# ORD-127 — Cardápios por horário: regra de visibilidade condicional

## Descrição
Terceira subtarefa de ORD-124 — a parte de maior risco de toda a história, porque muda o comportamento de `GET /catalog/categories` e `GET /catalog/products` **já em produção**, consumidos pelo totem em uso real. **Depende de ORD-125 implementado.** Não depende de ORD-126 (a regra de visibilidade funciona com cardápios criados via API/banco diretamente, não precisa da UI admin pra existir) — pode ser desenvolvida em paralelo a ORD-126 se fizer sentido pro sequenciamento real do trabalho.

Isolada como história própria de propósito: se algo der errado, o rollback é só desta mudança, sem precisar reverter o CRUD (ORD-125) ou a UI (ORD-126), que continuam funcionando (só sem efeito prático) mesmo se esta for revertida.

## Persona
Cliente final no totem (efeito indireto — não interage com nada novo, só vê o catálogo mudar de composição sozinho ao longo do dia).

---

## Explorer

### Fluxo principal
1. Produto/categoria vinculado a um cardápio ativo agora (dia certo, dentro do horário) → aparece no totem normalmente.
2. Mesmo produto, fora da janela do cardápio → não aparece.
3. Produto sem nenhum cardápio associado → sempre aparece, sem mudança de comportamento.
4. Chamadas do admin (`include_inactive=true`) continuam vendo tudo, independente de horário — o dono gerencia o catálogo a qualquer hora.

### Critérios de aceite
- [ ] `GET /catalog/categories` (chamada padrão do totem, `include_inactive=false`) exclui categorias vinculadas a cardápio(s) fora da janela ativa agora
- [ ] `GET /catalog/products` (idem) exclui produtos vinculados a cardápio(s) fora da janela ativa agora — direto (`MenuProduct`) ou via categoria (`MenuCategory`)
- [ ] Produto/categoria sem nenhum cardápio associado nunca é afetado — continua com o comportamento de hoje
- [ ] Produto em 2+ cardápios fica visível se **qualquer um** deles estiver na janela ativa (união, não interseção)
- [ ] Chamadas com `include_inactive=true` (admin) **não** aplicam esta regra — continuam mostrando tudo, de qualquer horário
- [ ] Comparação de dia/horário usa o relógio do servidor (sem fuso por empresa — decisão já registrada em ORD-124)
- [ ] Teste de regressão explícito: empresa sem nenhum cardápio cadastrado tem exatamente o mesmo comportamento de antes desta história

---

## QA Explorer

```gherkin
Feature: Regra de visibilidade condicional por horário

  Scenario: Produto dentro da janela aparece
    Dado um produto vinculado só ao cardápio "Almoço" (seg-sex, 11h30-15h)
    Quando GET /catalog/products é chamado numa quarta-feira às 12h
    Então o produto aparece na resposta

  Scenario: Produto fora da janela não aparece
    Dado o mesmo produto do cenário acima
    Quando GET /catalog/products é chamado na mesma quarta-feira às 16h
    Então o produto não aparece na resposta

  Scenario: Produto fora do dia configurado não aparece
    Dado o mesmo produto (só seg-sex)
    Quando GET /catalog/products é chamado num sábado às 12h (dentro do horário, mas fora do dia)
    Então o produto não aparece

  Scenario: Produto sem cardápio nunca é afetado
    Dado um produto sem nenhum vínculo de cardápio
    Quando GET /catalog/products é chamado em qualquer dia/horário
    Então o produto sempre aparece (comportamento idêntico a antes desta história)

  Scenario: Categoria inteira aplica a regra a todos os produtos, inclusive novos
    Dado uma categoria vinculada ao cardápio "Café da manhã" (8h-10h)
    E um produto criado nessa categoria depois do vínculo já existir
    Quando GET /catalog/products é chamado às 9h
    Então o produto novo aparece (herdou o horário da categoria)
    Quando é chamado às 11h
    Então o produto novo não aparece

  Scenario: União de janelas em cardápios múltiplos
    Dado um produto em "Café da manhã" (8h-10h) e "Almoço" (11h30-15h)
    Quando GET /catalog/products é chamado às 9h, às 10h30 e às 12h
    Então aparece às 9h e às 12h, mas não às 10h30

  Scenario: Admin continua vendo tudo, de qualquer horário
    Dado um produto vinculado a um cardápio fora da janela agora
    Quando GET /catalog/products?include_inactive=true é chamado (chamada do admin)
    Então o produto aparece normalmente, com seu status active real (não afetado pela regra de horário)

  Scenario: Sem regressão pra empresa sem cardápio nenhum
    Dado uma empresa que nunca cadastrou nenhum cardápio
    Quando GET /catalog/categories e GET /catalog/products são chamados
    Então o comportamento é idêntico ao que já existia antes desta história (nenhuma query extra observável no resultado)
```

---

## Tech Explorer

### Serviços impactados
- `services/catalog/` — só `list_categories` e `list_products` (as duas funções, não os outros endpoints de categoria/produto).

### Direção técnica
Função auxiliar `_is_menu_active_now(menu) -> bool`: `datetime.utcnow().weekday() in menu.weekdays and menu.start_time <= datetime.utcnow().time() <= menu.end_time` (nome exato e local do helper a definir na implementação; reaproveitar em `list_categories`, `list_products`, e no endpoint de resolução de ORD-125 se fizer sentido).

Pra cada categoria/produto candidato (quando `include_inactive=False`, ou seja, chamada do totem): verificar se tem algum vínculo de cardápio (`MenuCategory`/`MenuProduct`); se não tem nenhum, sempre visível (comportamento de hoje); se tem, visível só se pelo menos um cardápio vinculado estiver ativo agora (`_is_menu_active_now`).

Fazer isso **em uma query só** (não N+1 por produto) — provavelmente um `LEFT JOIN` contra as tabelas de vínculo + agregação, filtrando em Python os candidatos cujos cardápios batem a janela (comparação de weekday/time não é trivialmente expressável em SQL portátil pra JSON de weekdays; mais simples buscar os candidatos com pelo menos 1 vínculo e filtrar em Python do que tentar embutir a lógica de horário inteira em SQL).

### Riscos
- **Este é o único ponto de risco real de produção em toda ORD-124** — muda endpoints já usados pelo totem em produção. Testar com uma empresa real (Burger House demo) tendo cardápios configurados, validar em pelo menos 3 horários diferentes (dentro, fora, no limite exato do minuto de virada) antes de considerar concluído.
- Comparação `start_time <= hora_atual <= end_time` não cobre janelas que cruzam a meia-noite (ex.: 22h-02h) — **não é um caso pedido nesta história** (nenhum exemplo do usuário cruza meia-noite), mas vale documentar como limitação conhecida, não silenciosa, caso apareça um pedido de "jantar até 1h da manhã" no futuro.
- Comparação usa datetime naive UTC (mesmo padrão do resto do serviço, ver bug de timezone já corrigido em `prep_stats` na sessão anterior) — sem fuso por empresa, decisão já registrada em ORD-124.

### Estimativa
5 pontos — mudança conceitualmente pequena (uma condição a mais em duas queries), mas exige teste cuidadoso por tocar produção; a maior parte do esforço é validação, não código.

---

## Ready

**Explorer:** [x] · **QA Explorer:** [x] · **Tech Explorer:** [x] · **Aprovação final:** [x] — decisões de produto herdadas de ORD-124, incluindo a decisão explícita de não tratar virada de meia-noite nesta história.

**Status: Ready** — depende de ORD-125 implementado antes de começar.
