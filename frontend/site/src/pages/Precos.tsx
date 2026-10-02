import { whatsappLink } from "../config";
import Reveal from "../components/Reveal";
import { TagIcon, ShieldIcon, DevicesIcon } from "../components/Icons";

export default function Precos() {
  return (
    <>
      <section className="section hero">
        <div className="blob" style={{ width: 420, height: 420, top: -160, right: -100 }} />
        <div className="container">
          <Reveal>
            <div className="card-icon">
              <TagIcon />
            </div>
            <h1>Custo justo, sem letra miúda</h1>
            <p className="subhead">
              A gente não publica uma tabela de preço fechada ainda — mas pode te explicar exatamente como a conta
              funciona, sem surpresa no fim do mês.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="section section--tint">
        <div className="container">
          <Reveal>
            <h2>Por totem, com desconto a cada unidade</h2>
            <p className="subhead">Não uma mensalidade igual pra todo mundo.</p>
            <ul className="bullets">
              <li>Cobrança por totem: o custo por unidade cai a cada totem adicional na mesma operação</li>
              <li>Sem contrato de fidelidade de 1 ano só pra testar</li>
              <li>
                Sem taxa própria da Ordin embutida na sua maquininha — a taxa de pagamento continua sendo a da sua
                adquirente, negociada por você
              </li>
            </ul>
            <div className="btn-row">
              <a className="btn btn--primary" href={whatsappLink("Oi! Quero saber a tabela de preço do Ordin.")} target="_blank" rel="noreferrer">
                Fale com a gente pra sua tabela
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <Reveal>
            <div className="card-icon">
              <ShieldIcon />
            </div>
            <h2>Você sabe exatamente quanto está pagando</h2>
            <p className="subhead">
              É comum um "totem grátis" esconder a conta na taxa de cartão — você só descobre no extrato. Aqui não.
            </p>
            <ul className="bullets">
              <li>Sem taxa própria da Ordin embutida no sistema — você continua negociando sua taxa direto com sua adquirente</li>
              <li>Sem contrato de fidelidade de 1 ano só pra testar o produto</li>
              <li>Sem cobrar por módulo que você não vai usar</li>
            </ul>
          </Reveal>
        </div>
      </section>

      <section className="section section--tint">
        <div className="container">
          <Reveal>
            <div className="card-icon">
              <DevicesIcon />
            </div>
            <h2>Três formas de ter o equipamento</h2>
            <p className="subhead">
              Compre, alugue, ou traga o seu — você escolhe. O Ordin roda no navegador, sem sistema operacional
              proprietário: funciona em tablet Android, notebook Windows, Chromebook ou qualquer touchscreen com
              navegador atualizado.
            </p>
          </Reveal>
          <div className="grid grid--3" style={{ marginTop: 28 }}>
            {[
              { t: "Comprar", d: "O equipamento é seu." },
              { t: "Alugar", d: "Sem comprometer caixa no início." },
              { t: "Trazer o seu", d: "Se você já tem (ou prefere comprar por conta própria), seguindo nossa especificação técnica." },
            ].map((o, i) => (
              <Reveal delay={i * 100} key={o.t}>
                <div className="card">
                  <h3>{o.t}</h3>
                  <p>{o.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <Reveal>
            <div className="card-icon">
              <ShieldIcon />
            </div>
            <h2>Implantação sem esforço</h2>
            <p className="subhead">A gente cuida do cadastro do cardápio, configuração e layout — o sistema chega pronto pra você vender.</p>
          </Reveal>
          <ul className="bullets" style={{ maxWidth: 560 }}>
            <li>Cadastro de produtos e cardápio feito pela nossa equipe</li>
            <li>Configuração e layout prontos antes de você começar a vender</li>
            <li>Sem burocracia, sem tomar o seu tempo</li>
          </ul>
        </div>
      </section>

      <section className="section" style={{ textAlign: "center" }}>
        <div className="container">
          <Reveal>
            <h2>Vamos calcular juntos?</h2>
            <p className="subhead" style={{ margin: "0 auto" }}>
              Me conta quantos totens você precisa e qual adquirente já usa — eu te mostro a conta certinha, sem
              letra miúda.
            </p>
            <div className="btn-row" style={{ justifyContent: "center" }}>
              <a className="btn btn--primary" href={whatsappLink("Oi! Quero calcular quanto custaria o Ordin pra mim.")} target="_blank" rel="noreferrer">
                Falar com a gente
              </a>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
