---
id: ORD-204
status: Ready
estimativa: 2 pontos
---

# Fluxo de pendência de cadastro quando fornecedor é criado automaticamente na importação de NF

## Descrição

`create_supplier_invoice` (B1, `ORD-194`) já cria o fornecedor automaticamente quando o CNPJ do
emitente não existe ainda — mas só com `nome`+`cnpj`, via insert direto que bypassa o schema
`SupplierIn` (que desde `ORD-202` exige contato comercial obrigatório). Resultado: um fornecedor
assim hoje não tem contato, endereço, nem razão social — e não existe nenhum sinal, em lugar
nenhum, de que esse cadastro está incompleto. Esta história fecha a lacuna que `ORD-202` deixou
deliberadamente em aberto (decisão do Explorer daquela história: não introduzir indicador visual
até existir um conceito real de "pendência").

## Persona

Admin da empresa — mesma persona de `ORD-182`/`ORD-202`/`ORD-203`.

## Contexto

Pedido original do usuário, registrado desde a análise de `ORD-202`: a importação de NF não pode
travar esperando cadastro completo, mas o fornecedor recém-criado precisa ficar sinalizado pra
alguém completar depois, sem se perder.

## Fluxo principal

1. Admin importa uma NF (`POST /catalog/supplier-invoices`) cujo CNPJ do emitente não existe ainda.
2. Sistema cria o fornecedor automaticamente (`nome`+`cnpj` do XML, como já faz hoje) e marca
   `cadastro_pendente=True`.
3. A importação da nota segue normalmente — nenhum bloqueio.
4. O fornecedor aparece na listagem (`SupplierListScreen.tsx`) com `Tag variant="warning"`
   "Cadastro pendente".
5. Admin clica em "Editar" (tela já existente de `ORD-202`) e completa os dados — o formulário já
   exige contato comercial pela validação existente.
6. Ao salvar com sucesso (`PUT /catalog/suppliers/{id}`), `cadastro_pendente` vira `False`
   automaticamente — sem botão ou ação extra de "resolver pendência".

## Fluxos alternativos / exceções

- **Fornecedor já existente (mesmo CNPJ) reaproveitado na importação**: `cadastro_pendente` não é
  alterado (nem criado nem tocado).
- **Fornecedor criado manualmente**: nasce com `cadastro_pendente=False` — sem mudança de código
  nesse endpoint, é o `server_default` da coluna.
- **Admin nunca revisa o fornecedor pendente**: nada quebra — pendência é só sinalização visual,
  nunca bloqueio funcional.
- **Fornecedor já pendente recebe uma segunda NF antes de ser revisado**: flag continua `True`, não
  reseta nem "piora".
- **Admin edita só parte dos campos e salva** (ex: só contato, sem endereço): `cadastro_pendente`
  vira `False` de qualquer forma — não exige completude total.

## Dependências

- Serviços envolvidos: só `catalog`.
- Histórias bloqueantes: nenhuma — `ORD-202` (cadastro completo) e `ORD-194`/B1 (import de NF) já
  mergeadas.

## Critérios de aceite funcionais

- [ ] Fornecedor criado automaticamente na importação de NF nasce com `cadastro_pendente=True`.
- [ ] Fornecedor criado manualmente nasce com `cadastro_pendente=False`.
- [ ] Fornecedor reaproveitado (já existia por CNPJ) na importação nunca tem o flag alterado.
- [ ] Importação de NF nunca bloqueia nem atrasa por causa do estado do cadastro do fornecedor.
- [ ] Listagem de fornecedores mostra `Tag variant="warning"` pros pendentes.
- [ ] Salvar o fornecedor (`PUT`) com sucesso zera `cadastro_pendente` automaticamente, sem exigir
      completude total.
- [ ] Isolamento multi-tenant: sem checagem nova necessária (coluna de `Supplier`, já isolada).

## Wireframe / Mockup

`SupplierListScreen.tsx` — célula da coluna "Nome" ganha `Tag variant="warning"` "Cadastro
pendente" condicional, mesmo padrão de composição de célula já usado desde `ORD-199`. Sem tela
nova — "Editar" já leva pro formulário completo de `ORD-202`.

## QA Explorer

### Rastreabilidade — Critério (Explorer) → Cenário

| # | Critério | Cenário(s) |
|---|---|---|
| 1 | Auto-criado nasce pendente | *Fornecedor criado automaticamente nasce pendente* |
| 2 | Manual nasce não-pendente | *Fornecedor criado manualmente nunca nasce pendente* |
| 3 | Reaproveitado nunca tem flag alterado | *Fornecedor existente reaproveitado não é afetado* / *Segunda nota pro mesmo fornecedor pendente não altera o flag* |
| 4 | Import nunca bloqueado | *Importação de NF com fornecedor novo continua funcionando* |
| 5 | Listagem mostra Tag | *Listagem exibe Tag de pendente* / *...não exibe pro completo* |
| 6 | PUT zera o flag, sem exigir completude | *Salvar com contato preenchido zera o flag, mesmo sem endereço* |
| 7 | Isolamento multi-tenant | *Listagem de uma empresa não mistura flag de pendência de outra* |

### Cenários Gherkin

```gherkin
Feature: Fluxo de pendência de cadastro na importação automática de NF
  Como Admin da empresa
  Quero que um fornecedor criado automaticamente na importação de NF fique sinalizado como pendente
  Para completar o cadastro dele depois, sem travar a importação da nota

  Background:
    Dado que estou autenticado como admin da empresa "Burger House" (company_id=1)

  Scenario: Fornecedor criado automaticamente nasce pendente
    Dado que não existe fornecedor cadastrado com o CNPJ do emitente de uma NF
    Quando importo essa NF (POST /catalog/supplier-invoices)
    Então um fornecedor novo é criado com nome e CNPJ do XML
    E esse fornecedor tem cadastro_pendente=True

  Scenario: Fornecedor criado manualmente nunca nasce pendente
    Dado que estou na tela de novo fornecedor
    Quando crio um fornecedor preenchendo nome, CNPJ e contato comercial (POST /catalog/suppliers)
    Então o fornecedor é criado com cadastro_pendente=False

  Scenario: Fornecedor existente reaproveitado não é afetado
    Dado um fornecedor já cadastrado (manual, cadastro_pendente=False) com CNPJ X
    Quando importo uma NF cujo emitente tem o CNPJ X
    Então nenhum fornecedor novo é criado
    E o cadastro_pendente do fornecedor existente continua False

  Scenario: Segunda nota pro mesmo fornecedor pendente não altera o flag
    Dado um fornecedor criado automaticamente numa importação anterior, cadastro_pendente=True, ainda não revisado
    Quando importo uma segunda NF do mesmo CNPJ
    Então nenhum fornecedor novo é criado
    E o cadastro_pendente continua True

  Scenario: Importação de NF com fornecedor novo continua funcionando de ponta a ponta
    Dado uma NF cujo CNPJ do emitente nunca foi cadastrado
    Quando importo essa NF
    Então a importação é confirmada com sucesso (201), sem nenhum erro ou atraso relacionado ao cadastro do fornecedor
    E a nota e seus itens são persistidos normalmente

  Scenario: Listagem exibe Tag de pendente
    Dado um fornecedor com cadastro_pendente=True
    Quando abro a listagem de fornecedores
    Então esse fornecedor aparece com uma Tag "Cadastro pendente" (variant warning)

  Scenario: Listagem não exibe Tag pro fornecedor completo
    Dado um fornecedor com cadastro_pendente=False (manual ou já revisado)
    Quando abro a listagem de fornecedores
    Então esse fornecedor aparece sem nenhuma Tag de pendência

  Scenario: Salvar com contato preenchido zera o flag, mesmo sem endereço
    Dado um fornecedor com cadastro_pendente=True, só com nome e CNPJ
    Quando edito esse fornecedor preenchendo apenas o contato comercial, deixando endereço e razão social em branco
    E salvo (PUT /catalog/suppliers/{id})
    Então a atualização é confirmada (200)
    E cadastro_pendente vira False

  Scenario: Listagem de uma empresa não mistura flag de pendência de outra
    Dado que a empresa "Pasta & Co" tem um fornecedor criado automaticamente (cadastro_pendente=True)
    Quando eu, autenticado como admin da "Burger House", listo meus fornecedores
    Então o fornecedor da "Pasta & Co" nunca aparece na minha listagem, pendente ou não
```

### Nota de execução de teste

Regressão do fluxo de importação de NF (`create_supplier_invoice`, B1/C1) coberta pela suíte
existente (`test_ord194_upload_xml_nota_fiscal_compra.py`, `test_ord195_vinculo_automatico_nota_compra.py`)
— roda como baseline antes/depois. Nenhum payload de teste existente precisa mudar (campo novo só
no response, não no request).

## Tech Explorer

### Migration

```python
def upgrade() -> None:
    op.add_column(
        "suppliers",
        sa.Column("cadastro_pendente", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

def downgrade() -> None:
    op.drop_column("suppliers", "cadastro_pendente")
```

`server_default=sa.false()` — garante que fornecedor legado (criado antes desta história) recebe
`False` na hora do `ADD COLUMN`, nunca é "pendente" por definição mesmo tendo campos vazios.

### Alterações de código

`create_supplier_invoice` (`main.py:5149-5153`) — uma linha, só dentro do `if supplier is None`:

```python
supplier = Supplier(
    company_id=company_id, nome=parsed.emit_nome, cnpj=parsed.emit_cnpj,
    cadastro_pendente=True,
)
```

`update_supplier` — uma linha incondicional, junto das outras atribuições diretas já existentes:

```python
s.cadastro_pendente = False
```

`create_supplier` (manual) — **sem mudança de código**, usa o `server_default=False` da coluna.

`SupplierOut` ganha `cadastro_pendente: bool`.

### Frontend — `SupplierListScreen.tsx`

```tsx
import { Alert, Button, makeToast, Tag } from "design-system";
// ...
{ key: "nome", header: "Nome", render: (s) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    {s.nome}
    {s.cadastro_pendente && <Tag variant="warning">Cadastro pendente</Tag>}
  </div>
) },
```

`types.ts`: `Supplier.cadastro_pendente: boolean`.

### Migrations

Ver acima — 1 coluna nova em `suppliers`.

### Impacto em outros serviços

Nenhum.

### Impacto em testes existentes

Nenhuma quebra esperada — nenhum teste existente faz asserção de igualdade exata no JSON de
resposta de `Supplier`, só acesso a campos específicos.

### Estimativa

| Frente | Estimativa |
|---|---|
| Migration + 2 linhas de backend + `SupplierOut` | ~1h |
| Frontend (`Tag` condicional + `types.ts`) | ~0.5h |
| Testes (9 cenários + baseline de regressão do import de NF) | ~1.5h |
| **Total** | **~3h ≈ 2 pontos** |

### Riscos

- Nenhum risco técnico novo — desenho mais simples possível (1 coluna booleana, 2 pontos de
  escrita, 1 indicador visual condicional).

## Rastreabilidade ponta a ponta (checklist de Ready)

| Passo do Fluxo Principal | Critério de aceite | Cenário Gherkin | Endpoint/tela |
|---|---|---|---|
| 1. Admin importa NF, fornecedor não existe | ✅ Critério 1 | *Fornecedor criado automaticamente nasce pendente* | `POST /catalog/supplier-invoices` |
| 2. Sistema cria fornecedor com cadastro_pendente=True | ✅ Critério 1 | mesmo cenário | `create_supplier_invoice` |
| 3. Importação segue sem bloqueio | ✅ Critério 4 | *Importação de NF com fornecedor novo continua funcionando* | `create_supplier_invoice` |
| 4. Fornecedor aparece na listagem com Tag | ✅ Critério 5 | *Listagem exibe Tag* / *...não exibe* | `SupplierListScreen.tsx` |
| 5. Admin edita e completa (contato obrigatório) | ✅ Critério 6 | *Salvar com contato preenchido zera o flag* | `SupplierFormScreen.tsx` |
| 6. Ao salvar, cadastro_pendente vira False | ✅ Critério 6 | mesmo cenário | `PUT /catalog/suppliers/{id}` |
| — Manual nunca nasce pendente | ✅ Critério 2 | *Fornecedor criado manualmente nunca nasce pendente* | `POST /catalog/suppliers` |
| — Reaproveitado nunca alterado | ✅ Critério 3 | *Fornecedor existente reaproveitado...* / *Segunda nota...* | `create_supplier_invoice` |
| — Isolamento multi-tenant | ✅ Critério 7 | *Listagem de uma empresa não mistura...* | `GET /catalog/suppliers` |

Todas as linhas preenchidas — nenhum passo do Fluxo Principal ficou só em prosa.

### Checklist final

- [x] Explorer — história, contexto, fluxo, dependências, critérios de aceite completos
- [x] QA Explorer — happy path, bordas, isolamento, rastreabilidade 1:1
- [x] Tech Explorer — migration, 2 alterações de código, frontend, estimativa, riscos
- [x] Rastreabilidade ponta a ponta — tabela acima, sem célula vazia
- [x] Sem bloqueios não resolvidos — história pequena e bem contida, sem achados que exigissem
      repasse adicional de PM/QA/Backend (confirmado pelo usuário, mesmo ritmo do `ORD-197`)
