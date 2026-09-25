# ORD-207 — Cadastro de parceiro

**Status:** Ready
**Serviço:** company-service + frontend/admin (primeira UI real da frente de monetização)
**Frente:** Monetização (parcerias comissionadas + faturamento B2B) — sequência direta do ORD-206
(`docs/stories/ORD-206-estrutura-tabela-comissionamento-parceiros.md`, PR #172 aberta).

## História

Como Administrativo/Financeiro da Ordin, quero cadastrar e manter parceiros comerciais (PF ou PJ),
vinculados a uma tabela de comissão, com registro do aceite do contrato clickwrap, para viabilizar
o programa de parceiros com rastreabilidade suficiente pro futuro fechamento mensal de comissão.

## Contexto e motivação

Segunda peça da frente de monetização (2026-09-25), sequência direta do ORD-206. O ORD-206 criou a
estrutura de tabela de comissão (`CommissionTable`/`CommissionTableHistory`) deliberadamente sem
nenhuma entidade "Parceiro" — esta história é onde ela nasce e se conecta à estrutura já pronta.
Sem cadastro de parceiro, não existe "quem" vincular à tabela de comissão nem "quem" vai receber
pagamento no fechamento mensal (história futura) — bloqueante pra fechar a cadeia comercial.

**Condição herdada do repasse de PM do ORD-206** (não pode ser esquecida): como o ORD-206 não teve
nenhum frontend, esta história precisa entregar uma tela real que permita visualizar/escolher a
tabela de comissão vinculada a cada parceiro — é a primeira vez que a estrutura de comissão fica
visível pra um humano.

### Decisões por lente (fechadas no Explorer, refinadas nos repasses)

- **[Financeiro]** Sem dado bancário nesta história — só entra quando existir pagamento de comissão
  de fato (fechamento mensal, história futura). Coletar agora seria armazenar dado sensível sem uso
  imediato.
- **[Administrativo]** Clickwrap é registro **interno**: o Administrativo/Financeiro da Ordin
  confirma que o parceiro aceitou os termos fora da plataforma (e-mail, conversa comercial) — mesma
  filosofia do `CompanyContractScreen.tsx` ("assinatura acontece fora, aqui só registra"). Não
  existe portal self-service do parceiro nesta história.
- **[Administrativo → Financeiro, refinado]** Campo `acceptance_reference` (texto livre,
  **obrigatório**, `min_length=10`) — referência de onde está a evidência real do aceite (ex.:
  "e-mail de 20/09 com fulano@parceiro.com"). Proposto pelo Administrativo como opcional, corrigido
  pelo Financeiro pra obrigatório: é a única evidência de uma obrigação de pagamento futura, não
  pode ficar em branco.
- **[Financeiro]** Um parceiro pode trocar de `CommissionTable` ao longo do tempo — gera histórico
  próprio (`PartnerCommissionHistory`), separado do `CommissionTableHistory` do ORD-206 (que só
  rastreia mudança de VALOR dentro de uma tabela, não qual parceiro usa qual tabela quando).
- **[Administrativo]** Parceiro nasce ativo; desativação e reativação são soft (`deactivated_at`),
  ambas idempotentes, preservam vínculo e histórico — nunca hard-delete.
- **[Administrativo]** Documento (CPF/CNPJ) e tipo (PF/PJ) são **imutáveis** depois de criados —
  evita contaminar o histórico de comissão futuro vinculado ao `partner_id` com uma troca de
  identidade legal sem rastro. Risco aceito conscientemente: um parceiro cadastrado com documento
  errado vira um registro "zumbi" (inativável, mas não corrigível via API) — aceitável pro volume
  baixíssimo esperado nesta fase; correção via suporte/acesso direto ao banco se necessário.

### Pendências de contador/advogado (sinalizadas, não resolvidas aqui)

Enquadramento fiscal de retenção sobre comissão PF (IRRF via RPA) vs. PJ (nota fiscal do parceiro)
— não é resolvido nesta história (não há pagamento de comissão ainda). `partner_type` existe como
**dado**, não como regra — a regra de retenção fica inteiramente na futura história de pagamento,
sem meia-implementação aqui (confirmado pelo Financeiro). Fica registrado como pré-requisito daquela
história futura, junto com a confirmação de que a reativação do CNPJ da Ordin concluiu.

## Fluxo principal

1. Administrativo/Financeiro cria um parceiro (nome, tipo PF/PJ, documento, e-mail, telefone).
2. Registra o aceite do contrato clickwrap (versão do termo, `acceptance_reference`, quem
   registrou) — obrigatório pra criar o parceiro, parte do mesmo payload de criação.
3. Vincula o parceiro a uma tabela de comissão existente (`CommissionTable` do ORD-206, não pode
   estar arquivada).
4. Troca a tabela de comissão vinculada a um parceiro existente — gera entrada em
   `PartnerCommissionHistory`.
5. Lista os parceiros cadastrados, com nome, tipo, tabela de comissão vinculada e status
   (ativo/inativo) visíveis direto na listagem — opção de incluir inativos.
6. Desativa um parceiro (soft) — preserva vínculo e histórico.
7. Reativa um parceiro inativo (soft) — restaura status, preserva vínculo e histórico.

## Fluxos alternativos / exceções

- Tentar criar parceiro sem confirmar o aceite do clickwrap → bloqueado (422).
- Tentar vincular (na criação ou na troca) um parceiro a uma `CommissionTable` arquivada →
  bloqueado (422).
- CPF/CNPJ inválido (dígito verificador) → erro de validação, reaproveitando
  `domain/cpf.py`/`domain/cnpj.py` já existentes.
- CPF/CNPJ duplicado → 422 (catch de `IntegrityError`, mesmo padrão de `create_company` pra CNPJ
  duplicado — não 409, por consistência com o resto do serviço).
- Trocar a tabela vinculada pra mesma que já está vinculada → no-op idempotente, sem gerar
  histórico.
- Desativar/reativar um parceiro que já está no estado alvo → no-op idempotente.
- Enviar `document`/`partner_type` num `PUT` de edição → ignorado silenciosamente (campos não
  fazem parte de `PartnerUpdateIn`; comportamento padrão do Pydantic sem `extra="forbid"`).
- Enviar campos de dado bancário no payload de criação → ignorados silenciosamente, mesmo
  mecanismo acima.
- **Tentar excluir uma `CommissionTable` (ORD-206) vinculada a um parceiro** → bloqueado (409),
  correção retroativa no endpoint `DELETE /commercial/commission-tables/{id}` (ver seção técnica).

## Dependências

- **Serviço:** company-service (mesmo serviço do ORD-206) + frontend admin (nova
  `PartnerListScreen.tsx`/tela de cadastro).
- **Histórias bloqueantes:** ORD-206 (Ready, implementado, PR #172 — `CommissionTable` precisa
  existir antes desta história poder vincular parceiro a ela).
- **Histórias que dependem desta:** cálculo de comissão / fechamento mensal (precisa de "quem é o
  parceiro" pra saber a quem pagar, e da regra de retenção PF/PJ ainda não resolvida); vínculo
  Company→Partner ("empresa X foi ativada pelo parceiro Y" — história futura própria, ainda sem
  número).

## Fora de escopo (histórias futuras, não travam esta)

Dado bancário, geração de cobrança/link MP pra comissão, cálculo de comissão e fechamento mensal,
seção de parcerias no site institucional (cadastro público), vínculo Company→Partner, edição de
`document`/`partner_type` depois de criado, exclusão real (hard-delete) de parceiro.

## Critérios de aceite funcionais

- [PM] CRUD de parceiro: nome, tipo (PF/PJ), documento, e-mail, telefone.
- [Administrativo] Documento validado conforme tipo (CPF pra PF, CNPJ pra PJ), reaproveitando
  `domain/cpf.py`/`domain/cnpj.py`.
- [Administrativo] Documento é único — não pode haver dois parceiros com o mesmo CPF/CNPJ.
- [Administrativo] Aceite do contrato clickwrap é obrigatório na criação (versão do termo,
  `acceptance_reference` obrigatório, quem registrou, quando).
- [PM] Todo parceiro tem exatamente uma `CommissionTable` vinculada a qualquer momento; a tabela
  vinculada pode ser trocada depois da criação.
- [Administrativo] Não é possível vincular um parceiro a uma `CommissionTable` arquivada.
- [Financeiro] Toda troca de tabela de comissão vinculada a um parceiro gera entrada em
  `PartnerCommissionHistory` (de qual tabela, pra qual, quem, quando), com `from` correto mesmo sob
  concorrência.
- [PM] Listagem de parceiros mostra nome, tipo, tabela de comissão vinculada e status
  (ativo/inativo) sem precisar abrir o detalhe de cada um.
- [PM] Listagem por padrão mostra só parceiros ativos, com opção de incluir inativos.
- [Administrativo] Desativação de parceiro é soft — nunca exclusão real.
- [Administrativo] Um parceiro inativo pode ser reativado, restaurando o status e preservando
  vínculo e histórico.
- [Financeiro] Nenhum dado bancário é coletado nesta história.
- [Backend-SR] Uma `CommissionTable` (ORD-206) vinculada a ao menos um parceiro não pode ser
  excluída de verdade — só arquivada.
- Isolamento multi-tenant: N/A — dado de plataforma, sem `company_id`.

## Wireframe / Mockup (descrito em prosa)

Nova tela **"Parceiros"** no admin da plataforma (superadmin/admin), ao lado de onde
`CommissionTable`/`PriceTable` são gerenciados.

- **Lista**: colunas Nome, Tipo (PF/PJ), Documento (mascarado), Tabela de comissão vinculada,
  Status (badge ativo/inativo) — botão "Novo parceiro", toggle "mostrar inativos", clique na linha
  abre o detalhe/edição (mesma tela, não uma tela separada — mesmo padrão do
  `CompanyContractScreen`).
- **Formulário de criação/edição**: nome, tipo, documento, e-mail, telefone + seletor de
  `CommissionTable` (dropdown, só tabelas não-arquivadas) + campo `acceptance_reference` +
  checkbox de aceite do contrato clickwrap (texto explicativo, obrigatório pra salvar na criação).
- **Aba de histórico** no detalhe do parceiro: lista de trocas de tabela de comissão
  (`PartnerCommissionHistory`), mesmo padrão visual de histórico já usado em outras telas do admin.

## Solução Técnica

### Serviços impactados

- **company-service**: `Partner` + `PartnerCommissionHistory`, migration, 8 endpoints novos sob
  `/commercial/partners` — e uma correção pontual em `DELETE /commercial/commission-tables/{id}`
  (endpoint do ORD-206, PR #172).
- **frontend/admin**: nova `PartnerListScreen.tsx`.

### Modelo de dados

```python
class Partner(Base):
    __tablename__ = "partners"
    id                      = Column(Integer, primary_key=True)
    name                    = Column(String(120), nullable=False)
    partner_type            = Column(String(2), nullable=False)  # "PF" | "PJ" — imutável após criação
    document                = Column(String(20), nullable=False, unique=True, index=True)  # imutável após criação
    email                   = Column(String(255), nullable=False)  # str simples, sem validação de formato (consistente com ContactIn.email)
    phone                   = Column(String(20), nullable=False)
    acceptance_reference    = Column(String(500), nullable=False)  # obrigatório — evidência do aceite fora da plataforma
    commission_table_id     = Column(Integer, nullable=False, index=True)  # sem FK real, mesmo padrão do resto do serviço
    accepted_term_version   = Column(String(10), nullable=False)  # "v1", constante no código
    accepted_at             = Column(DateTime, nullable=False)
    registered_by_user_id   = Column(Integer, nullable=True)
    deactivated_at          = Column(DateTime, nullable=True)
    created_at              = Column(DateTime, default=datetime.utcnow)


class PartnerCommissionHistory(Base):
    # Append-only — só registra TROCA de tabela vinculada (from/to), nunca a
    # atribuição inicial na criação (mesma filosofia de CompanyPlanHistory).
    # Reconstrução de "qual tabela valia em qual mês" (achado do repasse de
    # Financeiro, documentado aqui pra não ser rederivado errado na história
    # de fechamento mensal): sem nenhuma entrada, commission_table_id atual
    # do Partner vale desde created_at; com entradas, from_commission_table_id
    # da mais antiga vale desde created_at até ela, e cada to_commission_table_id
    # vale até a próxima troca (ou até agora, na última).
    __tablename__ = "partner_commission_history"
    id                          = Column(Integer, primary_key=True)
    partner_id                  = Column(Integer, nullable=False, index=True)
    from_commission_table_id    = Column(Integer, nullable=False)
    to_commission_table_id      = Column(Integer, nullable=False)
    changed_by_user_id          = Column(Integer, nullable=True)
    created_at                  = Column(DateTime, default=datetime.utcnow)
```

Schema `PartnerIn`: `partner_type` via `Field(pattern="^(PF|PJ)$")` (mesmo idiom de
`PriceTableKindIn`); validação cruzada documento↔tipo feita no handler (mesma escolha do ORD-206
pra regras que dependem de outro campo do mesmo payload, sem precedente de `model_validator`
cross-field no arquivo).

### Endpoints

Todos exigem JWT + `_require_platform_admin`, sem `company_id`.

| Método | Rota | Descrição |
|---|---|---|
| POST | `/commercial/partners` | Cria parceiro. Valida: `confirm_clickwrap` obrigatório (422 se ausente); documento por tipo (`domain/cpf.py`/`cnpj.py`); `CommissionTable` existe (404) e não-arquivada (422); catch `IntegrityError` → 422 documento duplicado. |
| GET | `/commercial/partners?include_inactive=false` | Lista parceiros, com `commission_table` embutido. |
| GET | `/commercial/partners/{id}` | Detalhe de um parceiro. 404 se não existe. |
| PUT | `/commercial/partners/{id}` | Edita `name`/`email`/`phone` — `document`/`partner_type`/`acceptance_reference` imutáveis, ignorados se enviados. |
| POST | `/commercial/partners/{id}/commission-table` | Troca tabela vinculada. `SELECT * FROM partners WHERE id=:id FOR UPDATE` (lock de linha, lê `commission_table_id` atual dentro do lock antes de decidir o `from` — corrige race de troca concorrente). Valida tabela nova existe/não-arquivada. Idempotente se igual à atual (sem histórico). |
| POST | `/commercial/partners/{id}/deactivate` | Soft, idempotente. |
| POST | `/commercial/partners/{id}/reactivate` | Soft, idempotente. |
| GET | `/commercial/partners/{id}/history` | Histórico de troca de tabela, ordenado por `created_at asc`. |

**Correção retroativa no ORD-206** — `DELETE /commercial/commission-tables/{id}` (já existente,
`services/company/main.py`, PR #172) ganha uma terceira checagem, com mensagem distinta da de
histórico:

```python
async def _has_partner_linked(db: AsyncSession, commission_table_id: int) -> bool:
    result = await db.execute(
        select(Partner.id).where(Partner.commission_table_id == commission_table_id).limit(1)
    )
    return result.scalar_one_or_none() is not None
```

```python
    if await _has_partner_linked(db, commission_table_id):
        raise HTTPException(
            409,
            "Tabela está vinculada a ao menos um parceiro e não pode ser excluída — "
            "troque a tabela desse(s) parceiro(s) antes, ou arquive esta tabela em vez de excluí-la.",
        )
```

`archive_commission_table` **não** precisa dessa checagem — arquivar não quebra o vínculo existente
de um parceiro, só tira a tabela da lista de "disponível pra novo vínculo".

### Migration

Nova migration em `services/company/migrations/versions/`, `down_revision` apontando pra head atual
(a do ORD-206, `20260925_1500`). Cria `partners` (unique index em `document`, index em
`commission_table_id`) e `partner_commission_history` (index em `partner_id`).

### Eventos de fila

N/A — nenhuma mudança de estado aqui precisa ser propagada de forma assíncrona.

### Impacto em outros serviços

N/A — tudo dentro do company-service e seu próprio frontend.

### Riscos técnicos

- **Parceiro com documento errado é "zumbi"** (sem exclusão real, documento imutável) — risco
  aceito conscientemente pelo Administrativo, volume esperado baixíssimo nesta fase.
- **Race condition na troca de tabela** — mitigada com lock de linha (`SELECT ... WHERE id=:id FOR
  UPDATE`), primeiro uso desse padrão específico no arquivo (os dois locks existentes do ORD-206
  trancam a tabela inteira, não uma linha) — padrão simples e sem exotismo, sem necessidade de mais
  precedente.
- **Unicidade de documento sob concorrência** — `UniqueConstraint` no banco + catch de
  `IntegrityError`, mesmo padrão testado de `create_company`. Recomendado (achado do repasse de QA)
  rodar esse teste de fato contra SQLite antes de fechar, não só assumir por analogia.
- **Referência órfã em `CommissionTable`** — corrigida com `_has_partner_linked` no `DELETE` do
  ORD-206 (ver acima).
- **Evidência de aceite clickwrap é só uma referência textual**, não um artefato anexado — aceito
  como proporcional ao volume inicial esperado; revisar com advogado real se o programa de
  parceiros crescer a ponto de justificar mais rigor.

### Estimativa

- **Backend:** 10–14h (2 modelos + migration + 8 endpoints + correção retroativa no ORD-206 +
  testes cobrindo os 33 cenários).
- **Frontend:** 12–16h (primeira tela real desta frente — lista, formulário, aba de histórico).

## QA Explorer — cenários Gherkin (33 no total)

29 cenários originais (criação PF/PJ válida e inválida, aceite clickwrap obrigatório, vínculo e
troca de `CommissionTable`, histórico from/to, listagem com filtro de inativos, desativação e
reativação idempotentes, rejeição de dado bancário, controle de acesso) + 3 do repasse de QA
(e-mail vazio no `PUT`, `document`/`partner_type` ignorados no `PUT`, trocar pra mesma tabela não
gera histórico) + 1 do repasse de Backend-SR (excluir `CommissionTable` vinculada a parceiro é
bloqueado, 409). Cenário "erro e-mail em formato inválido" foi corrigido pra "erro e-mail vazio"
(sem validação de formato, consistente com `ContactIn.email`); cenário "documento duplicado" foi
corrigido de 409 pra 422 (consistente com `create_company`).

## Repasses realizados (todos concluídos, achados aplicados)

| Repasse | Achados aplicados |
|---|---|
| PM | Reativação de parceiro adicionada ao escopo (soft desativação sem reativação não fazia sentido de produto) — 2 cenários novos; confirmado que os 7 passos do Fluxo Principal têm critério e cenário (sem lacuna tipo ORD-194); wireframe em prosa suficiente pra avançar. |
| QA | 3 cenários de borda novos (e-mail vazio no PUT, campos imutáveis ignorados no PUT, troca pra mesma tabela idempotente); nota de atenção pra testar de fato o `IntegrityError` de documento duplicado contra SQLite. |
| Backend-SR | Confirmado `SELECT WHERE id FOR UPDATE` como padrão seguro mesmo sem precedente exato no arquivo; confirmado catch genérico de `IntegrityError` seguro (única unique constraint da tabela); **achado bloqueante:** `DELETE` de `CommissionTable` (ORD-206) não checava vínculo de `Partner` — corrigido com `_has_partner_linked`; confirmado que `document` sem máscara é consistente com `Company.document`. |
| Administrativo | Proposto campo `acceptance_reference` (evidência do aceite); confirmado documento imutável como risco aceito; proposta de mensagem de erro distinta pro `DELETE` bloqueado por vínculo de parceiro; confirmado que LGPD é coberto pela base legal de execução de contrato, sem ação nova exigida por esta história. |
| Financeiro | `acceptance_reference` corrigido de opcional pra **obrigatório** (embasa obrigação de pagamento futura); documentada a lógica de reconstrução de "qual tabela valia em qual mês" pro fechamento mensal futuro; confirmado que `partner_type` sem regra de retenção nesta história é correto (sem meia-implementação); confirmado que métricas de investidor (parceiros ativos, por tipo, por tabela) são respondíveis com o desenho atual. |

## Checklist de Ready

Todos os itens do checklist (Explorer, QA Explorer, Tech Explorer, rastreabilidade ponta a ponta,
aprovação final) verificados — ver histórico de conversa da sessão em que esta história foi
desenhada. ✅ **ORD-207 está Ready.**
