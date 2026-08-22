import { useEffect, useState } from "react";
import { Hand } from "lucide-react";
import type { Theme } from "../themes";
import type { TotemVideo } from "../types";
import { FONT } from "../scale";
import api from "../api";

const FONT_D = "'Lexend', sans-serif";

interface Props {
  T: Theme;
  companyName: string;
  companyId: number | null;
  onStart: () => void;
}

// Modo espera com vídeos em rotação (ORD-115) — busca a playlist ativa toda
// vez que a tela ociosa é exibida (ela remonta a cada goIdle()/newOrder(),
// momento natural pra pegar vídeos atualizados sem precisar de polling).
// Sem vídeo ativo (ou erro de rede), cai silenciosamente na tela estática —
// nunca bloqueia a tela ociosa por causa disso.
export default function WelcomeScreen({ T, companyName, companyId, onStart }: Props) {
  const [videos, setVideos] = useState<TotemVideo[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setVideos([]);
    setIndex(0);
    if (!companyId) return;
    api.get(`/companies/${companyId}/totem-videos/active`)
      .then((r) => setVideos(r.data.videos ?? []))
      .catch(() => setVideos([]));
  }, [companyId]);

  const current = videos[index] ?? null;

  return (
    <div
      onClick={onStart}
      style={{
        position: "relative",
        minHeight: "100vh",
        overflow: "hidden",
        background: T.radial,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {/* Vídeo em rotação — desmonta (e para) automaticamente quando o
          cliente toca a tela, já que onStart() troca de tela imediatamente
          e leva este componente inteiro junto. Nenhuma lógica extra de
          "cancelar reprodução" é necessária. */}
      {current && (
        <video
          key={current.id}
          src={current.video_url}
          autoPlay
          muted
          playsInline
          onEnded={() => setIndex((i) => (i + 1) % videos.length)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            zIndex: 0,
          }}
        />
      )}

      {/* Escurece o vídeo pra manter o texto legível por cima, sem tampar
          quando não há vídeo (fallback estático não muda em nada). */}
      {current && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1 }} />
      )}

      <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", alignItems: "center" }}>
        {/* Marca — só a da empresa, de propósito (ORD-114): esta é a única
            tela vista pelo cliente final antes de decidir tocar pra começar,
            nenhuma identificação do fornecedor de software (Ordin) aqui. */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{
            fontFamily: FONT_D,
            fontWeight: 900,
            fontSize: FONT.headlineLg,
            color: current ? "#fff" : T.text,
            letterSpacing: "-1px",
            lineHeight: 1,
            marginBottom: 8,
          }}>
            {companyName}
          </div>
          <div style={{
            fontFamily: FONT_D,
            color: current ? "#fff" : T.roxo,
            fontSize: FONT.body,
            fontWeight: 700,
            letterSpacing: "4px",
            textTransform: "uppercase",
          }}>
            Autoatendimento
          </div>
        </div>

        {/* CTA — pulse */}
        <div style={{
          animation: "pulse 2.4s ease-in-out infinite",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}>
          <div style={{
            width: 88,
            height: 88,
            borderRadius: "50%",
            background: current ? "rgba(255,255,255,0.15)" : T.roxoSubtle,
            border: `2px solid ${current ? "#fff" : T.roxo}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: "glow 2.4s ease-in-out infinite",
          }}>
            <Hand size={44} color={current ? "#fff" : T.roxo} strokeWidth={1.5} />
          </div>
          <div style={{
            fontFamily: FONT_D,
            fontSize: FONT.headline,
            fontWeight: 800,
            color: current ? "#fff" : T.text,
            letterSpacing: "-0.5px",
          }}>
            Toque para começar
          </div>
          <div style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: FONT.bodyLg,
            color: current ? "rgba(255,255,255,0.8)" : T.muted,
            fontWeight: 400,
          }}>
            Faça seu pedido em minutos
          </div>
        </div>
      </div>
    </div>
  );
}
