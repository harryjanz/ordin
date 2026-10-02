import type { ReactNode } from "react";
import Reveal from "../components/Reveal";

const FAQ_ITEMS: { q: string; a: ReactNode }[] = [
  {
    q: "Quanto custa?",
    a: (
      <>
        A cobrança é por totem, com desconto a cada unidade adicional na mesma operação — não é uma mensalidade
        igual pra qualquer tamanho de negócio. A taxa de pagamento continua sendo a da sua própria adquirente,
        negociada por você — a gente não embute taxa própria escondida no sistema. Não publicamos uma tabela
        fechada ainda; fale com a gente pra sua conta certinha.
      </>
    ),
  },
  {
    q: "Funciona com a minha adquirente?",
    a: (
      <>
        Sim, provavelmente. Hoje já funciona com <strong>Cielo, Rede, GetNet e PagSeguro</strong> (via PayGo, nosso
        parceiro de TEF multiadquirente), além de <strong>Mercado Pago, Stone e Adyen</strong> diretamente.
        <br />
        <br />
        Importante: isso mantém sua <strong>adquirente</strong> — o contrato e a taxa que você já negociou — não
        necessariamente o <strong>aparelho físico</strong> que você usa hoje. Na prática, você recebe um terminal
        novo, configurado pra continuar liquidando com a adquirente que já é sua.
      </>
    ),
  },
  {
    q: "Preciso trocar de maquininha?",
    a: (
      <>
        O terminal físico muda (vira um equipamento compatível com o Ordin), mas a sua adquirente — o contrato, a
        taxa negociada — continua a mesma, na maioria dos casos.
      </>
    ),
  },
  {
    q: "Como funciona a instalação? Preciso de técnico?",
    a: (
      <>
        O cadastro da sua empresa é 100% digital: seu CNPJ é consultado automaticamente, o contrato pode ser
        assinado sem papel. A nossa equipe cuida do cadastro do cardápio, configuração e layout pra você — o
        sistema chega pronto pra vender, sem burocracia. Sobre o equipamento físico, você escolhe entre comprar,
        alugar, ou trazer o seu próprio (o Ordin roda em qualquer dispositivo com navegador — Android, Windows ou
        Chromebook).
      </>
    ),
  },
  {
    q: "E se der problema, tenho suporte?",
    a: <>Sim — suporte 24x7, com contato inicial pelo WhatsApp.</>,
  },
  {
    q: "Meu cliente vai saber usar o totem sem ajuda?",
    a: (
      <>
        O fluxo é visual e guiado: cardápio com fotos, grupos de opção com mínimo/máximo claros (ex: "escolha o
        sabor"), CPF opcional (não trava quem não quer digitar documento). A tela de espera já mostra o cardápio em
        vídeo antes mesmo do primeiro toque, e se alguém ficar parado no meio do pedido, aparece um aviso antes de
        qualquer coisa reiniciar.
      </>
    ),
  },
  {
    q: "O que acontece se um produto esgotar no meio do pedido?",
    a: (
      <>
        O sistema bloqueia automaticamente produtos esgotados — eles somem do cardápio do totem antes mesmo do
        cliente tentar pedir, e há uma checagem de disponibilidade final antes do pagamento.
      </>
    ),
  },
  {
    q: "Dá pra programar o cardápio por horário (ex: só de manhã)?",
    a: (
      <>
        Sim — você programa dia da semana e janela de horário por categoria ou produto. Duas limitações a saber: a
        comparação de horário hoje não ajusta fuso horário por empresa, e janelas que cruzam a meia-noite (ex: 22h
        às 2h) ainda não são suportadas.
      </>
    ),
  },
  {
    q: "O totem funciona sem internet?",
    a: (
      <>
        Não. O totem depende de conexão com a internet pra funcionar — catálogo, pagamento e emissão de nota fiscal
        passam pelo nosso sistema em tempo real. Não há modo offline hoje.
      </>
    ),
  },
  {
    q: "Posso usar em mais de uma loja?",
    a: (
      <>
        Depende do que você quer dizer por "loja". Você pode ter <strong>vários totens na mesma operação/CNPJ</strong>{" "}
        sem problema — isso já funciona hoje. Se você tem <strong>unidades diferentes, com CNPJ e endereço
        próprios</strong>, cada uma precisa de um cadastro separado — ainda não existe um painel único que gerencie
        uma rede de lojas de uma vez. Se isso é essencial pro seu caso, vale conversar antes de assinar.
      </>
    ),
  },
  {
    q: "Vocês integram com iFood/Rappi?",
    a: (
      <>
        Não hoje. O Ordin é focado em atendimento presencial no totem — pedido feito e pago ali, retirada no
        balcão. Se o seu negócio depende de delivery via marketplace como canal principal, vale conversar antes pra
        entender se faz sentido pra sua operação agora.
      </>
    ),
  },
];

export default function Faq() {
  return (
    <section className="section hero">
      <div className="blob" style={{ width: 380, height: 380, top: -140, right: -100 }} />
      <div className="container">
        <Reveal>
          <h1>Perguntas frequentes</h1>
        </Reveal>
        <div style={{ marginTop: 32, maxWidth: 760 }}>
          {FAQ_ITEMS.map((item, i) => (
            <Reveal delay={Math.min(i * 40, 240)} key={item.q}>
              <div className="faq-item">
                <h3>{item.q}</h3>
                <p>{item.a}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
