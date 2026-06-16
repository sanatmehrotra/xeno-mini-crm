"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customersApi, Customer } from "@/lib/api/customers";
import { toast } from "sonner";

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

/* ── Add Customer Modal ───────────────────────────────────────────────────── */

function AddCustomerModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "", email: "", phone: "",
    city: "Mumbai", tier: "bronze", acquisition_channel: "organic",
    tags: "",
  });

  const mut = useMutation({
    mutationFn: () => customersApi.create({
      name: form.name,
      email: form.email,
      phone: form.phone || undefined,
      attributes: {
        city: form.city,
        tier: form.tier,
        acquisition_channel: form.acquisition_channel,
      },
      tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast.success(`Customer "${form.name}" added`);
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail ?? "Failed to add customer");
    },
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <div className="fixed inset-0 bg-espresso/60 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-md space-y-5 p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg text-parchment">Add Customer</h2>
            <button onClick={onClose} className="text-muted hover:text-parchment">✕</button>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted mb-1">Name *</label>
                <input className="input w-full" placeholder="Priya Sharma" value={form.name} onChange={set("name")} />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Phone</label>
                <input className="input w-full" placeholder="+91 98XXXXXXXX" value={form.phone} onChange={set("phone")} />
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Email *</label>
              <input className="input w-full" type="email" placeholder="priya@email.com" value={form.email} onChange={set("email")} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-muted mb-1">City</label>
                <select className="input w-full" value={form.city} onChange={set("city")}>
                  {["Mumbai","Delhi","Bangalore","Chennai","Hyderabad","Pune","Kolkata","Ahmedabad"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Tier</label>
                <select className="input w-full" value={form.tier} onChange={set("tier")}>
                  {["bronze","silver","gold","platinum"].map((t) => (
                    <option key={t} className="capitalize">{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Channel</label>
                <select className="input w-full" value={form.acquisition_channel} onChange={set("acquisition_channel")}>
                  {["organic","paid_instagram","paid_google","referral","influencer"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Tags <span className="opacity-60">(comma-separated)</span></label>
              <input className="input w-full" placeholder="vip, coffee_lover, repeat_buyer" value={form.tags} onChange={set("tags")} />
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              className="btn-primary flex-1"
              disabled={!form.name || !form.email || mut.isPending}
              onClick={() => mut.mutate()}
            >
              {mut.isPending ? "Adding…" : "Add Customer"}
            </button>
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Import JSON/CSV Modal ────────────────────────────────────────────────── */

function ImportModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"json" | "csv">("json");
  const [raw, setRaw] = useState("");
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);

  const mut = useMutation({
    mutationFn: async () => {
      let records: any[];
      if (tab === "json") {
        records = JSON.parse(raw);
      } else {
        // Parse CSV: first row is headers
        const lines = raw.trim().split("\n");
        const headers = lines[0].split(",").map((h) => h.trim());
        records = lines.slice(1).map((line) => {
          const vals = line.split(",").map((v) => v.trim());
          const obj: any = {};
          headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
          return obj;
        });
      }
      const res = await customersApi.import(records);
      return res.data.data as { imported: number; skipped: number };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      setResult(data);
      toast.success(`Imported ${data.imported} customers, skipped ${data.skipped} duplicates`);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail ?? "Import failed — check your data format");
    },
  });

  const exampleJson = `[\n  {\n    "name": "Arjun Mehta",\n    "email": "arjun@email.com",\n    "phone": "+917788991234",\n    "total_spent": 5400,\n    "order_count": 3,\n    "attributes": { "city": "Delhi", "tier": "silver" },\n    "tags": ["repeat_buyer"]\n  }\n]`;

  const exampleCsv = `name,email,phone,total_spent,order_count\nArjun Mehta,arjun@email.com,+917788991234,5400,3`;

  return (
    <>
      <div className="fixed inset-0 bg-espresso/60 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-lg space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg text-parchment">Import Customers</h2>
            <button onClick={onClose} className="text-muted hover:text-parchment">✕</button>
          </div>

          {/* Format tabs */}
          <div className="flex gap-1 border-b border-border">
            {(["json", "csv"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setRaw(""); setResult(null); }}
                className={`px-4 py-2 text-xs font-mono uppercase border-b-2 -mb-px transition-colors ${
                  tab === t ? "border-copper text-copper" : "border-transparent text-muted hover:text-parchment"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {result ? (
            <div className="text-center py-6 space-y-2">
              <p className="text-5xl">✅</p>
              <p className="text-parchment font-medium">{result.imported} customers imported</p>
              <p className="text-muted text-sm">{result.skipped} duplicates skipped</p>
              <button className="btn-ghost text-xs mt-2" onClick={onClose}>Close</button>
            </div>
          ) : (
            <>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-muted uppercase tracking-wider">Paste {tab.toUpperCase()} data</label>
                  <button
                    className="text-copper text-xs hover:underline"
                    onClick={() => setRaw(tab === "json" ? exampleJson : exampleCsv)}
                  >
                    Load example
                  </button>
                </div>
                <textarea
                  className="input w-full h-48 font-mono text-xs resize-none"
                  placeholder={tab === "json" ? exampleJson : exampleCsv}
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                />
              </div>
              <div className="flex gap-3">
                <button
                  className="btn-primary flex-1"
                  disabled={!raw.trim() || mut.isPending}
                  onClick={() => mut.mutate()}
                >
                  {mut.isPending ? (
                    <span className="flex items-center gap-2 justify-center">
                      <span className="w-4 h-4 border-2 border-espresso/40 border-t-espresso rounded-full animate-spin" />
                      Importing…
                    </span>
                  ) : `Import ${tab.toUpperCase()}`}
                </button>
                <button className="btn-ghost" onClick={onClose}>Cancel</button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default function CustomersPage() {
  const [page,    setPage]    = useState(1);
  const [search,  setSearch]  = useState("");
  const [sortBy,  setSortBy]  = useState("last_purchase_at");
  const [order,   setOrder]   = useState<"asc"|"desc">("desc");
  const [selected, setSelected] = useState<Customer | null>(null);
  const [cityFilter, setCityFilter] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [showAdd, setShowAdd]       = useState(false);
  const [showImport, setShowImport] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["customers", page, search, sortBy, order, cityFilter, tierFilter],
    queryFn: () =>
      customersApi.list({
        page, limit: 50,
        search: search || undefined,
        sort_by: sortBy,
        order,
        city: cityFilter || undefined,
        tier: tierFilter || undefined,
      }).then((r) => r.data),
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
        <div className="flex items-center gap-2">
          <button className="btn-ghost text-sm px-3 py-2" onClick={() => setShowImport(true)}>
            ↑ Import
          </button>
          <button className="btn-primary text-sm" onClick={() => setShowAdd(true)}>
            + Add Customer
          </button>
        </div>
      </div>

      {showAdd    && <AddCustomerModal onClose={() => setShowAdd(false)} />}
      {showImport && <ImportModal      onClose={() => setShowImport(false)} />}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
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
        {/* City quick-filter */}
        <select
          className="input w-36"
          value={cityFilter}
          onChange={(e) => { setCityFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Cities</option>
          {["Mumbai","Delhi","Bangalore","Chennai","Hyderabad","Pune","Kolkata","Ahmedabad"].map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        {/* Tier quick-filter */}
        <select
          className="input w-32"
          value={tierFilter}
          onChange={(e) => { setTierFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Tiers</option>
          {["platinum","gold","silver","bronze"].map((t) => (
            <option key={t} value={t} className="capitalize">{t}</option>
          ))}
        </select>
        {/* Clear filters */}
        {(cityFilter || tierFilter) && (
          <button
            className="btn-ghost text-xs px-3 py-2 text-brick hover:border-brick/50"
            onClick={() => { setCityFilter(""); setTierFilter(""); setPage(1); }}
          >
            ✕ Clear filters
          </button>
        )}
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
