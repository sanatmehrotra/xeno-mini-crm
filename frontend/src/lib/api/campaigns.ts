import apiClient from "./client";

export type CampaignStatus = "draft" | "running" | "completed" | "failed";
export type CampaignChannel = "email" | "sms" | "whatsapp" | "rcs";

export interface Campaign {
  id: string;
  name: string;
  segment_id: string;
  segment_name?: string;
  channel: CampaignChannel;
  message_template: string;
  status: CampaignStatus;
  created_at: string;
  updated_at: string;
  launched_at: string | null;
  completed_at: string | null;
}

export interface CampaignAnalytics {
  campaign_id: string;
  total_sent: number;
  funnel: {
    queued: number;
    sent: number;
    delivered: number;
    opened: number;
    read: number;
    clicked: number;
    failed: number;
  };
  attribution: {
    orders_count: number;
    revenue: number;
    attributed_customers: { customer_id: string; name: string; order_amount: number }[];
  };
}

export const campaignsApi = {
  list: () =>
    apiClient.get<{ data: Campaign[]; meta: Record<string, unknown> }>("/campaigns"),

  get: (id: string) =>
    apiClient.get<{ data: Campaign; meta: Record<string, unknown> }>(`/campaigns/${id}`),

  create: (payload: {
    name: string;
    segment_id: string;
    channel: CampaignChannel;
    message_template: string;
  }) =>
    apiClient.post<{ data: Campaign; meta: Record<string, unknown> }>("/campaigns", payload),

  launch: (id: string) =>
    apiClient.post(`/campaigns/${id}/launch`),

  analytics: (id: string) =>
    apiClient.get<{ data: CampaignAnalytics; meta: Record<string, unknown> }>(
      `/campaigns/${id}/analytics`
    ),

  delete: (id: string) => apiClient.delete(`/campaigns/${id}`),
};
