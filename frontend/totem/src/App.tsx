import { useState, useEffect } from "react";
import api from "./api";
import { useStore } from "./store";
import { THEMES, type ThemeKey } from "./themes";
import SetupScreen from "./screens/SetupScreen";
import { getStoredTerminalId } from "./screens/DeviceSetupScreen";
import WelcomeScreen from "./screens/WelcomeScreen";
import CatalogScreen from "./screens/CatalogScreen";
import CpfScreen from "./screens/CpfScreen";
import PaymentScreen from "./screens/PaymentScreen";
import SuccessScreen from "./screens/SuccessScreen";
import type { CompanyInfo, TerminalInfo, Product, CompletedOrder } from "./types";

const INACTIVITY_TIMEOUT_MS = 120_000;
const INACTIVITY_WARN_SEC   = 10;

export default function App() {
  const [themeKey, setThemeKey] = useState<ThemeKey>("light");
  const T = THEMES[themeKey];

  const {
    company, terminal, cart, cpf, completedOrder, screen,
    setToken, setCompany, setTerminal, setScreen,
    addToCart, removeFromCart, setCpf, setCompletedOrder,
    newOrder, goIdle, resetSession, touch,
  } = useStore();

  const savedTerminalId = getStoredTerminalId();
  const [orderRef, setOrderRef] = useState<string | null>(null);
  const [warnCountdown, setWarnCountdown] = useState(0);
  const [showInactivityModal, setShowInactivityModal] = useState(false);

  // ── inatividade — apenas nas telas do fluxo do cliente ───────────────────
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
        goIdle();
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
    setScreen("welcome");
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

  // ── heartbeat — ativo em "welcome" e "catalog" (terminal em uso) ──────────
  useEffect(() => {
    if ((screen !== "catalog" && screen !== "welcome") || !company || !terminal) return;
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
            maxWidth: 380,
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⏱️</div>
            <h3 style={{ color: T.text, fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
              Ainda está aí?
            </h3>
            <p style={{ color: T.muted, fontSize: 15, marginBottom: 24 }}>
              O pedido será cancelado em{" "}
              <strong style={{ color: T.roxo }}>{warnCountdown}s</strong>
            </p>
            <button
              onClick={() => { touch(); setShowInactivityModal(false); }}
              style={{
                padding: "0 40px",
                minHeight: 64,
                background: T.btn,
                color: T.btnText,
                border: "none",
                borderRadius: 999,
                fontSize: 18,
                fontWeight: 800,
                fontFamily: "'Lexend', sans-serif",
                cursor: "pointer",
                boxShadow: T.glow,
              }}
            >
              Continuar
            </button>
          </div>
        </div>
      )}

      {screen === "welcome" && (
        <WelcomeScreen
          T={T}
          themeKey={themeKey}
          companyName={company?.name ?? "ordin"}
          onStart={() => setScreen("catalog")}
          onThemeToggle={() => setThemeKey((k) => k === "dark" ? "light" : "dark")}
        />
      )}

      {screen === "catalog" && (
        <CatalogScreen
          T={T}
          companyName={company?.name ?? ""}
          cart={cart}
          onAdd={(p: Product) => addToCart({ ...p, qty: 1 })}
          onRemove={removeFromCart}
          onCheckout={() => setScreen("cpf")}
          onHome={goIdle}
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
          <h2 style={{ color: T.text, fontSize: 28, fontWeight: 800, margin: 0 }}>
            Pagamento não autorizado
          </h2>
          <p style={{ color: T.muted, fontSize: 16 }}>Verifique os dados do cartão e tente novamente</p>
          <div style={{ display: "flex", gap: 14 }}>
            <button
              onClick={goIdle}
              style={{
                padding: "0 32px",
                minHeight: 60,
                background: T.surface,
                border: `1px solid ${T.borderNeutral}`,
                borderRadius: 999,
                color: T.muted,
                cursor: "pointer",
                fontFamily: "'Lexend', sans-serif",
                fontWeight: 700,
                fontSize: 16,
              }}
            >
              Cancelar
            </button>
            <button
              onClick={() => orderRef && setScreen("payment")}
              style={{
                padding: "0 40px",
                minHeight: 60,
                background: T.btn,
                color: T.btnText,
                border: "none",
                borderRadius: 999,
                fontFamily: "'Lexend', sans-serif",
                fontSize: 17,
                fontWeight: 800,
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
