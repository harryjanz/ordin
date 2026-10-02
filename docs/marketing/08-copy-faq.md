# 08 — Copy da página "Perguntas frequentes"

**Fase:** 4 — Site (continuação) · **Status:** rascunho para aprovação
**Base:** `03-posicionamento.md` seção 3 (objeções) + `04-arquitetura-site.md` (perguntas adicionais sugeridas) + `01-inventario-produto.md` (guardrails).

**Papel desta página:** resolver objeção antes que vire abandono silencioso, e qualificar lead desincentivando quem não é o ICP (multi-loja, delivery) a agendar uma demo que vai terminar em desencontro.

---

### Quanto custa?

A cobrança é por totem, com desconto a cada unidade adicional na mesma operação — não é uma mensalidade igual pra qualquer tamanho de negócio. A taxa de pagamento continua sendo a da sua própria adquirente, negociada por você — a gente não embute taxa própria escondida no sistema. Não publicamos uma tabela fechada ainda; fale com a gente pra sua conta certinha. Ver `/precos`.

---

### Funciona com a minha adquirente?

Sim, provavelmente. Hoje já funciona com **Cielo, Rede, GetNet e PagSeguro** (via PayGo, nosso parceiro de TEF multiadquirente), além de **Mercado Pago, Stone e Adyen** diretamente.

**Importante**: isso mantém sua **adquirente** — o contrato e a taxa que você já negociou — não necessariamente o **aparelho físico** que você usa hoje. Na prática, você recebe um terminal novo, configurado pra continuar liquidando com a adquirente que já é sua.

*Dependência a confirmar antes de publicar (`01-inventario-produto.md`, §6): Stone e Adyen estão planejadas pra estar prontas até o lançamento do site — conferir status real de implementação antes de publicar esta resposta como está.*

---

### Preciso trocar de maquininha?

O terminal físico muda (vira um equipamento compatível com o Ordin), mas a sua adquirente — o contrato, a taxa negociada — continua a mesma, na maioria dos casos (ver pergunta anterior).

---

### Como funciona a instalação? Preciso de técnico?

O cadastro da sua empresa é 100% digital: seu CNPJ é consultado automaticamente, o contrato pode ser assinado sem papel, e a configuração do cardápio é feita direto no painel. Sobre o equipamento físico, você escolhe entre comprar, alugar, ou trazer o seu próprio seguindo nossa orientação técnica. Ver `/precos`.

---

### E se der problema, tenho suporte?

Sim — suporte 24x7, com contato inicial pelo WhatsApp.

---

### Meu cliente vai saber usar o totem sem ajuda?

O fluxo é visual e guiado: cardápio com fotos, grupos de opção com mínimo/máximo claros (ex: "escolha o sabor"), CPF opcional (não trava quem não quer digitar documento). A tela de espera já mostra o cardápio em vídeo antes mesmo do primeiro toque, e se alguém ficar parado no meio do pedido, aparece um aviso antes de qualquer coisa reiniciar.

---

### O que acontece se um produto esgotar no meio do pedido?

O sistema bloqueia automaticamente produtos esgotados — eles somem do cardápio do totem antes mesmo do cliente tentar pedir, e há uma checagem de disponibilidade final antes do pagamento.

---

### Dá pra programar o cardápio por horário (ex: só de manhã)?

Sim — você programa dia da semana e janela de horário por categoria ou produto. **Duas limitações a saber**: a comparação de horário hoje não ajusta fuso horário por empresa, e janelas que cruzam a meia-noite (ex: 22h às 2h) ainda não são suportadas.

---

### O totem funciona sem internet?

Não. O totem depende de conexão com a internet pra funcionar — catálogo, pagamento e emissão de nota fiscal passam pelo nosso sistema em tempo real. Não há modo offline hoje.

---

### Posso usar em mais de uma loja?

Depende do que você quer dizer por "loja". Você pode ter **vários totens na mesma operação/CNPJ** sem problema — isso já funciona hoje. Se você tem **unidades diferentes, com CNPJ e endereço próprios**, cada uma precisa de um cadastro separado — ainda não existe um painel único que gerencie uma rede de lojas de uma vez. Se isso é essencial pro seu caso, vale conversar antes de assinar.

---

### Vocês integram com iFood/Rappi?

Não hoje. O Ordin é focado em atendimento presencial no totem — pedido feito e pago ali, retirada no balcão. Se o seu negócio depende de delivery via marketplace como canal principal, vale conversar antes pra entender se faz sentido pra sua operação agora.

---

## Checklist de guardrail antes de publicar esta página

- [ ] A pergunta de adquirente/maquininha mantém a distinção explícita, sem simplificar
- [ ] A pergunta de Stone/Adyen tem o status real confirmado (não copiar texto sem checar `01-inventario-produto.md`, §6, no dia da publicação)
- [ ] A resposta de "offline" é direta — "não" sem rodeio, antes que o cliente descubra sozinho depois de assinar
- [ ] As respostas de "multi-loja" e "delivery" desqualificam o lead errado em vez de prometer algo que não existe
