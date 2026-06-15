"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { segmentsApi } from "@/lib/api/segments";
import { campaignsApi, CampaignChannel } from "@/lib/api/campaigns";
import { aiApi } from "@/lib/api/ai";

const CHANNELS: { value: CampaignChannel; label: string; icon: string }[] = [
  { value: "whatsapp", label: "WhatsApp", icon: "💬" },
  { value: "sms",      label: "SMS",      icon: "📱" },
  { value: "email",    label: "Email",    icon: "✉️" },
  { value: "rcs",      label: "RCS",      icon: "🔵" },
];

// Highlight {merge_tags} in the message template
function highlightMergeTags(text: string) {
  return text.replace(/\{(\w+)\}/g, '<mark class="bg-copper/20 text-copper rounded px-0.5">{$1}</mark>');
}

export default function NewCampaignPage() {
  const router      = useRouter();
  const searchParams = useSearchParams();
  const qc          = useQueryClient();

  const [name,     setName]    = useState("");
  const [segId,    setSegId]   = useState(searchParams.get("segment") ?? "");
  const [channel,  setChannel] = useState<CampaignChannel>("whatsapp");
  const [message,  setMessage] = useState("");
  const [aiLoading, setAILoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [savedId,  setSavedId] = useState<string | null>(null);

  // Load segments for picker
  const { data: segsData } = useQuery({
    queryKey: ["segments"],
    queryFn: () => segmentsApi.list().then((r) => r.data.data),
  });
  const segments = segsData ?? [];
  const selectedSeg = segments.find((s: any) => s.id === segId);

  // Save as draft
  const saveMut = useMutation({
    mutationFn: () =>
      campaignsApi.create({ name, segment_id: segId, channel, message_template: message }),
    onSuccess: (res) => {
      setSavedId(res.data.data.id);
      setShowConfirm(true);
    },
  });

  // Launch
  const launchMut = useMutation({
    mutationFn: (id: string) => campaignsApi.launch(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      router.push(`/campaigns/${id}`);
    },
  });

  // AI draft message
  const handleAIDraft = async () => {
    if (!segId) return;
    setAILoading(true);
    try {
      const res = await aiApi.draftMessage({ segment_id: segId, channel });
      setMessage(res.data.data.message);
    } catch {
      alert("AI draft failed — check that OPENROUTER_API_KEY is set.");
    } finally {
      setAILoading(false);
    }
  };

  const canSave = name.trim() && segId && message.trim();

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="heading">New Campaign</h1>
        <p className="text-muted text-sm mt-1">Build, preview, then launch</p>
      </div>

      {/* Campaign name */}
      <div className="card space-y-4">
        <div>
          <label className="block text-xs text-muted uppercase tracking-wider mb-1.5">Campaign Name</label>
          <input className="input" placeholder="e.g. Win-Back June" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        {/* Segment picker */}
        <div>
          <label className="block text-xs text-muted uppercase tracking-wider mb-1.5">Target Segment</label>
          <select className="input" value={segId} onChange={(e) => setSegId(e.target.value)}>
            <option value="">— Choose segment —</option>
            {(segments as any[]).map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.member_count} members)</option>
            ))}
          </select>
          {selectedSeg && (
            <p className="text-copper text-xs font-mono mt-1">
              ✓ {(selectedSeg as any).member_count} recipients
            </p>
          )}
        </div>

        {/* Channel selector */}
        <div>
          <label className="block text-xs text-muted uppercase tracking-wider mb-2">Channel</label>
          <div className="flex gap-2">
            {CHANNELS.map((ch) => (
              <button
                key={ch.value}
                onClick={() => setChannel(ch.value)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded border text-sm transition-colors ${
                  channel === ch.value
                    ? "border-copper bg-copper/10 text-copper"
                    : "border-border text-muted hover:text-parchment hover:border-border"
                }`}
              >
                <span>{ch.icon}</span>
                <span>{ch.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Message editor */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted uppercase tracking-wider">Message Template</label>
          <button
            className="btn-ghost text-xs px-3 py-1.5"
            onClick={handleAIDraft}
            disabled={!segId || aiLoading}
          >
            {aiLoading ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 border border-muted border-t-copper rounded-full animate-spin" />
                Drafting…
              </span>
            ) : "✨ Draft with AI"}
          </button>
        </div>

        <textarea
          className="input w-full h-36 resize-none font-mono text-sm"
          placeholder="Hi {name}, we miss you at BrewBharat! It's been {days_inactive} days since your last order…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />

        {/* Merge tag hints */}
        <div className="flex flex-wrap gap-1.5">
          {["{name}", "{email}", "{total_spent}", "{order_count}", "{tier}", "{city}", "{days_inactive}"].map((tag) => (
            <button
              key={tag}
              className="badge-copper text-[11px] cursor-pointer hover:bg-copper/30"
              onClick={() => setMessage((m) => m + tag)}
            >
              {tag}
            </button>
          ))}
        </div>

        {/* Live preview */}
        {message && (
          <div className="bg-espresso rounded p-3 border border-border/50">
            <p className="text-muted text-[11px] uppercase tracking-wider mb-1.5">Preview</p>
            <p
              className="text-parchment text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: highlightMergeTags(message) }}
            />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={!canSave || saveMut.isPending} onClick={() => saveMut.mutate()}>
          {saveMut.isPending ? "Saving…" : "Review & Launch →"}
        </button>
        <button className="btn-ghost" onClick={() => router.back()}>Cancel</button>
      </div>

      {/* Confirmation dialog */}
      {showConfirm && savedId && (
        <div className="fixed inset-0 bg-espresso/70 flex items-center justify-center z-50 px-4">
          <div className="card max-w-sm w-full border-2 border-copper/50 space-y-4">
            <h2 className="font-display text-xl text-parchment">Launch Campaign?</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Name</span>
                <span className="text-parchment font-medium">{name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Segment</span>
                <span className="text-parchment">{(selectedSeg as any)?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Recipients</span>
                <span className="text-copper font-mono font-bold">{(selectedSeg as any)?.member_count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Channel</span>
                <span className="text-parchment uppercase text-xs font-mono">{channel}</span>
              </div>
            </div>
            <p className="text-brick text-xs bg-brick/10 border border-brick/20 rounded px-3 py-2">
              ⚠ This will immediately send messages to {(selectedSeg as any)?.member_count ?? "?"} customers.
            </p>
            <div className="flex gap-2">
              <button
                className="btn-primary flex-1"
                disabled={launchMut.isPending}
                onClick={() => launchMut.mutate(savedId)}
              >
                {launchMut.isPending ? "Launching…" : "✓ Confirm & Launch"}
              </button>
              <button className="btn-ghost flex-1" onClick={() => { setShowConfirm(false); router.push("/campaigns"); }}>
                Save as Draft
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
