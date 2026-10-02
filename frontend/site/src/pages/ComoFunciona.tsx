import { Link } from "react-router-dom";
import Reveal from "../components/Reveal";
import DeviceFrame from "../components/DeviceFrame";
import ParallaxPhoto from "../components/ParallaxPhoto";
import totemAbertura from "../assets/img/totem-01-abertura.jpg";
import totemCatalogo from "../assets/img/totem-02-catalogo.jpg";
import totemCombo from "../assets/img/totem-03-upsell-combo.jpg";
import totemCustomizacao from "../assets/img/totem-04-customizacao.jpg";
import totemPagamento from "../assets/img/totem-05-pagamento.jpg";
import adminClientes from "../assets/img/admin-clientes.jpg";
import heroKioskUso from "../assets/img/hero-kiosk-uso.jpg";

export default function ComoFunciona() {
  return (
    <>
      <section className="section hero">
        <div className="blob" style={{ width: 420, height: 420, top: -160, right: -100 }} />
        <div className="container grid grid--2" style={{ alignItems: "center" }}>
          <Reveal>
            <span className="eyebrow">Como funciona</span>
            <h1>Do pedido à nota fiscal, cada passo explicado</h1>
            <p className="subhead">Nada aqui é promessa — é o que o sistema realmente faz, hoje.</p>
          </Reveal>
          <Reveal delay={100}>
            <ParallaxPhoto src={heroKioskUso} alt="Cliente fazendo pedido num totem de autoatendimento" aspect="4 / 3" />
          </Reveal>
        </div>
      </section>

      <section className="section section--tint">
        <div className="container grid grid--2" style={{ alignItems: "center" }}>
          <Reveal>
            <div style={{ maxWidth: 280, margin: "0 auto" }}>
              <DeviceFrame src={totemAbertura} alt="Tela de espera do totem, com vídeo do cardápio em rotação" />
            </div>
          </Reveal>
          <Reveal delay={100}>
            <span className="eyebrow">O fluxo do cliente</span>
            <h2>O que o seu cliente vê, do início ao fim</h2>
            <p className="subhead">Simples o bastante pra quem nunca usou um totem na vida.</p>
            <ol style={{ listStyle: "decimal", paddingLeft: 20, marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
              <li>
                <strong>Tela de espera</strong> — vídeo do seu cardápio em rotação, já ensinando visualmente antes
                mesmo do primeiro toque
              </li>
              <li>
                <strong>Catálogo</strong> — produtos com fotos, grupos de opção resolvidos num único mecanismo
              </li>
              <li>
                <strong>Tipo de consumo</strong> — local ou para levar
              </li>
              <li>
                <strong>CPF na nota — opcional</strong> — ninguém trava o pedido por não querer digitar documento
              </li>
              <li>
                <strong>Nome de retirada</strong> — seu cliente é chamado pelo nome, não só por um número
              </li>
              <li>
                <strong>Pagamento</strong> — cartão ou PIX, com a adquirente que você já usa
              </li>
              <li>
                <strong>Ticket com QR</strong> — pronto pra retirada, com proteção contra coleta duplicada
              </li>
            </ol>
            <p className="note">
              Se o cliente ficar parado no meio do fluxo, aparece um aviso antes de qualquer coisa reiniciar — o
              totem nunca "trava" sem explicação.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <Reveal>
            <span className="eyebrow">Catálogo e combos</span>
            <h2>Cardápio com fotos, opções e sugestão certeira</h2>
            <p className="subhead">
              Grupos de opção com mínimo e máximo claros, combos sugeridos no momento certo, alérgenos e calorias
              por item.
            </p>
          </Reveal>
          <div className="grid grid--2" style={{ marginTop: 32 }}>
            <Reveal>
              <div style={{ maxWidth: 320, margin: "0 auto" }}>
                <DeviceFrame src={totemCatalogo} alt="Catálogo do totem com fotos e tags de produto" />
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div style={{ maxWidth: 320, margin: "0 auto" }}>
                <DeviceFrame src={totemCombo} alt="Sugestão de combo com economia destacada" />
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="section section--tint" id="pagamento">
        <div className="container grid grid--2" style={{ alignItems: "center" }}>
          <Reveal>
            <span className="eyebrow">Pagamento</span>
            <h2>Sua adquirente continua sendo sua</h2>
            <p className="subhead">
              Cielo, Rede, GetNet, PagSeguro, Mercado Pago, Stone ou Adyen — você escolhe como recebe. A gente não
              embute uma taxa própria disfarçada de "totem grátis".
            </p>
            <ul className="bullets">
              <li>Via PayGo, compatível com as adquirentes que a maioria dos negócios já usa — Cielo, Rede, GetNet, PagSeguro</li>
              <li>Mercado Pago, Stone e Adyen disponíveis diretamente</li>
              <li>Nenhuma taxa própria da Ordin embutida no preço do sistema</li>
              <li>
                Se uma venda for aprovada mas algo falhar depois (ex: produto esgotou no fechamento), o estorno
                acontece sozinho
              </li>
            </ul>
            <div className="note">
              <strong>Importante:</strong> manter sua adquirente é diferente de manter o mesmo aparelho físico. Na
              prática, você recebe um terminal novo, configurado pra continuar liquidando com a adquirente que você
              já tem — sua conta, seu contrato, sua taxa negociada continuam os mesmos. O que muda é só a máquina em
              cima do balcão.
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div style={{ display: "flex", gap: 20, justifyContent: "center" }}>
              <div style={{ maxWidth: 220 }}>
                <DeviceFrame src={totemPagamento} alt="Tela de formas de pagamento do totem" />
              </div>
              <div style={{ maxWidth: 220, marginTop: 32 }}>
                <DeviceFrame src={totemCustomizacao} alt="Tela de customização de bebida do combo" />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section" id="fiscal">
        <div className="container">
          <Reveal>
            <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
              <span className="eyebrow">Fiscal</span>
              <h2>Nota fiscal emitida sozinha, venda por venda</h2>
              <p className="subhead" style={{ margin: "0 auto" }}>
                Sem depender de alguém lembrar de rodar nada no fim do dia, sem módulo fiscal separado pra
                configurar.
              </p>
            </div>
          </Reveal>
          <div className="grid grid--3" style={{ marginTop: 32 }}>
            {[
              "Emissão de NFC-e automática a cada venda aprovada",
              "Se uma nota ficar pendente, o sistema tenta de novo sozinho por até 24h",
              "Se o pagamento for cancelado, a nota é cancelada dentro do prazo",
            ].map((t, i) => (
              <Reveal delay={i * 100} key={t}>
                <div className="card">
                  <p style={{ color: "var(--text)" }}>{t}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--tint">
        <div className="container grid grid--2" style={{ alignItems: "center" }}>
          <Reveal>
            <ParallaxPhoto src={adminClientes} alt="Painel administrativo do Ordin" aspect="16 / 10" speed={0.08} />
          </Reveal>
          <Reveal delay={120}>
            <span className="eyebrow">Painel administrativo</span>
            <h2>Seu cardápio, suas regras, seus números</h2>
            <p className="subhead">Tudo que você precisa pra rodar o dia a dia, num painel só.</p>
            <ul className="bullets">
              <li>Cardápio com fotos, categorias, combos, grupos de opção e alérgenos (conforme RDC 727/2022)</li>
              <li>Programação de cardápio por horário, pra itens que só fazem sentido em parte do dia</li>
              <li>Controle de estoque com bloqueio automático de produto esgotado</li>
              <li>Relatórios de receita e ticket médio, com comparação de período, por terminal e forma de pagamento</li>
            </ul>
            <p className="note">
              O painel não calcula "produtos mais vendidos" automaticamente — isso ainda é uma etiqueta que você
              mesmo marca no cadastro do produto, não um ranking gerado pelo sistema.
            </p>
            <div className="btn-row">
              <Link to="/demo" className="btn btn--primary">
                Agendar uma conversa
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
