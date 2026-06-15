"use client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { campaignsApi, CampaignAnalytics } from "@/lib/api/campaigns";
import { aiApi } from "@/lib/api/ai";
import { useCampaignSocket } from "@/lib/hooks/useCampaignSocket";
import { useState } from "react";

/* ── Delivery funnel bar ────────────────────────────────────────────────────── */

function FunnelBar({
  label, count, total, color, pulsing,
}: {
  label: string; count: number; total: number; color: string; pulsing?: boolean;
}) {
  const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0.0";
  const w   = total > 0 ? Math.max((count / total) * 100, 2) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-baseline">
        <span className="text-muted text-xs uppercase tracking-wider flex items-center gap-1.5">
          {pulsing && (
            <span className="w-1.5 h-1.5 rounded-full bg-copper animate-pulse" />
          )}
          {label}
        </span>
        <span className="font-mono text-parchment text-sm font-bold">{count.toLocaleString("en-IN")}</span>
      </div>
      <div className="h-2.5 bg-espresso rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color} ${pulsing ? "animate-pulse-copper" : ""}`}
          style={{ width: `${w}%` }}
        />
      </div>
      <p className="text-muted text-[11px] font-mono text-right">{pct}%</p>
    </div>
  );
}

/* ── Campaign detail page ───────────────────────────────────────────────────── */

export default function CampaignDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const router   = useRouter();
  const [insights, setInsights] = useState<string | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);

  // Subscribe to live WS updates
  useCampaignSocket(id);

  const { data: campRes } = useQuery({
    queryKey: ["campaign", id],
    queryFn: () => campaignsApi.get(id).then((r) => r.data.data),
  });

  const { data: analyticsRes, isLoading: analyticsLoading } = useQuery({
    queryKey: ["campaign-analytics", id],
    queryFn: () => campaignsApi.analytics(id).then((r) => r.data.data as CampaignAnalytics),
    refetchInterval: campRes?.status === "running" ? 10_000 : false,
  });

  const launchMut = useMutation({
    mutationFn: () => campaignsApi.launch(id),
  });

  const campaign  = campRes;
  const analytics = analyticsRes;
  const funnel    = analytics?.funnel;
  const total     = funnel?.sent ?? funnel?.queued ?? 0;

  const handleInsights = async () => {
    setInsightsLoading(true);
    try {
      const res = await aiApi.insights(id);
      setInsights(res.data.data.summary);
    } catch {
      setInsights("Could not generate insights — try again.");
    } finally {
      setInsightsLoading(false);
    }
  };

  if (!campaign) {
    return <div className="card animate-pulse h-64" />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-muted text-xs mb-2">
            <button onClick={() => router.push("/campaigns")} className="hover:text-copper transition-colors">Campaigns</button>
            <span>/</span>
            <span className="text-parchment">{campaign.name}</span>
          </div>
          <h1 className="heading">{campaign.name}</h1>
          <div className="flex items-center gap-3 mt-2">
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
          </div>
        </div>
        {campaign.status === "draft" && (
          <button
            className="btn-primary"
            onClick={() => launchMut.mutate()}
            disabled={launchMut.isPending}
          >
            {launchMut.isPending ? "Launching…" : "🚀 Launch"}
          </button>
        )}
        {campaign.status === "running" && (
          <div className="flex items-center gap-2 text-copper text-sm">
            <span className="w-2 h-2 rounded-full bg-copper animate-pulse" />
            <span className="font-mono text-xs">Live</span>
          </div>
        )}
      </div>

      {/* Delivery Funnel */}
      <div className="card space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-parchment">Delivery Funnel</h2>
          {campaign.status === "running" && (
            <span className="flex items-center gap-1.5 text-copper text-xs font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-copper animate-pulse" />
              Receiving live updates
            </span>
          )}
        </div>

        {analyticsLoading ? (
          <div className="space-y-4">
            {[0,1,2,3,4,5].map((i) => (
              <div key={i} className="h-8 rounded bg-espresso animate-pulse" />
            ))}
          </div>
        ) : funnel ? (
          <div className="space-y-4">
            <FunnelBar label="Queued"    count={funnel.queued}    total={funnel.queued}  color="bg-gold/60" />
            <FunnelBar label="Sent"      count={funnel.sent}      total={funnel.queued}  color="bg-gold" />
            <FunnelBar label="Delivered" count={funnel.delivered} total={funnel.queued}  color="bg-sage/70" />
            <FunnelBar label="Opened"    count={funnel.opened + funnel.read} total={funnel.queued} color="bg-sage" pulsing={campaign.status === "running"} />
            <FunnelBar label="Clicked"   count={funnel.clicked}   total={funnel.queued}  color="bg-sage font-bold" />
            <FunnelBar label="Failed"    count={funnel.failed}    total={funnel.queued}  color="bg-brick/70" />
          </div>
        ) : (
          <p className="text-muted text-sm">No analytics yet — launch the campaign first.</p>
        )}
      </div>

      {/* Attribution + AI Insights */}
      <div className="grid grid-cols-2 gap-4">
        {/* Attribution */}
        <div className="card space-y-3">
          <h2 className="font-display text-base text-parchment">Attribution</h2>
          {analytics?.attribution ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-espresso rounded p-3">
                  <p className="text-muted text-[10px] uppercase tracking-wider">Orders</p>
                  <p className="font-mono text-copper text-2xl font-bold">{analytics.attribution.orders_count}</p>
                </div>
                <div className="bg-espresso rounded p-3">
                  <p className="text-muted text-[10px] uppercase tracking-wider">Revenue</p>
                  <p className="font-mono text-copper text-xl font-bold">
                    ₹{new Intl.NumberFormat("en-IN").format(Math.round(analytics.attribution.revenue))}
                  </p>
                </div>
              </div>
              {analytics.attribution.attributed_customers.slice(0, 3).map((c) => (
                <div key={c.customer_id} className="flex justify-between text-xs py-1 border-b border-border/40">
                  <span className="text-muted truncate">{c.name}</span>
                  <span className="text-sage font-mono ml-2">₹{new Intl.NumberFormat("en-IN").format(c.order_amount)}</span>
                </div>
              ))}
            </>
          ) : (
            <p className="text-muted text-sm">No attributed orders yet.</p>
          )}
        </div>

        {/* AI Insights */}
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base text-parchment">AI Insights</h2>
            <span className="text-copper text-lg">✨</span>
          </div>
          {insights ? (
            <p className="text-parchment/80 text-sm leading-relaxed italic">{insights}</p>
          ) : (
            <>
              <p className="text-muted text-sm">
                Generate an AI summary of this campaign&apos;s performance and recommendations.
              </p>
              <button
                className="btn-primary text-sm"
                onClick={handleInsights}
                disabled={insightsLoading || campaign.status === "draft"}
              >
                {insightsLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-espresso/40 border-t-espresso rounded-full animate-spin" />
                    Analyzing…
                  </span>
                ) : "Generate Insights"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
