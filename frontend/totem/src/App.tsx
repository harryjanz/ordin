import { useEffect, Component } from "react";
import { XCircle } from "lucide-react";
import type { ReactNode } from "react";
import api from "./api";
import { useStore } from "./store";
import { resolveTheme } from "./themes";
import SetupScreen from "./screens/SetupScreen";
import { getStoredTerminalId } from "./screens/DeviceSetupScreen";
import WelcomeScreen from "./screens/WelcomeScreen";
import CatalogScreen from "./screens/CatalogScreen";
import ConsumptionTypeScreen from "./screens/ConsumptionTypeScreen";
import CpfScreen from "./screens/CpfScreen";
import PickupNameScreen from "./screens/PickupNameScreen";
import PaymentScreen from "./screens/PaymentScreen";
import PIXPaymentScreen from "./screens/PIXPaymentScreen";
import SuccessScreen from "./screens/SuccessScreen";
import { useState } from "react";
import type { CompanyInfo, TerminalInfo, CartItem, CompletedOrder, ConsumptionType } from "./types";

class PixErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(e: unknown) {
    return { error: String(e) };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24 }}>
          <div style={{ fontSize: 48 }}>⚠️</div>
          <h2 style={{ color: "#c00", margin: 0 }}>Erro ao exibir tela PIX</h2>
          <pre style={{ background: "#fee", padding: 16, borderRadius: 8, fontSize: 12, maxWidth: 400, wordBreak: "break-all" }}>{this.state.error}</pre>
          <button onClick={() => this.setState({ error: null })} style={{ padding: "12px 32px", background: "#c00", color: "#fff", border: "none", borderRadius: 8, fontSize: 16, cursor: "pointer" }}>
            Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ORD-158 — fallback só pra dado antigo em cache do zustand persist (de
// antes desta história); depois de um pareamento novo o valor real da
// empresa sempre vem preenchido pela migration (default 5 min / 30s).
const DEFAULT_INACTIVITY_TIMEOUT_MIN = 5;
const DEFAULT_INACTIVITY_WARN_SEC = 30;

export default function App() {
  const {
    company, terminal, cart, cpf, consumptionType, completedOrder, screen,
    setToken, setCompany, setTerminal, setScreen,
    addToCart, removeFromCart, setCpf, setConsumptionType, setCompletedOrder,
    newOrder, goIdle, resetSession, touch,
  } = useStore();

  // Tema derivado da empresa — sem estado local; padrão ordin light antes do login
  const T = resolveTheme(
    company?.visual_theme ?? "ordin",
    company?.visual_mode  ?? "light",
  );

  const savedTerminalId = getStoredTerminalId();
  const [orderRef, setOrderRef] = useState<string | null>(null);
  // ORD-119 — mesmo motivo do consumptionTypeOverride acima: guarda o tipo
  // escolhido antes de passar pela tela de nome de retirada, pra não perder
  // o valor entre a navegação e a chamada de handleCpfDone.
  const [pendingConsumptionType, setPendingConsumptionType] = useState<ConsumptionType | null>(null);
  const [pixData, setPixData] = useState<{
    transactionId: number; qrCodeBase64: string;
  } | null>(null);
  const [refusedMethod, setRefusedMethod] = useState<string>("");
  const [warnCountdown, setWarnCountdown] = useState(0);
  const [showInactivityModal, setShowInactivityModal] = useState(false);

  // ── inatividade — apenas nas telas do fluxo do cliente ───────────────────
  const watchedScreens = ["catalog", "cpf", "payment"];

  // ORD-158 — vem da empresa pareada (configurável no admin), com fallback
  // pro default só em caso de dado antigo sem esses campos ainda.
  const inactivityTimeoutMs = (company?.inactivity_timeout_min ?? DEFAULT_INACTIVITY_TIMEOUT_MIN) * 60_000;
  const inactivityWarnSec = company?.inactivity_warn_sec ?? DEFAULT_INACTIVITY_WARN_SEC;

  useEffect(() => {
    if (!watchedScreens.includes(screen)) {
      setShowInactivityModal(false);
      return;
    }

    const interval = setInterval(() => {
      const idle = Date.now() - useStore.getState().lastActivity;
      if (idle >= inactivityTimeoutMs) {
        setShowInactivityModal(false);
        goIdle();
      } else if (idle >= inactivityTimeoutMs - inactivityWarnSec * 1000) {
        setWarnCountdown(Math.ceil((inactivityTimeoutMs - idle) / 1000));
        setShowInactivityModal(true);
      } else {
        setShowInactivityModal(false);
      }
    }, 500);

    // Investigação (2026-09-03) — instrumentado com console.log temporário e
    // confirmado que touch() disparava corretamente a cada clique real; o
    // "timer insiste em aparecer" que o usuário via testando no navegador
    // era rolagem/hover de mouse sem clicar em nada — click/touchstart/
    // keydown não cobrem isso. scroll/wheel/mousemove adicionados (mousemove
    // com throttle de 1s, senão dispara a cada pixel e o touch() vira
    // trabalho desperdiçado); mousemove não existe em touchscreen real, mas
    // não faz mal deixar — só nunca dispara lá.
    let lastMouseMoveTouch = 0;
    const handler = () => touch();
    const throttledMouseHandler = () => {
      const now = Date.now();
      if (now - lastMouseMoveTouch > 1000) {
        lastMouseMoveTouch = now;
        touch();
      }
    };
    ["click", "touchstart", "keydown", "scroll", "wheel"].forEach((ev) => window.addEventListener(ev, handler));
    window.addEventListener("mousemove", throttledMouseHandler);

    return () => {
      clearInterval(interval);
      ["click", "touchstart", "keydown", "scroll", "wheel"].forEach((ev) => window.removeEventListener(ev, handler));
      window.removeEventListener("mousemove", throttledMouseHandler);
    };
  }, [screen, inactivityTimeoutMs, inactivityWarnSec]);

  // ── handlers ─────────────────────────────────────────────────────────────

  function handlePinSuccess(co: CompanyInfo, term: TerminalInfo, token: string) {
    setToken(token);
    setCompany(co);
    setTerminal(term);
    setScreen("welcome");
  }

  // `consumptionTypeOverride` existe porque, ao pular a tela de CPF direto da
  // ConsumptionTypeScreen, o store ainda não re-renderizou com o valor recém
  // selecionado (setConsumptionType é assíncrono) — sem o override, o pedido
  // sairia com o consumption_type da renderização anterior (null).
  async function handleCpfDone(c: string | null, consumptionTypeOverride?: ConsumptionType | null, pickupName?: string | null) {
    setCpf(c);
    try {
      // ORD-150 — combo explode em N itens normais (preço real de cada
      // componente, igual um produto avulso) e a economia vira o `discount`
      // do pedido — campo já existente, sem migration no order-service (ver
      // achado técnico da Tech Explorer). Arredonda a economia POR UNIDADE
      // antes de multiplicar por qty, senão pedidos com 2+ do mesmo combo
      // podem fechar com 1 centavo de diferença.
      const items: { product_id: number; name: string; qty: number; unit_price: number; selected_options?: { group_name: string; option_label: string; price_delta: number }[] }[] = [];
      let comboDiscount = 0;
      for (const line of cart) {
        if (line.kind === "combo" && line.comboItems) {
          const comboSum = line.comboItems.reduce((s, ci) => s + ci.price, 0);
          const savingsPerUnit = Math.round((comboSum - line.price) * 100) / 100;
          comboDiscount += savingsPerUnit * line.qty;
          for (const ci of line.comboItems) {
            // ORD-159 (pendência registrada) — item de combo nunca carrega
            // opção escolhida, addComboToCart não oferece seleção ainda.
            items.push({ product_id: ci.product_id, name: `${ci.name} (${line.name})`, qty: line.qty, unit_price: ci.price });
          }
        } else {
          items.push({
            product_id: line.id, name: line.name, qty: line.qty, unit_price: line.price,
            selected_options: line.selectedOptions?.map((o) => ({
              group_name: o.group_name, option_label: o.option_label, price_delta: o.price_delta,
            })),
          });
        }
      }
      const res = await api.post("/orders", {
        items,
        discount: comboDiscount,
        cpf: c || null,
        consumption_type: consumptionTypeOverride !== undefined ? consumptionTypeOverride : consumptionType,
        pickup_name: pickupName || null,
      });
      setOrderRef(res.data.order_ref);
      setScreen("payment");
    } catch {
      setScreen("catalog");
    }
  }

  function handleSuccess(order: CompletedOrder) {
    setCompletedOrder(order);
    setPixData(null);
    setScreen("success");
  }

  function handlePix(data: { transactionId: number; qrCode: string; qrCodeBase64: string }) {
    setPixData({ transactionId: data.transactionId, qrCodeBase64: data.qrCodeBase64 });
    setScreen("pix");
  }

  async function handlePixSuccess() {
    if (!orderRef) return;
    const ticketsRes = await api.get(`/orders/${orderRef}/tickets`).catch(() => ({ data: { tickets: [], order_qr_data: null } }));
    const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
    handleSuccess({
      order_ref: orderRef,
      total,
      method: "pix",
      nsu: null,
      provider: "mock",
      tickets: ticketsRes.data.tickets ?? [],
      order_qr_data: ticketsRes.data.order_qr_data ?? null,
    });
  }

  function handlePixCancel() {
    setPixData(null);
    goIdle();
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
          companyName={company?.name ?? "ordin"}
          companyId={company?.id ?? null}
          onStart={() => setScreen("catalog")}
        />
      )}

      {screen === "catalog" && (
        <CatalogScreen
          T={T}
          companyName={company?.name ?? ""}
          menuLayout={company?.catalog_menu_layout ?? "horizontal"}
          cart={cart}
          onAdd={(item: CartItem) => addToCart(item)}
          onRemove={removeFromCart}
          onCheckout={() => {
            if (company?.consumption_mode_enabled) setScreen("consumption");
            else if (company?.fulfillment_mode === "retirada_unica") setScreen("pickup");
            else handleCpfDone(null);
          }}
          onHome={goIdle}
        />
      )}

      {screen === "consumption" && (
        <ConsumptionTypeScreen
          T={T}
          onSelect={(type) => {
            setConsumptionType(type);
            if (company?.fulfillment_mode === "retirada_unica") {
              setPendingConsumptionType(type);
              setScreen("pickup");
            } else {
              handleCpfDone(null, type);
            }
          }}
          onBack={() => setScreen("catalog")}
        />
      )}

      {/* ORD-119 — só no modelo de retirada única; nome opcional pra
          identificar o pedido no painel de retirada. */}
      {screen === "pickup" && (
        <PickupNameScreen
          T={T}
          onNext={(name) => handleCpfDone(null, pendingConsumptionType ?? undefined, name)}
          onBack={() => setScreen(company?.consumption_mode_enabled ? "consumption" : "catalog")}
        />
      )}

      {/* Tela pulada por ora (nenhuma navegação leva a "cpf" hoje) — CPF na
          nota só faz sentido junto da emissão de NFC-e, ainda não
          implementada (ver estudo em docs/estudo-nfce.md). Componente
          mantido de propósito pra reativar quando o módulo fiscal existir. */}
      {screen === "cpf" && (
        <CpfScreen
          T={T}
          onNext={(c) => handleCpfDone(c)}
          onSkip={() => handleCpfDone(null)}
          onBack={() => setScreen(company?.consumption_mode_enabled ? "consumption" : "catalog")}
        />
      )}

      {screen === "payment" && orderRef && (
        <PaymentScreen
          T={T}
          cart={cart}
          total={cartTotal}
          cpf={cpf}
          orderRef={orderRef}
          paymentProvider={terminal?.payment_provider}
          onSuccess={handleSuccess}
          onRefused={(m) => { setRefusedMethod(m); setScreen("refused"); }}
          onPix={handlePix}
          onBack={() => setScreen("catalog")}
        />
      )}

      {screen === "pix" && orderRef && (
        <PixErrorBoundary>
          {pixData ? (
            <PIXPaymentScreen
              T={T}
              transactionId={pixData.transactionId}
              qrCodeBase64={pixData.qrCodeBase64}
              amount={cartTotal}
              orderRef={orderRef}
              onSuccess={handlePixSuccess}
              onCancel={handlePixCancel}
            />
          ) : (
            <div style={{ minHeight: "100vh", background: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <p style={{ color: "#666", fontSize: 16 }}>Carregando PIX…</p>
            </div>
          )}
        </PixErrorBoundary>
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
          background: T.radial,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px 0",
        }}>
          <div style={{ width: "min(680px, 92vw)", display: "flex", flexDirection: "column", alignItems: "center", gap: 24, textAlign: "center" }}>
            <XCircle size={100} color={T.errorText} strokeWidth={1.2} />
            <h2 style={{ color: T.text, fontFamily: "'Lexend', sans-serif", fontSize: 52, fontWeight: 800, margin: 0 }}>
              {refusedMethod === "pix" ? "Erro ao gerar PIX" : "Pagamento não autorizado"}
            </h2>
            <p style={{ color: T.muted, fontFamily: "'Inter', sans-serif", fontSize: 22, margin: 0, lineHeight: 1.5 }}>
              {refusedMethod === "pix"
                ? "Não foi possível gerar o QR Code PIX.\nTente novamente ou escolha outra forma de pagamento."
                : "Pagamento recusado pelo terminal.\nVerifique o cartão e tente novamente."}
            </p>
            <div style={{ display: "flex", gap: 12, width: "100%", marginTop: 8 }}>
              <button
                onClick={goIdle}
                style={{
                  padding: "0 28px", height: 88, flexShrink: 0,
                  background: T.surface, border: `1.5px solid ${T.border}`,
                  borderRadius: 12, color: T.text, cursor: "pointer",
                  fontFamily: "'Lexend', sans-serif", fontWeight: 700, fontSize: 20,
                  textTransform: "uppercase", letterSpacing: 1,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => orderRef && setScreen("payment")}
                style={{
                  flex: 1, height: 88,
                  background: T.btn, color: T.btnText,
                  border: "none", borderRadius: 12,
                  fontFamily: "'Lexend', sans-serif", fontSize: 22,
                  fontWeight: 800, cursor: "pointer", boxShadow: T.glow,
                  textTransform: "uppercase", letterSpacing: 1,
                }}
              >
                Tentar novamente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
