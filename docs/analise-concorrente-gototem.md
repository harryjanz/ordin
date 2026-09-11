# Análise de concorrência — Gototem (produto, funcionalidades, preço)

Quinto da leva de aprofundamento (após CPlug, Nola, Consumer e Zig) dos 8 concorrentes originalmente cobertos só por dashboard/BI em `docs/analise-dashboard-concorrentes-mercado.md` (achado da época: "dashboard mobile/desktop com filtros por vendas/faturamento/ticket médio — essencialmente o que já temos, sem diferencial novo" — pesquisa de hoje mostra um produto mais amplo do que só o dashboard sugeria). Pesquisa (2026-09-10). Ver `docs/project_ordin_concorrentes_referencia` (memória) pra lista completa.

**Fontes:** `gototem.com.br` (site institucional, Joinville/SC).

## Achado central: Gototem é especialista em autoatendimento que PLUGA em cima do PDV que o cliente já tem — não é um PDV completo próprio

Diferente de CPlug/Consumer/SisFood (que vendem PDV completo + totem no mesmo ecossistema) e do Nola (PDV + gestão, totem como acessório), a Gototem se posiciona como **camada de autoatendimento que se integra ao PDV existente do restaurante**, explicitamente compatível com: **Totvschef, Menew, Saipos, Sischef, Colibri, Desbravador, Mogo, Eclética, Opdv, Linx, Unika, AlfaLabs, 3LM**, entre outros. Ou seja, concorre indiretamente com o próprio Mogo (que também está na lista de referência do Ordin) — a Gototem se vende como add-on que funciona em cima do Mogo, não como substituto dele.

Isso é um modelo de mercado que nenhum concorrente anterior tinha mostrado tão explicitamente: **o totem como produto autônomo/plugável**, competindo só nessa fatia específica do fluxo (autoatendimento), deixando PDV/gestão financeira/estoque pro sistema que o restaurante já usa.

## Linha de produto (módulos, todos com prefixo "Gototem")

- **FOOD**: totem de autoatendimento clássico — pedido, personalização, pagamento.
- **BALANÇA**: "o cliente pesa, paga e o sistema calcula tudo automaticamente" — nicho de self-service por peso (restaurante a quilo), não visto em nenhum concorrente anterior.
- **SMART**: "transforma seus garçons em caixas móveis" — PDV móvel pra atendimento de mesa.
- **CARDÁPIO MOBILE**: cardápio via QR Code no celular do cliente.
- **MENU**: cardápio digital com envio direto à cozinha.
- **PAY**: pagamento via totem com comanda (modelo pré-pago/comanda, não só por pedido).
- **KDS**: painel de gerenciamento de pedidos pra cozinha.

Segmentos: restaurantes, bares, hamburguerias, açaiterias, sorveterias, cafeterias, pizzarias, food trucks, conveniências, franquias **e supermercados** (único concorrente a citar supermercado explicitamente, provavelmente por causa do módulo BALANÇA).

## Preço, setup e planos — não há tabela pública

Sem preços no site — "orçamento via WhatsApp". Mesmo padrão da Zig, mas aqui provavelmente por ser um negócio B2B de porte menor/regional (Joinville/SC) que vende sob consulta, não por operar em segmento enterprise como a Zig.

**Contexto de mercado geral (não específico da Gototem, achado em busca complementar sobre preço de totem no Brasil, tratar como ordem de grandeza do setor, não como preço confirmado de nenhum concorrente):** hardware de totem varia ~R$4-25 mil/unidade dependendo do porte (bancada R$4-7k, chão R$8-15k, premium R$18-25k, outdoor R$12-20k); software recorrente R$100-500/mês; modelos de comodato/aluguel a partir de ~R$979-1.299/mês sem investimento inicial. Nenhum desses números foi confirmado como sendo especificamente da Gototem — vale registrar como pano de fundo do setor, útil pra calibrar expectativa de "quanto custa" quando a informação não é pública.

## Diferenciais de venda (números de marketing)

- "Aumento do ticket médio em até 30%"
- "55% de redução no tempo de espera"
- "66% dos clientes preferem autoatendimento" (estatística de preferência do consumidor, não resultado direto de cliente)
- Suporte 24/7 humanizado (site também menciona seg-seg 9h-21h em outro ponto — pequena inconsistência entre páginas, não resolvida nesta pesquisa)
- "Fabricação nacional"
- Monitoramento em tempo real do equipamento

## Detalhes operacionais (FAQ implícito no site)

- Funciona integrado ao PDV existente (não substitui).
- Instalação remota com treinamento via web (não presencial).
- Suporte humano.
- Requer internet conectada (mesmo requisito universal já visto em SisFood/CPlug/Consumer).
- Segurança com monitoramento em tempo real do equipamento.

## Comparação com o Ordin (observações, não recomendação)

- **Modelo "totem plugável em PDV de terceiros"** é um ângulo de mercado que o Ordin (sendo plataforma única PDV+totem+KDS) não precisa competir diretamente — mas mostra que existe demanda de restaurante que já tem PDV e só quer adicionar autoatendimento sem trocar de sistema. Pode ser relevante se o Ordin algum dia considerar uma oferta "totem standalone" pra quem já usa outro PDV — hoje não é o modelo do Ordin, é só um dado de mercado.
- **Módulo BALANÇA (self-service por peso)** é nicho não coberto por nenhum concorrente anterior nem pelo Ordin — vale registrar como possibilidade de segmento (buffet/self-service a quilo) se algum dia entrar no radar de expansão de segmento do Ordin.
- Terceiro concorrente seguido (depois de Nola e Zig) sem tabela de preço pública — reforça que **grande parte do mercado brasileiro de totem/PDV não expõe preço**, e os que expõem (CPlug, Consumer) parecem ser exceção, não regra. Vale esse dado consolidado quando o Ordin decidir sua própria estratégia de transparência de pricing.

## Próximos passos

Pendente na mesma rodada: **PagTotem/PagVendas (PagBank)** — último da lista de 8.
