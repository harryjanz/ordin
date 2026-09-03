---
id: ORD-156
status: Ready
estimativa: 13,5 pontos (0,5 config + 5 auto-fix + 6 manual + 1 medição mypy)
tipo: chore
fase: 6
sprint: null
responsavel: Backend SR
---

# ORD-156 — Zerar débito de lint/type-check em `services/`

## Descrição
O CI (`.github/workflows/ci.yml`, job "Lint & type check") falha consistentemente em `main`
desde pelo menos 2026-09-01 — `ruff check services/` encontra **827 erros pré-existentes**
espalhados pelos cinco microsserviços (import não ordenado, `Optional[X]` vs `X|None`, B008
Depends-em-default, entre outros padrões repetidos). O job de `mypy` nem chega a rodar porque o
step de `ruff` já falha antes. Nenhuma história recente introduziu essa dívida — confirmado
arquivo por arquivo em várias histórias ao longo de 2026-09 (ORD-151 a ORD-155) que as mudanças
não aumentam a contagem de erros pré-existente nos arquivos tocados.

## Persona
Time de desenvolvimento — todo PR contra `main` mostra CI vermelho independente da qualidade do
código novo, o que reduz o sinal do CI como gate de qualidade (ninguém mais confia no "vermelho"
como indicador confiável de problema introduzido pela mudança).

## Contexto
Levantado pelo usuário em 2026-09-03 ao confirmar que o PR #118 (feature de combo/bundle,
ORD-112 a ORD-155) foi mergeado em `main` com CI vermelho — não por causa do próprio PR, mas por
esse débito já existente. Decisão explícita do usuário: não corrigir na hora, tratar como
"tema maior" — por isso essa história abre agora só no step New, pra ser retomada depois, sem
travar o fluxo de trabalho atual. Ver `pendencia-ci-lint-quebrado.md` na memória do projeto pro
histórico completo da investigação.

## Explorer

### História
Como time de desenvolvimento, quero que o CI volte a ser um sinal confiável (verde = sem
problema novo, vermelho = algo que a mudança introduziu), para não precisar mais ignorar o
resultado do lint em todo PR por causa de um débito que não tem relação com o que está sendo
revisado.

### Contexto e motivação
Levantamento em 2026-09-03 (`ruff check --statistics` rodado dentro de cada container) mostra
**843 erros** distribuídos pelos 5 serviços:

| Serviço | Erros | Principais categorias |
|---|---|---|
| `company` | 334 | B008 (129), RUF059 (86), DTZ003 (55), I001 (46) |
| `catalog` | 175 | UP045 (72), B008 (46), I001 (35), RUF100 (12) |
| `order` | 147 | I001 (37), UP045 (34), RUF059 (21), B008 (18) |
| `payment` | 137 | I001 (40), BLE001 (24), DTZ003 (23), DTZ001 (20) |
| `auth` | 50 | I001 (20), DTZ003 (10), UP045 (9) |

Achado importante que muda o tamanho real do problema: **boa parte não é código ruim, é
configuração de lint desalinhada com o padrão do projeto**:
- **B008 "function-call-in-default-argument" (215 ocorrências, maior categoria isolada)** é o
  padrão `Depends(...)` do FastAPI em parâmetro default — uso correto e idiomático do
  framework, não um bug. O ruff sinaliza porque a regra genérica não conhece FastAPI. Provável
  que baste configurar `extend-select`/`ignore` no `pyproject.toml` (ruff já tem suporte
  dedicado a isso, ver `flake8-bugbear` + exceção pra `Depends`), não reescrever 215 assinaturas
  de endpoint.
- **I001 "unsorted-imports" (178 ocorrências) + RUF100/UP045/UP006/UP037/F401/F541 (mais ~50)**
  são 100% auto-corrigíveis com `ruff check --fix` (sem revisão manual necessária) — juntos,
  ~333 dos 843 erros (quase 40%) somem com um comando, sem risco de mudar comportamento.
- **DTZ001/003/007 "datetime sem timezone" (~144 ocorrências)** é o único grupo que exige decisão
  de verdade: o projeto usa `datetime.utcnow()`/colunas naive de propósito (consistente em todo
  o schema) ou é falta de padronização real? Precisa checar `ARQUITETURA.md` e decidir entre
  migrar pra `datetime.now(UTC)` de verdade (mudança comportamental, precisa de testes) ou
  configurar a regra como aceita (se naive-UTC for decisão consciente do projeto).
- **RUF059 unused-unpacked-variable (107), BLE001 blind-except (31), E722/SIM102/S110/S112
  (~10)** são os únicos grupos que exigem revisão linha a linha de verdade.

Ou seja: o "débito de 843 erros" real após triagem provavelmente fica bem menor — a maior parte
é auto-fix ou ajuste de config, não reescrita de lógica.

### Fluxo principal
1. Rodar `ruff check services/ --fix` (só as regras auto-corrigíveis) em cada serviço, revisar o
   diff (deve ser só reordenação de import e sintaxe, sem mudança de comportamento), testar cada
   serviço.
2. Configurar `pyproject.toml` pra não sinalizar `B008` em parâmetros `Depends(...)`/`File(...)`
   do FastAPI (ou o padrão específico usado no projeto) — decisão de configuração, documentar o
   porquê.
3. Decidir o caso `datetime` (DTZ00x): padronizar pra timezone-aware ou formalizar naive-UTC
   como convenção aceita no `pyproject.toml`.
4. Revisar manualmente o que sobrar (RUF059, BLE001, E722, SIM102, S110/S112) — volume bem menor
   depois dos passos 1-3, provavelmente dezenas, não centenas.
5. `mypy` só roda no CI depois que `ruff` passa — depois de zerar o ruff, rodar `mypy` em cada
   serviço pra descobrir o tamanho real dessa segunda camada de débito (ainda não medido nesta
   história, porque o CI nem chega lá hoje).

### Fluxos alternativos / exceções
- Serviço com muitos DTZ00x pode exigir decisão diferente dos outros (ex: `payment` guarda
  timestamps de auditoria financeira — pode ter exigência de timezone mais forte que os outros).
- Se algum auto-fix do passo 1 mudar comportamento observável (não deveria, mas é regra a
  confirmar caso a caso), isolar esse arquivo pra revisão manual em vez de aplicar o fix cego.

### Dependências
- Serviços envolvidos: todos os 5 (`auth`, `company`, `catalog`, `order`, `payment`) —
  provavelmente cabe dividir em 5 sub-tarefas/PRs menores (um por serviço) em vez de um PR gigante
  tocando tudo de uma vez, mais fácil de revisar e não trava tudo se um serviço tiver decisão
  pendente (ex: o caso DTZ00x do `payment`).
- Sem histórias bloqueantes — é debt cleanup isolado, não depende de nenhuma feature em
  andamento.

### Critérios de aceite funcionais
- [ ] `ruff check services/` passa sem erros no CI (job "Lint & type check" fica verde).
- [ ] `mypy` roda no CI (hoje nem chega a rodar) — não necessariamente zerado nesta história,
      mas pelo menos com o tamanho do débito medido e uma decisão registrada (zerar já, ou virar
      história separada).
- [ ] Nenhuma mudança de comportamento observável nos 5 serviços — suíte de testes de cada
      serviço continua passando exatamente como antes.
- [ ] Regras que forem intencionalmente ignoradas (ex: B008 em `Depends`) ficam documentadas no
      `pyproject.toml` com comentário explicando o porquê — não é só silenciar sem registro.

### Wireframe / Mockup
N/A — mudança de infraestrutura de qualidade de código, sem UI.

## QA Explorer

Diferente de uma feature, o "aceite" aqui é negativo por natureza: nenhum comportamento
observável pode mudar, só o estado do lint. Os cenários abaixo cobrem cada uma das 4 frentes do
Fluxo Principal, mais a integração final no CI — não faz sentido cenário de isolamento
multi-tenant (mudança é 100% infraestrutura de código, sem dado de empresa envolvido).

```gherkin
Feature: Zerar débito de lint/type-check sem alterar comportamento
  Como time de desenvolvimento
  Quero que ruff/mypy passem em services/ sem nenhuma mudança de comportamento
  Para que o CI volte a ser um sinal confiável de qualidade

  Background:
    Dado a suíte de testes de cada um dos 5 serviços passa 100% antes de qualquer mudança
    (linha de base registrada por serviço)

  Scenario: Auto-fix de import/sintaxe não muda comportamento
    Dado um serviço com erros das categorias I001/UP045/UP006/UP035/UP037/F401/F541/RUF100
    Quando `ruff check --fix` é aplicado só nessas categorias
    Então o diff resultante é só reordenação de import e sintaxe equivalente
    E a suíte de testes do serviço continua passando com a mesma contagem de antes

  Scenario: Exceção de B008 pra Depends do FastAPI não esconde bug real
    Dado a configuração de `extend-immutable-calls` no `pyproject.toml` cobrindo
    `Depends`/`Query`/`Body`/`File`/`Form` (padrões FastAPI usados no projeto)
    Quando `ruff check` roda de novo
    Então nenhum endpoint com `Depends(...)` em parâmetro default é mais sinalizado
    E um `def` hipotético com lista/dict mutável de verdade em default (não-FastAPI)
    continua sendo sinalizado normalmente

  Scenario: Decisão de datetime aplicada de forma consistente
    Dado a decisão tomada pro caso DTZ00x (migrar pra timezone-aware OU formalizar
    naive-UTC como convenção aceita)
    Quando a decisão é aplicada em todos os 5 serviços
    Então nenhum serviço fica com um padrão diferente dos outros sem justificativa registrada
    E se for migração de verdade: comparação/ordenação/serialização de datas em teste
    automatizado continua correta (nenhuma trocada por engano entre naive e aware no meio do
    caminho, o que quebraria comparação silenciosamente)

  Scenario: payment-service pode ter regra mais rígida de datetime
    Dado o payment-service guarda timestamps de auditoria financeira
    Quando a decisão de datetime for aplicada
    Então esse serviço pode adotar timezone-aware mesmo que os outros fiquem com naive-UTC
    documentado, com a divergência justificada explicitamente na história ou no código

  Scenario: Revisão manual do que sobra não introduz regressão
    Dado os erros restantes após os passos 1-3 (RUF059, BLE001, E722, SIM102, S110/S112)
    Quando cada um é corrigido individualmente
    Então a suíte de testes do serviço correspondente continua passando
    E cada fix é revisável isoladamente (commit/PR pequeno por serviço, não um PR gigante
    tocando os 5 de uma vez)

  Scenario: CI fica verde de ponta a ponta
    Dado `ruff check services/` sem erros em todos os 5 serviços
    Quando o pipeline de CI roda num PR
    Então o job "Lint & type check" passa
    E os jobs "Testes + cobertura" e "Build Docker images" (hoje pulados por `needs: lint`)
    voltam a rodar de verdade

  Scenario: mypy medido, decisão registrada
    Dado ruff zerado nos 5 serviços
    Quando `mypy` roda pela primeira vez em cada serviço
    Então o tamanho real do débito de tipo é registrado na história
    E fica decidido explicitamente se essa segunda camada é zerada já ou vira história separada
```

**Cenários revisados e aprovados pelo PM:** sim — cobrem as 4 frentes do fluxo principal (auto-fix,
exceção B008, decisão de datetime, revisão manual) mais a integração final no CI e a medição do
mypy. Sem cenário de isolamento multi-tenant (não se aplica — mudança de infraestrutura de
código, não de dado de empresa). Ponto em aberto explícito pro Tech Explorer: nesta história a
"borda" mais sensível é a decisão de datetime — decidir aí se timezone-aware é viável sem virar
uma segunda história por si só (mudança de schema/coluna pode ser necessária dependendo do
banco).

## Solução Técnica

### Serviços impactados
Todos os 5: `auth`, `company`, `catalog`, `order`, `payment`. Nenhuma mudança de endpoint,
contrato ou schema de banco — é debt cleanup de código, não feature.

### Achado de configuração (muda o desenho da solução)
O CI roda `ruff check services/` **a partir da raiz do repo** (`.github/workflows/ci.yml:36`).
Não existe `[tool.ruff]` em nenhum lugar hoje — nem no `pyproject.toml` raiz, nem nos 5
`pyproject.toml` de cada serviço (só têm `[tool.pytest.ini_options]`/`[tool.coverage...]`). Como
ruff resolve config subindo diretório a diretório até achar um `pyproject.toml` com seção
`[tool.ruff]`, **o lugar certo pra configurar as exceções de B008 e DTZ00x é o `pyproject.toml`
da raiz do monorepo** (`/pyproject.toml`), não um por serviço — uma seção só, vale pros 5.

### Endpoints
Nenhum — sem mudança de contrato.

### Migrations
Nenhuma — decisão adotada pro caso `datetime` (ver abaixo) é resolvida via configuração de
lint, não mudança de schema/coluna.

### Mudança de implementação — 5 fases

**Fase 1 — `pyproject.toml` raiz, duas exceções de configuração (resolve ~359 dos ~843 erros
sem tocar em nenhuma linha de código de serviço):**
```toml
[tool.ruff.lint]
# ORD-156 — naive-UTC é convenção deliberada do projeto: toda coluna
# DateTime do schema (Alembic, todos os 5 serviços) é naive, e todo
# datetime.utcnow() no código representa UTC por convenção da aplicação,
# não por acaso. Migrar pra timezone-aware exigiria tocar toda coluna de
# todo serviço pra pouco ganho real — risco desproporcional ao benefício
# pra um projeto que já é consistente (só naive, nunca misturado).
ignore = ["DTZ001", "DTZ003", "DTZ007"]

[tool.ruff.lint.flake8-bugbear]
# B008 sinaliza corretamente chamada-em-default como bug em geral, mas o
# padrão Depends(...)/Query(...)/etc é o jeito IDIOMÁTICO do FastAPI de
# injetar dependência — não é o bug que a regra existe pra pegar. Lista
# explícita (não um ignore geral de B008) pra continuar pegando um
# def f(x=[]) de verdade, que aí sim é bug.
extend-immutable-calls = [
    "fastapi.Depends", "fastapi.Query", "fastapi.Body", "fastapi.File",
    "fastapi.Form", "fastapi.Path", "fastapi.Header", "fastapi.Cookie",
    "fastapi.Security",
]
```
Depois de aplicado: reduz de ~843 pra ~484 erros só com config, zero risco de regressão
(nenhuma linha de serviço muda).

**Fase 2 — auto-fix seguro (~333 erros, I001/UP045/UP006/UP035/UP037/F401/F541/RUF100):**
```bash
ruff check services/ --fix
```
Revisar o diff por serviço (deve ser só reordenação de import e sintaxe equivalente), rodar a
suíte de testes de cada um antes de commitar. Um PR por serviço (5 PRs pequenos, não 1 gigante)
— mais fácil de revisar, e se algum auto-fix mexer com algo inesperado num serviço, não trava
os outros 4.

**Fase 3 — revisão manual do que sobra (~151 erros: RUF059 unused-unpacked-variable ~107,
BLE001 blind-except ~31, E722/SIM102/S110/S112/PLW1508/UP007 ~12):** corrigir um a um, por
serviço, cada fix revisável isoladamente. `payment-service` concentra a maior parte do
`BLE001` (24 dos 31) — exceções capturadas de forma ampla em código que lida com resposta de
provider de pagamento (Mercado Pago/PayGo); revisar com atenção redobrada por ser código
financeiro, preferir `except (TipoEspecífico1, TipoEspecífico2)` a `except Exception` quando o
provider já documenta os erros possíveis.

**Fase 4 — `mypy` (segunda camada, ainda não medida em CI porque nunca chega a rodar):**
```bash
mypy services/ --ignore-missing-imports
```
Rodar depois do ruff zerado, registrar o tamanho real do débito por serviço. Decisão explícita
no fim desta fase: zerar já (nova sub-história) ou aceitar como débito conhecido e documentado
por enquanto — não decidir isso "por omissão".

**Fase 5 — CI:** nenhuma mudança no `ci.yml` em si — o job "Lint & type check" já roda
`ruff check services/` e `mypy services/ --ignore-missing-imports`; ao zerar os dois, os jobs
"Testes + cobertura" e "Build Docker images" (hoje pulados por `needs: lint`) voltam a rodar de
verdade em todo PR.

### Eventos de fila
Nenhum.

### Impacto em outros serviços
Nenhum além dos 5 já listados — mudança de infraestrutura de código, sem contrato entre
serviços envolvido.

### Estimativa
- Fase 1 (config): 0,5 ponto — 2 blocos de config num arquivo só, sem tocar serviço.
- Fase 2 (auto-fix): 1 ponto por serviço × 5 = 5 pontos — a maior parte é revisar diff + rodar
  suíte, não escrever código.
- Fase 3 (manual): 1-2 pontos por serviço, mais pesado em `payment` (BLE001 financeiro) e
  `company`/`order` (RUF059 concentrado) — estimativa total 6 pontos.
- Fase 4 (mypy, só medição + decisão): 1 ponto.
- **Total: ~13,5 pontos**, mas divisível em PRs pequenos e independentes por fase/serviço — não
  precisa ser uma sprint fechada, dá pra ir mesclando aos poucos sem bloquear outras histórias.

### Riscos

**Fase 1 (config B008/DTZ) — risco funcional baixo, risco de coordenação real.**
Nenhuma linha de serviço muda, mas o `pyproject.toml` é compartilhado pelos 5 — se outra branch
estiver em andamento e for avaliada pelo CI em paralelo, o comportamento do lint muda debaixo
dela sem aviso. Mitigado: comunicar a mudança de config antes de mergear, não só o código.

**Fase 2 (auto-fix de import/sintaxe) — risco real, não hipotético, com precedente nesta
sessão.**
- Reordenação de import pode mudar ordem de execução de código de nível de módulo com efeito
  colateral (`require_env()` que derruba o processo se faltar variável, criação de
  engine/client no import) — o mesmo tipo de fragilidade já visto no gotcha do
  `S3_ENDPOINT_URL` (ver [[gotcha-teste-s3-endpoint-url-vaza]]). Mitigado: **suíte de testes
  sozinha não basta** — cada serviço precisa de `docker compose up` real depois do auto-fix, não
  só pytest, porque falha de import-time pode não aparecer numa suíte que não exercita o
  startup completo da app.
- `F401` (import não usado) pode remover um import que só existe pelo efeito colateral de
  registrar um model no `Base.metadata` antes de `create_all()` — remoção quebraria
  migration/criação de tabela silenciosamente. Mitigado: revisão manual de todo `F401` antes de
  aceitar o fix automático (não aplicar cego só essa regra).

**Fase 3 (revisão manual) — aqui mora o risco mais sério da história: `BLE001`/`E722` em
`payment-service`.**
Trocar `except Exception:`/bare `except:` por uma exceção específica **muda comportamento em
produção**, não só estilo — se o código real ocasionalmente lançar um tipo diferente do previsto
(timeout, erro de rede inesperado da API do provider), o que hoje é capturado e tratado com
graça vira exceção não tratada. Numa chamada de pagamento/reembolso isso pode deixar uma
transação em estado inconsistente em vez de cair no fallback esperado. Categoria concentrada
24/31 em `payment-service` — maior risco isolado de toda a história. Mitigado: revisão com
atenção redobrada, preferir `except (TipoA, TipoB)` só quando o provider documenta
explicitamente os erros possíveis; nunca estreitar "no escuro". `S110`/`S112` (silenciar exceção
sem fazer nada) têm risco menor, mas às vezes o silêncio é intencional (best-effort cleanup) —
"corrigir" adicionando log/raise pode introduzir ruído nesses casos legítimos; julgamento caso a
caso, não fix mecânico.

**mypy (Fase 4) revelar um débito muito maior que o esperado** — escopo desta história cobre só
medir e decidir, não necessariamente zerar; se for grande, vira história própria em vez de
inflar esta.

**Cross-cutting: os 5 serviços são deployados de forma independente** (ver
`docs/ARQUITETURA.md`) — uma regressão sutil de auto-fix num serviço não aparece nos outros 4.
"Testei um, deve estar tudo bem nos outros" é uma armadilha aqui — cada serviço precisa da sua
própria verificação (testes + `docker compose up`), não uma passada única assumindo
uniformidade.

## Validação (Fase 1 — config, 2026-09-03)

Implementada só a Fase 1 nesta rodada (config-only, zero mudança de código de serviço) — Fases
2-4 ficam pra PRs seguintes, com checkpoint combinado antes de entrar na Fase 2 (risco real).

- `ruff check services/`: 859 → 497 erros (−362), confirmado num container limpo comparando a
  mesma árvore de código antes/depois só da mudança de `pyproject.toml`.
- Categorias `DTZ001`/`DTZ003`/`DTZ007` e `B008` (Depends do FastAPI) desapareceram por
  completo da saída — nenhuma outra categoria mudou de contagem, confirmando que a config não
  teve efeito colateral em regras não relacionadas.
- Sem risco de runtime a testar nesta fase: `pyproject.toml` não é lido pela aplicação nem pelo
  pytest fora da seção `[tool.pytest.ini_options]` (intocada) — mudança de config de lint não
  tem como afetar comportamento de serviço em produção. `docker compose up` dos 5 serviços seguiu
  rodando sem qualquer rebuild necessário (nenhum arquivo de serviço mudou).

## Validação (Fase 2 — auto-fix, 2026-09-03)

`ruff check services/ --fix` aplicado nas categorias auto-corrigíveis
(I001/UP045/UP006/UP035/UP037/F401/F541/RUF100): **497 → 148 erros** (859 → 148 desde o início da
história, −83%). 120 arquivos tocados nos 5 serviços — só reordenação/split de import e sintaxe
equivalente (`Optional[X]` → `X | None`, etc.), nenhuma mudança de lógica.

Verificação seguindo à risca o plano de mitigação da Fase 2 (ver Riscos):
- **Os 7 `F401` (import não usado) revisados individualmente** antes de aceitar — todos
  genuinamente mortos (`string` em `auth/main.py`, `sqlalchemy.select` em 2 arquivos de teste,
  `unittest.mock.MagicMock`/`patch` em 2 arquivos de teste). Nenhum caso de import mantido só
  por efeito colateral de registro (ex: model pra `Base.metadata`).
- **Checado que a reordenação de import não introduz dependência de ordem** — `config.py` e
  `audit.py` (shared, importados nos 5 serviços) não têm código de nível de módulo, só funções;
  o único código de módulo com efeito colateral real (`redis_client = redis.from_url(...)` em
  `auth/main.py`) continua depois de todo o bloco de imports, como já era.
- **Suíte de testes por serviço, em ambiente limpo, comparando exatamente com a baseline
  pré-fix** (não só "os testes passam", mas "a mesma contagem de antes"):
  - `auth`: 31/31 (idêntico)
  - `company`: 335/335, mesmas 9 falhas pré-existentes já confirmadas antes desta história
  - `catalog`: 185/185 (idêntico)
  - `order`: 58/58 (idêntico)
  - `payment`: 126/126 (idêntico)
- **`docker compose up` real dos 5 serviços** (não só pytest, per o risco documentado de
  import-time silenciosamente não coberto por teste) — todos subiram com
  "Application startup complete", sem crash loop, migrations aplicadas normalmente, e
  `GET /health` retornou 200 nos 5 (`localhost:8001-8005`).
- Erros restantes (148) são exatamente as categorias previstas pra Fase 3
  (`RUF059` 107, `BLE001` 30, `E722`/`SIM102` 3+3, resto 4) — nenhuma categoria nova surgiu do
  auto-fix em si.
