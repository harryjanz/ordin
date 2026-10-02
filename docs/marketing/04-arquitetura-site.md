# 04 — Arquitetura do Site

**Fase:** 4 — Site · **Status:** rascunho para aprovação
**Base:** `03-posicionamento.md` (ICP, posicionamento, 3 pilares, objeções).

Site institucional enxuto — 5 páginas, não um portal. Justificativa geral: a empresa está em estágio inicial (sem case público, sem preço fechado, sem decisão de hardware/suporte — `03-posicionamento.md`, seção 4), então o site precisa converter em lead qualificado (demo/conversa), não parecer uma operação maior do que é. Páginas tipo "Sobre nós"/"Blog"/"Clientes" foram **deliberadamente excluídas** desta primeira versão — não há narrativa de empresa documentada nem case real para sustentar essas páginas sem inventar conteúdo.

---

## Identidade visual (achado de 2026-09-30, corrige suposição anterior)

Existe sim um brand kit real e consistente, usado hoje em `frontend/admin` e `frontend/totem` — não precisa ser inventado do zero:

- **Símbolo**: `OrdinSymbol.tsx` (hexágono arredondado com vão circular central), SVG com `currentColor`, replicado idêntico em admin e totem — é o logo mark oficial do Ordin.
- **Cor de marca**: roxo `#9900ff` (`--brand-primary`), com secundária lilás clara `#f6ebff` (`--brand-secondary`). Semânticas fixas nos dois modos: sucesso `#058060`, aviso `#c63f06`, erro `#cf343f`.
- **Modo escuro é o padrão histórico do admin**: fundo `#180a33`, superfície `#1d1434`, texto branco. Modo claro existe como alternativa: fundo `#f1f5f7`, superfície branca, texto `#180a33`.
- **Fonte declarada**: "Metropolis", com fallback Helvetica Neue/Helvetica/Arial/sans-serif.

**Ressalva real, não assumir que resolve sozinho**: não existe nenhum arquivo de fonte Metropolis no repositório (sem `@font-face`, sem `.woff`/`.ttf`) — a declaração em `theme.scss` cai silenciosamente no fallback hoje. **Antes de usar Metropolis no site institucional**, confirmar se existe licença pra uso web (é fonte comercial) e conseguir os arquivos — ou assumir o fallback (Helvetica Neue/sans-serif do sistema) como a tipografia real, ou escolher outra fonte de exibição pro site que não tenha essa pendência de licenciamento.

**Recomendação pro site institucional**: reaproveitar símbolo + roxo de marca + modo escuro-primeiro (consistência de marca com o resto do produto), resolver a pendência de fonte antes de bater o martelo na tipografia final.

## Pesquisa visual de concorrentes (2026-09-30) e decisão sobre imagem de ambiente

Visitados ao vivo: CPlug, Consumer, Suitable, Goomer (sites reais, não só pesquisa de posicionamento). Achados por padrão visual — o que é transferível pro Ordin sem fabricar prova:

| Padrão visto | Fonte | Aplicável ao Ordin? |
|---|---|---|
| Seções alternando imagem-real/texto a cada bloco | CPlug | Sim — já aplicado em `05-copy-home.md`/`ComoFunciona.tsx` |
| Depoimento de cliente com nota/foto flutuante | Consumer | Não — exigiria cliente real nomeado; Burger House é dado demo/seed (`init.sql`), nunca pode ser apresentado como depoimento |
| Selo de parceria (iFood, Sebrae, Google) | Consumer | Não — Ordin não tem reconhecimento de terceiro hoje |
| Estatística de resultado tipo "+40% no lucro" sem fonte | Goomer | Não — contraria o guardrail de `01-inventario-produto.md` |
| Diagrama orbital de módulos (ecossistema amplo) | Suitable | Não, de propósito — contradiria o pilar 3 ("não somos suíte de 30 módulos") |
| Linha de hardware físico fotografado | Goomer | Não — Ordin não tem SKU de hardware próprio (modelo é vender/alugar/BYO) |
| **Imagem de ambiente mostrando o totem em uso** | (pedido direto do usuário, não visto em nenhum concorrente específico) | **Sim** — diferente de "prova social", é atmosfera visual, não uma alegação verificável |

**Decisão sobre a imagem de ambiente**: banco de imagens de terceiro (Unsplash) tentado e abandonado — página protegida por desafio anti-bot (prova de trabalho), e contornar isso está na lista de ações proibidas. Caminho escolhido: **ilustração SVG original** (`frontend/site/src/components/KioskScene.tsx`), sem dependência externa, sem risco de licença, na paleta de marca (roxo + acento quente consistente com `totem-01-abertura.jpg`). Mostra o totem com um cliente tocando a tela, um segundo totem ao fundo (sugere múltiplas unidades sem prometer rede/multi-loja), luminária e linha de chão pra ambientação de balcão — sem alegar ser foto de instalação real, exatamente como qualquer site B2B usa ilustração/fotografia genérica de categoria sem fingir ser cliente específico.

## Mapa do site

```
Home (/)
 ├─ Como funciona (/como-funciona)
 ├─ Preços (/precos)
 ├─ Perguntas frequentes (/faq)
 └─ Contato / Demo (/demo)
```

Jornada esperada: a maioria do tráfego entra pela Home → lê os 3 pilares → ou já está convencido e vai direto pro CTA de demo, ou quer prova técnica (**Como funciona**) ou quer saber se cabe no orçamento (**Preços**) antes de decidir. **FAQ** existe pra interceptar objeção antes que vire abandono silencioso, não como página de destino de tráfego.

---

## Home (/)

**Objetivo:** apresentar o posicionamento e os 3 pilares, gerar confiança suficiente pra levar o visitante a "Como funciona", "Preços" ou direto ao CTA de demo.

**Por que existe:** é a porta de entrada única pra qualquer canal de tráfego (busca, indicação, anúncio) — não existe outra forma de alguém "cair" no site.

Detalhamento seção por seção em `05-copy-home.md`.

---

## Como funciona (/como-funciona)

**Objetivo:** provar com detalhe que o produto é real e funciona de ponta a ponta — do cliente no totem até o fechamento fiscal — pra quem já passou da curiosidade do pitch e quer entender o mecanismo antes de agendar demo.

**Por que existe:** o maior ativo do Ordin hoje é justamente a profundidade técnica real (pagamento, fiscal, estorno automático) que nenhum concorrente pesquisado detalha — mas isso não cabe em bullets de home sem virar uma parede de texto. Esta página é onde a profundidade técnica vira confiança, sem comprometer a objetividade da Home.

**Estrutura sugerida (sem copy final, só esqueleto):**
1. O fluxo do cliente no totem — passo a passo real (`01-inventario-produto.md`, §15): PIN/pareamento → catálogo com fotos e opções → tipo de consumo → pagamento → ticket com QR e nome de retirada.
2. Pagamento — mantém a adquirente que o cliente já usa (Cielo, Rede, GetNet, PagSeguro, via PayGo multiadquirente) ou Mercado Pago, Stone ou Adyen direto. **Decisão do usuário (2026-09-30, 3ª rodada)**: Stone e Adyen entram sem qualificador de "a caminho" — plano é integrá-las até o lançamento do site; **conferir status real em `01-inventario-produto.md`, §6, antes de publicar**, caso o lançamento antecipe a conclusão dessas 2 integrações. **Explicar a nuance de terminal aqui, não só na Home**: a adquirente/contrato comercial é preservado, o terminal físico é novo (compatível com PayGo) — não é "sua maquininha atual continua funcionando". Sem taxa própria embutida; o que acontece se uma venda falhar (estorno automático).
3. Fiscal — nota emitida a cada venda, sem passo manual.
4. Painel administrativo — cardápio, relatórios por forma de pagamento/terminal, gestão de usuários.
5. **Guardrail editorial obrigatório:** nenhuma seção desta página pode prometer nada da lista "O que NÃO prometer no site" de `01-inventario-produto.md` (offline, KDS, app nativo, personalização de marca, infra AWS, relatório de mais vendidos). Antes de publicar o copy real desta página, revalidar frase por frase contra essa lista.

---

## Preços (/precos)

**Objetivo:** qualificar o lead e reduzir a fricção de "nem vou perguntar, deve ser caro" — mesmo sem valor fechado.

**Por que existe (mesmo sem preço público ainda):** omitir uma página de preço inteiramente é pior do que ter uma página honesta sem número fechado — o padrão de mercado mais eficaz pra esse ICP é transparência (CPlug/Consumer, `02-concorrencia-matriz.md`, seção 2), e simplesmente não ter a página sinaliza o oposto.

**Decisão registrada (2026-09-30):** preço não será publicado — o gancho da página é **custo justo**, não um número. Conteúdo:
- Explicar a **lógica** de cobrança (por totem, com desconto a cada totem adicional na mesma operação) sem publicar valor.
- Mensagem central de custo justo: sem taxa própria escondida embutida no sistema, sem contrato de fidelidade de 1 ano só pra testar — conecta direto com o achado de mercado mais forte da pesquisa (MDR oculta é a lacuna de comunicação mais opaca do setor, `02-concorrencia-matriz.md`, seção 4).
- Modelo de hardware (também decidido): venda, locação, ou BYO (cliente compra seguindo orientação técnica da Ordin) — três opções, sem valor associado ainda.
- CTA central: "Fale com a gente para sua tabela".

**Pendência restante, mais estreita que antes:** especificação técnica do equipamento recomendado pra quem optar por BYO ainda não existe — necessária antes de detalhar essa opção com precisão.

---

## Perguntas frequentes (/faq)

**Objetivo:** resolver objeção antes que vire motivo de abandono, sem precisar de uma pessoa de vendas no meio do caminho pra toda pergunta óbvia.

**Por que existe:** reaproveita diretamente a seção 3 de `03-posicionamento.md` (preço, instalação, suporte, "meu cliente não sabe usar totem") — conteúdo já desenvolvido, só precisa de formato de página. As 3 respostas que antes dependiam de decisão do usuário (preço, hardware, suporte) já estão resolvidas (2026-09-30: custo justo sem valor público; venda/locação/BYO; 24x7 via WhatsApp) — nenhum placeholder `[A DEFINIR]` deve aparecer nessas 3 nesta página.

**Cuidado editorial específico desta página:** pergunta óbvia de FAQ é "funciona com a minha adquirente?" — a resposta cita Cielo, Rede, GetNet, PagSeguro (via PayGo multiadquirente), Mercado Pago, Stone e Adyen como disponíveis (decisão do usuário, 2026-09-30, 3ª rodada — plano é ter Stone e Adyen prontas até o lançamento do site). **Checar status real em `01-inventario-produto.md`, §6, antes de publicar** — Stone/Adyen só devem aparecer sem qualificador se de fato estiverem implementadas até lá. Segundo cuidado, que não muda com essa decisão: "mantém sua adquirente" ≠ "mantém sua maquininha física" — o terminal muda mesmo quando a adquirente não muda, isso precisa estar explícito pra não virar reclamação de cliente depois (`03-posicionamento.md`, seção 1 e 4).

**Conteúdo:** as 4 perguntas de `03-posicionamento.md` seção 3, mais perguntas adicionais que a pesquisa de concorrência sugere serem comuns no setor (`docs/analise-concorrentes-fluxo-retirada-unica.md`, `analise-concorrentes-cardapio-por-horario.md`): "o que acontece se o produto esgotar no meio do pedido?" (resposta real: bloqueio automático, `01`, §5), "dá pra programar cardápio por horário?" (resposta real, com a ressalva de limitação de fuso horário, `01`, §5).

---

## Contato / Demo (/demo)

**Objetivo:** conversão final — transformar interesse em conversa real com o time comercial.

**Por que existe:** todo caminho do site (Home, Como funciona, Preços, FAQ) deve terminar aqui ou ter um CTA secundário pra cá. Sem essa página, as outras 4 são só conteúdo sem saída.

**Formato recomendado:** WhatsApp como canal primário (não formulário longo) — **[INFERÊNCIA, não fato de pesquisa]**: coerente com o tom "direto" do posicionamento e com o porte do ICP (pequeno negócio, decisão rápida, sem processo de compra formal de enterprise), mas não há dado de pesquisa confirmando que é o canal de conversão de maior taxa pra este público especificamente — validar com teste real quando o site estiver no ar, não tratar como decisão fechada.

**Dado mínimo a coletar no formulário/conversa:** nome do estabelecimento, quantos totens pretende usar (informa a tabela de desconto por volume), se já tem maquininha/adquirente hoje (reforça o gancho do pilar 1 logo na primeira conversa comercial).

---

Fecha o mapa do site. Detalhamento de copy (headline, subhead, bullets, CTA, prova sugerida por seção da Home + 3 variações de headline para A/B + sugestão de stack técnica) em `05-copy-home.md`.
