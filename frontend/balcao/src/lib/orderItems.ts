import api from "../api";
import type { Ticket } from "../types";

export interface OrderItemSummary {
  name: string;
  qty: number;
}

// ORD-122 — resumo dos itens de um pedido, pra exibir no detalhe e na
// confirmação de coleta (informação operacional que faltava — só o código
// do ticket não diz o que tem no pedido). tickets tem 1 linha por unidade
// (qty=2 -> 2 tickets, mesmo padrão do ticket compacto do totem, ORD-118)
// — só a unidade 1 de cada item representa a linha, senão duplica.
export function summarizeItems(tickets: Ticket[]): OrderItemSummary[] {
  return tickets
    .filter((t) => t.unit_number === 1)
    .map((t) => ({
      name: t.qr_data.split("|")[1] ?? "Item",
      qty: t.total_units,
    }));
}

export async function fetchOrderItems(orderRef: string): Promise<OrderItemSummary[]> {
  const r = await api.get(`/orders/${orderRef}/tickets`);
  const tickets: Ticket[] = r.data.tickets ?? [];
  return summarizeItems(tickets);
}
