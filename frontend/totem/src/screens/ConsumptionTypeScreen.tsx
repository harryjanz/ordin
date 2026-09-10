import { ArrowLeft, Utensils, ShoppingBag } from "lucide-react";
import type { Theme } from "../themes";
import type { ConsumptionType } from "../types";
import { FONT } from "../scale";
import { Button } from "@/components/ui/button";

const FONT_D = "'Lexend', sans-serif";
const FONT_B = "'Inter', sans-serif";

interface Props {
  T: Theme;
  onSelect: (type: ConsumptionType) => void;
  onBack: () => void;
}

// Nomenclatura confirmada com pesquisa de mercado (ORD-108) — "Comer no
// local" / "Para levar" é o padrão dominante (Goomer, KCMS, e o mesmo que
// o McDonald's consagrou no Brasil desde ~2015). Não reinventar aqui é boa
// UX: menos carga cognitiva num fluxo rápido de totem.
const OPTIONS: { type: ConsumptionType; label: string; Icon: typeof Utensils }[] = [
  { type: "local", label: "Comer no local", Icon: Utensils },
  { type: "viagem", label: "Para levar", Icon: ShoppingBag },
];

export default function ConsumptionTypeScreen({ T, onSelect, onBack }: Props) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center pt-8 pb-6"
      style={{ background: T.radial, transition: "background 0.3s" }}
    >
      <div className="flex flex-col gap-7" style={{ width: "min(680px, 92vw)" }}>

        <div className="text-center">
          <h2 className="mb-2" style={{ color: T.text, fontFamily: FONT_D, fontSize: FONT.headline, fontWeight: 800 }}>
            Como você vai consumir?
          </h2>
          <p style={{ color: T.muted, fontFamily: FONT_B, fontSize: FONT.subtitle }}>
            Escolha uma opção pra continuar
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {OPTIONS.map(({ type, label, Icon }) => (
            <button
              key={type}
              onClick={() => onSelect(type)}
              className="flex flex-col items-center justify-center gap-4 rounded-2xl border-2 transition-colors"
              style={{ height: 220, background: T.numBg, borderColor: T.border }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.roxo; e.currentTarget.style.background = T.numHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.numBg; }}
            >
              <Icon size={48} color={T.roxo} strokeWidth={1.5} />
              <span style={{ color: T.text, fontFamily: FONT_D, fontSize: FONT.title, fontWeight: 800 }}>
                {label}
              </span>
            </button>
          ))}
        </div>

        <Button
          variant="outline"
          onClick={onBack}
          className="self-start rounded-lg uppercase tracking-wide"
          style={{ minHeight: 88, paddingLeft: 28, paddingRight: 28, fontFamily: FONT_D, fontSize: FONT.subtitle, fontWeight: 700 }}
        >
          <ArrowLeft className="size-4" /> Voltar
        </Button>

      </div>
    </div>
  );
}
