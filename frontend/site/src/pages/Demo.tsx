import { whatsappLink } from "../config";
import Reveal from "../components/Reveal";
import { CheckCircleIcon, ChatIcon } from "../components/Icons";

export default function Demo() {
  return (
    <section className="section hero" style={{ textAlign: "center" }}>
      <div className="blob" style={{ width: 480, height: 480, top: -200, left: "50%", transform: "translateX(-50%)" }} />
      <div className="container" style={{ position: "relative" }}>
        <Reveal>
          <div className="card-icon" style={{ margin: "0 auto 20px" }}>
            <ChatIcon />
          </div>
          <h1>Vamos ver se o Ordin resolve a fila do seu balcão?</h1>
          <p className="subhead" style={{ margin: "0 auto" }}>
            Sem compromisso, sem letra miúda — uma conversa de 15 minutos pra entender sua operação.
          </p>
          <ul className="bullets" style={{ margin: "24px auto", maxWidth: 420, textAlign: "left" }}>
            {["Mantém a adquirente que você já usa", "Nota fiscal automática em cada venda", "Custo justo, sem taxa escondida"].map((t) => (
              <li key={t}>
                <span className="bullet-dot">
                  <CheckCircleIcon size={14} />
                </span>
                {t}
              </li>
            ))}
          </ul>
          <div className="btn-row" style={{ justifyContent: "center" }}>
            <a className="btn btn--primary" href={whatsappLink("Oi! Quero agendar uma conversa sobre o Ordin.")} target="_blank" rel="noreferrer">
              Chamar no WhatsApp
            </a>
          </div>
          <p className="note" style={{ margin: "24px auto 0", maxWidth: 420 }}>
            Suporte 24x7 depois que você assinar — o mesmo WhatsApp vira seu canal de suporte.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
