import apiClient from "./client";

// ── Types ────────────────────────────────────────────────────────────────────

export interface DraftMessageRequest {
  segment_id: string;
  channel: string;
  tone?: string;
}

export interface DraftMessageResponse {
  data: { message: string };
  meta: Record<string, unknown>;
}

export interface InsightsResponse {
  data: { summary: string; recommendations: string[] };
  meta: Record<string, unknown>;
}

/**
 * SSE event types emitted by POST /ai/agent/chat
 * Raw SSE chunks are parsed immediately into these typed shapes.
 */
export type AgentEvent =
  | { type: "tool_call";            name: string; arguments: Record<string, unknown> }
  | { type: "tool_result";          name: string; result: unknown }
  | { type: "text_delta";           content: string }
  | { type: "done";                 message: string }
  | { type: "pending_confirmation"; campaign_id: string; message: string }
  | { type: "error";                message: string };

// ── API calls ─────────────────────────────────────────────────────────────────

export const aiApi = {
  draftMessage: (req: DraftMessageRequest) =>
    apiClient.post<DraftMessageResponse>("/ai/draft-message", req),

  insights: (campaignId: string) =>
    apiClient.get<InsightsResponse>(`/ai/insights/${campaignId}`),

  /**
   * Opens an SSE stream for the agent chat endpoint.
   * Returns the raw Response so the caller can consume response.body as a ReadableStream.
   * We use fetch directly (not axios) because axios doesn't support streaming.
   */
  agentChatStream: async (
    message: string,
    conversationId?: string,
    confirm?: boolean
  ): Promise<Response> => {
    const token = (await import("@/stores/auth")).useAuthStore.getState().token;
    return fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1"}/ai/agent/chat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message, conversation_id: conversationId, confirm }),
      }
    );
  },
};
