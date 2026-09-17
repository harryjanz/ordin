---
id: ORD-174
status: Ready
estimativa: 4 pontos (2,5 backend + 1,5 frontend)
fase: null
sprint: null
responsavel: Backend SR + Frontend
---

# ORD-174 — Custo do módulo fiscal na tabela de preços comercial

## Descrição
Sétima história do épico — resolve a decisão comercial que ficava em aberto desde o levantamento
(`docs/estudo-nfce.md` §8 item 3). **Decisão tomada com o usuário nesta história**: o custo do
módulo fiscal é um **add-on separado, independente da `PriceTable`** (ORD-162/165) — não um eixo
novo dentro dela. Motivo: o custo real (Focus NFe: plano fixo/mês + valor por nota emitida) mede
uma dimensão diferente da `PriceTable` (que mede transações do totem) — misturar os dois
acoplaria dimensões de custo que variam por motivos diferentes.

## Persona
**Superadmin/Admin da plataforma Ordin** — quem já gerencia `PriceTable`/`CompanyPlan` hoje
(ORD-162 a 167), mesmo papel, mesma área de responsabilidade comercial.

## Contexto
Achado de negócio relevante (registrado no levantamento, seção 5): a própria Focus NFe cobra
"plano fixo + excedente por nota" (ex. Retail R$59,90/mês + R$0,05/NFCe excedente) — reforça que
add-on separado é o modelo mais direto de repassar esse custo, sem forçar a estrutura de
"multiplicador por faixa de transação" que a `PriceTable` usa pro totem.

## Explorer

### História
Como **integrante do time Ordin**, quero cadastrar planos de preço do módulo fiscal (valor
fixo/mês + valor por nota emitida) e vincular uma empresa a um desses planos quando ela ativa o
módulo, para que o custo fique estruturado e visível, sem misturar com a tabela de preço do
totem.

### Relação com o flag `ativo` já criado na ORD-171
`CompanyFiscalConfig.ativo` (ORD-171) já é o interruptor único de "módulo ligado" — controla
emissão **e** cobrança ao mesmo tempo, sem duplicar estado. Esta história não cria um segundo
flag; só adiciona **qual plano de preço** se aplica quando `ativo=true`.

### Onde isso aparece no admin
A aba **"Plano"** já existente em `CompanyScreen.tsx` (hoje só mostra a `PriceTable` vinculada)
ganha uma segunda seção **"Módulo fiscal"**, mostrando o plano de add-on vinculado (se o módulo
estiver ativo) — decisão de manter no "Plano" e não na aba "Fiscal" (ORD-168/170/171): "Plano" é
onde a equipe já olha pra informação comercial/de cobrança; "Fiscal" é configuração técnica
(certificado, CSC, ambiente) — misturar os dois confundiria os dois tipos de informação.

### Fluxo principal
1. Time Ordin cadastra planos de add-on fiscal numa tela nova (mesmo padrão de
   `PriceTableListScreen`/`PriceTableFormScreen`, mas mais simples — só nome, preço fixo/mês,
   preço por nota).
2. Ao ativar o módulo fiscal de uma empresa (`CompanyFiscalConfig.ativo=true`, ORD-171), a
   mesma ação exige escolher um plano de add-on — não dá pra ativar sem vincular um plano.
3. A aba "Plano" da empresa passa a mostrar os dois blocos: plano do totem (`PriceTable`, já
   existente) e plano do módulo fiscal (novo), cada um com seu próprio preço.
4. Desativar o módulo fiscal (`ativo=false`) não desvincula o plano — mantém histórico de qual
   plano a empresa usou, mesmo padrão "editable grudento" já usado em `PriceTable` (ORD-165).

### Fluxos alternativos / exceções
- **Empresa com módulo inativo**: bloco "Módulo fiscal" na aba Plano mostra "Não contratado",
  sem plano vinculado.
- **Plano de add-on em uso não pode ser excluído**: mesmo princípio já aplicado à `PriceTable`
  (ORD-165) — plano vinculado a alguma empresa (mesmo que módulo esteja inativo agora, histórico)
  fica travado pra exclusão, só edição.

### Dependências
- **company-service**: modelo novo (`FiscalAddonPlan`), campo novo em `CompanyFiscalConfig`
  (`fiscal_addon_plan_id`), reaproveitando o padrão de tela já validado em `PriceTable`.
- **frontend/admin**: tela nova de listagem/edição de planos de add-on (espelha
  `PriceTableListScreen`/`PriceTableFormScreen`), extensão da aba "Plano" em `CompanyScreen.tsx`.
- **Histórias bloqueantes**: ORD-171 (Ready) — usa o mesmo flag `ativo`.
- **Histórias que dependem desta**: nenhuma.

### Critérios de aceite funcionais
- [ ] Time Ordin cadastra/edita planos de add-on fiscal (nome, preço fixo/mês, preço por nota)
- [ ] Ativar o módulo fiscal de uma empresa exige escolher um plano de add-on
- [ ] Aba "Plano" mostra o plano do totem e o do módulo fiscal separadamente
- [ ] Plano de add-on vinculado a alguma empresa (mesmo que módulo inativo agora) não pode ser
      excluído
- [ ] Empresa com módulo inativo mostra "Não contratado", sem erro

### Wireframe / Mockup
**Faltando** — reaproveita o layout já existente de `PriceTableListScreen`/
`PriceTableFormScreen` como referência direta, risco baixo.

## QA Explorer

### Sobre isolamento multi-tenant e controle de acesso
Mesmo padrão de `PriceTable` (ORD-167): planos de add-on não são dado de empresa, são catálogo
comercial da própria plataforma — controle por role (`superadmin`/`admin`), não por tenant.
Vínculo empresa↔plano é que carrega `company_id`.

### Cenários Gherkin

```gherkin
Feature: Custo do módulo fiscal na tabela de preços comercial
  Como integrante do time Ordin
  Quero cadastrar planos de add-on fiscal e vincular empresas a eles
  Para que o custo do módulo fique estruturado e visível

  Background:
    Dado que o usuário está autenticado com role "superadmin" ou "admin"

  # --- Happy path ---

  Scenario: Cadastrar um plano de add-on fiscal
    Quando o usuário cadastra um plano "Fiscal Básico" com preço fixo e preço por nota
    Então o plano é salvo e aparece na listagem

  Scenario: Ativar módulo fiscal exige escolher um plano
    Dado uma empresa "Burger House" com dados fiscais completos e cadastrada na Focus NFe
    Quando o usuário ativa o módulo fiscal dessa empresa
    Então o sistema exige a seleção de um plano de add-on antes de confirmar
    E, escolhido o plano, a aba "Plano" passa a mostrar o bloco "Módulo fiscal" preenchido

  # --- Bordas ---

  Scenario: Empresa com módulo inativo mostra "Não contratado"
    Dado uma empresa sem módulo fiscal ativo
    Quando o usuário abre a aba "Plano" dessa empresa
    Então o bloco "Módulo fiscal" mostra "Não contratado", sem plano vinculado

  Scenario: Desativar módulo não desvincula o plano
    Dado uma empresa com módulo fiscal ativo e plano vinculado
    Quando o usuário desativa o módulo fiscal
    Então o plano permanece vinculado (histórico), só o status de ativação muda

  Scenario: Plano de add-on em uso não pode ser excluído
    Dado um plano de add-on vinculado a pelo menos uma empresa (ativa ou não)
    Quando o usuário tenta excluir esse plano
    Então o sistema bloqueia a exclusão, permitindo só edição

  # --- Erros / controle de acesso ---

  Scenario: Owner não gerencia planos de add-on fiscal
    Dado um usuário autenticado com role "owner"
    Quando esse usuário tenta acessar a tela de planos de add-on fiscal
    Então o sistema retorna 403
```

### Critérios de aceite testáveis
- [ ] CRUD de planos de add-on funcional, restrito a `superadmin`/`admin`
- [ ] Ativação do módulo fiscal exige plano vinculado
- [ ] Aba "Plano" reflete corretamente contratado/não contratado
- [ ] Desativação preserva o vínculo do plano (histórico)
- [ ] Plano em uso não pode ser excluído
- [ ] `owner`/`manager` recebem 403 no CRUD de planos

### O que ainda impede o avanço pro Tech Explorer
Nada bloqueante.

## Tech Explorer

### Serviços impactados
Só **company-service** (mesmo serviço de `PriceTable`) + **frontend/admin**.

### Modelo de dados (novo, espelha `PriceTable` de forma simplificada)
```python
class FiscalAddonPlan(Base):
    __tablename__ = "fiscal_addon_plans"
    id = Column(Integer, primary_key=True)
    name = Column(String(120), nullable=False)
    status = Column(String(20), default="active")  # mesmo espírito de PriceTable.status
    monthly_price = Column(Numeric(10, 2), nullable=False)
    price_per_document = Column(Numeric(10, 4), nullable=False)  # 4 casas — valores por nota
                                                                    # costumam ser centavos (R$0,05)
    created_at = Column(DateTime, server_default=func.now())

# Em CompanyFiscalConfig (ORD-168/170/171):
#   fiscal_addon_plan_id = Column(Integer, ForeignKey("fiscal_addon_plans.id"), nullable=True)
```
Sem tabela de histórico dedicada (diferente de `CompanyPlanHistory`) — dado o volume baixo
esperado (módulo opt-in, poucos clientes no piloto), reavaliar se necessário depois de escala
maior; não construído agora pra não especular.

### Endpoints novos
- `GET/POST/PUT /commercial/fiscal-addon-plans` e `GET /commercial/fiscal-addon-plans/{id}` —
  mesmo padrão de auth e formato de `PriceTable` (`_require_platform_admin`).
- `PATCH /companies/{id}/fiscal-config` (extensão do endpoint já existente da ORD-171) passa a
  aceitar `fiscal_addon_plan_id` junto de `ativo`.

Response de `GET /commercial/fiscal-addon-plans/{id}` inclui `linked_companies_count` (mesmo
padrão de `PriceTable`), usado pra bloquear exclusão de plano em uso.

### Mudança no frontend
- Tela nova `FiscalAddonPlanListScreen`/`FiscalAddonPlanFormScreen` — cópia estrutural direta de
  `PriceTableListScreen`/`PriceTableFormScreen`, campos reduzidos (nome, preço fixo, preço por
  nota, sem faixas de transação).
- `PlanTab` (`CompanyScreen.tsx`) ganha bloco "Módulo fiscal" abaixo do bloco existente de
  `PriceTable`, mostrando plano vinculado ou "Não contratado".

### Migrations
Uma: cria `fiscal_addon_plans` + coluna `fiscal_addon_plan_id` em `company_fiscal_configs`.

### Eventos de fila
Nenhum.

### Impacto em outros serviços
Nenhum.

### Estimativa
- Backend: **~2,5 pontos** — modelo + 4 endpoints CRUD (cópia direta do padrão `PriceTable`, sem
  faixas de transação — mais simples que o original).
- Frontend: **~1,5 ponto** — tela nova (cópia estrutural de `PriceTable`) + bloco na aba Plano.
- **Total: ~4 pontos.**

### Riscos
1. **Sem histórico de mudança de plano** (decisão deliberada, documentada acima) — aceitável
   pro volume esperado do piloto, revisar se o módulo escalar.
2. **Reaproveitamento estrutural de `PriceTable`** reduz risco de implementação (padrão já
   validado em produção pelas ORD-162 a 167), mas exige atenção pra não copiar código
   desnecessariamente — avaliar se vale abstrair um componente compartilhado ou se a duplicação
   pontual é aceitável dado o tamanho pequeno da tela.

### O que ainda impede o avanço pro Ready
Nada bloqueante.

## Ready

**Explorer:** [x] história Como/quero/para · [x] decisão comercial fechada com o usuário (add-on
separado, não eixo da PriceTable) · [x] relação com o flag `ativo` esclarecida (não duplica
estado) · [x] fluxo principal (4 passos) · [x] dependências (bloqueada por ORD-171) · [ ]
wireframe — não produzido, risco baixo (reaproveita layout da PriceTable) · [x] critérios de
aceite funcionais.

**QA Explorer:** [x] happy path (cadastro de plano, ativação vinculando plano) · [x] bordas
(não contratado, desativação preserva vínculo, plano em uso não exclui) · [x] erros/controle de
acesso (owner 403) · [x] cenários aprovados.

**Tech Explorer:** [x] serviço impactado (só company-service) · [x] modelo de dados
(`FiscalAddonPlan` + campo em `CompanyFiscalConfig`) · [x] endpoints (CRUD + extensão do
existente) · [x] migrations (uma) · [x] eventos de fila — nenhum · [x] estimativa (4 pontos) ·
[x] riscos com mitigação.

**Aprovação final:** [x] solução técnica revisada · [x] estimativa 4 pontos · [x] sem bloqueios
não resolvidos · [ ] sprint específico — não atribuída ainda.

**Status: Ready.**

## Implementação

Implementado como desenhado no Tech Explorer, com um ajuste de local do dado exposto ao
frontend: o bloco "Módulo fiscal" da aba Plano foi embutido em `CompanyPlanOut`
(`GET /companies/{id}/plan`), não em `FiscalConfigOut` como o esboço original sugeria — esse
endpoint já é acessível a owner/manager da própria empresa (`_require_company_admin`), enquanto
`FiscalConfigOut` é restrito a superadmin/admin. Colocar o bloco lá deixaria a aba Plano quebrada
(403 silencioso) pra qualquer usuário que não fosse admin de plataforma.

Backend: `FiscalAddonPlan` (modelo) + `fiscal_addon_plan_id` em `CompanyFiscalConfig` + CRUD
`/commercial/fiscal-addon-plans` (create/list/get/update/delete, bloqueio de edição/exclusão
quando vinculado a alguma empresa) + extensão de `PUT /companies/{id}/fiscal-config` (aceita
`fiscal_addon_plan_id`, exige plano preenchido pra `ativo=true`) + extensão de
`GET /companies/{id}/plan` (bloco `fiscal_addon_plan`/`fiscal_module_ativo`). Migration
`20260917_1400_fiscal_addon_plans.py`, testada rodando de verdade no container local (upgrade
limpo). 19 testes novos (`test_ord174_addon_fiscal_pricing.py`, 10 testes, + 1 teste de borda
adicionado em `test_ord171_ativo_ambiente_credenciais.py` para "ativar sem plano é rejeitado" + 3
testes existentes ajustados pra passar `fiscal_addon_plan_id` na ativação). Suíte completa do
company-service (469 testes) e `ruff` sem regressão.

Frontend: `FiscalAddonPlanListScreen`/`FiscalAddonPlanFormScreen` (cópia estrutural simplificada
de `PriceTableListScreen`/`PriceTableFormScreen`, sem faixas nem status), nova entrada de sidebar
"Add-on fiscal", `FiscalTab` ganha Dropdown de plano (auto-save, mesmo padrão do Ambiente) e o
Toggle de ativação passa a exigir plano escolhido, `PlanTab` ganha o bloco "Módulo fiscal".
Testado manualmente de ponta a ponta no navegador: criação de plano, vínculo numa empresa já
ativa de sessão anterior (caso "grandfathered" — `ativo=true` sem plano, populado corretamente
pelo Dropdown sem precisar desativar/reativar), bloqueio de edição/exclusão do plano em uso, e o
bloco da aba Plano refletindo o vínculo.

**Gotcha desta sessão (recorrente)**: o container do company-service ficou rodando código
desatualizado duas vezes durante a implementação — hot-patch (`docker compose cp`) feito antes de
terminar todas as edições do `main.py`, mascarado porque o serviço continuava respondendo (só sem
os campos novos). Sintoma: `GET /companies/{id}/plan` retornando sem `fiscal_addon_plan`/
`fiscal_module_ativo` mesmo depois de reload completo do navegador — só reproduzido comparando a
resposta real da API via curl contra o código fonte.
