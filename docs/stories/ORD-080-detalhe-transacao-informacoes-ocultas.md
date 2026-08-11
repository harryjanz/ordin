---
id: ORD-080
status: Ready
fase: 6
sprint: null
responsavel: Backend + Frontend
estimativa: 4 pontos
---

# ORD-080 — Detalhe da transação TEF: informações importantes hoje ocultas

## Descrição
Quarta e última história da análise de PM sobre `/payments` (ver [[ORD-077]] pra contexto geral). O pedido do usuário foi genérico ("podemos também trazer informações importantes") — investiguei o que exatamente está sendo guardado no banco e nunca chega no admin, em vez de supor. O achado mais forte: **o motivo de uma transação ter sido recusada nunca é salvo em lugar nenhum** — o dado existe por um instante e se perde.

## Persona
Admin/owner/manager investigando uma transação específica — seja porque o cliente reclamou, o caixa perguntou por que uma venda foi recusada, ou o suporte da PayGo/Mercado Pago pediu o `provider_transaction_id` pra investigar do lado deles.

## Contexto

### Achado 1 — o motivo de recusa nunca é persistido (o mais importante)
`TransactionResult.error_message` (`domain/schemas.py:28`) é preenchido pelo provider e usado **uma única vez**: na resposta HTTP síncrona pro totem no momento da recusa (`main.py:376`, `"error": result.error_message or "Não autorizado"`). Em nenhum ponto do fluxo esse valor é gravado em `tx.*` antes do `db.commit()` — confirmei com uma query direta no banco: transações `refused` reais no ambiente de dev têm `paygo_response IS NULL` (o único campo que poderia carregar algo parecido, e mesmo assim só seria preenchido por PayGo, não por mock/MercadoPago). **Hoje, se um cliente perguntar "por que minha compra foi recusada ontem", a resposta é literalmente impossível de recuperar** — o dado nunca existiu além do momento da tela do totem.

### Achado 2 — campos que já estão no banco mas nunca chegam no admin
Comparando a tabela `transactions` (`main.py:46-69`) com o que `TransactionOut`/`list_payments` devolve (`main.py:155-165`, `397-409`):

| Campo no banco | Hoje no admin? | Por que importa |
|---|---|---|
| `environment` (sandbox/production) | Não | Saber se uma transação foi teste ou real é crítico pra não contar receita de sandbox como faturamento de verdade |
| `terminal_id` | Só o número (`OrdersScreen` também só mostra "Terminal {id}", mesmo padrão) | Terminal tem `label` de verdade no company-service (`services/company/main.py:131`, ex: "Totem 1 - Entrada", ver `project_ordin_dev_reference`) — número puro não diz nada pra quem opera |
| `cancelled_at` / `cancel_reason` | Não | Fica **crítico** depois de [[ORD-079]] existir — sem isso, um cancelamento vira uma mudança de status sem explicação visível |
| `provider_transaction_id` | Não | É a referência que o suporte da PayGo/Mercado Pago pede quando alguém liga pra investigar uma transação — sem ela, o operador não tem o que informar |
| `tef_number` | Não | Número da maquininha física — relevante quando a empresa tem mais de uma máquina no mesmo terminal |

### Por que uma tela de detalhe, não só mais colunas na tabela
A tabela já tem 8 colunas (`PaymentsScreen.tsx:30-39`); enfiar mais 5 sem hierarquia vira ruído. O padrão já existe no próprio admin: `OrdersScreen.tsx` (`39-46`, `96-135`) expande a linha ao clicar, carregando detalhe sob demanda (`api.get` só dispara na primeira expansão, resultado fica em cache local) — mesmo padrão que proponho aqui, não um padrão novo.

---

## Explorer

### História
Como **admin/owner/manager**, quero expandir uma transação na tabela e ver seus detalhes completos (ambiente, terminal, referência do provider, e motivo — de recusa ou cancelamento), para investigar um caso específico sem precisar pedir consulta direta ao banco.

### Fluxo principal
1. Usuário clica numa linha da tabela de transações
2. Linha expande (mesmo padrão visual do `OrdersScreen`) mostrando: ambiente (tag "Sandbox"/"Produção"), terminal (nome, não só número — buscado sob demanda), referência do provider (`provider_transaction_id`), e:
   - se `refused`: motivo da recusa (novo campo, ver Tech Explorer — **não existe pra transações já recusadas antes desta história**, só pra novas a partir do deploy)
   - se `cancelled`: motivo do cancelamento + data/hora (vem de [[ORD-079]])
3. Clicar de novo recolhe a linha

### Critérios de aceite
- [ ] Linha expansível mostra: ambiente, terminal (nome), `provider_transaction_id`, `tef_number` (quando houver)
- [ ] Transação `refused`: mostra motivo da recusa quando disponível — e deixa claro quando não está disponível ("Motivo não registrado — transação anterior a [data]"), não um campo vazio sem explicação
- [ ] Transação `cancelled`: mostra motivo do cancelamento e data/hora (depende de [[ORD-079]] estar implementada pra ter dado real pra mostrar, mas o espaço na UI já nasce pronto pra isso)
- [ ] Terminal mostra `label` (nome), não só o ID — busca sob demanda ao expandir, mesmo padrão do `OrdersScreen`
- [ ] Ambiente sandbox visualmente distinto (tag de aviso, não a mesma cor neutra dos outros dados) — evita confundir teste com transação real
- [ ] Não quebra a tabela existente — é aditivo, expande a linha, não substitui nenhuma coluna atual

### Wireframe / Mockup
Ver protótipo (Artifact) — painel expansível abaixo da linha, mesma estrutura de `OrdersScreen.tsx:96-135` (`colSpan` cobrindo todas as colunas, grid de pares label/valor em vez da sub-tabela de tickets que o Orders usa, já que aqui não tem uma lista aninhada, são só campos).

---

## QA Explorer

```gherkin
Feature: Detalhe da transação TEF

  Scenario: Expandir mostra ambiente e terminal
    Dado uma transação aprovada em ambiente sandbox no terminal "Totem 1 - Entrada"
    Quando o usuário clica na linha
    Então vê a tag "Sandbox" e o nome do terminal (não só o número)

  Scenario: Transação recusada com motivo registrado
    Dado uma transação refused criada após esta história ir ao ar
    Quando o usuário expande a linha
    Então vê o motivo da recusa retornado pelo provider

  Scenario: Transação recusada sem motivo (dado histórico)
    Dado uma transação refused criada antes desta história existir
    Quando o usuário expande a linha
    Então vê uma indicação clara de que o motivo não foi registrado (não um campo vazio)

  Scenario: Transação cancelada mostra motivo e data
    Dado uma transação cancelada via ORD-079, com motivo "Contestação do cliente"
    Quando o usuário expande a linha
    Então vê o motivo e a data/hora do cancelamento

  Scenario: Colapsar a linha
    Dado uma linha expandida
    Quando o usuário clica nela de novo
    Então o painel de detalhe fecha

  Scenario: Terminal buscado sob demanda
    Dado que o usuário nunca expandiu nenhuma linha desse terminal antes
    Quando expande a primeira linha desse terminal
    Então uma requisição busca o nome do terminal
    E expandir outra linha do mesmo terminal não repete a requisição (cache local)
```

---

## Tech Explorer

### Serviços impactados
- `services/payment/main.py` — nova coluna `refused_reason`, migration Alembic, `TransactionOut` ganha campos novos
- `services/payment/migrations/` — nova migration
- `frontend/admin/` — `PaymentsScreen.tsx` (expand pattern), `PaymentsScreen.module.scss`

### Direção técnica proposta

**Backend — persistir o motivo de recusa (Achado 1):**
```python
# main.py:46-69 — novo campo na tabela
refused_reason = Column(String(255), nullable=True)

# main.py, dentro de create_payment, antes do commit no caminho de recusa (perto da linha 302)
tx.status = result.status.value
if result.status not in (TransactionStatus.approved, TransactionStatus.processing):
    tx.refused_reason = result.error_message
await db.commit()
```
Migration Alembic simples (`ADD COLUMN refused_reason VARCHAR(255) NULL`), mesmo padrão das migrations já existentes em `services/payment/migrations/versions/` (ex: `20260618_1100_add_pix_fields_to_transactions.py`).

**Backend — expor campos existentes:**
```python
class TransactionOut(BaseModel):
    ...  # campos já existentes
    environment: Optional[str] = None
    terminal_id: int
    provider_transaction_id: Optional[str] = None
    tef_number: Optional[str] = None
    cancelled_at: Optional[str] = None
    cancel_reason: Optional[str] = None
    refused_reason: Optional[str] = None
```
Todos esses campos **já existem na tabela** — é só parar de omiti-los na serialização (`main.py:397-409`).

**Backend — nome do terminal:** endpoint novo e pequeno, `GET /payments/terminals/{id}/label` no payment-service chamando `_get_terminal_config` (já existe, `main.py:98-110`) e devolvendo só o `label` — ou o frontend chama um endpoint equivalente do company-service diretamente, se existir um público (a rotear e confirmar no momento da implementação; `_get_terminal_config` hoje é uma chamada **interna** service-a-service com `X-Internal-Secret`, não exposta pro browser — precisa de um endpoint público novo, autenticado por JWT normal, não pelo header interno).

**Frontend:** clona o padrão de `OrdersScreen.tsx:39-46` (`expanded`/`setExpanded`, `tickets`/`setTickets` como cache por chave) — aqui a "chave" é `transaction.id`, e em vez de buscar tickets, busca (se ainda não tiver) o label do terminal.

### Riscos
- **Dado histórico sem motivo (Achado 1):** o `refused_reason` só existe pra transações **novas**, a partir do deploy — transações antigas ficam com `NULL` pra sempre (não dá pra reconstruir um dado que nunca foi capturado). O critério de aceite já cobre isso explicitamente (mensagem "não registrado"), pra não parecer bug quando for só dado histórico faltante.
- **Endpoint novo de terminal label:** precisa decidir se é um endpoint novo no `payment-service` (proxying pra company-service) ou se o frontend chama `company-service` diretamente — a segunda opção é mais simples mas quebra o padrão atual de "cada tela só fala com o serviço dono do próprio domínio" (o admin hoje não tem nenhuma chamada direta a `company-service` fora das telas de empresa). Recomendo a primeira opção (proxy no payment-service) pra manter esse padrão, mesmo sendo uma chamada a mais.
- **Motivo de recusa pode conter texto do provider não traduzido** (ex: resposta bruta de um adquirente em inglês/código) — vale um mapeamento mínimo de mensagens conhecidas pra português amigável na hora de exibir, sem obrigação de cobrir 100% dos casos na v1 (fallback: mostrar o texto bruto mesmo, melhor que nada).

### Estimativa
4 pontos — 1 coluna nova + migration + endpoint de terminal label (pequeno) no backend; expand-row reaproveitando padrão já existente no frontend. Soft-depende de [[ORD-079]] pra ter dado real de cancelamento pra mostrar (mas a estrutura da UI não depende disso pra ser construída).

---

## Ready

**Explorer:** [x] fluxo e critérios definidos, achado principal (motivo de recusa nunca persistido) documentado com evidência de banco · **QA Explorer:** [x] cenários cobrindo dado novo vs. histórico ausente, cache de terminal, expand/colapse · **Tech Explorer:** [x] migration proposta, contrato de API estendido, riscos sobre endpoint novo e dado histórico · **Aprovação final:** [x] aprovado no chat pelo usuário (2026-08-11)

**Status: Ready** — pode começar a implementação.
