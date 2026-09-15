---
id: ORD-169
status: Ready
estimativa: 5 pontos (3 backend + 2 frontend)
fase: null
sprint: null
responsavel: Backend SR + Frontend
---

# ORD-169 — Cadastro fiscal do produto (NCM, CFOP, CEST)

## Descrição
Segunda história do épico de emissão fiscal NFC-e (`docs/estudo-nfce.md`; ver `docs/roles/pm.md`
§ Épicos mapeados). Hoje o `Product` (catalog-service) não tem nenhuma classificação fiscal —
toda nota fiscal exige NCM por item, e opcionalmente CFOP/CEST conforme o caso. Sem isso, a
história 4 (emissão de NFC-e) não tem como montar o payload de itens da nota.

**Não depende do bloqueio externo confirmado com a Focus NFe** (mesma leitura da ORD-168) — é só
cadastro de dado dentro do Ordin. **Depende parcialmente da ORD-168** (Ready): a derivação de
CST/CSOSN na emissão (história 4, fora do escopo desta) precisa do `regime_tributario` da
empresa já existir, mas o cadastro de NCM/CFOP/CEST em si não depende de nada da ORD-168 — as
duas podem ser implementadas em paralelo, só a validação de ponta a ponta em produção depende da
ordem.

## Persona
**Owner (dono/gestor da empresa cliente)** — decisão do Explorer, diferente da ORD-168: quem já
cadastra e mantém o catálogo hoje em `ProductEditScreen.tsx` é o próprio owner, e um catálogo
pode ter dezenas/centenas de produtos — pedir pro time Ordin classificar item a item não escala
como escalou pro cadastro único da empresa (ORD-168). Mitigação pra falta de conhecimento
técnico do owner: autocomplete de NCM por descrição + texto de ajuda por campo (decisão já
registrada no levantamento, `docs/estudo-nfce.md` §3.2, nota de UX).

## Contexto
Levantamento aprofundado em `docs/estudo-nfce.md` §3.1/§3.2 (2026-09-15) — decisões já fechadas
relevantes:
- **NCM**: fonte oficial via API pública da Receita Federal (Sistema Classif,
  `portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json`), sem captcha,
  JSON diário. Autocomplete por descrição no cadastro + job de sincronização mensal.
- **CFOP**: campo real por produto (não default único de empresa) — 5.101 (produção própria) vs.
  5.102 (revenda de item pronto), com texto explicativo.
- **CEST**: opcional — varia por NCM+segmento+estado (27 portarias estaduais diferentes, sem
  tabela única confiável) — Ordin nunca afirma se um item tem ST, só oferece o campo.
- **CST/CSOSN**: **não é campo desta história** — computado na história 4 a partir do
  `regime_tributario` (ORD-168) + presença de CEST no item.
- `ProductEditScreen.tsx` **não tem abas** (confirmado nesta sessão) — é um formulário único de
  página, diferente de `CompanyScreen.tsx`. Os campos fiscais entram como seção nova dentro do
  mesmo formulário, não uma tela/aba separada.

## Explorer

### História
Como **owner de uma empresa cliente**, quero classificar cada produto do meu catálogo com NCM,
CFOP e (quando aplicável) CEST, para que o Ordin tenha o dado necessário pra montar a nota fiscal
quando eu decidir ativar a emissão de NFC-e.

### Campos desta história (escopo fechado)
| Campo | Tipo | Obrigatório | UI |
|---|---|---|---|
| `ncm` | string (8 dígitos) | Não (produto pode ficar sem, mas não pode emitir nota sem) | Busca por descrição (autocomplete contra tabela sincronizada), não digitação livre do código |
| `cfop` | enum | Não | Dropdown com 2 opções (5.101 "Produção própria" / 5.102 "Revenda de item pronto"), texto de ajuda explicando a diferença |
| `cest` | string (7 dígitos) | Não, sempre opcional | Campo de texto simples — Ordin não valida nem sugere, só armazena |

**Fora do escopo**: CST/CSOSN (história 4, computado); unidade de medida (mencionada no
levantamento original mas não aprofundada nesta rodada — **pendência a esclarecer no QA Explorer
desta história**, ver abaixo).

### Tabela NCM local (pré-requisito técnico desta história)
Pra oferecer autocomplete, o catalog-service precisa de uma cópia local da tabela NCM, mantida
por um job mensal (decisão já registrada, `docs/estudo-nfce.md` §3.2) que sincroniza contra a API
da Receita Federal. Isso é infraestrutura nova desta história, não só um campo — ver Tech
Explorer.

### Fluxo principal
1. Owner abre `ProductEditScreen.tsx` pra criar ou editar um produto.
2. Nova seção **"Classificação fiscal"** aparece no formulário (não é aba — o formulário é de
   página única), com os 3 campos acima e texto de ajuda inline explicando cada um (decisão de
   UX já registrada no levantamento).
3. No campo NCM, owner digita parte da descrição do produto (ex. "hambúrguer") e vê sugestões da
   tabela sincronizada — seleciona o código correto.
4. Owner escolhe CFOP no dropdown (produção própria ou revenda), lendo o texto de ajuda se tiver
   dúvida.
5. Owner preenche CEST só se souber que o item tem substituição tributária — campo claramente
   marcado como opcional, sem indicação de obrigatoriedade.
6. Produto salva normalmente — campos fiscais em branco não bloqueiam o salvamento (produto pode
   existir e vender no totem sem classificação fiscal completa; só não poderá emitir NFC-e até
   estar completo, checagem que é da história 4).

### Fluxos alternativos / exceções
- **Produto sem NCM cadastrado**: continua vendável no totem normalmente — a ausência de
  classificação fiscal só impede emissão de nota (história 4), não impede a venda em si.
- **Busca de NCM sem resultado**: mostra mensagem "Nenhum NCM encontrado pra essa descrição" —
  não trava o formulário, owner pode salvar sem preencher e voltar depois.
- **NCM que existia e foi descontinuado/alterado pela Receita Federal** (job mensal detecta
  mudança): produto continua com o código antigo salvo, sem quebrar — **pendência já registrada
  no levantamento pro Tech Explorer**: precisa de fluxo de reconciliação, não bloqueio automático.

### Dependências
- **catalog-service**: tabela NCM local (nova) + job de sincronização mensal (novo) + 3 campos
  novos em `Product`.
- **frontend/admin**: `ProductEditScreen.tsx` ganha seção nova, com busca de NCM (interação nova
  nesta tela — não existe autocomplete/busca-conforme-digita hoje, só `Dropdown` de lista fechada
  e `InputBase` de busca simples tipo filtro, usado no combo/promoção).
- **Histórias bloqueantes**: nenhuma (independente da ORD-168 pro cadastro em si).
- **Histórias que dependem desta**: história 4 (emissão) consome NCM/CFOP/CEST pra montar
  `items[]` do `POST /nfce`.

### Critérios de aceite funcionais
- [ ] Seção "Classificação fiscal" aparece em `ProductEditScreen.tsx`, com texto de ajuda por
      campo
- [ ] Busca de NCM por descrição retorna sugestões da tabela sincronizada, sem exigir o código
      exato
- [ ] CFOP é selecionável entre as 2 opções, com texto explicativo visível
- [ ] CEST é sempre opcional, sem nenhuma validação de obrigatoriedade
- [ ] Produto sem nenhuma classificação fiscal salva e vende normalmente no totem
- [ ] Job mensal sincroniza a tabela NCM local contra a API oficial da Receita Federal

### Wireframe / Mockup
**Faltando** — diferente da ORD-168 (que reaproveita `PaymentTab`), esta tem uma interação
genuinamente nova (busca-conforme-digita contra uma tabela grande). Recomendo produzir um
wireframe simples da seção "Classificação fiscal" antes do Tech Explorer, focado só no campo de
busca de NCM — risco de UX maior que o normal se ficar mal resolvido (tabela com milhares de
entradas, usuário não técnico buscando por texto livre).

## QA Explorer

### Pendência levantada no Explorer, resolvida aqui
Unidade de medida (`unidade_comercial`/`unidade_tributavel`, campos que o `POST /nfce` da Focus
NFe exige — `docs/estudo-nfce.md` §7) tinha sido mencionada no levantamento original mas não
aprofundada. **Decisão**: fica **fora do escopo desta história** — não é uma classificação fiscal
que varia por regime/estado como NCM/CFOP/CEST, é só uma unidade descritiva (ex. "un", "kg").
Registrado como pendência pra história 4 (emissão) resolver — provavelmente com um default fixo
("un", já que o totem vende itens unitários) em vez de campo novo por produto.

### Sobre isolamento multi-tenant nesta história
`Product.company_id` já isola por empresa (produto de uma empresa nunca aparece nem é editável
por outra) — nenhum cenário novo aqui, é o controle padrão já testado em outras histórias de
catálogo. A tabela NCM local, diferente disso, **não é dado de empresa nenhuma** — é referência
global compartilhada (mesma tabela oficial pra todo mundo), sem isolamento por tenant.

### Cenários Gherkin

```gherkin
Feature: Cadastro fiscal do produto
  Como owner da empresa cliente
  Quero classificar produtos do catálogo com NCM, CFOP e CEST
  Para que o Ordin tenha o dado necessário pra emitir NFC-e quando eu ativar o módulo

  Background:
    Dado que o owner está autenticado na própria empresa
    E existe um produto "X-Burger" no catálogo

  # --- Happy path ---

  Scenario: Classificar um produto com NCM, CFOP e CEST
    Quando o owner abre a edição do produto "X-Burger"
    E busca por "hambúrguer" no campo de NCM
    Então aparecem sugestões da tabela NCM sincronizada
    Quando o owner seleciona um NCM da lista
    E escolhe CFOP "5.101 — Produção própria"
    E preenche o CEST
    E salva
    Então os 3 campos são persistidos no produto

  Scenario: Classificar um produto só com NCM e CFOP, sem CEST
    Quando o owner classifica o produto "X-Burger" só com NCM e CFOP
    E salva
    Então o produto é salvo normalmente, sem exigir CEST

  # --- Bordas ---

  Scenario: Produto sem nenhuma classificação fiscal continua vendável
    Dado um produto "Suco Natural" sem NCM/CFOP/CEST cadastrados
    Quando esse produto aparece no catálogo do totem
    Então ele é exibido e vendável normalmente, sem nenhum aviso ao cliente final

  Scenario: Busca de NCM sem resultado
    Quando o owner busca "xyzabc123" no campo de NCM
    Então o sistema mostra "Nenhum NCM encontrado pra essa descrição"
    E o formulário permanece editável, sem travar

  Scenario: Job mensal de sincronização roda sem quebrar produtos já classificados
    Dado um produto já classificado com um NCM que foi alterado na tabela oficial mais recente
    Quando o job mensal de sincronização roda
    Então o produto mantém o NCM antigo salvo, sem erro
    E fica registrado que aquele NCM não é mais o vigente na tabela mais recente (pendência de
      reconciliação, não bloqueio — ver Tech Explorer)

  # --- Erros / controle de acesso ---

  Scenario: Owner não acessa nem edita produto de outra empresa
    Dado um produto "Y-Burger" pertencente à empresa "Pasta & Co"
    Quando um owner autenticado na empresa "Burger House" tenta editar esse produto
    Então o sistema retorna 403 ou 404 (mesmo controle já existente de outras histórias de catálogo)
```

### Critérios de aceite testáveis
- [ ] Produto pode ser salvo com 0, 1, 2 ou 3 campos fiscais preenchidos, sem exigir nenhum
- [ ] Busca de NCM por descrição retorna resultados da tabela sincronizada
- [ ] Busca sem resultado mostra mensagem clara, não erro
- [ ] Produto sem classificação fiscal continua aparecendo e vendável no totem
- [ ] Job mensal atualiza a tabela NCM local sem quebrar produtos já classificados com códigos
      antigos
- [ ] Isolamento por empresa já existente no catálogo não regride

### O que ainda impede o avanço pro Tech Explorer
Nada bloqueante. Unidade de medida resolvida como fora de escopo (acima). Wireframe da busca de
NCM segue como pendência de maior risco que o normal (registrado no Explorer) — recomendo
produzir antes do Tech Explorer definir a UI de busca em detalhe, mas não impede desenhar o
backend (tabela + job + endpoint de busca) em paralelo.

## Tech Explorer

### Serviços impactados
- **catalog-service**: tabela nova `ncm_codes` (referência global, sem `company_id`), 3 colunas
  novas em `Product` (`ncm`, `cfop`, `cest`), endpoint de busca (`GET /ncm/search?q=...`), job
  periódico de sincronização.
- **frontend/admin**: `ProductEditScreen.tsx` ganha seção "Classificação fiscal", com campo de
  busca conforme digita (debounced) pro NCM.

### Modelo de dados
```python
class NcmCode(Base):
    __tablename__ = "ncm_codes"
    codigo = Column(String(8), primary_key=True)  # sem dígitos formatados, só números
    descricao = Column(Text, nullable=False)
    ato_legal = Column(String(255), nullable=True)
    sincronizado_em = Column(DateTime, server_default=func.now())

# Em Product (catalog-service):
#   ncm = Column(String(8), ForeignKey("ncm_codes.codigo"), nullable=True)
#   cfop = Column(String(4), nullable=True)  # "5101" ou "5102", sem ponto — string simples,
#                                              # não FK, só 2 valores fixos validados na aplicação
#   cest = Column(String(7), nullable=True)  # texto livre, sem validação nem FK
```
`ncm` é `nullable=True` com FK — produto sem NCM não referencia nada; produto com NCM inválido
(não existente na tabela local) é rejeitado na escrita, evitando dado fiscal inconsistente desde
o cadastro (diferente do CFOP/CEST, que são texto/enum simples sem tabela de referência).

### Endpoint novo

#### `GET /ncm/search?q={termo}`
**Serviço:** catalog-service · **Auth:** JWT (qualquer role autenticado da empresa — leitura de
referência global, sem dado sensível)

Busca por `ILIKE`/full-text simples na `descricao`, limitado a ~20 resultados, ordenado por
relevância básica (prefixo primeiro). Response:
```json
[
  { "codigo": "21069090", "descricao": "Outras preparações alimentícias, n.e." },
  { "codigo": "19059090", "descricao": "Outros produtos de padaria" }
]
```

### Job de sincronização mensal
Novo script (`scripts/sync_ncm.py`, mesmo padrão de `scripts.seed_demo_images` já existente no
catalog-service — script standalone, não roda em migration, sem I/O de rede em Alembic) que
busca `https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json`,
faz upsert na tabela `ncm_codes` (por `codigo`), e **não apaga códigos removidos da tabela
oficial** — só deixa de atualizá-los, evitando quebrar produtos que ainda referenciam um código
descontinuado (resolve a pendência de reconciliação levantada no QA Explorer: nada quebra, o
código antigo só para de receber atualização). Agendamento (cron do container, ou job externo)
é detalhe de infra a decidir no deploy, não muda o script em si.

### Mudança no frontend
`ProductEditScreen.tsx` — nova seção "Classificação fiscal":
- Campo de busca de NCM: `InputBase` com busca debounced (~300ms) contra `GET /ncm/search`,
  lista de sugestões abaixo do campo (padrão dropdown-de-resultados, não um componente de
  autocomplete formal do design-system — não existe um hoje, construído ad-hoc igual outras
  buscas já existentes na base, ex. `PromotionFormScreen`).
- `Dropdown` pro CFOP, 2 opções fixas com `note`/texto de ajuda abaixo (mesmo padrão visual já
  usado em outros dropdowns da tela).
- `InputBase` simples pro CEST, com texto de ajuda "Opcional — só preencha se souber que este
  item tem Substituição Tributária. Consulte seu contador em caso de dúvida." (reforça a
  ressalva já registrada no levantamento, §3.2, de que o Ordin não afirma nada sobre ST).

`types.ts`: `Product` ganha `ncm?: string`, `cfop?: "5101" | "5102"`, `cest?: string`.

### Migrations
Duas: (1) cria `ncm_codes` (tabela vazia até o job rodar pela primeira vez); (2) adiciona
`ncm`/`cfop`/`cest` em `products`, todos nullable, sem backfill necessário.

### Eventos de fila
Nenhum.

### Impacto em outros serviços
Nenhum direto. **Forward-looking**: história 4 vai ler esses 3 campos do catalog-service (via
chamada interna já existente ou nova, a definir na própria história 4) pra montar `items[]` do
`POST /nfce`.

### Estimativa
- Backend: **~3 pontos** — tabela nova + job de sincronização (integração externa real, com
  parsing de JSON grande) + endpoint de busca + 3 campos novos em `Product` — mais superfície que
  a ORD-168.
- Frontend: **~2 pontos** — busca debounced nova (padrão ad-hoc, sem componente pronto) + seção
  com 3 campos e textos de ajuda.
- **Total: ~5 pontos.**

### Riscos
1. **Busca de NCM sem componente de autocomplete formal no design-system** — mitigado seguindo o
   padrão ad-hoc já usado em outras buscas da base (ex. `PromotionFormScreen`), mas é
   trabalho de UI genuinamente novo, maior risco de retrabalho visual do que a ORD-168. Reforça a
   recomendação do QA Explorer de ter um wireframe antes de implementar.
2. **Job de sincronização é integração externa real** (rede, parsing de milhares de registros) —
   mitigado reaproveitando o padrão já existente de scripts standalone fora de migration
   (`scripts.seed_demo_images`), sem I/O de rede em Alembic (regra já estabelecida no
   `CLAUDE.md`).
3. **Tamanho da tabela NCM** (milhares de códigos) — índice em `descricao` pra busca eficiente é
   necessário, não é só uma FK simples; considerar `ILIKE` com índice trigram (`pg_trgm`) se a
   busca ficar lenta — decisão de otimização, não bloqueio pro Ready.

### O que ainda impede o avanço pro Ready
Nada bloqueante. Wireframe da busca de NCM segue como débito registrado (maior risco que o normal,
mas não impede começar o backend em paralelo).

## Ready

**Explorer:** [x] história Como/quero/para · [x] contexto e motivação · [x] campos e escopo
fechado (tabela) · [x] fluxo principal (6 passos) · [x] dependências identificadas (independente
de bloqueio externo, parcialmente relacionada à ORD-168) · [ ] wireframe — não produzido, maior
risco que o normal, registrado explicitamente · [x] critérios de aceite funcionais.

**QA Explorer:** [x] happy path (classificação completa) · [x] bordas (parcial, produto sem
classificação continua vendável, busca sem resultado, job de sincronização não quebra produto
existente) · [x] erros/controle de acesso (isolamento por empresa já existente, sem regressão) ·
[x] pendência de unidade de medida resolvida (fora de escopo, fica pra história 4) · [x] cenários
aprovados.

**Tech Explorer:** [x] serviços impactados (`catalog-service` + `frontend/admin`) · [x] modelo de
dados novo (`NcmCode` + 3 campos em `Product`) · [x] endpoint de busca com payload · [x] job de
sincronização desenhado (script standalone, sem I/O em migration) · [x] migrations (duas) · [x]
eventos de fila — nenhum · [x] estimativa (5 pontos) · [x] riscos com mitigação.

**Aprovação final:** [x] solução técnica revisada · [x] estimativa 5 pontos · [x] sem bloqueios
não resolvidos (wireframe é débito registrado, não bloqueio, mesma decisão já tomada em histórias
anteriores) · [ ] sprint específico — não atribuída ainda.

**Status: Ready.** Pode começar a implementação — backend primeiro (tabela NCM + job + campos em
Product + endpoint de busca), depois frontend (seção nova em `ProductEditScreen.tsx`).
