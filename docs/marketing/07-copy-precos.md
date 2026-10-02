# 07 — Copy da página "Preços"

**Fase:** 4 — Site (continuação) · **Status:** rascunho para aprovação
**Base:** `04-arquitetura-site.md` + `03-posicionamento.md` seção 3 (objeção de preço, decidida 2026-09-30).

**Papel desta página:** qualificar o lead sem publicar número. O gancho é **custo justo**, não uma tabela de valores — decisão explícita do usuário, não omissão por falta de definição.

---

## Seção 1 — Intro

**Headline:**
> Custo justo, sem letra miúda

**Subhead:**
> A gente não publica uma tabela de preço fechada ainda — mas pode te explicar exatamente como a conta funciona, sem supresa no fim do mês.

---

## Seção 2 — Como a cobrança funciona (lógica, sem valor)

**Headline:**
> Por totem, com desconto a cada unidade — não uma mensalidade igual pra todo mundo

**Bullets (lógica de produto, sem publicar valor — `docs/proposta-plano-comercial-ordin.md` não é decisão fechada pra comunicação externa):**
- Cobrança por totem: o custo por unidade cai a cada totem adicional na mesma operação
- Sem contrato de fidelidade de 1 ano só pra testar
- Sem taxa própria da Ordin embutida na sua maquininha — a taxa de pagamento continua sendo a da sua adquirente, negociada por você

**CTA:** "Fale com a gente pra sua tabela" → `/demo`

---

## Seção 3 — Custo justo: o que isso quer dizer na prática

**Headline:**
> Você sabe exatamente quanto está pagando

**Subhead:**
> É comum um "totem grátis" esconder a conta na taxa de cartão — você só descobre no extrato. Aqui não.

**Bullets (contexto educativo, não medição própria — `02-concorrencia-matriz.md`, seção 4):**
- Sem taxa própria da Ordin embutida no sistema — você continua negociando sua taxa direto com sua adquirente
- Sem contrato de fidelidade de 1 ano só pra testar o produto
- Sem cobrar por módulo que você não vai usar

**Nota de rigor (não publicar sem revisar):** nenhum número de economia específico deve aparecer aqui — "PDV grátis pode custar até 4x mais" é um dado de pesquisa de mercado sobre o setor, não uma medição do Ordin (`02-concorrencia-matriz.md`, seção 4). Se usar esse dado nesta página, atribuir à fonte, nunca apresentar como "nossa economia comprovada".

**CTA:** "Entender minha conta" → `/demo`

---

## Seção 4 — Hardware do totem

**Headline:**
> Três formas de ter o equipamento

**Subhead:**
> Compre, alugue, ou traga o seu — você escolhe.

**Bullets (decisão de produto, 2026-09-30):**
- **Comprar** — o equipamento é seu
- **Alugar** — sem comprometer caixa no início
- **Trazer o seu** — se você já tem (ou prefere comprar por conta própria) um equipamento compatível, seguindo nossa especificação técnica

**Pendência explícita, não publicar sem resolver (`03-posicionamento.md`, seção 4):** a especificação técnica do equipamento recomendado pra opção "traga o seu" ainda não existe. Até existir, a opção BYO deve aparecer como "fale com a gente" em vez de uma lista de requisitos técnicos — não inventar specs de hardware aqui.

**CTA:** "Ver qual opção faz sentido pra mim" → `/demo`

---

## Seção 5 — CTA final

**Headline:**
> Vamos calcular juntos?

**Subhead:**
> Me conta quantos totens você precisa e qual adquirente já usa — eu te mostro a conta certinha, sem letra miúda.

**CTA:** "Falar com a gente" (WhatsApp, ver `04-arquitetura-site.md`)

---

## Seção 4.5 — Implantação sem esforço (adicionada 2026-10-01, revisita à Genesis PRO)

**Headline:**
> Implantação sem esforço

**Subhead:**
> A gente cuida do cadastro do cardápio, configuração e layout — o sistema chega pronto pra você vender.

**Bullets (decisão confirmada pelo usuário, 2026-10-01 — ver `03-posicionamento.md`, seção 3.5):**
- Cadastro de produtos e cardápio feito pela nossa equipe
- Configuração e layout prontos antes de você começar a vender
- Sem burocracia, sem tomar o seu tempo

**Nota de rigor:** não citar prazo específico (ex. "X dias úteis") — a Genesis PRO só cita prazo na página de preço dela, não no hero; seguimos o mesmo padrão até existir um SLA de implantação real definido.

Seção 2 ("Como a cobrança funciona") também ganhou uma frase sobre o totem rodar em qualquer dispositivo com navegador — ver `03-posicionamento.md`, seção 3.5.

## Checklist de guardrail antes de publicar esta página

- [ ] Nenhum valor em R$ aparece em nenhuma seção
- [ ] "4x mais caro" (se usado) está atribuído à fonte de mercado, não ao Ordin
- [ ] Opção "traga o seu" não lista modelo/marca de equipamento específico sem a especificação técnica existir
- [ ] CTA de toda seção aponta pra conversa, nunca pra um "assinar agora"
- [ ] "Implantação sem esforço" não cita prazo específico sem SLA real definido
