import { Link } from "react-router-dom";
import { whatsappLink } from "../config";
import Reveal from "../components/Reveal";
import DeviceFrame from "../components/DeviceFrame";
import { CardIcon, ReceiptIcon, TagIcon, CheckCircleIcon, XCircleIcon, DevicesIcon } from "../components/Icons";
import ParallaxPhoto from "../components/ParallaxPhoto";
import totemAbertura from "../assets/img/totem-01-abertura.jpg";
import totemCatalogo from "../assets/img/totem-02-catalogo.jpg";
import totemCombo from "../assets/img/totem-03-upsell-combo.jpg";
import adminClientes from "../assets/img/admin-clientes.jpg";
import totemPagamentoUI from "../assets/img/totem-05-pagamento.jpg";
import heroKioskUso from "../assets/img/hero-kiosk-uso.jpg";
import totemPagamentoCloseup from "../assets/img/totem-pagamento-closeup.jpg";
import ambienteMultiTotem from "../assets/img/ambiente-multi-totem.jpg";

const PROVIDERS = [
  { label: "Cielo" },
  { label: "Rede" },
  { label: "GetNet" },
  { label: "PagSeguro" },
  { label: "Mercado Pago" },
  { label: "Stone" },
  { label: "Adyen" },
];

export default function Home() {
  return (
    <>
      {/* Seção 1 — Hero */}
      <section className="section hero">
        <div className="blob" style={{ width: 480, height: 480, top: -160, right: -120 }} />
        <div className="container hero__grid">
          <div>
            <span className="eyebrow">Totem de autoatendimento</span>
            <h1>Sua adquirente continua sendo sua</h1>
            <p className="subhead" style={{ marginTop: 16 }}>
              Cardápio com fotos, mantém a adquirente que você já usa, nota fiscal emitida sozinha a cada venda.
              Custo justo, sem taxa escondida, sem precisar ser uma rede grande pra começar.
            </p>
            <ul className="bullets">
              <li>
                <span className="bullet-dot">
                  <CheckCircleIcon size={14} />
                </span>
                Cielo, Rede, GetNet, PagSeguro, Mercado Pago, Stone e Adyen — você escolhe
              </li>
              <li>
                <span className="bullet-dot">
                  <CheckCircleIcon size={14} />
                </span>
                Nota fiscal automática em cada venda
              </li>
              <li>
                <span className="bullet-dot">
                  <CheckCircleIcon size={14} />
                </span>
                Custo justo: sem piso de faturamento, sem contrato de fidelidade pra testar
              </li>
            </ul>
            <div className="btn-row">
              <Link to="/demo" className="btn btn--primary">
                Agendar uma conversa
              </Link>
              <Link to="/como-funciona" className="btn btn--secondary">
                Ver como funciona
              </Link>
            </div>
            <div className="hero__badges">
              {PROVIDERS.map((p) => (
                <span key={p.label} className="tag">
                  {p.label}
                </span>
              ))}
            </div>
          </div>
          <div className="hero__visual">
            <DeviceFrame src={totemAbertura} alt="Tela de boas-vindas do totem Ordin, Burger House" float />
          </div>
        </div>
      </section>

      {/* Seção 1.5 — Cena do totem em uso (ilustração original, sem banco de imagens) */}
      <section className="section">
        <div className="container" style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: 48, alignItems: "center" }}>
          <Reveal>
            <span className="eyebrow">No seu balcão</span>
            <h2>Do jeito que já funciona, só mais rápido</h2>
            <p className="subhead">
              O totem fica no seu espaço, ligado à internet — seu cliente só toca e pede. Sem fila extra, sem
              atendente parado esperando digitar o pedido.
            </p>
          </Reveal>
          <Reveal delay={100}>
            <ParallaxPhoto src={heroKioskUso} alt="Cliente fazendo pedido num totem de autoatendimento" aspect="4 / 3" />
          </Reveal>
        </div>
      </section>

      {/* Seção 2 — Como funciona (preview visual) */}
      <section className="section section--tint">
        <div className="blob" style={{ width: 420, height: 420, bottom: -200, left: -140 }} />
        <div className="container">
          <Reveal>
            <span className="eyebrow">Como funciona</span>
            <h2>Do pedido à nota fiscal, sem ninguém no meio</h2>
            <p className="subhead">
              Seu cliente pede sozinho no totem. Você recebe a venda, a nota fiscal e o pedido pronto pra retirada —
              tudo no automático.
            </p>
          </Reveal>
          <div className="grid grid--3" style={{ marginTop: 40 }}>
            {[
              { img: totemCatalogo, step: "1. Catálogo", text: "Fotos, preços e tags como \"mais vendido\" — fácil de escolher" },
              { img: totemCombo, step: "2. Combo e opções", text: "Sugestão de combo e personalização no momento certo" },
              { img: totemPagamentoUI, step: "3. Pagamento", text: "Cartão ou PIX, com a adquirente que você já usa" },
            ].map((s, i) => (
              <Reveal delay={i * 100} key={s.step}>
                <div className="card" style={{ padding: 20 }}>
                  <div style={{ maxWidth: 180, margin: "0 auto" }}>
                    <DeviceFrame src={s.img} alt={s.text} />
                  </div>
                  <p style={{ color: "var(--brand)", fontWeight: 700, fontSize: 13, marginTop: 16, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {s.step}
                  </p>
                  <p style={{ color: "var(--text)", marginTop: 4 }}>{s.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <div className="btn-row">
            <Link to="/como-funciona" className="btn btn--secondary">
              Ver o fluxo completo
            </Link>
          </div>
        </div>
      </section>

      {/* Seção 3 — Pilar 1: Pagamento sem susto */}
      <section className="section" id="pagamento">
        <div className="container grid grid--2" style={{ alignItems: "center" }}>
          <Reveal>
            <div className="card-icon">
              <CardIcon />
            </div>
            <span className="eyebrow">Pilar 1</span>
            <h2>Sua adquirente continua sendo sua</h2>
            <p className="subhead">
              Cielo, Rede, GetNet, PagSeguro, Mercado Pago, Stone ou Adyen. Você não precisa trocar de adquirente
              pra ter autoatendimento. E se uma venda falhar no meio do caminho, o estorno acontece sozinho.
            </p>
            <ul className="bullets">
              <li>
                <span className="bullet-dot">
                  <CheckCircleIcon size={14} />
                </span>
                Mantém a adquirente que você já usa (Cielo, Rede, GetNet, PagSeguro) via PayGo, ou use Mercado Pago, Stone ou Adyen direto
              </li>
              <li>
                <span className="bullet-dot">
                  <CheckCircleIcon size={14} />
                </span>
                Nenhuma taxa própria embutida escondida no preço do sistema
              </li>
              <li>
                <span className="bullet-dot">
                  <CheckCircleIcon size={14} />
                </span>
                Se o pagamento for aprovado mas algo falhar depois, o estorno é automático
              </li>
            </ul>
            <div className="btn-row">
              <Link to="/como-funciona" className="btn btn--secondary">
                Entender como funciona o pagamento
              </Link>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <ParallaxPhoto src={totemPagamentoCloseup} alt="Close-up de cliente tocando a tela de pagamento do totem" aspect="4 / 3" speed={0.1} />
          </Reveal>
        </div>
      </section>

      {/* Seção 4 — Pilar 2: Fiscal no automático */}
      <section className="section section--tint" id="fiscal">
        <div className="container">
          <Reveal>
            <div style={{ maxWidth: 640 }}>
              <div className="card-icon">
                <ReceiptIcon />
              </div>
              <span className="eyebrow">Pilar 2</span>
              <h2>Nota fiscal emitida sozinha, venda por venda</h2>
              <p className="subhead">
                Cada pedido pago já sai com nota fiscal — sem depender de alguém lembrar de rodar nada no fim do
                dia.
              </p>
              <ul className="bullets">
                <li>
                  <span className="bullet-dot">
                    <CheckCircleIcon size={14} />
                  </span>
                  Emissão automática a cada venda aprovada
                </li>
                <li>
                  <span className="bullet-dot">
                    <CheckCircleIcon size={14} />
                  </span>
                  Reconciliação automática se alguma nota ficar pendente
                </li>
                <li>
                  <span className="bullet-dot">
                    <CheckCircleIcon size={14} />
                  </span>
                  Cancelamento de nota dentro do prazo, se o pagamento for estornado
                </li>
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Seção 4.5 — Visibilidade total (prova do painel admin) */}
      <section className="section">
        <div className="container grid grid--2" style={{ alignItems: "center" }}>
          <Reveal>
            <ParallaxPhoto src={adminClientes} alt="Painel administrativo do Ordin, tela de clientes" aspect="16 / 10" speed={0.08} />
          </Reveal>
          <Reveal delay={120}>
            <span className="eyebrow">Painel administrativo</span>
            <h2>Visibilidade total do seu negócio</h2>
            <p className="subhead">
              Cardápio, pedidos, transações e contratos — tudo num painel só, pensado pra quem toca o dia a dia da
              operação.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Seção 5 — Pilar 3: Custo justo */}
      <section className="section section--tint">
        <div className="container grid grid--2" style={{ alignItems: "center" }}>
          <Reveal>
            <div className="card-icon">
              <TagIcon />
            </div>
            <span className="eyebrow">Pilar 3</span>
            <h2>Custo justo, sem letra miúda</h2>
            <p className="subhead">
              Sem piso de faturamento mínimo, sem contrato de um ano só pra testar, sem taxa escondida embutida
              no sistema. Você sabe exatamente quanto está pagando.
            </p>
            <ul className="bullets">
              <li>
                <span className="bullet-dot">
                  <CheckCircleIcon size={14} />
                </span>
                Sem exigência de faturamento mínimo pra contratar
              </li>
              <li>
                <span className="bullet-dot">
                  <CheckCircleIcon size={14} />
                </span>
                Comece com 1 totem e cresça — o custo por totem cai a cada unidade adicional
              </li>
              <li>
                <span className="bullet-dot">
                  <CheckCircleIcon size={14} />
                </span>
                Sem taxa própria da Ordin escondida na maquininha
              </li>
            </ul>
            <div className="btn-row">
              <Link to="/precos" className="btn btn--secondary">
                Ver como a cobrança funciona
              </Link>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <ParallaxPhoto src={ambienteMultiTotem} alt="Dois totens em uso simultâneo num balcão de food service" aspect="16 / 10" speed={0.1} />
          </Reveal>
        </div>
      </section>

      {/* Seção 5.5 — Diferencial: roda em qualquer dispositivo */}
      <section className="section" style={{ background: "#180a33" }}>
        <div className="container" style={{ textAlign: "center" }}>
          <Reveal>
            <span className="eyebrow" style={{ color: "#cfa3ff" }}>O grande diferencial</span>
            <h2 style={{ color: "#fff" }}>O totem que roda em qualquer dispositivo</h2>
            <p className="subhead" style={{ color: "rgba(255,255,255,0.72)", margin: "0 auto" }}>
              O Ordin roda direto no navegador — sem sistema operacional proprietário, sem porte pra outra
              plataforma. Funciona em tablet Android, notebook Windows, Chromebook ou qualquer touchscreen com
              navegador atualizado. Você escolhe o equipamento que cabe no seu orçamento.
            </p>
            <div className="hero__badges" style={{ justifyContent: "center" }}>
              {["Android", "Windows", "Chrome OS", "Qualquer navegador moderno"].map((t) => (
                <span
                  key={t}
                  className="tag"
                  style={{ background: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.2)", color: "#fff" }}
                >
                  {t}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Seção 6 — Para quem é */}
      <section className="section">
        <div className="container">
          <Reveal>
            <h2 style={{ textAlign: "center" }}>Pra quem é (e pra quem ainda não é)</h2>
            <div className="hero__badges" style={{ justifyContent: "center" }}>
              <span className="tag">🍔 Alimentação e restaurantes</span>
              <span className="tag">☕ Cafeterias</span>
              <span className="tag">🍺 Bares e pubs</span>
              <span className="tag">🎶 Baladas e casas noturnas</span>
              <span className="tag">🏖️ Parques e lazer</span>
              <span className="tag">🛍️ Lojas e varejo</span>
              <span className="tag">🏢 Franquias e redes</span>
            </div>
          </Reveal>
          <div className="grid grid--2" style={{ marginTop: 32 }}>
            <Reveal>
              <div className="card">
                <h3 style={{ color: "var(--success-base)" }}>É pra você se</h3>
                <ul className="bullets">
                  {[
                    "Tem uma operação de atendimento rápido com pedido e retirada (não serviço de mesa com garçom)",
                    "Quer resolver fila e erro de pedido sem precisar trocar de adquirente",
                    "Está começando ou é de porte pequeno/médio",
                  ].map((t) => (
                    <li key={t}>
                      <span className="bullet-dot" style={{ background: "#e4fbf3", color: "var(--success-base)" }}>
                        <CheckCircleIcon size={14} />
                      </span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <div className="card">
                <h3 style={{ color: "var(--error-base)" }}>Ainda não é pra você se</h3>
                <ul className="bullets">
                  {[
                    "É uma operação de venda por atacado/distribuição (estoque e balança), não atendimento direto ao consumidor final",
                    "Precisa de painel único centralizado pra gerenciar várias unidades como rede (cada unidade pode usar o Ordin separadamente, só não existe ainda um painel único entre elas)",
                    "Depende de delivery via iFood/Rappi como canal principal",
                    "Precisa de painel de cozinha (KDS) com roteamento por praça",
                  ].map((t) => (
                    <li key={t}>
                      <span className="bullet-dot" style={{ background: "#fff0f0", color: "var(--error-base)" }}>
                        <XCircleIcon size={14} />
                      </span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Seção 7 — CTA final */}
      <section className="section section--tint">
        <div className="blob" style={{ width: 500, height: 500, top: -200, left: "50%", transform: "translateX(-50%)" }} />
        <div className="container" style={{ textAlign: "center", position: "relative" }}>
          <Reveal>
            <h2>Vamos ver se o Ordin resolve a fila do seu balcão?</h2>
            <p className="subhead" style={{ margin: "0 auto" }}>
              Sem compromisso, sem letra miúda — uma conversa de 15 minutos pra entender sua operação.
            </p>
            <div className="btn-row" style={{ justifyContent: "center" }}>
              <a className="btn btn--primary" href={whatsappLink("Oi! Quero agendar uma conversa sobre o Ordin.")} target="_blank" rel="noreferrer">
                Agendar conversa
              </a>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
