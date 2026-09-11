# Proposta de plano comercial — mensalidade por totem + taxa transacional

Primeira versão pra discussão (2026-09-10), consolidando a pesquisa de concorrência (`docs/analise-concorrentes-modelo-cobranca-totem.md`, `docs/analise-custo-transacional-oculto-concorrentes.md`) e a estimativa de custo AWS (`docs/analise-custo-infra-aws-estimativa.md`). Estrutura pedida: mensalidade por totem com desconto progressivo por unidade adicional (até 5 totens, acima disso sob consulta) + tabela de taxa transacional já calibrada pro segmento pequeno/médio. **Custo de hardware fica fora desta proposta — próxima etapa, separada.**

## 1. Mensalidade por totem

Base de R$249,00 pro 1º totem, ancorada na CPlug (`docs/analise-concorrente-cplug.md`) — é o concorrente mais parecido com o próprio modelo do Ordin: totem como produto central desde o plano de entrada (R$249/mês), não add-on gated num plano caro. Cross-check: Consumer e Suitable só liberam totem no topo do funil (R$269,90 e R$459 respectivamente) — R$249 fica conservador/competitivo dentro dessa faixa observada, sem ser o mais barato nem o mais caro do mercado pesquisado.

Estrutura: 1º totem preço cheio, 2º a 0,5×, do 3º ao 5º a 0,3× cada, 6º+ sob consulta comercial.

| Totem | Multiplicador | Valor do totem | Total acumulado no mês |
|---|---|---|---|
| 1º | 1,0× | R$249,00 | R$249,00 |
| 2º | 0,5× | R$124,50 | R$373,50 |
| 3º | 0,3× | R$74,70 | R$448,20 |
| 4º | 0,3× | R$74,70 | R$522,90 |
| 5º | 0,3× | R$74,70 | R$597,60 |
| 6º+ | — | Sob consulta comercial | — |

Preço médio por totem cai de R$249,00 (1 totem) para R$119,52 (5 totens) — coerente com a régua de dimensionamento já levantada (`docs/analise-concorrentes-sisfood-totem-autoatendimento.md`): cliente com 5 totens já está no perfil "médio-grande" (250+ pedidos/dia), então faz sentido premiá-lo com o maior desconto antes de virar negociação comercial dedicada.

## 2. Taxa transacional (por empresa/mês)

Tabela já calibrada pro segmento pequeno/médio (`docs/analise-custo-infra-aws-estimativa.md`), ancorada na régua de totens-por-pedido/dia do SisFood:

| Faixa de transações/mês | Perfil equivalente | Preço/transação |
|---|---|---|
| 0 – 1.000 | Pequeno iniciante | R$0,12 |
| 1.001 – 3.000 | Pequeno padrão (1-2 totens) | R$0,10 |
| 3.001 – 7.500 | Médio (2-4 totens) | R$0,08 |
| 7.501 – 15.000 | Médio-grande (4-6+ totens) | R$0,06 |
| 15.000+ | Sai do pequeno/médio | R$0,04 (ou sob consulta) |

## 3. O que fica de fora, de propósito

- **Hardware do totem** (comprado, alugado ou comodato) — não modelado aqui, é a próxima etapa, separada por pedido explícito do usuário.
- **Taxa de adquirente/MDR** — nunca entra na conta do Ordin; é repassada ao adquirente que o cliente escolher, mantendo o diferencial de multi-provedor já estabelecido.
- **Setup/adesão** — não incluído nesta proposta; os dois concorrentes com pricing mais transparente (CPlug, Consumer) não cobram, vale considerar seguir o mesmo padrão quando essa peça entrar na discussão.

## Possível expansão futura — eventos e casas noturnas (fora do escopo desta proposta)

Discussão (2026-09-10): casa de show/casa noturna (300-800 pessoas, aberta sexta/sábado/domingo, venda de bebida alcoólica + porção) tem volume muito acima do segmento pequeno/médio que esta tabela cobre — estimativa por cenário (baixo/médio/alto, assumindo 2-4 transações/pessoa/noite pela repetição de rodada de bebida) vai de **7.800 a 41.600 transações/mês**, e a necessidade de totens no pico (regra de 1 totem a cada 30-50 pedidos em 2h) fica em **12-20 totens**, muito acima do teto de 5 desta proposta.

Esse perfil bate com o segmento que a **Zig** ataca (`docs/analise-concorrente-zig.md`) — cashless pra eventos/casas noturnas/arenas —, já classificado como **adjacente**, não concorrente direto do Ordin no pequeno/médio restaurante. Nota de produto: alta densidade de compra repetida costuma usar **modelo cashless pré-pago** (cartão/pulseira recarregável em múltiplos pontos de bar) em vez de fila única no totem — mudança de UX, não só de preço, que o Ordin não modela hoje.

**Status: possível expansão de segmento, não decidida.** Não desenhar faixa comercial dedicada nem mudar produto pra isso sem pedido explícito — registrado aqui só pra não perder o contexto se a conversa voltar.

## Observação

Valores e degraus são ponto de partida — âncoras vêm de pesquisa de mercado e de uma estimativa de custo AWS projetada (infra ainda não existe em produção), não de dado real de operação. Ajustar livremente antes de qualquer comunicação externa.
