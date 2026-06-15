import apiClient from "./client";

export interface OverviewStats {
  total_customers: number;
  total_orders: number;
  total_revenue: number;
  active_campaigns: number;
  completed_campaigns: number;
  avg_delivery_rate: number;
  attributed_revenue_30d: number;
}

export const analyticsApi = {
  overview: () =>
    apiClient.get<{ data: OverviewStats; meta: Record<string, unknown> }>("/analytics/overview"),
};
