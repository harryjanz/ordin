export type Role = "admin" | "owner" | "manager" | "cashier";

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  userId: number | null;
  companyId: number | null;
  role: Role | null;
}

export interface Company {
  id: number;
  name: string;
  slug: string;
  plan: string;
  active: boolean;
}

export interface Terminal {
  id: number;
  company_id: number;
  label: string;
  active: boolean;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  active: boolean;
}

export interface Category {
  id: number;
  company_id: number;
  name: string;
  active: boolean;
  sort_order: number;
}

export interface Product {
  id: number;
  company_id: number;
  category_id: number;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  active: boolean;
  sort_order: number;
}

export interface Order {
  order_ref: string;
  status: string;
  total: number;
  terminal_id: number;
  created_at: string;
  tickets_total: number;
  tickets_collected: number;
}

export interface Ticket {
  ticket_code: string;
  status: string;
  unit_number: number;
  total_units: number;
  collected_at: string | null;
  collected_by: string | null;
}

export interface Transaction {
  id: number;
  order_ref: string;
  method: string;
  amount: number;
  status: string;
  provider: string;
  nsu: string | null;
  authorization: string | null;
  created_at: string;
}
