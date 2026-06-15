"use client";
/**
 * CopilotDock — full AI co-pilot panel.
 *
 * • Streams SSE from /ai/agent/chat via useAgentChat
 * • Tool-call chips expand to show result
 * • pending_confirmation renders a ConfirmCard — never launches without a click
 * • Text streams with a blinking cursor while in-flight
 */
import { useState, useRef, useEffect } from "react";
import { useUIStore } from "@/stores/ui";
import { useAgentChat, ChatMessage } from "@/lib/hooks/useAgentChat";

/* ── Tool call chip ─────────────────────────────────────────────────────────── */

function ToolChip({ name, result }: { name: string; result?: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-1">
      <button
        onClick={() => result !== undefined && setOpen(!open)}
        className="flex items-center gap-1.5 bg-espresso border border-border rounded px-2 py-1 text-[11px] font-mono text-muted hover:text-parchment transition-colors"
      >
        🔧 {name}
        {result !== undefined && (
          <span className="text-copper ml-1">{open ? "▾" : "▸"}</span>
        )}
        {result === undefined && (
          <span className="w-2.5 h-2.5 border border-muted border-t-copper rounded-full animate-spin ml-1" />
        )}
      </button>
      {open && result !== undefined && (
        <pre className="mt-1 ml-4 text-[10px] font-mono text-muted bg-espresso border border-border/50 rounded p-2 max-h-32 overflow-auto">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}

/* ── Confirm card ───────────────────────────────────────────────────────────── */

function ConfirmCard({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="border-2 border-copper/60 rounded p-3 bg-espresso space-y-3 my-2">
      <div className="flex items-center gap-2">
        <span className="text-copper text-base">🚀</span>
        <p className="text-xs text-muted uppercase tracking-wider">Campaign Launch Request</p>
      </div>
      <p className="text-parchment text-sm">{message}</p>
      <p className="text-brick text-xs bg-brick/10 border border-brick/20 rounded px-2 py-1">
        ⚠ This will send messages to real customers.
      </p>
      <div className="flex gap-2">
        <button onClick={onConfirm} className="btn-primary text-xs px-3 py-1.5 flex-1">
          ✓ Confirm & Launch
        </button>
        <button onClick={onCancel} className="btn-ghost text-xs px-3 py-1.5 flex-1">
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ── Message bubble ─────────────────────────────────────────────────────────── */

function MessageBubble({
  msg,
  onConfirmLaunch,
  onCancelLaunch,
}: {
  msg: ChatMessage;
  onConfirmLaunch: (campaignId: string) => void;
  onCancelLaunch: () => void;
}) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] space-y-1 ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        <div
          className={`px-3 py-2 rounded text-sm leading-relaxed ${
            isUser
              ? "bg-copper/20 border border-copper/30 text-parchment rounded-br-sm"
              : "bg-surface border border-border text-parchment rounded-bl-sm"
          }`}
        >
          {msg.text || (msg.streaming && !msg.toolCalls?.length ? "" : "")}
          {msg.streaming && (
            <span className="inline-block w-1.5 h-3.5 bg-copper ml-0.5 animate-blink-cursor align-middle" />
          )}
        </div>

        {/* Tool call chips */}
        {msg.toolCalls && msg.toolCalls.length > 0 && (
          <div className="space-y-0.5 w-full">
            {msg.toolCalls.map((tc, i) => (
              <ToolChip key={i} name={tc.name} result={tc.result} />
            ))}
          </div>
        )}

        {/* Confirm card for pending launch */}
        {msg.pendingConfirmation && (
          <ConfirmCard
            message={msg.pendingConfirmation.message}
            onConfirm={() => onConfirmLaunch(msg.pendingConfirmation!.campaign_id)}
            onCancel={onCancelLaunch}
          />
        )}
      </div>
    </div>
  );
}

/* ── CopilotDock ────────────────────────────────────────────────────────────── */

export default function CopilotDock() {
  const { copilotOpen, setCopilotOpen } = useUIStore();
  const { messages, loading, sendMessage, clearChat } = useAgentChat();
  const [input, setInput]       = useState("");
  const bottomRef               = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!copilotOpen) return null;

  const handleSend = () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    sendMessage(text);
  };

  const handleConfirmLaunch = (campaignId: string) => {
    sendMessage(`confirm launch for campaign ${campaignId}`, true);
  };

  return (
    <aside className="fixed right-0 top-0 h-screen w-[380px] bg-surface border-l border-border flex flex-col z-50 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-copper text-lg">✨</span>
          <div>
            <p className="font-display text-sm font-medium text-parchment">AI Co-pilot</p>
            <p className="text-muted text-[11px]">Powered by Claude 3.5</p>
          </div>
          {loading && (
            <span className="w-1.5 h-1.5 rounded-full bg-copper animate-pulse ml-1" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={clearChat} className="text-muted/50 hover:text-muted text-xs transition-colors">
            Clear
          </button>
          <button
            onClick={() => setCopilotOpen(false)}
            className="text-muted hover:text-parchment transition-colors text-base"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Conversation */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="text-4xl opacity-20">✨</span>
            <p className="text-muted text-sm">Ask me about your customers,<br />segments, or campaigns.</p>
            <div className="space-y-1.5 w-full mt-2">
              {[
                "Who are my top customers this month?",
                "Create a segment of lapsed high-value customers",
                "Launch a win-back WhatsApp campaign",
              ].map((s) => (
                <button
                  key={s}
                  className="w-full text-left text-xs text-muted hover:text-copper bg-espresso border border-border/50 hover:border-copper/30 rounded px-3 py-2 transition-colors"
                  onClick={() => { setInput(s); }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            onConfirmLaunch={handleConfirmLaunch}
            onCancelLaunch={() => {}}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-4 border-t border-border shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            className="input flex-1 text-sm resize-none h-10 min-h-[40px] max-h-32 leading-relaxed"
            placeholder="Ask anything…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
            rows={1}
            style={{ height: "auto", overflow: "hidden" }}
            onInput={(e) => {
              const el = e.target as HTMLTextAreaElement;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 128) + "px";
            }}
          />
          <button
            className="btn-primary px-3 py-2.5 shrink-0"
            onClick={handleSend}
            disabled={!input.trim() || loading}
          >
            ✨
          </button>
        </div>
        <p className="text-muted/40 text-[10px] mt-1.5">Enter to send · Shift+Enter for new line</p>
      </div>
    </aside>
  );
}
