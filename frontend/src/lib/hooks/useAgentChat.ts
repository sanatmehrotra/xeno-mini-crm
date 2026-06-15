"use client";
/**
 * useAgentChat — manages the AI co-pilot conversation.
 *
 * Uses fetch + ReadableStream to consume SSE from POST /ai/agent/chat.
 * Parses each chunk immediately into a typed AgentEvent.
 * On tool_result events that correspond to mutations, invalidates the
 * relevant TanStack Query keys so the dashboard reflects changes.
 */
import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { aiApi, AgentEvent } from "@/lib/api/ai";

export type MessageRole = "user" | "assistant";

export interface ToolCallChip {
  name: string;
  args?: Record<string, unknown>;
  result?: unknown;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  toolCalls?: ToolCallChip[];
  // If the agent wants confirmation before launching
  pendingConfirmation?: { campaign_id: string; message: string };
  streaming?: boolean;
}

// Tool names that mutate backend data → invalidate queries on result
const MUTATION_TOOLS = new Set(["create_segment", "launch_campaign", "create_campaign"]);

export function useAgentChat() {
  const qc = useQueryClient();
  const [messages, setMessages]     = useState<ChatMessage[]>([]);
  const [conversationId, setConvId] = useState<string | undefined>(undefined);
  const [loading, setLoading]       = useState(false);

  const sendMessage = useCallback(
    async (text: string, confirm?: boolean) => {
      // Add user message to state
      const userMsg: ChatMessage = {
        id: Date.now().toString(),
        role: "user",
        text,
      };
      setMessages((prev) => [...prev, userMsg]);

      // Placeholder streaming assistant message
      const assistantId = (Date.now() + 1).toString();
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", text: "", toolCalls: [], streaming: true },
      ]);

      setLoading(true);
      try {
        const response = await aiApi.agentChatStream(text, conversationId, confirm);
        if (!response.ok) throw new Error("Stream request failed");

        const reader  = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer    = "";
        let toolCalls: ToolCallChip[] = [];
        let pendingConfirmation: ChatMessage["pendingConfirmation"] | undefined;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE lines are separated by \n\n; data lines start with "data: "
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (!raw || raw === "[DONE]") continue;

            let event: AgentEvent;
            try {
              event = JSON.parse(raw) as AgentEvent;
            } catch {
              continue; // malformed chunk — skip
            }

            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m;
                switch (event.type) {
                  case "text_delta":
                    return { ...m, text: m.text + event.content };

                  case "tool_call":
                    toolCalls = [...(m.toolCalls ?? []), { name: event.name, args: event.arguments }];
                    return { ...m, toolCalls };

                  case "tool_result": {
                    // Merge result into the last matching tool call chip
                    const updated = (m.toolCalls ?? []).map((tc) =>
                      tc.name === event.name && tc.result === undefined
                        ? { ...tc, result: event.result }
                        : tc
                    );
                    // Invalidate relevant queries so dashboard updates immediately
                    if (MUTATION_TOOLS.has(event.name)) {
                      qc.invalidateQueries({ queryKey: ["segments"] });
                      qc.invalidateQueries({ queryKey: ["campaigns"] });
                    }
                    return { ...m, toolCalls: updated };
                  }

                  case "pending_confirmation":
                    pendingConfirmation = { campaign_id: event.campaign_id, message: event.message };
                    return { ...m, pendingConfirmation };

                  case "done":
                    return { ...m, streaming: false };

                  case "error":
                    return { ...m, text: m.text || event.message, streaming: false };

                  default:
                    return m;
                }
              })
            );

            // Persist conversation_id from first response
            if (event.type === "done" && !conversationId) {
              // Backend may return conversation_id in headers or body — check response headers
              const convIdHeader = response.headers.get("x-conversation-id");
              if (convIdHeader) setConvId(convIdHeader);
            }
          }
        }

        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m))
        );
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, text: "Connection error — try again.", streaming: false }
              : m
          )
        );
      } finally {
        setLoading(false);
      }
    },
    [conversationId, qc]
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    setConvId(undefined);
  }, []);

  return { messages, loading, sendMessage, clearChat };
}
