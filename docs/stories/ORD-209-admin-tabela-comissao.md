# ORD-209 — Tela de administração de tabela de comissão de parceiro

**Status:** Ready

## História
Como Administrativo/Financeiro da Ordin, quero criar, editar, marcar como padrão, arquivar,
excluir e consultar o histórico de tabelas de comissão de parceiro (`CommissionTable`, ORD-206)
pelo painel admin, para não depender de chamada direta de API.

## Contexto e motivação
O ORD-206 criou a estrutura de dados de `CommissionTable`/`CommissionTableHistory` (setup por
totem + percentual recorrente mensal, uma tabela padrão + customizadas por acordo, histórico de
mudança de valor) com 7 endpoints completos no company-service — mas, por decisão explícita do
Tech Explorer daquela história, nenhuma tela foi construída, só a API. A expectativa era que o
ORD-207 (cadastro de parceiro) resolveria a exposição visual, mas o que o ORD-207 entregou foi só
um **seletor** (dropdown) de tabelas já existentes na hora de criar/editar um parceiro — não uma
tela de gestão das próprias tabelas. Resultado: não existia nenhuma forma de cadastrar uma tabela
de comissão nova pelo admin, só via API direta — gap descoberto ao vivo pelo usuário testando o
ORD-208.

## Fluxo principal
1. Admin acessa a aba "Tabelas de comissão" em Comercial
2. Consulta a lista de tabelas (ativas, ou incluindo arquivadas)
3. Cria uma nova tabela de comissão
4. Edita valores de uma tabela existente (vê histórico de alterações)
5. Marca uma tabela como padrão
6. Arquiva uma tabela que não está mais em uso
7. Exclui uma tabela definitivamente (quando elegível)
8. Consulta o histórico de alterações de uma tabela

## Fluxos alternativos / exceções
- Criar tabela quando já existe uma padrão: `note` obrigatória (mín. 10 caracteres) — a primeira
  tabela do sistema dispensa nota.
- Editar tabela em uso: Alert mostra a contagem exata de parceiros afetados (decisão do repasse
  de Financeiro — não um aviso genérico).
- Editar tabela arquivada: bloqueado — formulário abre em modo somente-leitura.
- Arquivar tabela que é a padrão, ou que ainda tem parceiro vinculado: bloqueado (409).
- Excluir tabela que é a padrão, já teve histórico, ou tem parceiro vinculado: bloqueado (409) —
  a única saída nesses casos é arquivar.

## Dependências
- Serviços envolvidos: `company` (endpoints já existentes do ORD-206 + 1 ajuste), `frontend/admin`
- Histórias bloqueantes: ORD-206 (Ready, mergeado), ORD-207 (Ready, mergeado) — ambas já em `main`

## Critérios de aceite funcionais
- [ ] Nova aba "Tabelas de comissão" em `CommercialScreen.tsx`, platform-admin only
- [ ] Lista mostra nome, setup por totem, % recorrente, vigente desde, tag "Padrão", status
      ativa/arquivada, com toggle "mostrar arquivadas"
- [ ] Criar tabela: `note` obrigatória apenas quando já existe uma tabela padrão
- [ ] Editar tabela: gera histórico por campo alterado (`setup_fee_per_totem`,
      `recurring_percent`, `vigente_desde`); reenviar os mesmos valores não duplica histórico
- [ ] Editar tabela em uso: Alert mostra a contagem exata de parceiros afetados
- [ ] Tabela arquivada abre em modo somente-leitura no formulário
- [ ] Marcar como padrão: exige `confirm_replace` se já existe outra padrão; idempotente se já é
- [ ] Arquivar: bloqueado se é a padrão OU tem parceiro vinculado (ajuste de backend, ver Tech
      Explorer)
- [ ] Excluir: bloqueado se é a padrão, tem histórico, ou tem parceiro vinculado; sucesso caso
      contrário
- [ ] Histórico: vazio retorna 200 com lista vazia; populado em ordem cronológica

## Wireframe / Mockup
Tela "Tabelas de comissão" como 4ª aba de `CommercialScreen.tsx` (ao lado de "Tabela de preço",
"Módulo fiscal", "Parceiros"). Lista + formulário separado (criar/editar), seguindo exatamente o
molde visual de `PartnerListScreen.tsx`/`PartnerFormScreen.tsx` (mais próximo que
`PriceTableListScreen`, por ter toggle de arquivadas/inativas análogo).

---

## Solução Técnica

### Serviços impactados
- **`company-service`**: ajuste em `archive_commission_table` + **endpoint novo**
  `GET /commercial/commission-tables/{id}` (ver Endpoints — nenhum dos dois estava previsto no
  Tech Explorer original, os dois só apareceram testando a implementação de verdade). Os outros 6
  endpoints do ORD-206 não mudam.
- **`frontend/admin`**: 2 telas novas, 1 aba nova, 3 rotas novas.

### Endpoints

Já existentes desde o ORD-206, exceto os dois ajustes marcados abaixo.

#### POST /commercial/commission-tables
**Auth:** platform-admin. Request: `{ name, setup_fee_per_totem, recurring_percent, note?, vigente_desde }`.
`note` exigida (min 10 chars) só se já existe alguma tabela `is_default=true`. Response 201:
`CommissionTableOut`.

#### GET /commercial/commission-tables?archived=
Response 200: `{ commission_tables: CommissionTableOut[] }`.

#### GET /commercial/commission-tables/{id} — **NOVO, ADICIONADO NESTA HISTÓRIA**
Faltava desde o ORD-206 — só existiam criar/listar/editar/set-default/archive/delete/histórico,
nenhum GET de item único. Passou pelos repasses do ORD-207 e ORD-208 sem ninguém notar porque
nenhuma tela tinha precisado carregar uma tabela específica pra edição até agora. O Tech Explorer
desta história presumiu, por analogia com `get_partner`/`get_price_table`, que o endpoint já
existia — só apareceu como 405 real ao testar `CommissionTableFormScreen` no browser. Mesmo padrão
de `get_partner`: 404 se não existe, `_require_platform_admin`, retorna `CommissionTableOut`.

#### PUT /commercial/commission-tables/{id}
Mesmo body do POST. Gera uma entrada de histórico por campo que realmente mudou entre
`setup_fee_per_totem`, `recurring_percent`, `vigente_desde` (não `name`/`note`, metadado). 404, 422
(`note` obrigatória se não é a padrão).

#### POST /commercial/commission-tables/{id}/set-default
Body: `{ confirm_replace: boolean }`. Idempotente se já é a padrão. 409 se já existe outra e
`confirm_replace=false`.

#### POST /commercial/commission-tables/{id}/archive — **AJUSTADO NESTA HISTÓRIA**
Sem body. 409 se `is_default=true`. **Novo:** 409 também se `_has_partner_linked(db, id)` for
verdadeiro (mesma checagem que o `DELETE` já usa desde o ORD-207) — reutiliza a função existente,
sem query nova:

```python
if await _has_partner_linked(db, commission_table_id):
    raise HTTPException(
        409,
        "Tabela está vinculada a ao menos um parceiro e não pode ser arquivada — "
        "troque a tabela desse(s) parceiro(s) antes.",
    )
```

**Por quê:** sem essa checagem, uma tabela "arquivada" podia continuar calculando comissão de
parceiro ativo normalmente — achado do repasse de PM/Backend-SR desta história, decisão explícita
do usuário. Com o ajuste, "arquivada" passa a significar de verdade "nenhum parceiro usa mais",
o que permite ao formulário tratar qualquer tabela arquivada como somente-leitura sem checagem
adicional.

#### DELETE /commercial/commission-tables/{id}
Sem mudança. 409 se é padrão, tem histórico, ou tem parceiro vinculado (`_has_partner_linked`).

#### GET /commercial/commission-tables/{id}/history
Sem mudança. `{ entries: [{ field_changed, old_value, new_value, changed_by_user_id, created_at }] }`,
ordenado por `created_at asc`.

### Migrations
Nenhuma — mudança é só de lógica de validação num endpoint existente, sem alteração de schema.

### Telas e rotas novas (frontend)

- **`CommissionTableListScreen.tsx`** (novo, molde de `PartnerListScreen.tsx`): toggle "Mostrar
  arquivadas" (`GET ?archived=`), colunas nome/setup/%/vigente desde/tag padrão/status, ações
  Editar/Marcar como padrão/Arquivar/Excluir por linha, erros de backend via `parseApiError` +
  `makeToast` (mesmo padrão das telas irmãs).
- **`CommissionTableFormScreen.tsx`** (novo, molde de `PartnerFormScreen.tsx`): `InputBase`
  (nome), `CurrencyInput` (setup), `NumberSpinInput` com `suffix="%"` (recorrente, mesma técnica de
  porcentagem inteira do `PriceTableFormScreen`), `DateInput` (vigente_desde, hora fixada em
  `00:00:00` — campo informativo), `TextArea` (note, com `helperMessage` orientando citar o
  parceiro/negociação). Painel de histórico (molde do painel homônimo em `PartnerFormScreen`).
  Tabela arquivada → todos os campos em modo leitura, sem botão Salvar.
- **`CommercialScreen.tsx`**: 4ª aba `commission-tables` / "Tabelas de comissão".
- **`App.tsx`**: rotas `/commercial/commission-tables`, `.../new`, `.../:id/edit` — adicionadas nos
  arrays `superadmin` e `admin`.

Chamadas de API inline via `api` (`../api`), sem módulo dedicado — padrão real confirmado no
código (`PriceTableListScreen`/`PartnerFormScreen` fazem o mesmo), não o que se presumia
inicialmente.

**Copy definida nos repasses:**
- Alert de edição (tabela em uso): *"Editar os valores desta tabela afeta a comissão de N
  parceiro(s) vinculado(s) a ela a partir de agora. Os novos valores substituem os atuais para
  qualquer cálculo que vier a consultar esta tabela — o histórico abaixo preserva os valores
  antigos para auditoria."* (contagem via `GET /commercial/partners` filtrado client-side por
  `commission_table.id`; texto "não retroativo" removido por prometer um comportamento de período
  que ainda não existe — achado do Financeiro).
- Texto explicativo do campo `vigente_desde`: *"Vigente desde é só informativo — quem define a
  tabela usada nos cálculos é 'Marcar como padrão'."*

### Impacto em outros serviços
Nenhum novo. `PartnerFormScreen.tsx` já consome `GET /commercial/commission-tables` — ver risco.

### Riscos técnicos
1. **Dropdown de tabela em `PartnerFormScreen` pode ficar temporariamente desatualizado** se uma
   tabela for arquivada/excluída em outra aba enquanto o formulário de parceiro está aberto. Sem
   mitigação nova: o backend já rejeita com 422 (`"Não é possível vincular parceiro a uma tabela
   de comissão arquivada"`), mesmo padrão de staleness aceito em outras telas do admin.
2. **`DELETE` pode retornar 409 depois do clique** se o estado mudou entre o load da lista e a
   ação — tratado com `parseApiError`/`makeToast`, sem lock otimista adicional.

### Estimativa
- Backend: ~2–2.5h (checagem de 4 linhas reaproveitando `_has_partner_linked` + endpoint
  `GET .../{id}` que faltava + 4 testes — ambos os achados só apareceram implementando).
- Frontend: ~10–14h.
- **Total: ~12–16.5h.**

### Achados testando ao vivo (não previstos no Tech Explorer)
- **`GET /commercial/commission-tables/{id}` não existia** (ver Endpoints) — 405 real ao abrir o
  formulário de edição pela primeira vez no browser.
- **`% recorrente` com `NumberSpinInput`/`decimalDigits` reproduz a mesma armadilha já documentada
  em `PriceTableFormScreen`**: digitar "3,5" vira "0,35" (mascaramento estilo centavos, não parsing
  de decimal). Diferente do multiplicador do PriceTable, aqui não dá pra contornar limitando a
  porcentagem a inteiros (comissão real tem casas decimais). Corrigido trocando por `InputBase` +
  parser próprio (`parsePercent`, aceita vírgula ou ponto, valida 0–100).
  Achado ao vivo digitando no formulário renderizado — não pega em typecheck nem em teste de API.
- **Nota obrigatória não aparecia ao editar uma tabela não-padrão** — o hint client-side (repasse de
  PM/Administrativo) só cobria a criação; a regra do backend (`not ct.is_default and not body.note`)
  também se aplica a edição, e faltava o mesmo aviso lá. Corrigido computando `noteRequired` a
  partir de `!t.is_default` no load de edição.
- 4 testes de `test_ord171_ativo_ambiente_credenciais.py` (módulo fiscal, sem nenhuma relação com
  esta história) falham mesmo isolados e sem nenhuma mudança desta história — falha pré-existente
  do ambiente local de teste, não investigada a fundo (fora de escopo). Confirmar se falha também
  em CI antes de considerar bloqueante pra outra história.

### Nota para história futura (não implementar agora)
A futura história de fechamento mensal/cálculo de comissão vai precisar reconstruir "qual valor de
comissão valia em cada mês fechado" a partir de `CommissionTableHistory` (mesmo algoritmo de
reconstrução cronológica do ORD-208: cada `new_value` vale até a próxima entrada daquele campo, ou
até agora se for a última). `vigente_desde` **não** serve pra essa reconstrução — é só metadado
descritivo.

---

## Repasses realizados

| Repasse | Achado principal | Aplicado |
|---|---|---|
| PM | Tabela arquivada editável nunca foi decidida (mesmo padrão do achado do ORD-194) | Sim — virou decisão de produto + ajuste de backend |
| QA | Faltavam cenários: editar sem mudar valor, reenvio idempotente, tabela arquivada somente-leitura; recomendou 1 E2E de caminho feliz + evidência manual pras bordas (não suíte completa) | Sim |
| Backend-SR | `archive_commission_table` não bloqueava tabela vinculada a parceiro ativo — correção real de código, reaproveitando `_has_partner_linked` (ORD-207) | Sim |
| Administrativo | Sem atrito operacional relevante (arquivar é ação rara; "quem usa a tabela" já é visível na aba Parceiros); sem campo de aprovação formal (estrutura da empresa não justifica ainda); ajustar `helperMessage` do `note` | Sim |
| Financeiro | Contagem exata de parceiros no Alert (não o texto genérico original); texto "não retroativo" corrigido por prometer comportamento inexistente; nota registrada pra história futura de fechamento mensal | Sim |

## Rastreabilidade ponta a ponta

| Passo do Fluxo Principal | Critério de aceite | Cenário Gherkin | Endpoint/tela |
|---|---|---|---|
| 1. Acessar aba "Tabelas de comissão" | Aba nova, platform-admin only | Acesso 403 / 401 | Rota `/commercial/commission-tables`, aba em `CommercialScreen.tsx` |
| 2. Consultar lista (ativas/arquivadas) | Nome/setup/%/vigente/status/tag padrão; toggle arquivadas | Listar ativas / Listar com arquivadas | `GET .../commission-tables`, `CommissionTableListScreen.tsx` |
| 3. Criar tabela | Note condicional; nasce `is_default=false` | Criar sem padrão / criar com padrão sem note (422) / criar com padrão com note | `POST .../commission-tables`, `CommissionTableFormScreen.tsx` (criar) |
| 4. Editar valores | Histórico por campo; sem histórico se nada mudou; Alert com contagem exata; arquivada = somente-leitura | Editar gera histórico / editar sem mudar valor rastreado / reenviar mesmo valor / tabela arquivada somente-leitura | `PUT .../{id}`, `CommissionTableFormScreen.tsx` (editar) |
| 5. Marcar como padrão | `confirm_replace` se já existe outra; idempotente | Marcar padrão sem outra existente / marcar com confirm_replace | `POST .../set-default`, `ConfirmDialog` na lista |
| 6. Arquivar | Bloqueado se padrão OU parceiro vinculado | Arquivar padrão bloqueado / arquivar com parceiro vinculado bloqueado / arquivar elegível | `POST .../archive`, ação na lista |
| 7. Excluir | Bloqueado se padrão/histórico/parceiro; sucesso se elegível | Excluir padrão / com histórico / com parceiro / elegível | `DELETE .../{id}`, ação na lista |
| 8. Consultar histórico | Vazio → 200 lista vazia; populado → ordem cronológica | Histórico vazio / histórico populado | `GET .../history`, painel no form |

Fora de escopo (cálculo de comissão, fechamento mensal, pagamento) — decisão explícita, documentada
na seção Fluxo principal / Nota para história futura, não omissão silenciosa.
