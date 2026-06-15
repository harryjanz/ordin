import { useState } from "react";
import api from "../api";
import { useStore } from "../store";

const S = {
  page: { padding: 32, color: "#DFE8ED" } as React.CSSProperties,
  title: { fontSize: 22, fontWeight: 700, marginBottom: 24 } as React.CSSProperties,
  card: {
    background: "#1d1434",
    border: "1px solid rgba(153,0,255,0.2)",
    borderRadius: 12,
    padding: "24px 28px",
    maxWidth: 480,
    marginBottom: 20,
  } as React.CSSProperties,
  cardTitle: { fontSize: 15, fontWeight: 600, marginBottom: 8 } as React.CSSProperties,
  cardDesc: { fontSize: 13, color: "rgba(223,232,237,0.5)", marginBottom: 16 } as React.CSSProperties,
  btn: {
    padding: "10px 20px",
    background: "#9900ff",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    cursor: "pointer",
  } as React.CSSProperties,
  pinBox: {
    marginTop: 16,
    background: "rgba(153,0,255,0.12)",
    border: "1px solid #9900ff",
    borderRadius: 8,
    padding: "16px 20px",
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: 8,
    color: "#DFE8ED",
    textAlign: "center" as const,
  } as React.CSSProperties,
  pinWarning: {
    marginTop: 8,
    fontSize: 12,
    color: "#f59e0b",
    textAlign: "center" as const,
  } as React.CSSProperties,
};

export default function SettingsScreen() {
  const companyId = useStore((s) => s.selectedCompanyId ?? s.companyId);
  const [pin, setPin] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function regenerate() {
    if (!companyId || !confirm("Gerar novo PIN? O PIN atual será invalidado.")) return;
    setLoading(true);
    try {
      const r = await api.post(`/companies/${companyId}/regenerate-pin`);
      setPin(r.data.pin ?? r.data.new_pin ?? "????");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={S.page}>
      <div style={S.title}>Configurações</div>

      <div style={S.card}>
        <div style={S.cardTitle}>PIN do totem</div>
        <div style={S.cardDesc}>
          O PIN de 4 dígitos é usado pelos clientes para acessar o cardápio no quiosque.
          Após regenerar, o PIN antigo é imediatamente invalidado.
        </div>
        <button style={S.btn} onClick={regenerate} disabled={loading || !companyId}>
          {loading ? "Gerando…" : "Regenerar PIN"}
        </button>

        {pin && (
          <>
            <div style={S.pinBox}>{pin}</div>
            <div style={S.pinWarning}>Anote este PIN — ele não será exibido novamente.</div>
          </>
        )}
      </div>
    </div>
  );
}
