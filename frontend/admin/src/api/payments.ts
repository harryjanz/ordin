import api from "../api";
import type { Transaction } from "../types";

export interface PaymentListFilters {
  companyId?: number;
  dateFrom?: string;
  dateTo?: string;
  provider?: string;
  status?: string;
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
  return params;
}

export async function listPayments(filters: PaymentListFilters): Promise<{ items: Transaction[]; total: number }> {
  const r = await api.get<{ items: Transaction[]; total: number }>("/payments", {
    params: buildPaymentListQuery(filters),
  });
  return r.data;
}
