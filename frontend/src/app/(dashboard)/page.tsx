"use client";
import { useQuery } from "@tanstack/react-query";
import { analyticsApi, OverviewStats } from "@/lib/api/analytics";
import { campaignsApi, Campaign, CampaignStatus } from "@/lib/api/campaigns";
import { campaignsApi as ca } from "@/lib/api/campaigns";

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN").format(Math.round(n));
}
function fmtRupee(n: number) {
  return "₹" + new Intl.NumberFormat("en-IN").format(Math.round(n));
}

const STATUS_BADGE: Record<CampaignStatus, string> = {
  draft:     "badge-muted",
  running:   "badge-gold",
  completed: "badge-sage",
  failed:    "badge-brick",
};

/* ── Metric card ───────────────────────────────────────────────────────────── */

function MetricCard({
  label,
  value,
  sub,
  delay,
}: {
  label: string;
  value: string;
  sub?: string;
  delay: number;
}) {
  return (
    <div
      className="card flex flex-col gap-1"
      style={{ animationDelay: `${delay}ms`, animation: "fade-up 0.4s ease forwards", opacity: 0 }}
    >
      <p className="text-muted text-xs uppercase tracking-wider">{label}</p>
      <p className="font-mono text-3xl font-bold text-parchment tracking-tight">{value}</p>
      {sub && <p className="text-muted text-xs">{sub}</p>}
    </div>
  );
}

/* ── Overview page ─────────────────────────────────────────────────────────── */

export default function OverviewPage() {
  const { data: statsRes, isLoading: statsLoading } = useQuery({
    queryKey: ["overview"],
    queryFn: () => analyticsApi.overview().then((r) => r.data.data),
  });

  const { data: campaignsRes, isLoading: campaignsLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => campaignsApi.list().then((r) => r.data.data),
  });

  const stats     = statsRes as OverviewStats | undefined;
  const campaigns = campaignsRes as Campaign[] | undefined;

  return (
    <div className="space-y-8">
      {/* Page heading */}
      <div>
        <h1 className="heading">Overview</h1>
        <p className="text-muted text-sm mt-1">BrewBharat · all-time metrics</p>
      </div>

      {/* Metric cards */}
      {statsLoading ? (
        <div className="grid grid-cols-4 gap-4">
          {[0,1,2,3].map((i) => (
            <div key={i} className="card h-24 animate-pulse bg-surface/60" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Total Customers"
            value={fmt(stats?.total_customers ?? 0)}
            sub={`${fmt(stats?.total_orders ?? 0)} orders`}
            delay={0}
          />
          <MetricCard
            label="Active Campaigns"
            value={String(stats?.active_campaigns ?? 0)}
            sub={`${stats?.completed_campaigns ?? 0} completed`}
            delay={80}
          />
          <MetricCard
            label="Avg Delivery Rate"
            value={`${(stats?.avg_delivery_rate ?? 0).toFixed(1)}%`}
            sub="across all campaigns"
            delay={160}
          />
          <MetricCard
            label="Total Revenue"
            value={fmtRupee(stats?.total_revenue ?? 0)}
            sub={`${fmtRupee(stats?.attributed_revenue_30d ?? 0)} attributed`}
            delay={240}
          />
        </div>
      )}

      {/* Recent campaigns table */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-medium text-parchment">
            Recent Campaigns
          </h2>
          <a href="/campaigns/new" className="btn-primary text-xs px-3 py-1.5">
            + New Campaign
          </a>
        </div>

        {campaignsLoading ? (
          <div className="space-y-2">
            {[0,1,2].map((i) => (
              <div key={i} className="h-10 rounded bg-espresso animate-pulse" />
            ))}
          </div>
        ) : campaigns?.length === 0 ? (
          <p className="text-muted text-sm py-8 text-center">
            No campaigns yet — create your first one.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted text-xs uppercase tracking-wider">
                  <th className="text-left pb-2 pr-4">Name</th>
                  <th className="text-left pb-2 pr-4">Channel</th>
                  <th className="text-left pb-2 pr-4">Status</th>
                  <th className="text-right pb-2 pr-4 font-mono">Launched</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {(campaigns ?? []).slice(0, 8).map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-espresso/60 transition-colors cursor-pointer group"
                    onClick={() => (window.location.href = `/campaigns/${c.id}`)}
                  >
                    <td className="py-2.5 pr-4 text-parchment group-hover:text-copper transition-colors">
                      {c.name}
                    </td>
                    <td className="py-2.5 pr-4 text-muted uppercase text-xs font-mono">
                      {c.channel}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={STATUS_BADGE[c.status]}>
                        {c.status}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono text-muted text-xs">
                      {c.launched_at
                        ? new Date(c.launched_at).toLocaleDateString("en-IN", {
                            day: "numeric", month: "short", year: "numeric",
                          })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
