# 09 — Copy da página "Contato / Demo"

**Fase:** 4 — Site (continuação) · **Status:** rascunho para aprovação
**Base:** `04-arquitetura-site.md` (papel desta página e decisão de canal WhatsApp).

**Papel desta página:** conversão final — todo caminho do site termina aqui ou tem um CTA secundário pra cá.

---

## Seção única — a página inteira

**Headline:**
> Vamos ver se o Ordin resolve a fila do seu balcão?

**Subhead:**
> Sem compromisso, sem letra miúda — uma conversa de 15 minutos pra entender sua operação.

**Bloco de confiança (3 bullets curtos, reforço dos pilares sem repetir a Home inteira):**
- Mantém a adquirente que você já usa
- Nota fiscal automática em cada venda
- Custo justo, sem taxa escondida

**CTA primário:** botão grande "Chamar no WhatsApp" (link `wa.me`, decisão registrada em `04-arquitetura-site.md` — inferência de canal, não dado validado, mas confirmada como aceitável pelo usuário)

**CTA secundário (se optar por também ter formulário, não obrigatório pra V1):** campo curto — nome do estabelecimento, quantos totens pretende usar, se já tem maquininha/adquirente hoje. Esses 3 dados são o mínimo útil pra já chegar na conversa comercial com contexto (quantos totens informa a tabela de desconto por volume; já ter adquirente reforça o gancho do pilar 1 logo de cara).

**Texto de apoio abaixo do CTA:**
> Suporte 24x7 depois que você assinar — o mesmo WhatsApp vira seu canal de suporte.

---

## Nota de implementação (V1)

Pra V1, recomendo **só o CTA de WhatsApp**, sem formulário — zero backend novo, consistente com a decisão de manter o site simples (`04-arquitetura-site.md`). O formulário fica como evolução futura, se o volume de contato justificar triagem antes da conversa.

## Checklist de guardrail antes de publicar esta página

- [ ] Número de WhatsApp configurado é o real de atendimento comercial, testado antes de publicar
- [ ] Texto "suporte 24x7" aqui é idêntico ao texto usado na FAQ e em qualquer outra página (mesmo cuidado já registrado em `03-posicionamento.md`, pra não repetir a inconsistência real encontrada no site da Gototem)
