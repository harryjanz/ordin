import { useEffect, useState, useCallback } from "react";
import type { Theme } from "../themes";
import { FONT, RADIUS } from "../scale";
import { OrdinSymbol } from "../assets/OrdinSymbol";
import api from "../api";
import { useStore } from "../store";
import { WsManager } from "../ws";
import { unlockAudio, chimeReady } from "../components/AudioFeedback";
import type { WsEvent, OrderSummary } from "../types";

const FONT_D = "'Lexend', sans-serif";
const FONT_B = "'Inter', sans-serif";

interface Props {
  T: Theme;
  companyId: number;
  companyName: string;
  prepUrgencyMinutes: number;
}

function label(o: OrderSummary) {
  return o.pickup_name || `#${o.order_ref.slice(-4)}`;
}

type UrgencyLevel = "none" | "orange" | "red";

// Laranja na metade do tempo configurado, vermelho ao passar — pedido do
// usuário (2026-08-24): dá pra equipe (e pro cliente vendo a TV) a sensação
// de que a demora é percebida, não ignorada.
function urgencyLevel(createdAt: string, prepUrgencyMinutes: number): UrgencyLevel {
  const elapsedMin = (Date.now() - new Date(createdAt).getTime()) / 60_000;
  if (elapsedMin >= prepUrgencyMinutes) return "red";
  if (elapsedMin >= prepUrgencyMinutes / 2) return "orange";
  return "none";
}

// ORD-119 — tela passiva (só leitura, sem toque), pensada pra rodar numa
// TV/tela grande visível pro salão. Fonte grande e alto contraste — vista a
// distância, não de perto como o resto do totem.
export default function PanelScreen({ T, companyId, companyName, prepUrgencyMinutes }: Props) {
  const { orders, setOrders, removeOrder, updateOrderStatus } = useStore();
  const [wsStatus, setWsStatus] = useState<"connected" | "connecting" | "disconnected">("connecting");

  // Força re-render periódico só pra cor de urgência avançar sozinha na
  // tela — TV roda sem interação nenhuma, sem isso a cor só mudaria quando
  // chegasse um evento de WS novo.
  const [, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(iv);
  }, []);

  // Item 1 da análise de concorrentes (2026-08-24) — alerta sonoro ao ficar
  // pronto, achado de mercado só na Mogo. Navegador bloqueia áudio sem
  // gesto prévio do usuário; numa TV isso pode nunca acontecer sozinho, daí
  // destravar no primeiro toque/clique que a tela receber (ex: durante a
  // instalação/teste do dispositivo).
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const loadOrders = useCallback(() => {
    api.get("/orders", { params: { status: "paid,ready", limit: 100 } })
      .then((r) => setOrders(r.data.orders ?? []))
      .catch(() => null);
  }, [setOrders]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const handleWsEvent = useCallback((event: WsEvent) => {
    // order.paid não carrega pickup_name no payload do evento (ver
    // broadcast_order_paid, services/order/websocket.py) — recarrega via
    // REST pra não mostrar "Pedido #..." por engano quando na verdade tem
    // nome informado.
    if (event.event === "order.paid") {
      loadOrders();
    }
    if (event.event === "order.ready" && event.order_ref) {
      updateOrderStatus(event.order_ref, "ready");
      chimeReady();
    }
    if (event.event === "order.completed" && event.order_ref) {
      removeOrder(event.order_ref);
    }
  }, [loadOrders, updateOrderStatus, removeOrder]);

  useEffect(() => {
    // Reconecta e revalida via REST antes de confiar só nos eventos — evita
    // ficar com dado desatualizado depois de uma queda de conexão (rede
    // instável, restart do order-service).
    const ws = new WsManager(companyId, handleWsEvent, (s) => {
      setWsStatus(s);
      if (s === "connected") loadOrders();
    });
    ws.connect();
    return () => ws.stop();
  }, [companyId, handleWsEvent, loadOrders]);

  // Mais antigos primeiro — quem espera há mais tempo fica no topo,
  // achado ao vivo (2026-08-24): a API devolve mais recente primeiro
  // (uso comum em telas de gestão), mas aqui é o oposto do que faz sentido.
  const byOldestFirst = (a: OrderSummary, b: OrderSummary) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  const preparing = orders.filter((o) => o.status === "paid").sort(byOldestFirst);
  const ready = orders.filter((o) => o.status === "ready").sort(byOldestFirst);

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", flexDirection: "column" }}>
      <div style={{
        background: T.header, padding: "20px 40px",
        display: "flex", alignItems: "center", gap: 16,
        borderBottom: `1px solid ${T.borderNeutral}`, boxShadow: T.cardShadow,
      }}>
        <OrdinSymbol size={32} color={T.roxo} />
        <div style={{ fontFamily: FONT_D, fontWeight: 900, fontSize: FONT.title, color: T.text }}>
          {companyName}
        </div>
        <div style={{
          marginLeft: "auto", display: "flex", alignItems: "center", gap: 8,
          fontFamily: FONT_B, fontSize: FONT.body, color: T.muted,
        }}>
          <span style={{
            width: 10, height: 10, borderRadius: "50%",
            background: wsStatus === "connected" ? T.successColor : wsStatus === "connecting" ? "#f2b705" : T.errorText,
            animation: wsStatus !== "connected" ? "pulse 1.5s ease-in-out infinite" : "none",
          }} />
          {wsStatus === "connected" ? "ao vivo" : wsStatus === "connecting" ? "conectando…" : "offline"}
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <Column title="Em preparo" items={preparing} T={T} accent={T.muted} prepUrgencyMinutes={prepUrgencyMinutes} />
        <div style={{ width: 1, background: T.borderNeutral }} />
        <Column title="Pronto para retirada" items={ready} T={T} accent={T.successColor} highlight />
      </div>
    </div>
  );
}

const URGENCY_COLOR: Record<UrgencyLevel, string | null> = {
  none: null,
  orange: "#f2994a",
  red: "#ff4d4d",
};

function Column({ title, items, T, accent, highlight, prepUrgencyMinutes }: {
  title: string; items: OrderSummary[]; T: Theme; accent: string; highlight?: boolean; prepUrgencyMinutes?: number;
}) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "32px 28px", overflowY: "auto" }}>
      <div style={{
        fontFamily: FONT_D, fontWeight: 800, fontSize: FONT.headline,
        color: accent, marginBottom: 28, textAlign: "center",
      }}>
        {title}
      </div>
      {items.length === 0 ? (
        <div style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          color: T.muted, fontFamily: FONT_B, fontSize: FONT.subtitle, textAlign: "center",
        }}>
          Nenhum pedido no momento
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 20 }}>
          {items.map((o) => {
            const level = prepUrgencyMinutes ? urgencyLevel(o.created_at, prepUrgencyMinutes) : "none";
            const urgencyColor = URGENCY_COLOR[level];
            return (
              <div
                key={o.order_ref}
                style={{
                  background: urgencyColor ? `${urgencyColor}22` : highlight ? T.roxoSubtle : T.surface,
                  border: `2px solid ${urgencyColor ?? (highlight ? T.roxo : T.borderNeutral)}`,
                  borderRadius: RADIUS.lg,
                  padding: "24px 16px",
                  textAlign: "center",
                  fontFamily: FONT_D,
                  fontWeight: 800,
                  fontSize: FONT.title,
                  color: T.text,
                  boxShadow: T.cardShadow,
                  animation: "fadeIn 0.3s ease",
                  wordBreak: "break-word",
                }}
              >
                {label(o)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
