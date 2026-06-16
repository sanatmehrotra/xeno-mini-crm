"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { segmentsApi } from "@/lib/api/segments";
import { campaignsApi, CampaignChannel } from "@/lib/api/campaigns";
import { aiApi } from "@/lib/api/ai";
import { toast } from "sonner";

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
  const [goal,     setGoal]    = useState("");
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

  // Search filter for segment card picker
  const [segSearch, setSegSearch] = useState("");
  const filteredSegs = (segments as any[]).filter((s) =>
    s.name.toLowerCase().includes(segSearch.toLowerCase())
  );

  // Load preview for selected segment to get sample customer for personalized preview
  const { data: segPreview } = useQuery({
    queryKey: ["segment-preview", segId],
    queryFn: () => segmentsApi.preview((selectedSeg as any).rules).then((r) => r.data.data),
    enabled: !!selectedSeg,
  });
  const sampleCustomer = segPreview?.sample?.[0] ?? null;

  // Save as draft
  const saveMut = useMutation({
    mutationFn: () =>
      campaignsApi.create({ name, segment_id: segId, channel, message_template: message }),
    onSuccess: (res) => {
      setSavedId(res.data.data.id);
      setShowConfirm(true);
      toast.success("Campaign saved as draft");
    },
    onError: () => toast.error("Failed to save campaign"),
  });

  // Launch
  const launchMut = useMutation({
    mutationFn: (id: string) => campaignsApi.launch(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success("Campaign launched successfully! 🚀");
      router.push(`/campaigns/${id}`);
    },
    onError: () => toast.error("Failed to launch campaign"),
  });

  // AI draft message
  const handleAIDraft = async () => {
    if (!segId) return;
    setAILoading(true);
    try {
      // Backend requires goal: str (non-optional) — send default if blank
      const effectiveGoal = goal.trim() || "increase engagement and drive repeat purchases";
      const res = await aiApi.draftMessage({ segment_id: segId, channel, goal: effectiveGoal });
      setMessage(res.data.data.message);
      toast.success("AI draft generated! ✨");
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail ??
        err?.message ??
        "AI draft failed — try again.";
      toast.error(detail);
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

        {/* Campaign goal */}
        <div>
          <label className="block text-xs text-muted uppercase tracking-wider mb-1.5">Campaign Goal <span className="normal-case text-muted/60">(optional — helps AI draft)</span></label>
          <input className="input" placeholder="e.g. Re-engage lapsed buyers, Announce Monsoon Sale" value={goal} onChange={(e) => setGoal(e.target.value)} />
        </div>

        {/* Segment picker — card-style with search */}
        <div>
          <label className="block text-xs text-muted uppercase tracking-wider mb-1.5">Target Segment</label>
          <div className="space-y-2">
            <input
              className="input text-sm"
              placeholder="Search segments…"
              value={segSearch}
              onChange={(e) => setSegSearch(e.target.value)}
            />
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {filteredSegs.length > 0 ? (
                filteredSegs.map((s: any) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSegId(s.id)}
                    className={`w-full text-left px-3 py-2.5 rounded border transition-colors ${
                      segId === s.id
                        ? "border-copper bg-copper/10 text-copper"
                        : "border-border hover:border-copper/40 text-parchment"
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-sm">{s.name}</span>
                      <span className="font-mono text-xs text-copper">{s.member_count} members</span>
                    </div>
                    {s.last_computed_at && (
                      <p className="text-muted text-[11px] mt-0.5">
                        Computed {new Date(s.last_computed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </p>
                    )}
                  </button>
                ))
              ) : segments.length === 0 ? (
                <p className="text-muted text-xs py-4 text-center">
                  No segments yet —{" "}
                  <a href="/segments/new" className="text-copper hover:underline">create one first</a>
                </p>
              ) : (
                <p className="text-muted text-xs py-3 text-center">No segments match “{segSearch}”</p>
              )}
            </div>
            {segments.length > 0 && (
              <a
                href="/segments/new"
                className="btn-ghost text-xs px-3 py-1.5 inline-flex items-center gap-1"
              >
                + New Segment
              </a>
            )}
          </div>
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
          <div className="flex items-center gap-2">
            {!segId && <span className="text-muted text-xs">Select a segment to enable AI draft</span>}
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
          <div className="bg-espresso rounded p-3 border border-border/50 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-muted text-[11px] uppercase tracking-wider">Preview</p>
              {sampleCustomer && (
                <p className="text-muted text-[11px] font-mono">
                  for: <span className="text-copper">{sampleCustomer.name}</span>
                </p>
              )}
            </div>
            <p
              className="text-parchment text-sm leading-relaxed"
              dangerouslySetInnerHTML={{
                __html: sampleCustomer
                  ? highlightMergeTags(
                      message
                        .replace(/\{name\}/g, sampleCustomer.name)
                        .replace(/\{email\}/g, sampleCustomer.email)
                        .replace(/\{city\}/g, (sampleCustomer as any).attributes?.city ?? "Mumbai")
                        .replace(/\{tier\}/g, (sampleCustomer as any).attributes?.tier ?? "gold")
                        .replace(/\{total_spent\}/g, `₹${Math.round(sampleCustomer.total_spent)}`)
                    )
                  : highlightMergeTags(message),
              }}
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
