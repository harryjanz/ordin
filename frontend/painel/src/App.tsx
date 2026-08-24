import { useStore } from "./store";
import { resolveTheme } from "./themes";
import PairScreen from "./screens/PairScreen";
import PanelScreen from "./screens/PanelScreen";
import type { CompanyInfo } from "./types";

export default function App() {
  const { token, company, setPaired } = useStore();

  const T = resolveTheme(
    company?.visual_theme ?? "ordin",
    company?.visual_mode  ?? "light",
  );

  function handlePaired(co: CompanyInfo, tok: string) {
    setPaired(tok, co);
  }

  if (!token || !company) {
    return <PairScreen T={T} onDone={handlePaired} />;
  }

  return <PanelScreen T={T} companyId={company.id} companyName={company.name} />;
}
