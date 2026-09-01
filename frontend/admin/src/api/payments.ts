import api from "../api";
import type { AnalyticsGranularity, PaymentAnalytics, PaymentStatusSummary, Transaction } from "../types";

export interface PaymentListFilters {
  companyId?: number;
  dateFrom?: string;
  dateTo?: string;
  provider?: string;
  status?: string;
  environment?: string;
  skip?: number;
  limit?: number;
}

// Função pura — monta os query params a partir do estado de filtro da tela
// de Transações (ORD-077), mesmo padrão de buildCompanyListQuery.
export function buildPaymentListQuery(filters: PaymentListFilters): Record<string, string | number> {
  const params: Record<string, string | number> = {
    skip: filters.skip ?? 0,
    limit: filters.limit ?? 50,
  };
  if (filters.companyId) params.company_id = filters.companyId;
  if (filters.dateFrom) params.date_from = filters.dateFrom;
  if (filters.dateTo) params.date_to = filters.dateTo;
  if (filters.provider) params.provider = filters.provider;
  if (filters.status) params.status = filters.status;
  if (filters.environment) params.environment = filters.environment;
  return params;
}

export interface PaymentListResult {
  items: Transaction[];
  total: number;
  summary: PaymentStatusSummary;
}

export async function listPayments(filters: PaymentListFilters): Promise<PaymentListResult> {
  const r = await api.get<PaymentListResult>("/payments", {
    params: buildPaymentListQuery(filters),
  });
  return r.data;
}

export interface PaymentAnalyticsFilters {
  companyId?: number;
  dateFrom: string;
  dateTo: string;
  granularity: AnalyticsGranularity;
}

export async function getPaymentsAnalytics(filters: PaymentAnalyticsFilters): Promise<PaymentAnalytics> {
  const params: Record<string, string | number> = {
    date_from: filters.dateFrom,
    date_to: filters.dateTo,
    granularity: filters.granularity,
  };
  if (filters.companyId) params.company_id = filters.companyId;
  const r = await api.get<PaymentAnalytics>("/payments/analytics", { params });
  return r.data;
}

export interface CancelPaymentPayload {
  reason: string;
}

export async function cancelPayment(id: number, payload: CancelPaymentPayload): Promise<void> {
  await api.post(`/payments/${id}/cancel`, payload);
}

// ORD-147 — reembolso real (pós-captura), exclusivo Mercado Pago. Endpoint
// dedicado, não reaproveita /cancel: são operações semanticamente diferentes.
export interface RefundPaymentPayload {
  reason: string;
}

export async function refundPayment(id: number, payload: RefundPaymentPayload): Promise<void> {
  await api.post(`/payments/${id}/refund`, payload);
}
