---
id: ORD-167
status: New
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
