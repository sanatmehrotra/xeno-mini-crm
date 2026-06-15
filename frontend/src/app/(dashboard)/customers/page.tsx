"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customersApi, Customer } from "@/lib/api/customers";

/* ── Helpers ───────────────────────────────────────────────────────────────── */

const TIER_BADGE: Record<string, string> = {
  platinum: "badge-copper",
  gold:     "badge-gold",
  silver:   "badge-muted",
  bronze:   "badge-muted",
};
const TAG_BADGE: Record<string, string> = {
  vip:        "badge-copper",
  high_value: "badge-gold",
  lapsed:     "badge-brick",
  new:        "badge-sage",
  repeat_buyer:"badge-sage",
};

function fmtRupee(n: number) {
  return "₹" + new Intl.NumberFormat("en-IN").format(Math.round(n));
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/* ── Customer detail slide-over panel ─────────────────────────────────────── */

function CustomerPanel({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ["customer", customer.id],
    queryFn: () => customersApi.get(customer.id).then((r) => r.data.data),
  });
  const detail = data ?? customer;

  return (
    <aside className="fixed right-0 top-0 h-screen w-[360px] bg-surface border-l border-border z-40 flex flex-col shadow-xl overflow-y-auto">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-surface">
        <h2 className="font-display text-base font-medium text-parchment">Customer Profile</h2>
        <button onClick={onClose} className="text-muted hover:text-parchment text-lg transition-colors">✕</button>
      </div>

      <div className="p-5 space-y-5">
        {/* Avatar + name */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-copper/20 border border-copper/40 flex items-center justify-center shrink-0">
            <span className="text-copper text-lg font-bold font-mono">{detail.name?.[0] ?? "?"}</span>
          </div>
          <div>
            <p className="text-parchment font-medium">{detail.name}</p>
            <p className="text-muted text-xs">{detail.email}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-espresso rounded p-3">
            <p className="text-muted text-[10px] uppercase tracking-wider">Total Spent</p>
            <p className="font-mono text-copper text-lg font-bold mt-0.5">{fmtRupee(detail.total_spent)}</p>
          </div>
          <div className="bg-espresso rounded p-3">
            <p className="text-muted text-[10px] uppercase tracking-wider">Orders</p>
            <p className="font-mono text-parchment text-lg font-bold mt-0.5">{detail.order_count}</p>
          </div>
        </div>

        {/* Attributes */}
        <div className="space-y-2">
          {[
            ["Phone",   detail.phone ?? "—"],
            ["City",    detail.attributes?.city ?? "—"],
            ["Channel", detail.attributes?.acquisition_channel ?? "—"],
            ["First Purchase", fmtDate(detail.first_purchase_at)],
            ["Last Purchase",  fmtDate(detail.last_purchase_at)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between text-sm">
              <span className="text-muted">{k}</span>
              <span className="text-parchment font-mono text-xs">{v}</span>
            </div>
          ))}
          {detail.attributes?.tier && (
            <div className="flex justify-between text-sm">
              <span className="text-muted">Tier</span>
              <span className={TIER_BADGE[detail.attributes.tier] ?? "badge-muted"}>
                {detail.attributes.tier}
              </span>
            </div>
          )}
        </div>

        {/* Tags */}
        {detail.tags?.length > 0 && (
          <div>
            <p className="text-muted text-xs uppercase tracking-wider mb-2">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {detail.tags.map((t) => (
                <span key={t} className={TAG_BADGE[t] ?? "badge-muted"}>{t}</span>
              ))}
            </div>
          </div>
        )}

        {/* Recent orders */}
        {"recent_orders" in detail && (detail as any).recent_orders?.length > 0 && (
          <div>
            <p className="text-muted text-xs uppercase tracking-wider mb-2">Order History</p>
            <div className="space-y-2">
              {(detail as any).recent_orders.slice(0, 5).map((o: any) => (
                <div key={o.id} className="bg-espresso rounded px-3 py-2 flex justify-between items-center">
                  <div>
                    <p className="text-parchment text-xs font-mono">{fmtDate(o.ordered_at)}</p>
                    <p className="text-muted text-[11px] uppercase">{o.channel}</p>
                  </div>
                  <p className="text-copper font-mono text-sm font-bold">{fmtRupee(o.amount)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

/* ── Customers page ────────────────────────────────────────────────────────── */

const SORT_OPTIONS = [
  { value: "last_purchase_at", label: "Last Purchase" },
  { value: "total_spent",      label: "Total Spent" },
  { value: "order_count",      label: "Order Count" },
  { value: "created_at",       label: "Date Added" },
  { value: "name",             label: "Name" },
];

export default function CustomersPage() {
  const [page,    setPage]    = useState(1);
  const [search,  setSearch]  = useState("");
  const [sortBy,  setSortBy]  = useState("last_purchase_at");
  const [order,   setOrder]   = useState<"asc"|"desc">("desc");
  const [selected, setSelected] = useState<Customer | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["customers", page, search, sortBy, order],
    queryFn: () =>
      customersApi.list({ page, limit: 50, search: search || undefined, sort_by: sortBy, order }).then((r) => r.data),
    placeholderData: (prev) => prev,
  });

  const customers = data?.data ?? [];
  const total     = data?.meta?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="heading">Customers</h1>
          <p className="text-muted text-sm mt-1 font-mono">{total} customers</p>
        </div>
        <button className="btn-primary">↑ Import</button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <input
          className="input max-w-xs"
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <select
          className="input w-48"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          className="btn-ghost px-3 py-2 font-mono text-xs"
          onClick={() => setOrder(order === "desc" ? "asc" : "desc")}
        >
          {order === "desc" ? "↓ DESC" : "↑ ASC"}
        </button>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted text-xs uppercase tracking-wider bg-espresso/50">
                {["Name", "Email", "Total Spent", "Orders", "Last Purchase", "Tags"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 first:pl-5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {isLoading
                ? Array(8).fill(0).map((_, i) => (
                    <tr key={i}>
                      {Array(6).fill(0).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 rounded bg-surface animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : customers.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-surface/60 cursor-pointer transition-colors group"
                      onClick={() => setSelected(c)}
                    >
                      {/* Name */}
                      <td className="px-4 py-3 pl-5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-copper/15 border border-copper/30 flex items-center justify-center shrink-0">
                            <span className="text-copper text-xs font-bold font-mono">{c.name[0]}</span>
                          </div>
                          <span className="text-parchment group-hover:text-copper transition-colors">{c.name}</span>
                        </div>
                      </td>
                      {/* Email */}
                      <td className="px-4 py-3 text-muted text-xs font-mono">{c.email}</td>
                      {/* Total spent */}
                      <td className="px-4 py-3 font-mono text-right">
                        <span className={c.total_spent > 10000 ? "text-copper font-bold" : "text-parchment"}>
                          {fmtRupee(c.total_spent)}
                        </span>
                      </td>
                      {/* Orders */}
                      <td className="px-4 py-3 font-mono text-parchment">{c.order_count}</td>
                      {/* Last purchase */}
                      <td className="px-4 py-3 font-mono text-muted text-xs">{fmtDate(c.last_purchase_at)}</td>
                      {/* Tags */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {c.tags.slice(0, 2).map((t) => (
                            <span key={t} className={`${TAG_BADGE[t] ?? "badge-muted"} text-[10px]`}>{t}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-espresso/30">
          <p className="text-muted text-xs font-mono">
            {Math.min((page - 1) * 50 + 1, total)}–{Math.min(page * 50, total)} of {total}
          </p>
          <div className="flex gap-2">
            <button
              className="btn-ghost px-3 py-1 text-xs"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >← Prev</button>
            <button
              className="btn-ghost px-3 py-1 text-xs"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >Next →</button>
          </div>
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <>
          <div className="fixed inset-0 bg-espresso/40 z-30" onClick={() => setSelected(null)} />
          <CustomerPanel customer={selected} onClose={() => setSelected(null)} />
        </>
      )}
    </div>
  );
}
