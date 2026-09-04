import { useEffect, useRef, useState } from "react";
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
  const videoRef = useRef<HTMLVideoElement>(null);

  // O atributo `autoPlay` sozinho não é confiável aqui — o React seta
  // `muted` como propriedade JS, não como atributo HTML (`hasAttribute`
  // fica false mesmo com `.muted === true`), e a política de autoplay do
  // Chrome pode avaliar o elemento antes disso, bloqueando a reprodução em
  // silêncio (sem erro nenhum, só fica pausado em 0). Chamar `.play()`
  // explicitamente aqui é a forma confiável — vídeo mudo sempre pode ser
  // tocado via JS, mesmo sob política de autoplay restrita.
  useEffect(() => {
    videoRef.current?.play().catch(() => {});
  }, [current?.id]);

  return (
    <div
      onClick={onStart}
      className="relative min-h-screen overflow-hidden flex flex-col items-center justify-center cursor-pointer select-none"
      style={{ background: T.radial }}
    >
      {/* Vídeo em rotação — desmonta (e para) automaticamente quando o
          cliente toca a tela, já que onStart() troca de tela imediatamente
          e leva este componente inteiro junto. Nenhuma lógica extra de
          "cancelar reprodução" é necessária. */}
      {current && (
        <video
          ref={videoRef}
          key={current.id}
          src={current.video_url}
          autoPlay
          muted
          playsInline
          // Com 1 só vídeo, `loop` nativo reinicia sem depender de troca de
          // índice (index 0 -> 0 % 1 não muda estado, então onEnded sozinho
          // nunca reiniciaria) — o browser não dispara "ended" quando loop
          // está ligado. Com 2+, loop fica desligado e onEnded avança pro
          // próximo, sempre um índice diferente do atual.
          loop={videos.length === 1}
          onEnded={() => setIndex((i) => (i + 1) % videos.length)}
          className="absolute inset-0 w-full h-full object-cover z-0"
        />
      )}

      {/* Escurece o vídeo pra manter o texto legível por cima, sem tampar
          quando não há vídeo (fallback estático não muda em nada). */}
      {current && <div className="absolute inset-0 bg-black/35 z-10" />}

      <div className="relative z-20 flex flex-col items-center">
        {/* Marca — só a da empresa, de propósito (ORD-114): esta é a única
            tela vista pelo cliente final antes de decidir tocar pra começar,
            nenhuma identificação do fornecedor de software (Ordin) aqui. */}
        <div className="text-center mb-12">
          <div
            className="leading-none mb-2 tracking-tighter"
            style={{ fontFamily: FONT_D, fontWeight: 900, fontSize: FONT.headlineLg, color: current ? "#fff" : T.text }}
          >
            {companyName}
          </div>
          <div
            className="uppercase tracking-[4px]"
            style={{ fontFamily: FONT_D, color: current ? "#fff" : T.roxo, fontSize: FONT.body, fontWeight: 700 }}
          >
            Autoatendimento
          </div>
        </div>

        {/* CTA — pulse */}
        <div className="flex flex-col items-center gap-4" style={{ animation: "pulse 2.4s ease-in-out infinite" }}>
          <div
            className="rounded-full flex items-center justify-center"
            style={{
              width: 88, height: 88,
              background: current ? "rgba(255,255,255,0.15)" : T.roxoSubtle,
              border: `2px solid ${current ? "#fff" : T.roxo}`,
              animation: "glow 2.4s ease-in-out infinite",
            }}
          >
            <Hand size={44} color={current ? "#fff" : T.roxo} strokeWidth={1.5} />
          </div>
          <div
            className="tracking-tight"
            style={{ fontFamily: FONT_D, fontSize: FONT.headline, fontWeight: 800, color: current ? "#fff" : T.text }}
          >
            Toque para começar
          </div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: FONT.bodyLg, color: current ? "rgba(255,255,255,0.8)" : T.muted, fontWeight: 400 }}>
            Faça seu pedido em minutos
          </div>
        </div>
      </div>
    </div>
  );
}
