import { useState, FormEvent } from "react";
import { Monitor } from "lucide-react";
import type { Theme } from "../themes";
import { FONT } from "../scale";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "ordin_terminal_id";

interface Props {
  T: Theme;
  onDone: () => void;
}

export default function DeviceSetupScreen({ T, onDone }: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const id = parseInt(value.trim(), 10);
    if (!id || id < 1) { setError("Informe um ID de terminal válido."); return; }
    localStorage.setItem(STORAGE_KEY, String(id));
    onDone();
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: T.radial }}>
      <Card className="text-center" style={{ width: 360, boxShadow: "0 8px 40px rgba(153,0,255,0.12)" }}>
        <CardContent>
          <Monitor className="mx-auto mb-4" size={FONT.headlineLg} color={T.roxo} />
          <h2 className="mb-2" style={{ color: T.text, fontSize: FONT.subtitle, fontWeight: 800 }}>
            Configuração do Dispositivo
          </h2>
          <p className="mb-7" style={{ color: T.muted, fontSize: FONT.body }}>
            Informe o ID do terminal configurado no Admin Panel.
            Esta tela aparece apenas na primeira vez.
          </p>
          {error && (
            <div
              className="rounded-lg mb-4"
              style={{ color: T.errorText, background: T.errorBg, padding: "8px 12px", fontSize: FONT.body }}
            >
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit}>
            <Input
              type="number"
              min={1}
              placeholder="ID do terminal (ex: 1)"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
              className="mb-4 text-center"
              style={{ height: "auto", padding: "12px 16px", background: T.numBg, color: T.text, fontSize: FONT.subtitle }}
            />
            <Button
              type="submit"
              className="w-full rounded-lg"
              style={{ padding: 16, background: T.btn, color: T.btnText, fontSize: FONT.bodyLg, fontWeight: 700, boxShadow: T.glow }}
            >
              Salvar e continuar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export function getStoredTerminalId(): number | null {
  const v = localStorage.getItem(STORAGE_KEY);
  const id = v ? parseInt(v, 10) : NaN;
  return isNaN(id) ? null : id;
}
