"use client";
import { useQuery } from "@tanstack/react-query";
import { campaignsApi, Campaign, CampaignStatus } from "@/lib/api/campaigns";
import Link from "next/link";

const STATUS_BADGE: Record<CampaignStatus, string> = {
  draft:     "badge-muted",
  running:   "badge-gold",
  completed: "badge-sage",
  failed:    "badge-brick",
};

const CHANNEL_ICON: Record<string, string> = {
  whatsapp: "💬",
  sms:      "📱",
  email:    "✉️",
  rcs:      "🔵",
};

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function CampaignsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => campaignsApi.list().then((r) => r.data.data as Campaign[]),
  });

  const campaigns = data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="heading">Campaigns</h1>
          <p className="text-muted text-sm mt-1">{campaigns.length} total</p>
        </div>
        <Link href="/campaigns/new" className="btn-primary">+ New Campaign</Link>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0,1,2].map((i) => <div key={i} className="card h-20 animate-pulse" />)}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 py-16 text-center">
          <span className="text-4xl opacity-20">📣</span>
          <p className="text-muted">No campaigns yet</p>
          <Link href="/campaigns/new" className="btn-primary mt-2">Create your first campaign</Link>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted text-xs uppercase tracking-wider bg-espresso/50">
                {["Campaign", "Channel", "Status", "Launched", ""].map((h, i) => (
                  <th key={i} className={`text-left px-5 py-3 ${i === 4 ? "text-right" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {campaigns.map((c) => (
                <tr key={c.id} className="hover:bg-surface/60 transition-colors group">
                  <td className="px-5 py-3">
                    <Link href={`/campaigns/${c.id}`} className="text-parchment group-hover:text-copper transition-colors font-medium">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-1.5 text-muted text-xs font-mono uppercase">
                      {CHANNEL_ICON[c.channel]} {c.channel}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={STATUS_BADGE[c.status]}>
                      {c.status === "running" && (
                        <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse mr-1.5 inline-block" />
                      )}
                      {c.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted text-xs font-mono">{fmtDate(c.launched_at)}</td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/campaigns/${c.id}`} className="btn-ghost text-xs px-3 py-1.5">
                      Analytics →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
