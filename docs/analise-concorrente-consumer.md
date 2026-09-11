# Análise de concorrência — Consumer (produto, funcionalidades, preço)

Terceiro da leva de aprofundamento (após CPlug e Nola) dos 8 concorrentes originalmente cobertos só por dashboard/BI em `docs/analise-dashboard-concorrentes-mercado.md` (achado da época: "relatórios acessíveis remoto por celular; nada de analytics diferenciado além do básico — combo/promoção ainda nem estão no totem deles" — pesquisa de hoje mostra que isso mudou/estava incompleto). Pesquisa (2026-09-10). Ver `docs/project_ordin_concorrentes_referencia` (memória) pra lista completa.

**Fontes:** `consumer.com.br/autoatendimento` (página de produto do totem) e `loja.consumer.com.br` (planos e preços).

## O que é

Sistema pra restaurantes, bares, lanchonetes, pizzarias — "+30 mil clientes", mais de 100 funcionalidades integradas (PDV, Comanda Mobile, Cardápio Digital, iFood, estoque, NFC-e, combos, divisão de conta, App do Entregador, balança, agenda de encomendas, fidelidade, cashback, Consumer Ads, Consumer Connect). Diferente do Nola (foco em gestão/BPO) e mais parecido com o SisFood/CPlug em focar o totem como produto de vitrine.

## Totem de autoatendimento — funcionalidades

Fluxo: cliente monta pedido na tela → cardápio com fotos/complementos/sugestões automáticas de adicionais → paga (TEF cartão crédito/débito, ou **PIX com QR Code na tela**) → cupom fiscal automático → pedido vai direto pra cozinha (impressora balcão/cozinha ou KDS).

Hardware: "hardware homologado (totem com tela touch e impressora)", sem modelo específico público — recomenda "consultar especialista pra melhor combinação pro seu volume" (mesmo padrão evasivo de SisFood/CPlug em não fixar SKU de hardware na página pública).

**Diferencial de venda mais agressivo entre os concorrentes vistos até agora** — números de case específicos:
- "+32% ticket médio" (estudo de caso concreto: R$28 → R$37)
- "2x mais pedidos no pico" (80 → 160 pedidos/hora)
- "Reduzi 1 atendente" — ROI citado em ~5 meses
- "42 restaurantes instalaram totens este mês" (prova social de volume recente)

## Tabela de preços (`loja.consumer.com.br`)

| Plano | Preço/mês | Totem incluso? | Principais recursos |
|---|---|---|---|
| **Grátis** | R$0 | Não | PDV, Comanda Mobile, Cardápio Digital, WhatsApp, estoque — até 200 pedidos/mês |
| **Essencial** | R$59,90 | Não | PDV (1 computador), emissor fiscal, cardápio digital básico (30 pedidos), relatórios Connect |
| **Profissional** | R$179,90 | Não | + PDV em rede (múltiplos computadores), comanda mobile, cardápio digital completo, multi-integração iFood |
| **Alta Performance** | R$269,90 | **Sim** | + **Totem de Autoatendimento**, automação TEF, disparo via WhatsApp, gerente de conta prioritário |

**Achado central pro benchmark de pricing**: terceiro modelo distinto de "onde o totem entra no pricing" visto até agora:
- **CPlug**: totem incluso desde o plano de entrada pago (R$249/mês)
- **Nola**: totem é hardware à parte, sob consulta, só a partir de faturamento alto (Profissional+)
- **Consumer**: totem incluso, mas só no **plano mais caro** (R$269,90/mês, "Alta Performance") — modelo de plano-degrau, não add-on à parte como o Nola, mas também não disponível nos planos de entrada como a CPlug

Detalhe de custo marginal: "**1 ponto de totem incluído; pontos adicionais cobrados separadamente**" — não achamos o valor exato do ponto adicional nesta rodada. Mesma lógica pro TEF: "primeiro ponto incluso, adicionais R$21,00 cada" — dá uma referência concreta de custo marginal por terminal extra, que nem CPlug nem Nola expuseram publicamente.

**Condições comerciais:** implementação gratuita em todos os planos, sem compromisso anual ("conheça os planos mensais"), garantia de **7 dias ou dinheiro de volta, sem perguntas** — modelo de baixo atrito parecido com o do Nola (30 dias grátis, sem fidelidade), e mais flexível que a CPlug (contrato de 1 ano no mensal).

## FAQ / detalhes técnicos capturados

- Emite fiscal? Sim, cupom fiscal automático "após pagamento via TEF".
- Funciona com PIX? Sim, QR Code exibido na tela do totem.
- Cardápio personalizável? Sim — cores, logo, fotos, ordem de exibição, combos.
- Quanto economiza de atendente? "1 a 2 atendentes em picos" (mensagem de venda, não medição).

## Comparação com o Ordin (observações, não recomendação)

- **Terceiro modelo de posicionamento de preço do totem** confirma que não há convenção única de mercado — vale essa mesma pergunta ("o totem entra em que degrau do pricing?") quando o Ordin decidir empacotar/precificar formalmente, se algum dia isso for cobrado à parte de um PDV completo.
- **Custo marginal por terminal adicional exposto publicamente** (R$21/ponto TEF) é o primeiro dado concreto de "quanto custa escalar terminais" visto na pesquisa — útil se o Ordin quiser comparar contra o próprio custo de adicionar terminais/totens por empresa.
- **Garantia de reembolso em 7 dias + sem fidelidade** é o segundo concorrente (depois do Nola) com modelo comercial de baixo atrito — pode ser sinal de tendência de mercado nesse segmento de pequeno/médio negócio, reforçando o próprio posicionamento do Ordin.
- Página de produto do totem é muito mais "case-driven" (números de resultado específicos) que SisFood/CPlug/Nola — vale como referência de como comunicar ROI se o Ordin quiser montar material de vendas equivalente.

## Próximos passos

Pendente na mesma rodada: **Zig, Gototem, PagTotem** — um de cada vez.
