"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { campaignsApi, CampaignAnalytics } from "@/lib/api/campaigns";
import { segmentsApi } from "@/lib/api/segments";
import { aiApi } from "@/lib/api/ai";
import { useCampaignSocket } from "@/lib/hooks/useCampaignSocket";
import { useState } from "react";
import { toast } from "sonner";

/* ── Helpers ────────────────────────────────────────────────────────────────── */

function fmtRupee(n: number) {
  return "₹" + new Intl.NumberFormat("en-IN").format(Math.round(n));
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// Highlight {merge_tags} in message preview
function highlightMergeTags(text: string) {
  return text.replace(
    /\{(\w+)\}/g,
    '<mark style="background:rgba(176,108,41,0.2);color:#E0964A;border-radius:3px;padding:0 3px">{$1}</mark>'
  );
}

/* ── Delivery funnel bar ─────────────────────────────────────────────────────── */

function FunnelBar({
  label, count, total, color, pulsing, rate,
}: {
  label: string; count: number; total: number; color: string; pulsing?: boolean; rate?: number;
}) {
  const pct = rate !== undefined ? (rate * 100).toFixed(1) : total > 0 ? ((count / total) * 100).toFixed(1) : "0.0";
  const w   = total > 0 ? Math.max((count / total) * 100, count > 0 ? 3 : 0) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-baseline">
        <span className="text-muted text-xs uppercase tracking-wider flex items-center gap-1.5">
          {pulsing && <span className="w-1.5 h-1.5 rounded-full bg-copper animate-pulse" />}
          {label}
        </span>
        <div className="flex items-center gap-3">
          <span className="text-muted text-[11px] font-mono">{pct}%</span>
          <span className="font-mono text-parchment text-sm font-bold w-12 text-right">
            {count.toLocaleString("en-IN")}
          </span>
        </div>
      </div>
      <div className="h-2 bg-espresso rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${w}%` }}
        />
      </div>
    </div>
  );
}

/* ── Campaign detail page ────────────────────────────────────────────────────── */

export default function CampaignDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const router   = useRouter();
  const qc       = useQueryClient();
  const [insights, setInsights]         = useState<string | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [showPreview, setShowPreview]   = useState(false);

  // Subscribe to live WS updates
  useCampaignSocket(id);

  const { data: campaign } = useQuery({
    queryKey: ["campaign", id],
    queryFn: () => campaignsApi.get(id).then((r) => r.data.data),
    refetchInterval: (q) =>
      q.state.data?.status === "running" ? 5_000 : false,
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["campaign-analytics", id],
    queryFn: () => campaignsApi.analytics(id).then((r) => r.data.data as CampaignAnalytics),
    refetchInterval: campaign?.status === "running" ? 5_000 : false,
    enabled: campaign?.status !== "draft",
  });

  // Load segment preview for message preview feature
  const { data: segPreview } = useQuery({
    queryKey: ["segment-preview-sample", campaign?.segment_id],
    queryFn: () =>
      segmentsApi.preview({ operator: "AND", conditions: [] } as any)
        .then((r) => r.data.data.sample?.[0]),
    enabled: showPreview && !!campaign?.segment_id,
  });

  const launchMut = useMutation({
    mutationFn: () => campaignsApi.launch(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign", id] });
      qc.invalidateQueries({ queryKey: ["campaign-analytics", id] });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success("Campaign launched! 🚀 Dispatching messages…");
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail ?? "Failed to launch campaign";
      toast.error(detail);
    },
  });

  const handleInsights = async () => {
    setInsightsLoading(true);
    try {
      const res = await aiApi.insights(id);
      // Backend returns { data: { insights: "..." } } OR { data: { summary: "..." } }
      const d = res.data.data as any;
      setInsights(d.summary ?? d.insights ?? JSON.stringify(d));
    } catch {
      toast.error("Could not generate insights — try again.");
    } finally {
      setInsightsLoading(false);
    }
  };

  // Compute total for funnel bars (use total_recipients as baseline)
  const total = analytics?.total_recipients ?? 0;

  // Personalize preview message with sample customer data
  const previewMessage = campaign?.message_template
    ? campaign.message_template
        .replace(/{name}/g, segPreview?.name ?? "Priya Sharma")
        .replace(/{email}/g, segPreview?.email ?? "priya@example.com")
        .replace(/{total_spent}/g, segPreview ? `₹${Math.round(segPreview.total_spent)}` : "₹12,450")
        .replace(/{city}/g, "Mumbai")
        .replace(/{tier}/g, "gold")
        .replace(/{order_count}/g, "8")
        .replace(/{days_inactive}/g, "45")
    : "";

  if (!campaign) {
    return (
      <div className="space-y-4">
        <div className="card h-20 animate-pulse" />
        <div className="card h-64 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-muted text-xs mb-2">
            <button onClick={() => router.push("/campaigns")} className="hover:text-copper transition-colors">
              Campaigns
            </button>
            <span>/</span>
            <span className="text-parchment">{campaign.name}</span>
          </div>
          <h1 className="heading">{campaign.name}</h1>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className={`badge ${
              campaign.status === "running"   ? "badge-gold"  :
              campaign.status === "completed" ? "badge-sage"  :
              campaign.status === "failed"    ? "badge-brick" : "badge-muted"
            }`}>
              {campaign.status === "running" && (
                <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse mr-1.5 inline-block" />
              )}
              {campaign.status.toUpperCase()}
            </span>
            <span className="text-muted text-xs font-mono uppercase">{campaign.channel}</span>
            {campaign.launched_at && (
              <span className="text-muted text-xs">Launched {fmtDate(campaign.launched_at)}</span>
            )}
            {campaign.completed_at && (
              <span className="text-muted text-xs">Completed {fmtDate(campaign.completed_at)}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Live message preview toggle */}
          <button
            className="btn-ghost text-xs px-3 py-1.5"
            onClick={() => setShowPreview((v) => !v)}
          >
            {showPreview ? "Hide Preview" : "👁 Message Preview"}
          </button>

          {campaign.status === "draft" && (
            <button
              className="btn-primary"
              onClick={() => launchMut.mutate()}
              disabled={launchMut.isPending}
            >
              {launchMut.isPending ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-espresso/40 border-t-espresso rounded-full animate-spin" />
                  Launching…
                </span>
              ) : "🚀 Launch"}
            </button>
          )}
          {campaign.status === "running" && (
            <div className="flex items-center gap-2 text-copper text-sm">
              <span className="w-2 h-2 rounded-full bg-copper animate-pulse" />
              <span className="font-mono text-xs">Live</span>
            </div>
          )}
        </div>
      </div>

      {/* Live Message Preview */}
      {showPreview && (
        <div className="card space-y-3 border-copper/30">
          <div className="flex items-center justify-between">
            <p className="text-muted text-xs uppercase tracking-wider">Message Preview</p>
            <span className="text-muted text-xs">
              Showing personalized for: <span className="text-copper">{segPreview?.name ?? "sample customer"}</span>
            </span>
          </div>
          <div className={`rounded p-4 ${
            campaign.channel === "whatsapp" ? "bg-[#1a2c1a] border border-green-900/40" :
            campaign.channel === "sms"      ? "bg-espresso border border-border" :
            campaign.channel === "email"    ? "bg-surface border border-border" :
                                              "bg-espresso border border-border"
          }`}>
            {campaign.channel === "whatsapp" && (
              <p className="text-green-400 text-[10px] uppercase tracking-wider mb-2 font-mono">WhatsApp Message</p>
            )}
            {campaign.channel === "sms" && (
              <p className="text-muted text-[10px] uppercase tracking-wider mb-2 font-mono">SMS</p>
            )}
            {campaign.channel === "email" && (
              <p className="text-muted text-[10px] uppercase tracking-wider mb-2 font-mono">Email Body</p>
            )}
            <p
              className="text-parchment text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: highlightMergeTags(previewMessage) }}
            />
          </div>
          <p className="text-muted text-xs">
            <span className="text-copper">Highlighted</span> tokens will be replaced with real customer data at send time.
          </p>
        </div>
      )}

      {/* Delivery Funnel */}
      <div className="card space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg text-parchment">Delivery Funnel</h2>
            {total > 0 && (
              <p className="text-muted text-xs mt-0.5">
                {total.toLocaleString("en-IN")} total recipients
              </p>
            )}
          </div>
          {campaign.status === "running" && (
            <span className="flex items-center gap-1.5 text-copper text-xs font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-copper animate-pulse" />
              Live updates
            </span>
          )}
        </div>

        {analyticsLoading ? (
          <div className="space-y-4">
            {[0,1,2,3,4,5].map((i) => (
              <div key={i} className="h-8 rounded bg-espresso animate-pulse" />
            ))}
          </div>
        ) : analytics && total > 0 ? (
          <div className="space-y-4">
            <FunnelBar label="Queued"    count={analytics.queued}    total={total} color="bg-border" />
            <FunnelBar label="Sent"      count={analytics.sent}      total={total} color="bg-gold/60" />
            <FunnelBar label="Delivered" count={analytics.delivered} total={total} color="bg-gold" rate={analytics.delivery_rate} />
            <FunnelBar label="Opened / Read" count={analytics.opened + analytics.read} total={total} color="bg-sage/70" rate={analytics.open_rate} pulsing={campaign.status === "running"} />
            <FunnelBar label="Clicked"   count={analytics.clicked}   total={total} color="bg-sage" rate={analytics.click_rate} />
            <FunnelBar label="Failed"    count={analytics.failed}    total={total} color="bg-brick/60" />
          </div>
        ) : campaign.status === "draft" ? (
          <div className="text-center py-8 space-y-3">
            <p className="text-4xl opacity-20">📊</p>
            <p className="text-muted text-sm">Launch the campaign to see delivery analytics</p>
            <button className="btn-primary text-sm" onClick={() => launchMut.mutate()} disabled={launchMut.isPending}>
              🚀 Launch Now
            </button>
          </div>
        ) : (
          <div className="text-center py-8 space-y-2">
            <p className="text-4xl opacity-20">⏳</p>
            <p className="text-muted text-sm">Processing… analytics will appear shortly</p>
            <p className="text-muted text-xs">The channel service is dispatching messages in the background</p>
          </div>
        )}
      </div>

      {/* Stats row for completed campaigns */}
      {analytics && total > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="card text-center space-y-1">
            <p className="text-muted text-xs uppercase tracking-wider">Delivery Rate</p>
            <p className="font-mono text-2xl font-bold text-copper">
              {(analytics.delivery_rate * 100).toFixed(1)}%
            </p>
          </div>
          <div className="card text-center space-y-1">
            <p className="text-muted text-xs uppercase tracking-wider">Open Rate</p>
            <p className="font-mono text-2xl font-bold text-sage">
              {(analytics.open_rate * 100).toFixed(1)}%
            </p>
          </div>
          <div className="card text-center space-y-1">
            <p className="text-muted text-xs uppercase tracking-wider">Click Rate</p>
            <p className="font-mono text-2xl font-bold text-parchment">
              {(analytics.click_rate * 100).toFixed(1)}%
            </p>
          </div>
        </div>
      )}

      {/* Attribution + AI Insights */}
      <div className="grid grid-cols-2 gap-4">

        {/* Attribution */}
        <div className="card space-y-3">
          <h2 className="font-display text-base text-parchment">Attribution</h2>
          {analytics && analytics.attributed_orders > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-espresso rounded p-3">
                <p className="text-muted text-[10px] uppercase tracking-wider">Attributed Orders</p>
                <p className="font-mono text-copper text-2xl font-bold mt-0.5">{analytics.attributed_orders}</p>
              </div>
              <div className="bg-espresso rounded p-3">
                <p className="text-muted text-[10px] uppercase tracking-wider">Revenue</p>
                <p className="font-mono text-copper text-xl font-bold mt-0.5">
                  {fmtRupee(analytics.attributed_revenue)}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 space-y-1">
              <p className="text-muted text-sm">No attributed orders yet</p>
              <p className="text-muted text-xs">
                Orders placed within {72}h of a click are attributed to this campaign
              </p>
            </div>
          )}
        </div>

        {/* AI Insights */}
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base text-parchment">AI Insights</h2>
            <span className="text-copper text-lg">✨</span>
          </div>
          {insights ? (
            <div className="space-y-2">
              <p className="text-parchment/90 text-sm leading-relaxed">{insights}</p>
              <button
                className="btn-ghost text-xs px-2 py-1"
                onClick={() => { setInsights(null); }}
              >
                Regenerate
              </button>
            </div>
          ) : (
            <>
              <p className="text-muted text-sm">
                Get an AI-powered analysis of this campaign&apos;s performance, what worked, and recommendations for next steps.
              </p>
              <button
                className="btn-primary text-sm"
                onClick={handleInsights}
                disabled={insightsLoading || campaign.status === "draft"}
                title={campaign.status === "draft" ? "Launch the campaign first" : ""}
              >
                {insightsLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-espresso/40 border-t-espresso rounded-full animate-spin" />
                    Analyzing…
                  </span>
                ) : campaign.status === "draft" ? "Launch first to get insights" : "✨ Generate Insights"}
              </button>
            </>
          )}
        </div>
      </div>

    </div>
  );
}
