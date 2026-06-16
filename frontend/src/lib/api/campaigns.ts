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
  total_recipients: number;
  // Delivery funnel — flat fields (no nested object)
  queued: number;
  sent: number;
  delivered: number;
  opened: number;
  read: number;
  clicked: number;
  failed: number;
  delivery_rate: number;
  open_rate: number;
  click_rate: number;
  // Attribution — flat fields
  attributed_orders: number;
  attributed_revenue: number;
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
