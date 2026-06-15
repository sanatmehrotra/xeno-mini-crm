import apiClient from "./client";

// ── Types ──────────────────────────────────────────────────────────────────

/** A single condition: { field, op, value } */
export interface RuleCondition {
  field: string;
  op: string;
  value: string | number | string[];
}

/** A compound group: { operator, conditions } — conditions can be RuleCondition or RuleGroup */
export interface RuleGroup {
  operator: "AND" | "OR";
  conditions: (RuleCondition | RuleGroup)[];
}

export type SegmentRule = RuleCondition | RuleGroup;

export interface Segment {
  id: string;
  name: string;
  rules: SegmentRule;
  member_count: number;
  last_computed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SegmentPreviewResponse {
  data: { count: number; sample: { id: string; name: string; email: string; total_spent: number }[] };
  meta: Record<string, unknown>;
}

// ── Field & op definitions — MUST match backend compile_rules() exactly ───
// Backend ALLOWED_DIRECT_FIELDS: total_spent, order_count
// Backend special fields: days_since_last_purchase, days_since_first_purchase, tags
// Backend JSONB fields: attributes.<key>  (city, tier, acquisition_channel)
// Backend ALLOWED_OPS: eq, neq, gt, gte, lt, lte, in, contains, between

export const SEGMENT_FIELDS = [
  { value: "total_spent",               label: "Total Spent (₹)" },
  { value: "order_count",               label: "Order Count" },
  { value: "days_since_last_purchase",  label: "Days Since Last Purchase" },
  { value: "days_since_first_purchase", label: "Days Since First Purchase" },
  { value: "attributes.city",           label: "City" },
  { value: "attributes.tier",           label: "Tier" },
  { value: "attributes.acquisition_channel", label: "Acquisition Channel" },
  { value: "tags",                      label: "Tag" },
] as const;

export const SEGMENT_OPS = [
  { value: "eq",       label: "is" },
  { value: "neq",      label: "is not" },
  { value: "gt",       label: "greater than" },
  { value: "gte",      label: "at least" },
  { value: "lt",       label: "less than" },
  { value: "lte",      label: "at most" },
  { value: "in",       label: "is one of" },
  { value: "contains", label: "contains" },
] as const;

// ── Value hints for categorical fields ─────────────────────────────────────

export const FIELD_VALUE_HINTS: Record<string, string[]> = {
  "attributes.city":  ["Mumbai", "Delhi", "Bangalore", "Chennai", "Hyderabad", "Pune", "Kolkata", "Ahmedabad"],
  "attributes.tier":  ["bronze", "silver", "gold", "platinum"],
  "attributes.acquisition_channel": ["organic", "paid_instagram", "paid_google", "referral", "influencer"],
  "tags": ["vip", "repeat_buyer", "lapsed", "new", "high_value", "coffee_lover", "gifter", "bulk_buyer"],
};

// ── API calls ──────────────────────────────────────────────────────────────

export const segmentsApi = {
  list: () =>
    apiClient.get<{ data: Segment[]; meta: Record<string, unknown> }>("/segments"),

  get: (id: string) =>
    apiClient.get<{ data: Segment; meta: Record<string, unknown> }>(`/segments/${id}`),

  preview: (rules: SegmentRule) =>
    apiClient.post<SegmentPreviewResponse>("/segments/preview", { rules }),

  fromNL: (query: string) =>
    apiClient.post<{ data: { rules: SegmentRule; description: string }; meta: Record<string, unknown> }>(
      "/segments/from-nl",
      { query }
    ),

  create: (name: string, rules: SegmentRule) =>
    apiClient.post<{ data: Segment; meta: Record<string, unknown> }>("/segments", { name, rules }),

  delete: (id: string) => apiClient.delete(`/segments/${id}`),
};
