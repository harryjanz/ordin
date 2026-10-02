# 03 — Posicionamento e Estratégia de Mensagem

**Fase:** 3 — Estratégia · **Status:** rascunho para aprovação
**Base:** `01-inventario-produto.md` (o que o produto realmente faz) + `02-concorrencia-matriz.md` (onde isso é raro ou comum no mercado).

---

## 1. ICP (perfil de cliente ideal)

### ICP principal

**Dono-operador de estabelecimento de atendimento rápido com 1 unidade física** — hamburgueria, pizzaria, lanchonete, cafeteria, operação em praça de alimentação/galeria. Fluxo "pede e retira" (não mesa com garçom). 1 a 5 totens na mesma operação.

Perfil estrutural, não arbitrário — bate exatamente com onde o Ordin tem prova técnica e onde a concorrência deixa espaço (`02-concorrencia-matriz.md`, seção 2 e 5):
- Sem piso de faturamento mínimo (diferente da Nola, que exige R$40k+/mês)
- Não é rede/franquia (diferente do público-alvo da Genesis PRO)
- Quer o totem como produto central, não um módulo dentro de uma suíte de 30 funcionalidades que não vai usar (diferente de Nola, Mogo, CardápioWeb, Suitable)

**Dores:**
- Fila visível no horário de pico — venda perdida por abandono, cliente insatisfeito
- Erro de pedido por comunicação verbal no balcão — retrabalho, desperdício, reclamação
- Custo e rotatividade de atendente de caixa
- Insegurança sobre quanto está pagando de taxa de cartão de verdade (achado de mercado real: PDV "grátis" pode custar até 4x mais via MDR forçada — `02-concorrencia-matriz.md`, seção 4)
- Pressão regulatória de NFC-e (gatilho real documentado: obrigatoriedade em SP a partir de jan/2026, `analise-gap-features-roadmap-futuro.md`)

**Gatilhos de compra:**
1. Fila visível perdendo cliente no pico
2. Erro de pedido recorrente custando dinheiro/reputação
3. Já foi "fisgado" por um totem "grátis" de outro fornecedor e descobriu a taxa escondida depois
4. Precisa resolver NFC-e e não quer um sistema fiscal separado do ponto de venda
5. Dificuldade de contratar/manter atendente de caixa

### ICP secundário

**Operação pequena que já tem um PDV/maquininha funcionando e não quer trocar de adquirente** para adicionar autoatendimento — a objeção natural de "já tenho uma maquininha, não vou abrir mão dela" é justamente onde o multi-provedor do Ordin resolve algo que a maioria dos concorrentes não resolve (`02-concorrencia-matriz.md`, linha "multi-adquirente sem lock-in").

Também cabe aqui: pequenas redes de 2-3 unidades contratando **separadamente** (cada unidade como cliente próprio) — hoje o Ordin não tem gestão multi-loja nativa (`01-inventario-produto.md`, §8), então esse público é atendível, mas não deve ser vendido com a promessa de "painel único pra sua rede".

**Fora do ICP, por decisão de escopo e não por limitação a esconder:** redes/franquias que precisam de dashboard consolidado multi-unidade, operações que vivem de delivery via marketplace (iFood/Rappi) como canal principal, e operações que já têm KDS/fidelidade como requisito não-negociável. Não vender para esse público sem avisar a lacuna antes do contrato.

---

## 2. Posicionamento

### Em uma frase

> **O totem de autoatendimento que mantém a adquirente que você já usa — Cielo, Rede, GetNet, PagSeguro, Mercado Pago, Stone ou Adyen.**

**Decisão do usuário (2026-09-30, 3ª rodada)**: Stone e Adyen entram no site como provedores disponíveis, sem qualificador de "a caminho" — plano de produto é ter as 4 integrações (MP, PayGo, Stone, Adyen) prontas **até o lançamento do site**. Isso remove a tag "a caminho" de todo o copy voltado ao cliente (Home, Como funciona, FAQ).

**Dependência registrada, não uma objeção**: esta mensagem pressupõe que Stone e Adyen estejam implementadas e testadas antes do site ir ao ar. Hoje (`01-inventario-produto.md`, §6) ambas têm decisão de implementar e arquitetura validada, mas zero código. **Se o lançamento do site for antecipado em relação à conclusão dessas 2 integrações, o copy precisa ser revisado antes de publicar** — citar um provedor que o cliente não consegue de fato usar no primeiro dia é o mesmo risco que motivou toda a correção anterior deste documento, só que materializado depois do ar, não antes.

**Segunda revisão, 2026-09-30**: depois da primeira correção (trocar "a maquininha que você já tem" por nomear os 4 provedores), pesquisa adicional mudou a conta de novo, pra melhor. **PayGo — já implementado no Ordin — é TEF genuinamente multiadquirente**: o terminal compatível aceita Cielo, GetNet, PagSeguro, Rede, Safra e Vero como adquirente configurada (`02-concorrencia-matriz.md`, nota de mercado). Combinado com Mercado Pago (também implementado), isso alcança **~66% do mercado por volume hoje** (Cielo 17% + Rede 18% + GetNet 5% + PagSeguro 17% + Mercado Pago 9%) — não os ~9% estimados na primeira revisão. Stone e Adyen seguem como "a caminho" (decisão de implementar, arquitetura validada, zero código) e, ao contrário do que se cogitou, **nenhuma das duas é multiadquirente** — cada uma é seu próprio stack fechado, então somam marca reconhecida, não mais cobertura de mercado.

**Nuance que não pode se perder na tradução pro site**: a frase fala em manter a **adquirente** (a relação/contrato comercial que o cliente já tem), não necessariamente **o aparelho físico idêntico** — na prática o cliente recebe um terminal compatível com PayGo, configurado pra continuar liquidando com a adquirente dele. "Mesma adquirente, terminal novo" é verdade; "mesma maquininha" não é, e não deve aparecer no site. Isso precisa ficar explícito em "Como funciona", mesmo que a Home simplifique a mensagem.

### Proposta de valor (parágrafo)

Ordin é o totem de autoatendimento pra quem quer resolver fila e erro de pedido sem precisar trocar de adquirente pra isso. Funciona com Cielo, Rede, GetNet, PagSeguro (via PayGo), Mercado Pago, Stone e Adyen. Sem taxa própria embutida no "totem grátis". Cada venda já sai com nota fiscal emitida automaticamente. Se algo falhar no meio do caminho, o sistema estorna sozinho, sem seu cliente precisar brigar por reembolso. Sem piso de faturamento, sem módulo que você não vai usar, sem precisar ser uma rede grande pra começar.

### 3 pilares de mensagem

| Pilar | Reivindicação | Prova (fato de código) |
|---|---|---|
| **1. Pagamento sem susto** | Mantenha a adquirente que já usa (Cielo, Rede, GetNet, PagSeguro) ou use Mercado Pago, Stone ou Adyen direto; e se uma venda falhar depois de paga, o estorno acontece sozinho | PayGo multiadquirente + Mercado Pago implementados hoje, ~66% do mercado por volume (`02`, nota de mercado); Stone e Adyen planejadas pra estar prontas até o lançamento do site (dependência registrada, não fato de código atual — `01`, §6); estorno automático testado quando baixa de estoque falha, 14 testes dedicados (`01`, §6) |
| **2. Fiscal no automático** | Nota fiscal sai em cada venda, sem alguém precisar lembrar de rodar nada | Emissão real de NFC-e por pedido via Focus NFe, com reconciliação automática em até 24h e cancelamento dentro da janela de 30 min (`01`, §7) |
| **3. Feito pra quem está começando ou é médio** | Sem piso de faturamento mínimo, sem contrato de fidelidade de 1 ano pra testar, sem suíte de 30 módulos que você não vai usar | Nenhuma barreira de faturamento no cadastro/plano (`01`, §10); contraste direto com a Nola (exige R$40k+/mês) e com suítes como CardápioWeb/Mogo/Nola que tratam o totem como módulo secundário (`02`, seção 1) |

**[INFERÊNCIA]** — a validade comercial final desses 3 pilares (se são exatamente o que converte o ICP, e não outra combinação) só se confirma com teste real de mercado/anúncio, não com esta análise de documento. Tratar como hipótese de partida testável, não verdade fechada.

---

## 3. Objeções e respostas

| Objeção | Resposta | Status da resposta |
|---|---|---|
| **"Quanto custa?"** | A lógica de cobrança é por totem, com desconto progressivo a cada totem adicional na mesma operação. Custo justo: sem taxa própria escondida embutida no sistema, sem contrato de fidelidade de 1 ano só pra testar — você sabe exatamente quanto está pagando, diferente do "totem grátis" que esconde a taxa na maquininha. | **[DECIDIDO 2026-09-30]** — preço **não vai ser publicado** (existe rascunho em `docs/proposta-plano-comercial-ordin.md`, não fechado pra comunicação externa). O gancho público é posicionamento de **custo justo/transparente**, não o valor em si — conecta direto com o achado de mercado mais forte da Fase 2 (MDR oculta é a lacuna mais opaca do setor, `02-concorrencia-matriz.md` seção 4). CTA é sempre "fale com a gente", nunca número na página. |
| **"Como funciona a instalação? Preciso de técnico?"** | O cadastro da empresa é digital: CNPJ é consultado automaticamente, contrato pode ser assinado sem papel, configuração do cardápio é no painel admin. Sobre o pagamento: você mantém a adquirente que já usa (Cielo, Rede, GetNet, PagSeguro), só com um terminal novo configurado pra ela — não precisa abrir conta em outro lugar. Sobre o totem físico: você pode comprar, alugar, ou trazer seu próprio equipamento seguindo as orientações técnicas da Ordin. | **[DECIDIDO 2026-09-30]** — modelo de hardware definido: **venda, locação, ou BYO (cliente compra por conta própria seguindo orientação/especificação da Ordin)**. Isso coloca o Ordin à frente de concorrentes opacos (Gototem, Zig, PagTotem, que não publicam nada sobre fornecimento) e no mesmo patamar de transparência de CPlug/Consumer/Genesis PRO. **Atenção à nuance de pagamento nesta resposta**: "manter a adquirente" é verdade (contrato/relação comercial preservados via PayGo multiadquirente); "manter a mesma maquininha física" não é — o cliente troca de terminal, não de adquirente. Não deixar essa distinção implícita. **Pendência menor restante**: especificação técnica do equipamento recomendado pra BYO (totem) ainda precisa existir antes de publicar essa opção com detalhe. |
| **"E se der problema, tenho suporte?"** | Suporte 24x7, contato inicial via WhatsApp. | **[DECIDIDO 2026-09-30]** — SLA definido: 24x7, WhatsApp como canal primário. **Cuidado editorial, achado real da pesquisa**: o dossiê da Gototem (`docs/analise-concorrente-gototem.md`) mostra inconsistência real entre páginas do mesmo site sobre horário de suporte (24/7 em um lugar, seg-seg 9h-21h em outro) — garantir que "24x7" apareça de forma **idêntica em toda página** do site (Home, Como funciona, FAQ) antes de publicar, exatamente o erro que a Gototem cometeu. |
| **"Meu cliente não vai saber usar o totem"** | O fluxo é visual e guiado: cardápio com fotos, grupos de opção resolvidos num único mecanismo (ex: "escolha o sabor" com mínimo/máximo claro), CPF é opcional (não trava quem não quer digitar documento). A tela de espera já mostra um vídeo com o cardápio em rotação antes mesmo do cliente tocar na tela, e se alguém ficar parado no meio do fluxo, aparece um aviso antes de reiniciar — não trava o totem sem explicação. | **[FATO]** — todos os elementos citados existem de verdade no código: fotos de produto (`01`, §5), grupos de opção com min/max (`01`, §4), CPF opcional (`01`, §15), vídeo em modo espera (`01`, §15), timeout com aviso antes de reiniciar (`01`, §15). Resposta sólida, pode ir ao site como está. |

---

## 3.5. Diferenciais adicionados em 2026-10-01 (revisita à Genesis PRO)

Usuário revisitou `genesis.pro.br` ao vivo (mesma concorrente já mapeada em `docs/analise-concorrente-genesispro.md`, agora com olhar visual/de posicionamento) e pediu 3 pontos incorporados:

1. **"O totem que roda em qualquer dispositivo e cabe no seu bolso"** — frase de hero da Genesis (base Android + SO próprio portado pra Windows, hardware de R$500 a R$15.000 comprado direto de fábrica). **Decisão: incorporar a versão real do Ordin, não copiar os números/claims da Genesis.** O Ordin é **mais forte nesse ponto especificamente**: o totem é um app **web** puro (`01-inventario-produto.md`, §15) — não precisa de nenhum SO próprio nem de porte pra outra plataforma, roda em qualquer coisa com navegador atualizado (Android, Windows, Chrome OS). Não citamos faixa de preço de hardware (seria inventar número) nem "direto de fábrica" (não é nosso modelo — o modelo é vender/alugar/BYO, já decidido). Virou seção própria na Home (`frontend/site`) e reforço na página Preços/FAQ.
2. **Segmentos** — Genesis lista 8 (Alimentação, Franquias e Redes, Cafeterias, Bares, Baladas, Parques Aquáticos, Distribuidoras de Bebida, Varejo). **Primeira leitura (descartada) achou que só 2 encaixavam** (Alimentação/Restaurantes e Cafeterias) — avaliação corrigida pelo usuário: eu estava comparando segmento a segmento contra o **conjunto completo de features da Genesis** pra cada um (comanda de mesa pros bares, cashless pras baladas/parques, painel de rede pras franquias), em vez de perguntar se existe um caso de uso **pede-e-retira** dentro de cada segmento que o Ordin já resolve hoje — e existe, pra quase todos:
   - **Bares e pubs** — serve pro modelo de pagar primeiro no balcão (não pra comanda aberta de mesa)
   - **Baladas e casas noturnas** — serve pro balcão de bebida com totem, pedido a pedido (não pro cashless de pulseira do evento inteiro)
   - **Parques e lazer** — serve pro balcão de alimentação dentro do parque (não pra bilhetagem do parque inteiro)
   - **Lojas e varejo** — o catálogo/combo/ticket serve pra qualquer produto, não só comida (alérgeno/caloria ficam só não usados)
   - **Franquias e redes** — cada unidade pode contratar o Ordin separadamente hoje; só não existe ainda painel único centralizado entre as unidades
   - **Distribuidoras de bebida** — **esse é o único que realmente não encaixa**: é modelo B2B de atacado (estoque/balança/venda por volume), fluxo diferente de "cliente pede e retira"

   **Decisão final: 7 dos 8 segmentos da Genesis entram como badges na Home**, cada um válido para o caso de uso de atendimento direto ao consumidor final (não necessariamente pra toda operação daquele segmento) — só Distribuidoras de Bebida fica de fora. A lista "ainda não é pra você se" foi reescrita pra refletir ressalvas específicas (atacado/distribuição, painel de rede centralizado) em vez de exclusão de segmento inteiro.
3. **"Implantação sem esforço"** — Genesis promete "nós fazemos tudo por você: cadastro de produtos, cardápio, layout". **Decisão confirmada pelo usuário (2026-10-01): sim, a equipe do Ordin também faz a implantação completa** (cadastro de cardápio, configuração, layout) — mesma promessa, sem citar prazo específico (a Genesis cita "14 dias úteis" só na página de preço, não no hero — seguimos o mesmo padrão, sem inventar prazo próprio). Virou seção nova na página Preços e atualização da resposta de instalação na FAQ.

## 4. Decisões registradas em 2026-09-30 (ex-pendências)

As 3 lacunas identificadas na primeira versão deste documento foram resolvidas pelo usuário:

1. **Preço** — não será publicado. Gancho público é posicionamento de **custo justo/transparente** (sem taxa escondida, sem fidelidade de 1 ano), CTA sempre "fale com a gente".
2. **Hardware físico do totem** — três modelos: venda, locação, ou BYO (cliente compra seguindo orientação técnica da Ordin). Falta só a especificação técnica do equipamento recomendado antes de detalhar a opção BYO no site.
3. **Suporte** — 24x7, WhatsApp como canal primário de contato.

**Nova pendência que substitui as 3 antigas**: a especificação técnica do equipamento recomendado pra quem optar por BYO (item 2) ainda não existe — necessária antes do site detalhar essa opção, mas não bloqueia o lançamento das outras 4 páginas.

**Pendência final, da segunda rodada de pesquisa (2026-09-30)**: confirmado que PayGo é multiadquirente real (Cielo/Rede/GetNet/PagSeguro/Safra/Vero) e que Stone/Adyen NÃO são — cada uma delas soma só a própria marca, nenhuma abre acesso a outra adquirente. A mensagem do site precisa distinguir com cuidado "mantém sua adquirente" (verdade, via PayGo) de "mantém sua maquininha física" (não é verdade — o terminal muda, mesmo que a adquirente não mude). Essa é a nuance mais importante de todo o levantamento de posicionamento e precisa sobreviver a qualquer simplificação de copy daqui pra frente.

**Decisão final, 3ª rodada (2026-09-30)**: Stone e Adyen deixam de ser citadas como "a caminho" — plano de produto é tê-las integradas até o lançamento do site, então entram no copy como provedores disponíveis, no mesmo nível de MP e PayGo. **Dependência de produto registrada, não resolvida por este documento**: isso só se sustenta se a implementação de fato terminar antes do ar — ver `01-inventario-produto.md`, §6, pra status real de código a qualquer momento antes de publicar.

---

Fecha a Fase 3. Próximo passo (Fase 4): mapa do site, copy da home seção por seção, 3 variações de headline para teste A/B, e sugestão de stack técnica (sem implementar) — tudo em `04-arquitetura-site.md` e `05-copy-home.md`.
