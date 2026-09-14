# Análise de concorrência — Genesis PRO (ProFranchising)

Concorrente novo, fora da rodada de 8 já fechada (`docs/analise-dashboard-concorrentes-mercado.md`). Pesquisa (2026-09-14) iniciada a partir de um link de solicitação de demo enviado pelo usuário, aprofundada com o site institucional e o blog. Ver `project_ordin_concorrentes_referencia` (memória) pra lista completa de concorrentes rastreados.

**Fontes:** landing page de demo (`lp.profranchising.com.br/solicitar-demo`), site institucional (`genesis.pro.br`), página de planos (`genesis.pro.br/pricing`), blog (`genesis.pro.br/blog`). Não existe `/faq` dedicado (404) — perguntas frequentes aparecem em accordion na home. Busca por reclamações (Reclame Aqui) não achou registro da empresa — só homônimos de outros ramos (seguros, benefícios veiculares), descartados.

## O que é

**Genesis PRO**, produto da empresa **PRO Franchising**. Plataforma de gestão + PDV que combina totem de autoatendimento, PDV, ERP, KDS, fiscal, estoque, financeiro, fidelidade e cashback num sistema só. Nasceu no mercado de franquias (nome da empresa é literalmente "ProFranchising") e depois expandiu pra food service em geral e até outros segmentos.

**Público-alvo declarado:** redes de franquia e restaurantes de médio/grande porte, cafeterias, bares/baladas, lojas de varejo, distribuidoras de bebida, parques aquáticos. Diferente da maioria dos concorrentes já mapeados (CPlug, Consumer, Suitable), o discurso comercial mira explicitamente **rede multi-unidade**, não o operador único pequeno — ponto de contraste direto com o público do Ordin hoje.

## Funcionalidades

- **Autoatendimento (totens)** com customização de marca — "com a cara da sua marca": layout, cores, ícones, fluxos de venda, impressão e regras por loja.
- PDV ilimitado (front de caixa) + PDV direto na maquininha de cartão.
- Cardápio digital por QR code + integração de delivery (iFood, Rappi).
- KDS sem limite de dispositivos.
- Gestão de estoque com ficha técnica e cálculo automático de CMV.
- Financeiro completo: contas a pagar/receber, conciliação bancária automática.
- Emissão fiscal (NFC-e, NFe) com importação automática de nota.
- Gestão de mesas/comandas com integração de balança.
- **Inteligência multi-loja**: gestão centralizada de várias unidades, padronização de cardápio/preço por região, dashboard em tempo real com ranking entre unidades, relatórios de vendas via WhatsApp, app de delivery próprio.
- Programas de fidelidade e cashback.
- Painel de senha pra controle de fila.

## Hardware e pagamento

- Roda em **Android, Windows ou sistema operacional proprietário da Genesis** — flexibilidade maior que a maioria (CPlug e SisFood também são BYO-hardware, mas Genesis PRO adiciona SO próprio como terceira opção).
- Faixa de equipamento recomendada: **R$500 a R$15.000** — não é obrigatório comprar o totem com eles ("você não precisa comprar o totem com a gente"), citam fornecedores de fábrica sem margem de revenda como alternativa.
- **Parceria oficial com a Stone** para pagamento integrado (maquininha que imprime e processa na própria PDV/totem), além de TEF genérico "com todas as principais adquirentes".
- Infra 100% cloud, servidores criptografados, backup automático, LGPD.

## Tabela de preços (`genesis.pro.br/pricing`)

| Plano | Preço/mês | Destaques |
|---|---|---|
| Essencial | R$250 | PDV básico, KDS, estoque, financeiro, cardápio digital, fidelidade básica |
| Gestão Completa | R$450 | + fiscal (NFC-e/NFe), integração WhatsApp, delivery, CRM |
| **Gestão + Autoatendimento** | R$650 | + totem de autoatendimento (1º incluso), customização de marca, mídia/display |
| Redes e Expansão | Sob consulta | Gestão multi-unidade, padronização de rede, precificação regional, BI |

**Achado central pro benchmark de pricing do Ordin — 4º modelo distinto de "onde o totem entra":** nenhum dos 8 concorrentes da rodada anterior tinha esse padrão híbrido. Aqui o totem **só entra a partir do 3º degrau** (R$650, igual ao padrão Consumer/Suitable de "plano mais caro"), mas depois de incluso o **1º totem**, cada unidade adicional custa **R$99/mês fixo por totem** — modelo de precificação por volume parecido com o Suit Tablet da Suitable (R$19,90-39,90/unidade), só que aqui o valor por unidade adicional é fixo e mais alto.

- **PDVs e usuários ilimitados em todos os planos, sem custo adicional** — contrasta com CPlug, que limita PDV/usuário por degrau de plano. Se o Ordin cobrar por terminal/usuário no futuro, esse é o benchmark mais agressivo já visto (ilimitado desde o plano de entrada R$250).
- **Sem fidelidade contratual** — cancelamento a qualquer momento, com exportação de dados garantida. Mesmo padrão da Nola (30 dias, sem fidelidade) e oposto ao contrato de 1 ano da CPlug.
- **Setup/implantação inclusa, sem custo separado**: em média 14 dias úteis, cadastro de produtos, montagem de cardápio, layout e integrações feitos pela equipe da Genesis; treinamento incluso.
- Suporte: gerente de conta dedicado via WhatsApp, central de atendimento com SLA, emergência 24h até as 22h.

## FAQ / destaques institucionais (accordion da home, sem página dedicada)

- Sem trava contratual — pode cancelar quando quiser, com garantia de exportação de dados.
- Segurança de dados: criptografia + conformidade LGPD.
- Suporte com central de atendimento + linha de emergência.
- +30 soluções integradas numa plataforma só — discurso de "não depender de vários sistemas".

## Clientes citados

Mais1 Café, Bubble MIX, Choco Oz, Konvém, Nanook, Buffet 133, Labola, Don Pastello, Orla Curitiba, Hera, Big Field Açaí, Mister Submarine, Picco Wine & Spirits, Mercadão Suplementos, entre outros. Lista mais extensa e com nomes mais reconhecíveis (franquias/redes) do que a maioria dos concorrentes já mapeados — reforça o posicionamento pra rede multi-unidade. Vale notar: existe página de status pública (`status.mais1cafe.com.br`) documentando incidentes técnicos reais — ex. problema de sincronização com Stone que impediu envio de informação pro KDS e pro totem. Sinal de que o produto está em produção real, não só marketing.

## Comparação com o Ordin (observações, não recomendação)

- **Foco em rede multi-unidade desde a proposta de valor** (padronização de cardápio/preço entre lojas, ranking entre unidades, dashboard consolidado) é um ângulo que nenhum dos 8 concorrentes anteriores explorou tão explicitamente — a maioria mira o operador único. Se o Ordin pretende atender redes/franquias no futuro, Genesis PRO é a referência mais próxima desse caso de uso hoje mapeada.
- **Terceiro padrão de "totem por volume"** (1º incluso no plano caro + adicional a preço fixo por unidade) some-se ao mapa dos 3 modelos já registrados em `project_concorrentes_modelo_cobranca` (incluso desde o básico / só no plano caro / hardware separado) — vale atualizar aquela memória com essa variante híbrida.
- **PDV e usuário ilimitados em todo plano** é o compromisso mais generoso visto até agora nesse eixo — referência se o Ordin decidir cobrar por terminal/usuário.
- **Integração oficial com Stone** (parceria declarada, não só TEF genérico) é relevante pra análise de adquirentes em andamento (`project_integracao_stone_decidida`) — mostra que pelo menos um concorrente direto já fechou parceria formal com a Stone especificamente, o que pode pesar na decisão do Ordin sobre priorização de adquirente.
- Diferente de Nola/Zig/PagTotem (adjacentes, não food service pequeno/médio), Genesis PRO **é** concorrente direto de food service — só que mirando uma faixa de cliente (redes) um degrau acima do que os outros 8 miravam.

## Próximos passos

Nenhum pendente nesta rodada — só este concorrente foi pedido. Ao atualizar a memória de referência, marcar Genesis PRO como concorrente direto focado em redes/franquias, e considerar se vale revisitar `project_concorrentes_modelo_cobranca` com o 4º modelo de pricing de totem encontrado aqui.
