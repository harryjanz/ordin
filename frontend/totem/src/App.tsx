import { useState, useEffect } from "react";
import api from "./api";
import { useStore } from "./store";
import { THEMES, type ThemeKey } from "./themes";
import SetupScreen from "./screens/SetupScreen";
import { getStoredTerminalId } from "./screens/DeviceSetupScreen";
import CatalogScreen from "./screens/CatalogScreen";
import CpfScreen from "./screens/CpfScreen";
import PaymentScreen from "./screens/PaymentScreen";
import SuccessScreen from "./screens/SuccessScreen";
import type { CompanyInfo, TerminalInfo, Product, CompletedOrder } from "./types";

const INACTIVITY_TIMEOUT_MS = 120_000;
const INACTIVITY_WARN_SEC   = 10;

export default function App() {
  const [themeKey, setThemeKey] = useState<ThemeKey>("dark");
  const T = THEMES[themeKey];

  const {
    company, terminal, cart, cpf, completedOrder, screen,
    setToken, setCompany, setTerminal, setScreen,
    addToCart, removeFromCart, setCpf, setCompletedOrder, newOrder, resetSession, touch,
  } = useStore();

  const savedTerminalId = getStoredTerminalId();
  const [orderRef, setOrderRef] = useState<string | null>(null);
  const [warnCountdown, setWarnCountdown] = useState(0);
  const [showInactivityModal, setShowInactivityModal] = useState(false);

  // ── inatividade ───────────────────────────────────────────────────────────
  const watchedScreens = ["catalog", "cpf", "payment"];

  useEffect(() => {
    if (!watchedScreens.includes(screen)) {
      setShowInactivityModal(false);
      return;
    }

    const interval = setInterval(() => {
      const idle = Date.now() - useStore.getState().lastActivity;
      if (idle >= INACTIVITY_TIMEOUT_MS) {
        setShowInactivityModal(false);
        resetSession();
      } else if (idle >= INACTIVITY_TIMEOUT_MS - INACTIVITY_WARN_SEC * 1000) {
        setWarnCountdown(Math.ceil((INACTIVITY_TIMEOUT_MS - idle) / 1000));
        setShowInactivityModal(true);
      } else {
        setShowInactivityModal(false);
      }
    }, 500);

    const handler = () => touch();
    ["click", "touchstart", "keydown"].forEach((ev) => window.addEventListener(ev, handler));

    return () => {
      clearInterval(interval);
      ["click", "touchstart", "keydown"].forEach((ev) => window.removeEventListener(ev, handler));
    };
  }, [screen]);

  // ── handlers ─────────────────────────────────────────────────────────────

  function handlePinSuccess(co: CompanyInfo, term: TerminalInfo, token: string) {
    setToken(token);
    setCompany(co);
    setTerminal(term);
    setScreen("catalog");
  }

  async function handleCpfDone(c: string | null) {
    setCpf(c);
    try {
      const res = await api.post("/orders", {
        items: cart.map((i) => ({ product_id: i.id, name: i.name, qty: i.qty, unit_price: i.price })),
        discount: 0,
        cpf: c || null,
      });
      setOrderRef(res.data.order_ref);
      setScreen("payment");
    } catch {
      setScreen("catalog");
    }
  }

  function handleSuccess(order: CompletedOrder) {
    setCompletedOrder(order);
    setScreen("success");
  }

  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);

  // ── heartbeat enquanto em modo kiosk ─────────────────────────────────────
  useEffect(() => {
    if (screen !== "catalog" || !company || !terminal) return;
    const iv = setInterval(async () => {
      try {
        await api.post(`/companies/${company.id}/terminals/${terminal.id}/heartbeat`);
      } catch { /* silencioso */ }
    }, 120_000);
    return () => clearInterval(iv);
  }, [screen, company, terminal]);

  if (screen === "pin") {
    return (
      <SetupScreen
        T={T}
        savedTerminalId={savedTerminalId}
        onDone={handlePinSuccess}
      />
    );
  }

  return (
    <div>
      {/* Modal de inatividade */}
      {showInactivityModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 999,
          background: "rgba(0,0,0,0.75)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 20,
            padding: "40px 48px",
            textAlign: "center",
            maxWidth: 360,
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⏱️</div>
            <h3 style={{ color: T.text, fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
              Ainda está aí?
            </h3>
            <p style={{ color: T.muted, fontSize: 14, marginBottom: 20 }}>
              A sessão será cancelada em{" "}
              <strong style={{ color: T.roxo }}>{warnCountdown}s</strong>
            </p>
            <button
              onClick={() => { touch(); setShowInactivityModal(false); }}
              style={{
                padding: "12px 32px",
                background: T.btn,
                color: T.btnText,
                border: "none",
                borderRadius: 12,
                fontSize: 16,
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: T.glow,
              }}
            >
              Continuar
            </button>
          </div>
        </div>
      )}

      {screen === "catalog" && (
        <CatalogScreen
          T={T}
          themeKey={themeKey}
          companyName={company?.name ?? ""}
          terminalLabel={terminal?.label ?? ""}
          cart={cart}
          onAdd={(p: Product) => addToCart({ ...p, qty: 1 })}
          onRemove={removeFromCart}
          onCheckout={() => setScreen("cpf")}
          onThemeToggle={() => setThemeKey((k) => k === "dark" ? "light" : "dark")}
        />
      )}

      {screen === "cpf" && (
        <CpfScreen
          T={T}
          onNext={(c) => handleCpfDone(c)}
          onSkip={() => handleCpfDone(null)}
        />
      )}

      {screen === "payment" && orderRef && (
        <PaymentScreen
          T={T}
          cart={cart}
          total={cartTotal}
          cpf={cpf}
          orderRef={orderRef}
          onSuccess={handleSuccess}
          onRefused={() => setScreen("refused")}
          onBack={() => setScreen("catalog")}
        />
      )}

      {screen === "success" && completedOrder && (
        <SuccessScreen
          T={T}
          order={completedOrder}
          companyName={company?.name ?? "ordin"}
          onNew={newOrder}
        />
      )}

      {screen === "refused" && (
        <div style={{
          minHeight: "100vh",
          background: T.bg,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
        }}>
          <div style={{ fontSize: 56 }}>❌</div>
          <h2 style={{ color: T.text, fontSize: 26, fontWeight: 800, margin: 0 }}>
            Pagamento não autorizado
          </h2>
          <p style={{ color: T.muted }}>Verifique os dados do cartão e tente novamente</p>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={resetSession}
              style={{
                padding: "14px 28px",
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: 12,
                color: T.muted,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Cancelar
            </button>
            <button
              onClick={() => orderRef && setScreen("payment")}
              style={{
                padding: "14px 32px",
                background: T.btn,
                color: T.btnText,
                border: "none",
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: T.glow,
              }}
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
