import api from "../api";
import type { Order, OrderStatusSummary, PrepStats, Ticket } from "../types";

export interface OrderListFilters {
  companyId?: number;
  orderRef?: string;
  cpf?: string;
  dateFrom?: string;
  dateTo?: string;
  hourFrom?: string;
  hourTo?: string;
  status?: string;
  skip?: number;
  limit?: number;
}

// Função pura — monta os query params a partir do estado de filtro da tela
// de Pedidos (ORD-081), mesmo padrão de buildPaymentListQuery.
export function buildOrderListQuery(filters: OrderListFilters): Record<string, string | number> {
  const params: Record<string, string | number> = {
    skip: filters.skip ?? 0,
    limit: filters.limit ?? 50,
  };
  if (filters.companyId) params.company_id = filters.companyId;
  if (filters.orderRef) params.order_ref = filters.orderRef;
  if (filters.cpf) params.cpf = filters.cpf;
  if (filters.dateFrom) params.date_from = filters.dateFrom;
  if (filters.dateTo) params.date_to = filters.dateTo;
  // hour_from/hour_to só têm efeito no backend com date_from setado — o
  // frontend já desabilita os campos até "De" ser preenchido, mas não
  // custa nada não mandar o parâmetro à toa.
  if (filters.dateFrom && filters.hourFrom) params.hour_from = filters.hourFrom;
  if (filters.dateFrom && filters.hourTo) params.hour_to = filters.hourTo;
  if (filters.status) params.status = filters.status;
  return params;
}

export interface OrderListResult {
  items: Order[];
  total: number;
  summary: OrderStatusSummary;
}

export async function listOrders(filters: OrderListFilters): Promise<OrderListResult> {
  const r = await api.get<{ orders: Order[]; total: number; summary: OrderStatusSummary }>("/orders", {
    params: buildOrderListQuery(filters),
  });
  return { items: r.data.orders, total: r.data.total, summary: r.data.summary };
}

export async function listOrderTickets(orderRef: string): Promise<Ticket[]> {
  const r = await api.get<{ tickets: Ticket[] }>(`/orders/${orderRef}/tickets`);
  return r.data.tickets ?? [];
}

// ORD-119 (item 3, análise de concorrentes 2026-08-24) — tempo médio de
// preparo / gargalo por hora, últimas 24h por padrão (sem date_from).
// dateFrom (ISO) permite janelas menores — usado pelos indicadores de
// saúde da operação (últimos 30min/60min, melhorias de UX 2026-08-24).
export async function getPrepStats(companyId?: number, dateFrom?: string): Promise<PrepStats> {
  const params: Record<string, string | number> = {};
  if (companyId) params.company_id = companyId;
  if (dateFrom) params.date_from = dateFrom;
  const r = await api.get<PrepStats>("/orders/prep-stats", { params });
  return r.data;
}
