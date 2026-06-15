import type { WsEvent } from "./types";

type Handler = (event: WsEvent) => void;

export class WsManager {
  private ws: WebSocket | null = null;
  private companyId: number;
  private handler: Handler;
  private onStatusChange: (s: "connected" | "connecting" | "disconnected") => void;
  private retryDelay = 1000;
  private stopped = false;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    companyId: number,
    handler: Handler,
    onStatusChange: (s: "connected" | "connecting" | "disconnected") => void
  ) {
    this.companyId = companyId;
    this.handler = handler;
    this.onStatusChange = onStatusChange;
  }

  connect() {
    if (this.stopped) return;
    this.onStatusChange("connecting");

    const proto = location.protocol === "https:" ? "wss" : "ws";
    this.ws = new WebSocket(`${proto}://${location.host}/ws/orders?company_id=${this.companyId}`);

    this.ws.onopen = () => {
      this.retryDelay = 1000;
      this.onStatusChange("connected");
      this.pingInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 25_000);
    };

    this.ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as WsEvent & { type?: string };
        if (data.type === "pong" || data.type === "heartbeat") return;
        if (data.event) this.handler(data);
      } catch { /* ignore malformed */ }
    };

    this.ws.onclose = () => {
      this.clearPing();
      if (this.stopped) return;
      this.onStatusChange("disconnected");
      const delay = Math.min(this.retryDelay, 30_000);
      this.retryDelay = Math.min(this.retryDelay * 2, 30_000);
      setTimeout(() => this.connect(), delay);
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private clearPing() {
    if (this.pingInterval) { clearInterval(this.pingInterval); this.pingInterval = null; }
  }

  stop() {
    this.stopped = true;
    this.clearPing();
    this.ws?.close();
  }
}
