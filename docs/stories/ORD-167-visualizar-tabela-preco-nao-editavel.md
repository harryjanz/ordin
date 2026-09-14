---
id: ORD-167
status: Explorer
fase: 6
sprint: null
responsavel: Backend SR + Frontend
---

# ORD-167 — Visualizar tabela de preço não editável (dados + empresas vinculadas)

## Descrição
Na tela de Tabelas de Preço do admin (`PriceTableListScreen.tsx`), quando uma tabela já foi
usada por alguma empresa (`editable=false`, regra fechada na ORD-165) o botão "Editar" some da
linha — e não existe nenhuma alternativa pra consultar a configuração daquela tabela. Hoje é
impossível ver preço do 1º/2º/3º-5º totem, faixas de transação ou quais empresas estão
vinculadas a uma tabela não editável, mesmo sem querer alterá-la. A proposta é dar uma forma de
**visualização somente-leitura** (o formato exato — modal ou reaproveitar a tela dedicada em modo
leitura — fica pro Explorer/Tech Explorer decidirem), mostrando tanto a configuração completa da
tabela quanto a lista de empresas vinculadas a ela (hoje só existe a contagem
`linked_companies_count`, não os nomes).

## Persona
**Admin / Super Admin** — administram o catálogo comercial de tabelas de preço e precisam
conferir a configuração de uma tabela já em uso (ex.: pra decidir se duplicam antes de editar, ou
pra saber quais empresas seriam afetadas por uma mudança).

## Contexto
Levantado pelo próprio usuário usando a tela: a regra de "tabela usada não é editável" (ORD-165)
já está correta e não deve mudar, mas o efeito colateral de esconder o botão "Editar" também
escondeu qualquer jeito de **ver** os dados — usuário explicitamente não quer poder editar,
só visualizar. Achado técnico já confirmado nesta sessão: `PriceTableFormScreen.tsx` já tem um
estado `readOnly` (usado hoje só quando alguém chega direto por link/engano, sem essa proteção
vir da lista) — parte da solução pode já existir, faltando só o ponto de entrada. O backend
(`PriceTableOut`/`PriceTableSummaryOut` em `services/company/main.py`) só expõe
`linked_companies_count: int`, não a lista de nomes — precisa de dado novo.

## Explorer

### História
Como **Admin/Super Admin**, quero visualizar a configuração completa de uma tabela de preço já
em uso e a lista de empresas vinculadas a ela, para conferir os dados e avaliar impacto antes de
decidir duplicar ou trocar a tabela de uma empresa — sem precisar (nem poder) editá-la.

### Decisão de UI: reaproveitar `PriceTableFormScreen`, não criar modal novo
O usuário deixou o formato em aberto ("pode ser até modal... o importante é ter uma forma de
visualizar"). Decisão do Explorer: **reaproveitar a tela dedicada já existente**
(`/commercial/price-tables/{id}/edit`), não construir um modal do zero. Motivos:
- `PriceTableFormScreen.tsx` **já tem** um estado `readOnly` (`!t.editable`) que desabilita todos
  os campos e esconde o botão "Salvar" — construído na ORD-162, hoje só alcançável se alguém
  navegar pra lá manualmente (ex.: digitando a URL), nunca pela lista. Falta só o ponto de
  entrada, não o comportamento.
- É o mesmo padrão já validado nesta sessão pra `PromotionFormScreen.tsx` (ORD-166): tela única
  que alterna entre editável/somente-leitura, título muda ("Editar promoção" → com tag de
  status), sem duplicar layout em dois lugares.
- Um modal novo precisaria replicar toda a estrutura visual da tabela (nome, 3 preços de totem,
  N faixas de transação) só pra virar uma segunda fonte de manutenção do mesmo layout.

Mudança mínima na lista: quando `!t.editable`, mostrar um botão **"Ver"** no lugar de "Editar"
(mesma posição, mesma rota, mesmo componente — só o texto/verbo muda). Na tela dedicada, quando
`readOnly`, o `<h1>` passa a ser "Ver tabela de preço" em vez de "Editar tabela de preço"
(paralelo ao "Editar promoção — *Ativa*" já implementado na ORD-166).

### Fluxo principal
1. Admin abre `/commercial/price-tables` — tabela com `editable=false` mostra botão **"Ver"** no
   lugar de "Editar".
2. Admin clica "Ver" → navega pra `/commercial/price-tables/{id}/edit` (mesma rota de sempre).
3. Tela carrega em modo somente-leitura (`readOnly=true`, já existente): nome, preços de totem,
   faixas de transação, tudo desabilitado, sem botão "Salvar".
4. Nova seção **"Empresas vinculadas"** lista o nome de cada empresa usando essa tabela agora
   (não só a contagem que já existia).
5. Admin sai pelo botão "Voltar" (já existente) — nenhuma escrita acontece em nenhum momento
   desse fluxo.

### Fluxos alternativos / exceções
- **Tabela sem nenhuma empresa vinculada, mas ainda não editável** (já usada no passado, ver
  regra "editable grudento" da ORD-165) — seção "Empresas vinculadas" mostra estado vazio
  explicando isso ("Nenhuma empresa usa esta tabela agora, mas ela já foi usada — por isso
  continua bloqueada pra edição"), não trata como erro.
- **Tabela com `editable=true`** — comportamento não muda em nada: continua mostrando "Editar",
  formulário editável, sem a seção de empresas vinculadas (ela só faz sentido pra justificar o
  bloqueio de edição).

### Dependências
- **company-service**: `PriceTableOut` (endpoint de detalhe, usado pelo `PriceTableFormScreen`)
  precisa passar a incluir a lista de empresas vinculadas (id + nome), não só a contagem. Join
  simples `CompanyPlan.company_id` → `Company.id`/`Company.name`, mesmo serviço, sem chamada
  externa.
- **frontend/admin**: `PriceTableListScreen.tsx` (trocar "Editar" por "Ver" condicional) e
  `PriceTableFormScreen.tsx` (título dinâmico + nova seção de empresas vinculadas).
- **Histórias bloqueantes**: nenhuma — depende só de dado já existente (`CompanyPlan`), sem
  mudança de schema.

### Critérios de aceite funcionais
- [ ] Tabela com `editable=false` mostra botão "Ver" (não "Editar") na listagem
- [ ] Clicar em "Ver" abre a mesma tela de edição, em modo somente-leitura (campos desabilitados,
      sem botão "Salvar") — comportamento que já existe, só faltava o link
- [ ] Título da tela reflete o modo somente-leitura (ex.: "Ver tabela de preço")
- [ ] Tela mostra a lista de nomes das empresas vinculadas àquela tabela, não só a contagem
- [ ] Tabela sem empresa vinculada agora (mas não editável por já ter sido usada) mostra estado
      vazio explicativo, não erro
- [ ] Tabela com `editable=true` continua com o comportamento atual, sem nenhuma mudança visível

### Wireframe / Mockup
**Faltando** — é mudança de UI (botão novo na lista + seção nova na tela dedicada), mesmo sendo
pequena. Recomendo produzir um wireframe simples no QA Explorer ou logo antes dele, focado só na
nova seção "Empresas vinculadas" (o resto da tela já existe e não muda visualmente).
