export interface ThemeTokens {
  bg: string; surface: string; header: string;
  border: string; borderNeutral: string;
  text: string; muted: string;
  roxo: string; roxoSubtle: string;
  btn: string; btnText: string;
  glow: string; radial: string;
  priceColor: string;
  cardShadow: string;
  catActive: string; catText: string;
  numBg: string; numHover: string;
  successColor: string;
  errorBg: string; errorText: string;
  placeholderA: string; placeholderB: string;
}

export type ThemeMode = "light" | "dark";

export interface ThemeEntry {
  label: string;
  description: string;
  colors: string[];
  modes: Record<ThemeMode, ThemeTokens>;
}

export const THEME_REGISTRY = {
  ordin: {
    label: "Ordin",
    description: "Identidade roxa vibrante com acento teal — padrão da plataforma.",
    colors: ["#9900ff", "#1a9999", "#DFE8ED"],
    modes: {
      light: {
        bg: "#DFE8ED", surface: "#ffffff", header: "#ffffff",
        border: "rgba(153,0,255,0.18)", borderNeutral: "rgba(0,0,0,0.08)",
        text: "#1d1434", muted: "rgba(29,20,52,0.45)",
        roxo: "#9900ff", roxoSubtle: "rgba(153,0,255,0.12)",
        btn: "#9900ff", btnText: "#ffffff",
        glow: "0 4px 20px rgba(153,0,255,0.35)",
        radial: "radial-gradient(ellipse at 60% 0%,rgba(153,0,255,0.07) 0%,transparent 55%),#DFE8ED",
        priceColor: "#1a9999",
        cardShadow: "0 2px 12px rgba(153,0,255,0.10)",
        catActive: "#9900ff", catText: "#ffffff",
        numBg: "rgba(153,0,255,0.10)", numHover: "rgba(153,0,255,0.22)",
        successColor: "#198737",
        errorBg: "rgba(255,77,109,0.08)", errorText: "#ff4d6d",
        placeholderA: "linear-gradient(135deg,#3a0080,#9900ff)",
        placeholderB: "linear-gradient(135deg,#0d3333,#33cccc)",
      },
      dark: {
        bg: "#0e0b1a", surface: "#1d1434", header: "#1d1434",
        border: "rgba(153,0,255,0.22)", borderNeutral: "rgba(255,255,255,0.07)",
        text: "#DFE8ED", muted: "rgba(223,232,237,0.45)",
        roxo: "#9900ff", roxoSubtle: "rgba(153,0,255,0.12)",
        btn: "#9900ff", btnText: "#ffffff",
        glow: "0 4px 20px rgba(153,0,255,0.35)",
        radial: "radial-gradient(ellipse at 60% 0%,rgba(153,0,255,0.18) 0%,transparent 60%),#0e0b1a",
        priceColor: "#33cccc",
        cardShadow: "0 2px 16px rgba(153,0,255,0.20)",
        catActive: "#9900ff", catText: "#ffffff",
        numBg: "rgba(153,0,255,0.12)", numHover: "rgba(153,0,255,0.25)",
        successColor: "#198737",
        errorBg: "rgba(255,77,109,0.10)", errorText: "#ff4d6d",
        placeholderA: "linear-gradient(135deg,#1d0040,#9900ff)",
        placeholderB: "linear-gradient(135deg,#051212,#33cccc)",
      },
    },
  },
  mc: {
    label: "Clássico Vermelho",
    description: "Vermelho vibrante com amarelo dourado — alto contraste e apetência.",
    colors: ["#DA291C", "#FFC72C", "#F5F0E5"],
    modes: {
      light: {
        bg: "#F5F0E5", surface: "#ffffff", header: "#ffffff",
        border: "rgba(218,41,28,0.20)", borderNeutral: "rgba(0,0,0,0.08)",
        text: "#27251F", muted: "rgba(39,37,31,0.45)",
        roxo: "#DA291C", roxoSubtle: "rgba(218,41,28,0.08)",
        btn: "#DA291C", btnText: "#ffffff",
        glow: "0 4px 20px rgba(218,41,28,0.30)",
        radial: "radial-gradient(ellipse at 60% 0%,rgba(218,41,28,0.06) 0%,transparent 55%),#F5F0E5",
        priceColor: "#DA291C",
        cardShadow: "0 2px 12px rgba(218,41,28,0.08)",
        catActive: "#FFC72C", catText: "#27251F",
        numBg: "rgba(255,199,44,0.15)", numHover: "rgba(255,199,44,0.30)",
        successColor: "#264F36",
        errorBg: "rgba(218,41,28,0.08)", errorText: "#DA291C",
        placeholderA: "linear-gradient(135deg,#8B0000,#DA291C)",
        placeholderB: "linear-gradient(135deg,#7A6000,#FFC72C)",
      },
      dark: {
        bg: "#1c1a16", surface: "#27251F", header: "#27251F",
        border: "rgba(255,199,44,0.20)", borderNeutral: "rgba(255,255,255,0.07)",
        text: "#F5F0E5", muted: "rgba(245,240,229,0.45)",
        roxo: "#DA291C", roxoSubtle: "rgba(218,41,28,0.15)",
        btn: "#DA291C", btnText: "#ffffff",
        glow: "0 4px 20px rgba(218,41,28,0.40)",
        radial: "radial-gradient(ellipse at 60% 0%,rgba(218,41,28,0.12) 0%,transparent 60%),#1c1a16",
        priceColor: "#FFC72C",
        cardShadow: "0 2px 16px rgba(218,41,28,0.20)",
        catActive: "#FFC72C", catText: "#27251F",
        numBg: "rgba(255,199,44,0.12)", numHover: "rgba(255,199,44,0.25)",
        successColor: "#5DD490",
        errorBg: "rgba(255,107,91,0.10)", errorText: "#ff6b5b",
        placeholderA: "linear-gradient(135deg,#5C0000,#DA291C)",
        placeholderB: "linear-gradient(135deg,#4A3800,#FFC72C)",
      },
    },
  },
  bk: {
    label: "Laranja Grelhado",
    description: "Laranja quente com vermelho — associação imediata a sabor e fogo.",
    colors: ["#FF8732", "#D62300", "#FFF8F0"],
    modes: {
      light: {
        bg: "#FFF8F0", surface: "#ffffff", header: "#ffffff",
        border: "rgba(255,135,50,0.25)", borderNeutral: "rgba(0,0,0,0.08)",
        text: "#1A0A00", muted: "rgba(26,10,0,0.45)",
        roxo: "#FF8732", roxoSubtle: "rgba(255,135,50,0.12)",
        btn: "#FF8732", btnText: "#0E0C0A",
        glow: "0 4px 20px rgba(255,135,50,0.40)",
        radial: "radial-gradient(ellipse at 60% 0%,rgba(255,135,50,0.08) 0%,transparent 55%),#FFF8F0",
        priceColor: "#D62300",
        cardShadow: "0 2px 12px rgba(255,135,50,0.12)",
        catActive: "#FF8732", catText: "#0E0C0A",
        numBg: "rgba(255,135,50,0.12)", numHover: "rgba(255,135,50,0.25)",
        successColor: "#198737",
        errorBg: "rgba(214,35,0,0.08)", errorText: "#D62300",
        placeholderA: "linear-gradient(135deg,#7A3200,#FF8732)",
        placeholderB: "linear-gradient(135deg,#6B0C00,#D62300)",
      },
      dark: {
        bg: "#0E0C0A", surface: "#1A1612", header: "#1A1612",
        border: "rgba(255,135,50,0.25)", borderNeutral: "rgba(255,255,255,0.07)",
        text: "#F5EBDC", muted: "rgba(245,235,220,0.40)",
        roxo: "#FF8732", roxoSubtle: "rgba(255,135,50,0.14)",
        btn: "#FF8732", btnText: "#0E0C0A",
        glow: "0 4px 20px rgba(255,135,50,0.40)",
        radial: "radial-gradient(ellipse at 60% 0%,rgba(255,135,50,0.14) 0%,transparent 60%),#0E0C0A",
        priceColor: "#FF8732",
        cardShadow: "0 2px 16px rgba(255,135,50,0.20)",
        catActive: "#FF8732", catText: "#0E0C0A",
        numBg: "rgba(255,135,50,0.12)", numHover: "rgba(255,135,50,0.25)",
        successColor: "#5DD490",
        errorBg: "rgba(255,106,74,0.12)", errorText: "#FF6B4A",
        placeholderA: "linear-gradient(135deg,#3A1600,#FF8732)",
        placeholderB: "linear-gradient(135deg,#2E0500,#D62300)",
      },
    },
  },
} as const satisfies Record<string, ThemeEntry>;

export type ThemeName = keyof typeof THEME_REGISTRY;
export type Theme = ThemeTokens;

export function resolveTheme(name: string, mode: string): Theme {
  const entry = THEME_REGISTRY[name as ThemeName];
  const m: ThemeMode = mode === "dark" ? "dark" : "light";
  return (entry ?? THEME_REGISTRY.ordin).modes[m];
}
