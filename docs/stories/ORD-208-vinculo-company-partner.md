# ORD-208 — Vínculo Company→Partner (quem ativou qual cliente)

**Status:** Ready
**Serviço:** company-service + frontend/admin (nova seção em tela já existente)
**Frente:** Monetização (parcerias comissionadas + faturamento B2B) — sequência do ORD-206
(`docs/stories/ORD-206-estrutura-tabela-comissionamento-parceiros.md`) e ORD-207
(`docs/stories/ORD-207-cadastro-de-parceiro.md`), ambos mergeados em `main`.

## História

Como Administrativo/Financeiro da Ordin, quero registrar e manter qual parceiro (se algum) trouxe
cada empresa cliente, para viabilizar o futuro cálculo de comissão sobre clientes ativados por
parceria.

## Contexto e motivação

Terceira peça da frente de monetização. O ORD-206 criou a estrutura de comissão
(`CommissionTable`) e o ORD-207 criou o cadastro de parceiro (`Partner`), cada um vinculado a
exatamente 1 `CommissionTable`. Faltava a peça que conecta os dois lados ao cliente final: sem
este vínculo, o futuro cálculo de comissão (história ainda sem número) não tem como responder
"esta empresa foi trazida por qual parceiro" — a informação não existe em lugar nenhum do sistema
hoje. Identificado como pendência explícita desde o Explorer do ORD-207.

### Decisões por lente

- **[PM/Administrativo]** O vínculo é um **fato comercial corrigível**, não uma identidade imutável
  (diferente de `Partner.document`/`partner_type`, ORD-207) — editável a qualquer momento, em
  qualquer empresa (nova ou já cadastrada há tempos). Empresas antigas nascem sem parceiro — estado
  válido e esperado, não uma lacuna a corrigir em massa.
- **[Administrativo]** Preenchimento 100% manual pelo Administrativo — sem nenhum mecanismo de
  rastreio/código de indicação automático nesta história (evita inflar o escopo com infraestrutura
  de tracking que ninguém pediu).
- **[Financeiro]** Toda troca (incluindo `null→parceiro`, `parceiro→null`, `parceiro→outro
  parceiro`) gera entrada de histórico auditável. Mesmo parceiro repetido (inclusive `null==null`)
  é idempotente, sem histórico falso.
- **[Financeiro]** O vínculo independe do status do parceiro — desativar o parceiro (ORD-207) não
  desfaz nem altera o vínculo já registrado; é permitido até vincular diretamente a um parceiro já
  inativo (só alcançável via API direta — o dropdown da UI só oferece parceiros ativos).
- **[Administrativo, refinado no repasse]** Campo `note` **opcional** no histórico — texto livre
  pra justificar o vínculo quando necessário (ex.: disputa comercial futura). Diferente do
  `acceptance_reference` **obrigatório** do `Partner` (ORD-207): aqui o vínculo não sustenta
  nenhuma obrigação de pagamento por si só, então forçar preenchimento numa venda direta óbvia
  seria fricção sem contrapartida de risco.
- **[PM]** UI entra como nova seção "Parceiro" dentro de `CompanyContractScreen.tsx` — único ponto
  de detalhe de empresa pro superadmin/admin hoje — não como tela nova.
- **[Backend-SR]** Acesso via `_require_platform_admin` (superadmin/admin, sem bypass de
  owner/manager) — **não** `_require_company_admin` (usado por `get_company_plan`, que permite o
  cliente ver o próprio plano). O vínculo com parceiro é informação comercial interna da Ordin, não
  deve vazar pro cliente final.

### Pendências de contador/advogado

**Nenhuma.** Confirmado 2x (Administrativo e Financeiro): o vínculo em si não gera nenhuma
obrigação fiscal ou jurídica — é só um registro de referência interna. Só a futura história de
cálculo/pagamento de comissão terá implicação fiscal real (retenção PF vs. nota fiscal PJ, já
sinalizado desde o ORD-206/207).

## Fluxo principal

1. Administrativo abre o detalhe de uma empresa cliente (`CompanyContractScreen`) e vê a seção
   "Parceiro" — mostra o parceiro vinculado atualmente (com indicação se está inativo) ou "Nenhum
   parceiro vinculado".
2. Administrativo seleciona um parceiro ativo e salva — gera entrada de histórico (`from: null`
   → `to: parceiro`).
3. Administrativo pode trocar o parceiro vinculado depois — gera nova entrada de histórico.
4. Administrativo pode remover o vínculo (selecionar "nenhum") — gera entrada de histórico com
   `to: null`.
5. Administrativo consulta o histórico de vínculos daquela empresa (quem foi vinculado, quando,
   por quem, com nota opcional).

## Fluxos alternativos / exceções

- Empresa nunca teve nenhum parceiro vinculado → estado válido, sem histórico, "Nenhum parceiro
  vinculado".
- Tentar vincular a um parceiro inexistente → 404.
- Tentar vincular a uma empresa inexistente → 404.
- Selecionar o mesmo parceiro já vinculado (ou "nenhum" numa empresa já sem parceiro) → no-op
  idempotente, sem histórico.
- Parceiro vinculado é desativado depois → vínculo permanece intacto, sem mudança automática; a
  consulta do vínculo passa a mostrar o status "inativo" do parceiro.
- Vincular diretamente a um parceiro já inativo (via API) → permitido, sem bloqueio (não
  alcançável pela UI real).

## Dependências

- **Serviço:** company-service (mesmo serviço de `Company` e `Partner`) + frontend admin.
- **Histórias bloqueantes:** ORD-206 e ORD-207 (`CommissionTable`/`Partner` precisam existir) —
  ambas já mergeadas em `main`.
- **Histórias que dependem desta:** cálculo de comissão / fechamento mensal (história futura, ainda
  sem número) — precisa deste vínculo pra saber a quem pagar.

## Fora de escopo (histórias futuras, não travam esta)

Cálculo de comissão em si, rotina de fechamento mensal, geração de cobrança/pagamento ao parceiro,
qualquer regra de "o que conta como uma ativação" além do vínculo simples de referência.

## Critérios de aceite funcionais

- [PM] Toda `Company` pode ter no máximo 1 `Partner` vinculado por vez (ou nenhum).
- [PM] O vínculo é editável a qualquer momento, em qualquer empresa (nova ou já existente).
- [Administrativo] Só é possível vincular a um parceiro que exista (404 se não existir).
- [Financeiro] Toda troca de vínculo (incluindo definir pela primeira vez ou remover) gera entrada
  de histórico auditável (de qual parceiro, pra qual, quem alterou, quando, com nota opcional).
- [Financeiro] Selecionar o mesmo vínculo já vigente (inclusive "nenhum" → "nenhum") não gera
  histórico falso (idempotente).
- [Financeiro] O vínculo não é desfeito nem alterado automaticamente quando o parceiro vinculado é
  desativado.
- [PM] A consulta do vínculo atual retorna o status do parceiro (ativo/inativo) resolvido ao vivo,
  pra UI poder indicar visualmente quando o parceiro vinculado está inativo.
- [PM] A tela de detalhe da empresa mostra claramente o parceiro vinculado atualmente (ou a
  ausência de vínculo) e o histórico de trocas.
- [Administrativo] O seletor de novo vínculo na UI só lista parceiros ativos.
- [Administrativo] É permitido vincular diretamente a um parceiro já inativo via API (decisão
  consciente, não bloqueada no backend) — mesmo essa opção não sendo alcançável pela UI real.
- Isolamento multi-tenant: N/A — mesmo padrão de acesso de `CompanyContractScreen` (platform-admin
  only); owner/manager recebe 403.

## Tabela de rastreabilidade ponta a ponta

| Passo do Fluxo Principal | Critério de aceite | Cenário Gherkin | Endpoint/tela |
|---|---|---|---|
| 1. Ver seção "Parceiro" (vinculado, inativo, ou nenhum) | Consulta retorna vínculo + status do parceiro; mostra "nenhum" corretamente | Consultar vínculo atual; consultar sem parceiro; consultar com parceiro inativo | `GET /companies/{id}/partner` + seção na `CompanyContractScreen` |
| 2. Selecionar e salvar (1ª vez) | Editável + gera histórico (`null→parceiro`) | Vincular pela 1ª vez; vincular direto a parceiro inativo | `PUT /companies/{id}/partner` |
| 3. Trocar depois | Editável a qualquer momento | Trocar vínculo; idempotência no mesmo parceiro | `PUT /companies/{id}/partner` |
| 4. Remover (selecionar "nenhum") | Toda troca gera histórico, inclui remoção; idempotência `null==null` | Remover vínculo; idempotência null→null | `PUT /companies/{id}/partner` |
| 5. Consultar histórico | Detalhe mostra histórico; histórico vazio é estado válido (200, não 404) | Consultar histórico; múltiplas trocas em ordem; histórico vazio; registro correto de null nas duas pontas | `GET /companies/{id}/partner/history` |

Todas as 5 linhas com as 4 colunas preenchidas. Nenhum passo cortado silenciosamente.

## QA Explorer — cenários Gherkin (17 no total — contagem corrigida na implementação: a
soma de "15 pós-repasse de PM + 3 do repasse de QA" foi rotulada como 18 por engano ao
consolidar, o mesmo tipo de erro de contagem já visto no ORD-206; a lista real abaixo tem 17)

```gherkin
Feature: Vínculo Company→Partner
  Como Administrativo/Financeiro da Ordin
  Quero registrar qual parceiro trouxe cada empresa cliente
  Para viabilizar o cálculo de comissão futuro

  Background:
    Dado que estou autenticado como platform-admin (role admin ou superadmin)
    E existe uma empresa cliente cadastrada
    E existe um parceiro ativo cadastrado

  Scenario: Vincular parceiro a uma empresa pela primeira vez
    Dado que a empresa não tem nenhum parceiro vinculado
    Quando eu vinculo o parceiro à empresa
    Então a empresa passa a mostrar esse parceiro como vinculado (200)
    E uma entrada de histórico é criada com from=null e to=parceiro

  Scenario: Trocar o parceiro vinculado a uma empresa
    Dado uma empresa vinculada ao parceiro A
    Quando eu vinculo o parceiro B a essa empresa
    Então a empresa passa a mostrar o parceiro B como vinculado (200)
    E uma entrada de histórico é criada com from=A e to=B

  Scenario: Remover o vínculo de uma empresa (voltar a "sem parceiro")
    Dado uma empresa vinculada ao parceiro A
    Quando eu removo o vínculo (seleciono "nenhum")
    Então a empresa passa a não ter parceiro vinculado (200)
    E uma entrada de histórico é criada com from=A e to=null

  Scenario: Selecionar o mesmo parceiro já vinculado é idempotente
    Dado uma empresa vinculada ao parceiro A
    Quando eu vinculo o parceiro A novamente (mesmo já vinculado)
    Então a operação retorna sucesso (200)
    E nenhuma entrada de histórico é criada

  Scenario: Reenviar partner_id=null numa empresa que já não tem parceiro é idempotente
    Dado uma empresa sem nenhum parceiro vinculado
    Quando eu envio PUT .../partner com partner_id=null
    Então a operação retorna sucesso (200)
    E nenhuma entrada de histórico é criada

  Scenario: Vincular parceiro que já está inativo desde antes é permitido via API
    Dado um parceiro já desativado
    Quando eu vinculo esse parceiro a uma empresa
    Então a operação retorna sucesso (200)
    E a consulta do vínculo retorna esse parceiro com status "inativo"

  Scenario: Erro ao vincular a um parceiro inexistente
    Quando eu tento vincular um partner_id que não existe
    Então recebo erro 404

  Scenario: Erro ao vincular parceiro a uma empresa inexistente
    Quando eu tento vincular um parceiro a um company_id que não existe
    Então recebo erro 404

  Scenario: Consultar o vínculo atual de uma empresa
    Dado uma empresa vinculada ao parceiro A
    Quando eu consulto o detalhe dessa empresa
    Então recebo o parceiro A como vínculo atual

  Scenario: Consultar vínculo de empresa sem parceiro nenhum
    Dado uma empresa sem nenhum parceiro vinculado
    Quando eu consulto o detalhe dessa empresa
    Então recebo "nenhum parceiro vinculado" (não erro, estado válido)

  Scenario: Consultar histórico de uma empresa que nunca trocou de parceiro retorna lista vazia
    Dado uma empresa sem nenhuma entrada de histórico de parceiro
    Quando eu consulto o histórico de vínculos dessa empresa
    Então recebo 200 com entries: []

  Scenario: Consultar histórico de vínculos de uma empresa
    Dado uma empresa que trocou de parceiro 2 vezes (A→B, depois B→C)
    Quando eu consulto o histórico de vínculos dessa empresa
    Então recebo as 2 entradas em ordem cronológica, com from/to corretos

  Scenario: Histórico registra corretamente entrada e remoção de vínculo
    Dado uma empresa sem parceiro
    Quando eu vinculo o parceiro A, depois removo o vínculo
    Então o histórico mostra 2 entradas: (null→A) e (A→null)

  Scenario: Desativar o parceiro vinculado não desfaz o vínculo da empresa
    Dado uma empresa vinculada ao parceiro A
    Quando o parceiro A é desativado (endpoint do ORD-207)
    Então a empresa continua mostrando o parceiro A como vinculado
    E o histórico de vínculos da empresa permanece intacto

  Scenario: Listagem de parceiros disponíveis pra vínculo esconde inativos
    Dado um parceiro ativo e um parceiro inativo
    Quando eu consulto a lista de parceiros disponíveis pra vincular
    Então só o parceiro ativo aparece

  Scenario: Owner/manager de empresa cliente recebe 403 ao tentar editar o vínculo
    Dado um usuário com role owner ou manager
    Quando ele tenta vincular ou consultar o vínculo/histórico de uma empresa
    Então recebe erro de acesso negado (403)

  Scenario: Requisição sem token recebe 401
    Quando eu chamo qualquer endpoint de vínculo Company→Partner sem Authorization header
    Então recebo erro de não autenticado (401)
```

## Solução Técnica

### Serviços impactados

- **company-service**: adiciona coluna a `Company` + nova tabela `CompanyPartnerHistory`, migration,
  3 endpoints novos sob `/companies/{company_id}/partner`.
- **frontend/admin**: nova seção "Parceiro" dentro de `CompanyContractScreen.tsx`.

### Modelo de dados

```python
class Company(Base):
    # ... colunas existentes (não mexidas) ...
    # ORD-208: parceiro (ORD-207) responsável por trazer esta empresa,
    # opcional. Sem ForeignKey real. Fato comercial corrigível (não
    # identidade) — diferente de Partner.document/partner_type, imutáveis.
    referred_by_partner_id = Column(Integer, nullable=True, index=True)


class CompanyPartnerHistory(Base):
    # ORD-208: log append-only de toda troca de vínculo Company→Partner.
    # from/to nullable nas duas pontas (null = "sem parceiro"). Diferente
    # de PartnerCommissionHistory (ORD-207): aqui a atribuição INICIAL
    # também gera histórico, porque Company já existe antes desta
    # história e sempre parte de null de verdade (não é um "estado
    # default silencioso" como is_default no ORD-206). note é opcional
    # (achado do repasse de Administrativo) — diferente do
    # acceptance_reference obrigatório do Partner, porque este vínculo
    # não sustenta obrigação de pagamento por si só.
    __tablename__ = "company_partner_history"
    id                    = Column(Integer, primary_key=True)
    company_id            = Column(Integer, nullable=False, index=True)
    from_partner_id       = Column(Integer, nullable=True)
    to_partner_id         = Column(Integer, nullable=True)
    changed_by_user_id    = Column(Integer, nullable=True)
    note                  = Column(String(500), nullable=True)
    created_at            = Column(DateTime, default=datetime.utcnow)
```

**Reconstrução "qual parceiro valia em qual mês"** (achado do repasse de Financeiro, documentar em
comentário no código quando implementado): percorrer o histórico em ordem cronológica; o
`to_partner_id` de cada entrada vale até a próxima entrada (ou até agora, na última); zero entradas
= a empresa nunca teve parceiro. Mais simples que a reconstrução do ORD-207 porque não existe o
caso "zero entradas = valor atual vale desde sempre" — aqui zero entradas é sempre "nunca teve".

### Endpoints

Todos exigem JWT + `_require_platform_admin` — **não** `_require_company_admin` (achado do
Backend-SR: `get_company_plan` usa `_require_company_admin`, que permite owner/manager verem o
próprio plano comercial; aqui é informação interna da Ordin, não deve vazar pro cliente).

#### `GET /companies/{company_id}/partner`
Retorna o vínculo atual. 404 se a empresa não existir. Se `referred_by_partner_id` não é `None`,
resolve o `Partner` e inclui `status` ("ativo"/"inativo", calculado de `deactivated_at`) — é aqui
que a UI recebe o dado pra mostrar a tag de inativo, sem afetar o vínculo em si.
Response 200: `{"partner": {"id", "name", "status"} | null}`.

#### `PUT /companies/{company_id}/partner`
Request: `{"partner_id": int | null, "note": str | null}`.
Handler: 404 se empresa não existir; 404 se `partner_id` informado não existir (sem checar status —
decisão consciente, não duplica a validação que já existe no dropdown do frontend). Idempotência:
se `partner_id` recebido é igual ao `referred_by_partner_id` atual (incluindo `None == None`),
retorna sem tocar em nada. Caso contrário, na mesma transação: `INSERT CompanyPartnerHistory(from=
atual, to=recebido, note=recebido)` + `UPDATE co.referred_by_partner_id = recebido`.
Response 200: mesmo shape do GET.
Erros: 404 (empresa ou parceiro não encontrado).

#### `GET /companies/{company_id}/partner/history`
404 se empresa não existir. Ordenado por `created_at asc`. **Correção do repasse de Backend-SR:**
resolve `from_partner_id`/`to_partner_id` em lote (mesmo padrão de `get_partner_history`, ORD-207),
mas tratando `None` explicitamente antes de indexar o dicionário de parceiros resolvidos — copiar o
padrão do ORD-207 literalmente quebraria com `KeyError`, porque lá `from`/`to` nunca são nulos e
aqui são:

```python
partner_ids = {pid for pid in ({e.from_partner_id for e in entries} | {e.to_partner_id for e in entries}) if pid is not None}
partners_by_id: dict[int, Partner] = {}
if partner_ids:
    result = await db.execute(select(Partner).where(Partner.id.in_(partner_ids)))
    partners_by_id = {p.id: p for p in result.scalars().all()}

def _ref(partner_id: int | None) -> dict | None:
    if partner_id is None:
        return None
    p = partners_by_id[partner_id]
    return {"id": p.id, "name": p.name, "status": "inativo" if p.deactivated_at else "ativo"}
```

Response 200: `{"entries": [{"from_partner", "to_partner", "note", "changed_by_user_id", "created_at"}]}`
— retorna `entries: []` (não 404) quando a empresa nunca teve nenhuma troca.
Erros: 404 (empresa não encontrada).

**Nota sobre `CompanyUpdate`:** o schema genérico de edição de empresa (`services/company/main.py`)
não pode nem deve ganhar `referred_by_partner_id` — além de não ser a decisão de design (endpoint
dedicado), `update_company` usa `body.model_dump(exclude_none=True)`, que silenciosamente ignoraria
qualquer tentativa de setar o campo pra `null` (remover vínculo) por ali.

### Migration

Nova migration em `services/company/migrations/versions/`, `down_revision` apontando pra head atual
(a do ORD-207, `20260925_1600`). Só **adiciona** — não recria `companies`: `ALTER TABLE companies
ADD COLUMN referred_by_partner_id` (nullable, sem `server_default` não-nulo — todas as empresas
existentes ficam `NULL` = "sem parceiro" automaticamente, sem backfill) + `CREATE TABLE
company_partner_history`.

### Frontend

Nova seção **"Parceiro"** dentro de `CompanyContractScreen.tsx`: mostra o parceiro vinculado (com
`Tag` "Inativo" se aplicável) ou "Nenhum parceiro vinculado"; botão "Vincular"/"Trocar" abre
`ConfirmDialog` com `Dropdown` alimentado por `GET /commercial/partners` (já filtra inativos) + campo
`note` opcional + opção "Nenhum"; seção de histórico abaixo, mesmo padrão visual do
`PartnerFormScreen` (ORD-207). Novas funções em `frontend/admin/src/api/companies.ts`:
`getCompanyPartner`, `setCompanyPartner`, `getCompanyPartnerHistory`.

### Eventos de fila

N/A.

### Impacto em outros serviços

N/A — tudo dentro do company-service e seu próprio frontend.

### Riscos técnicos

- **Nenhum backfill necessário** — coluna nova nullable, empresas existentes ficam corretas sem
  migration de dado.
- **Risco de confusão de padrão de acesso** — alguém copiar `_require_company_admin` por analogia
  com `CompanyPlan` no futuro; mitigado com comentário explícito no código.
- **`get_partner_history` não pode ser copiado literalmente** — corrigido (ver seção de endpoints).
- **Sem FK real** — mesmo padrão de integridade em nível de aplicação já aceito no resto do serviço.

### Estimativa

- **Backend:** 6–8h.
- **Frontend:** 5–7h.

## Repasses realizados (todos concluídos, achados aplicados)

| Repasse | Achados aplicados |
|---|---|
| PM | Cortou 1 cenário redundante ("empresa antiga retroativamente" — mesmo código, sem distinção real); adicionou critério + cenário de status do parceiro resolvido ao vivo na consulta. Confirmou tabela de rastreabilidade limpa (terceiro ciclo seguido sem lacuna tipo ORD-194). |
| QA | 3 cenários novos: vincular direto a parceiro já inativo, idempotência `null→null` explícita, histórico vazio retorna 200 (não 404). Sinalizou (sem decidir agora) candidatura a abstrair o padrão de histórico append-only em helper compartilhado — registrado como débito técnico futuro, não resolvido nesta história. |
| Backend-SR | Confirmou `_require_platform_admin` correto (não `_require_company_admin`); confirmou `CompanyUpdate` não pode ganhar o campo por acidente; **achado bloqueante corrigido:** padrão de resolução em lote de `get_partner_history` quebraria com `KeyError` se copiado literalmente (from/to nulos aqui, nunca nulos lá) — corrigido com tratamento explícito de `None`. |
| Administrativo | Propôs campo `note` opcional no histórico (evidência/justificativa quando necessário, calibrado como opcional — diferente do obrigatório do `acceptance_reference`); confirmou sem implicação LGPD nova; confirmou que "vincular a parceiro inativo" não é alcançável pela UI real (dropdown já filtra), sem necessidade de Alert extra. |
| Financeiro | Confirmou e documentou a lógica de reconstrução do histórico pro fechamento mensal futuro (mais simples que a do ORD-207); confirmou calibração do campo `note` como opcional; confirmou métricas de investidor (clientes por canal, por parceiro) respondíveis com o desenho atual. |

## Checklist de Ready

### Explorer
- [x] Formato *Como/quero/para*
- [x] Contexto e motivação (sequência ORD-206/207, pendência herdada do repasse de PM do ORD-207)
- [x] Fluxo principal (5 passos)
- [x] Dependências (ORD-206/207 bloqueantes, já mergeados; cálculo de comissão futuro depende desta)
- [x] Wireframe em prosa (nova seção dentro de `CompanyContractScreen.tsx`, achado real ao investigar o código de navegação existente)
- [x] Critérios de aceite rotulados por lente

### QA Explorer
- [x] Happy path, bordas e erros em Gherkin (17 cenários)
- [x] Acesso (403/401) coberto — isolamento multi-tenant é N/A, mesmo padrão de `CompanyContractScreen`
- [x] Cenários aprovados pelo PM

### Tech Explorer
- [x] Serviços impactados (company-service + frontend)
- [x] 3 endpoints com payload completo
- [x] Migration descrita (só adiciona, sem backfill)
- [x] Eventos de fila — N/A, documentado
- [x] Estimativa definida
- [x] Riscos identificados, incluindo 1 correção de bug real (achado do Backend-SR)

### Rastreabilidade ponta a ponta
- [x] Tabela com as 4 colunas preenchidas para as 5 linhas do Fluxo Principal
- [x] Nenhuma célula vazia

### Aprovação final
- [x] 5 repasses (PM, QA, Backend-SR, Administrativo, Financeiro) concluídos, achados aplicados
- [x] Estimativa acordada (6–8h backend + 5–7h frontend)
- [x] Sem bloqueios não resolvidos — confirmado 2x que nada aqui depende do contador/advogado
- [x] ✅ **ORD-208 está Ready**
