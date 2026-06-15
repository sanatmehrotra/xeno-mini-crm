import apiClient from "./client";

export interface Customer {
  id: string;
  external_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  total_spent: number;
  order_count: number;
  first_purchase_at: string | null;
  last_purchase_at: string | null;
  attributes: {
    city?: string;
    tier?: string;
    gender?: string;
    acquisition_channel?: string;
    [key: string]: string | undefined;
  };
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface CustomersListResponse {
  data: Customer[];
  meta: { page: number; per_page: number; total: number };
}

export interface CustomerDetailResponse {
  data: Customer & { recent_orders: Order[] };
  meta: Record<string, unknown>;
}

export interface Order {
  id: string;
  external_id: string | null;
  amount: number;
  items: { name: string; qty: number; price: number }[];
  channel: string;
  status: string;
  ordered_at: string;
}

export const customersApi = {
  list: (params: {
    page?: number;
    limit?: number;
    search?: string;
    sort_by?: string;
    order?: "asc" | "desc";
    city?: string;
    tier?: string;
  }) => apiClient.get<CustomersListResponse>("/customers", { params }),

  get: (id: string) =>
    apiClient.get<CustomerDetailResponse>(`/customers/${id}`),

  import: (customers: Partial<Customer>[]) =>
    apiClient.post("/customers/import", customers),
};
