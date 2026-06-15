"use client";
import { useQuery } from "@tanstack/react-query";
import { analyticsApi, OverviewStats } from "@/lib/api/analytics";
import { campaignsApi, Campaign, CampaignStatus } from "@/lib/api/campaigns";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import Link from "next/link";

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN").format(Math.round(n));
}
function fmtRupee(n: number) {
  return "₹" + new Intl.NumberFormat("en-IN").format(Math.round(n));
}

const STATUS_BADGE: Record<CampaignStatus, string> = {
  draft: "badge-muted",
  running: "badge-gold",
  completed: "badge-sage",
  failed: "badge-brick",
};

const CHANNEL_ICON: Record<string, string> = {
  whatsapp: "💬", sms: "📱", email: "✉️", rcs: "🔵",
};

/* ── Metric card ───────────────────────────────────────────────────────────── */

function MetricCard({
  label, value, sub, accent, delay,
}: {
  label: string; value: string; sub?: string; accent?: string; delay: number;
}) {
  return (
    <div
      className="card flex flex-col gap-1"
      style={{ animationDelay: `${delay}ms`, animation: "fade-up 0.4s ease forwards", opacity: 0 }}
    >
      <p className="text-muted text-xs uppercase tracking-wider">{label}</p>
      <p
        className="font-mono text-3xl font-bold tracking-tight"
        style={{ color: accent ?? "var(--color-parchment)" }}
      >
        {value}
      </p>
      {sub && <p className="text-muted text-xs">{sub}</p>}
    </div>
  );
}

/* ── Revenue sparkline data (estimated 12-month distribution) ──────────────── */

function generateSparkline(totalRevenue: number) {
  const months = ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May"];
  // Realistic coffee brand growth curve — heavier recent months
  const weights = [0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.10, 0.10, 0.11, 0.11, 0.12, 0.07];
  return months.map((month, i) => ({
    month,
    revenue: Math.round(totalRevenue * weights[i]),
  }));
}

/* ── Custom recharts tooltip ───────────────────────────────────────────────── */

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#241A14",
        border: "1px solid #3A2D24",
        borderRadius: "4px",
        padding: "8px 12px",
      }}
    >
      <p style={{ color: "#A8957E", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </p>
      <p style={{ color: "#E0964A", fontFamily: "'Space Mono', monospace", fontSize: "14px", fontWeight: 700 }}>
        {"₹" + new Intl.NumberFormat("en-IN").format(payload[0].value)}
      </p>
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
    queryFn: () => campaignsApi.list().then((r) => r.data.data as Campaign[]),
  });

  const stats = statsRes as OverviewStats | undefined;
  const campaigns = (campaignsRes as Campaign[] | undefined) ?? [];
  const sparkData = stats ? generateSparkline(stats.total_revenue) : [];

  return (
    <div className="space-y-8">
      {/* Page heading */}
      <div style={{ animation: "fade-up 0.3s ease forwards", opacity: 0 }}>
        <h1 className="heading">Overview</h1>
        <p className="text-muted text-sm mt-1">BrewBharat · all-time performance</p>
      </div>

      {/* Metric cards */}
      {statsLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card h-24 animate-pulse" style={{ background: "rgba(36,26,20,0.6)" }} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Total Customers"
            value={fmt(stats?.total_customers ?? 0)}
            sub={`${fmt(stats?.total_orders ?? 0)} orders placed`}
            delay={0}
          />
          <MetricCard
            label="Total Revenue"
            value={fmtRupee(stats?.total_revenue ?? 0)}
            sub={`${fmtRupee(stats?.attributed_revenue_30d ?? 0)} attributed`}
            accent="var(--color-copper)"
            delay={80}
          />
          <MetricCard
            label="Active Campaigns"
            value={String(stats?.active_campaigns ?? 0)}
            sub={`${stats?.completed_campaigns ?? 0} completed`}
            delay={160}
          />
          <MetricCard
            label="Avg Delivery Rate"
            value={`${(stats?.avg_delivery_rate ?? 0).toFixed(1)}%`}
            sub="across all campaigns"
            accent="var(--color-sage)"
            delay={240}
          />
        </div>
      )}

      {/* Revenue chart + quick stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue area chart — spans 2 cols */}
        <div className="card lg:col-span-2 space-y-4" style={{ animation: "fade-up 0.4s ease 0.2s forwards", opacity: 0 }}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-medium text-parchment">Revenue Trend</h2>
              <p className="text-muted text-xs mt-0.5">Last 12 months · estimated distribution</p>
            </div>
            {stats && (
              <span className="badge-sage text-xs px-2 py-1">
                ↑ {fmtRupee(stats.total_revenue)} total
              </span>
            )}
          </div>

          {statsLoading ? (
            <div className="h-48 rounded animate-pulse" style={{ background: "var(--color-espresso)" }} />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={sparkData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#E0964A" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#E0964A" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#3A2D24" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fill: "#A8957E", fontSize: 11, fontFamily: "'Space Mono', monospace" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#A8957E", fontSize: 10, fontFamily: "'Space Mono', monospace" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                  width={48}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#3A2D24", strokeWidth: 1 }} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#E0964A"
                  strokeWidth={2}
                  fill="url(#revenueGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: "#E0964A", stroke: "#181210", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Quick stats + actions */}
        <div className="card space-y-4" style={{ animation: "fade-up 0.4s ease 0.3s forwards", opacity: 0 }}>
          <h2 className="font-display text-base font-medium text-parchment">Quick Stats</h2>
          <div className="space-y-3">
            {[
              {
                label: "Avg Order Value",
                value: stats
                  ? fmtRupee((stats.total_revenue ?? 0) / Math.max(stats.total_orders ?? 1, 1))
                  : "—",
                color: "var(--color-copper)",
              },
              {
                label: "Orders / Customer",
                value: stats
                  ? ((stats.total_orders ?? 0) / Math.max(stats.total_customers ?? 1, 1)).toFixed(1)
                  : "—",
                color: "var(--color-parchment)",
              },
              {
                label: "Delivery Rate",
                value: stats ? `${(stats.avg_delivery_rate ?? 0).toFixed(1)}%` : "—",
                color: "var(--color-sage)",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="flex justify-between items-center py-2 border-b border-border/40 last:border-0"
              >
                <span className="text-muted text-xs">{item.label}</span>
                <span className="font-mono text-sm font-bold" style={{ color: item.color }}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>

          <div className="pt-2 space-y-2">
            <p className="text-muted text-[11px] uppercase tracking-wider mb-2">Quick Actions</p>
            <Link href="/segments/new" className="btn-ghost w-full text-xs justify-start px-3 py-2">
              📊 Build New Segment
            </Link>
            <Link href="/campaigns/new" className="btn-primary w-full text-xs justify-start px-3 py-2">
              📣 Launch Campaign
            </Link>
          </div>
        </div>
      </div>

      {/* Recent campaigns */}
      <div className="card" style={{ animation: "fade-up 0.4s ease 0.4s forwards", opacity: 0 }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-medium text-parchment">Recent Campaigns</h2>
          <Link href="/campaigns" className="text-muted text-xs hover:text-copper transition-colors">
            View all →
          </Link>
        </div>

        {campaignsLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-10 rounded animate-pulse"
                style={{ background: "var(--color-espresso)" }}
              />
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted text-sm">No campaigns yet —</p>
            <Link href="/campaigns/new" className="btn-primary mt-3 inline-block text-sm">
              Create your first campaign
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted text-xs uppercase tracking-wider">
                  <th className="text-left pb-2 pr-4">Name</th>
                  <th className="text-left pb-2 pr-4">Channel</th>
                  <th className="text-left pb-2 pr-4">Status</th>
                  <th className="text-right pb-2">Launched</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {campaigns.slice(0, 6).map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-espresso/60 transition-colors cursor-pointer group"
                    onClick={() => (window.location.href = `/campaigns/${c.id}`)}
                  >
                    <td className="py-2.5 pr-4 text-parchment group-hover:text-copper transition-colors font-medium">
                      {c.name}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className="flex items-center gap-1.5 text-muted text-xs font-mono uppercase">
                        {CHANNEL_ICON[c.channel]} {c.channel}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={STATUS_BADGE[c.status]}>
                        {c.status === "running" && (
                          <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse mr-1.5 inline-block" />
                        )}
                        {c.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-mono text-muted text-xs">
                      {c.launched_at
                        ? new Date(c.launched_at).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
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
