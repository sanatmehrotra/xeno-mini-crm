"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { segmentsApi, Segment, RuleGroup, RuleCondition, SegmentRule } from "@/lib/api/segments";
import { SEGMENT_FIELDS, SEGMENT_OPS } from "@/lib/api/segments";
import Link from "next/link";
import { toast } from "sonner";

/* ── Type helpers ──────────────────────────────────────────────────────────── */

function isGroup(r: SegmentRule): r is RuleGroup {
  return "operator" in r;
}

function fieldLabel(value: string) {
  return SEGMENT_FIELDS.find((f) => f.value === value)?.label ?? value;
}
function opLabel(value: string) {
  return SEGMENT_OPS.find((o) => o.value === value)?.label ?? value;
}

/* ── Rule display (read-only) ───────────────────────────────────────────────── */

function RuleDisplay({ rule, depth = 0 }: { rule: SegmentRule; depth?: number }) {
  if (isGroup(rule)) {
    return (
      <div className={depth > 0 ? "ml-4 pl-3 border-l-2 border-border/60 space-y-2" : "space-y-2"}>
        {rule.conditions.map((c, i) => (
          <div key={i} className="space-y-2">
            {i > 0 && (
              <span className={`inline-block text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                rule.operator === "AND"
                  ? "bg-copper/15 text-copper border border-copper/30"
                  : "bg-sage/15 text-sage border border-sage/30"
              }`}>
                {rule.operator}
              </span>
            )}
            <RuleDisplay rule={c} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  // Leaf condition
  const cond = rule as RuleCondition;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="bg-espresso border border-border rounded px-2 py-1 text-xs text-parchment font-mono">
        {fieldLabel(cond.field)}
      </span>
      <span className="text-muted text-xs">{opLabel(cond.op)}</span>
      <span className="bg-copper/10 border border-copper/30 rounded px-2 py-1 text-xs text-copper font-mono">
        {Array.isArray(cond.value) ? cond.value.join(", ") : String(cond.value)}
      </span>
    </div>
  );
}

/* ── Segment detail page ────────────────────────────────────────────────────── */

export default function SegmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: segRes, isLoading } = useQuery({
    queryKey: ["segment", id],
    queryFn: () => segmentsApi.get(id).then((r) => r.data.data as Segment),
  });

  const { data: previewRes, isLoading: previewLoading } = useQuery({
    queryKey: ["segment-preview", id],
    queryFn: () => segmentsApi.preview(seg!.rules).then((r) => r.data.data),
    enabled: !!segRes,
  });

  const deleteMut = useMutation({
    mutationFn: () => segmentsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["segments"] });
      toast.success("Segment deleted");
      router.push("/segments");
    },
    onError: () => toast.error("Failed to delete segment"),
  });

  const seg = segRes;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 rounded animate-pulse" style={{ background: "var(--color-surface)" }} />
        <div className="card h-48 animate-pulse" />
        <div className="card h-32 animate-pulse" />
      </div>
    );
  }

  if (!seg) {
    return (
      <div className="card text-center py-16">
        <p className="text-muted">Segment not found</p>
        <Link href="/segments" className="btn-ghost mt-4">← Back to Segments</Link>
      </div>
    );
  }

  const fmtDate = (s: string | null) =>
    s ? new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Never";

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-muted text-xs mb-2">
            <button onClick={() => router.push("/segments")} className="hover:text-copper transition-colors">
              Segments
            </button>
            <span>/</span>
            <span className="text-parchment">{seg.name}</span>
          </div>
          <h1 className="heading">{seg.name}</h1>
          <p className="text-muted text-sm mt-1 font-mono">
            Last computed: {fmtDate(seg.last_computed_at)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/campaigns/new?segment=${seg.id}`}
            className="btn-primary"
          >
            Launch Campaign
          </Link>
          <button
            className="btn-ghost hover:border-brick/50 hover:text-brick"
            onClick={() => {
              toast(`Delete "${seg.name}"?`, {
                description: "This cannot be undone.",
                action: {
                  label: "Delete",
                  onClick: () => deleteMut.mutate(),
                },
                cancel: { label: "Cancel", onClick: () => {} },
              });
            }}
            disabled={deleteMut.isPending}
          >
            {deleteMut.isPending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center">
          <p className="text-muted text-xs uppercase tracking-wider">Members</p>
          <p className="font-mono text-4xl font-bold text-copper mt-1">
            {seg.member_count ?? 0}
          </p>
        </div>
        <div className="card text-center">
          <p className="text-muted text-xs uppercase tracking-wider">Live Preview</p>
          {previewLoading ? (
            <div className="h-10 rounded animate-pulse mt-1" style={{ background: "var(--color-espresso)" }} />
          ) : (
            <p className="font-mono text-4xl font-bold text-sage mt-1">
              {previewRes?.count ?? "—"}
            </p>
          )}
          <p className="text-muted text-[11px] mt-0.5">current match</p>
        </div>
        <div className="card text-center">
          <p className="text-muted text-xs uppercase tracking-wider">Created</p>
          <p className="font-mono text-lg font-bold text-parchment mt-1">
            {fmtDate(seg.created_at)}
          </p>
        </div>
      </div>

      {/* Rules */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-medium text-parchment">Segment Rules</h2>
          <Link href="/segments/new" className="btn-ghost text-xs px-3 py-1.5">
            Clone & Edit
          </Link>
        </div>
        <div className="bg-espresso rounded p-4 border border-border/50">
          <RuleDisplay rule={seg.rules} />
        </div>
      </div>

      {/* Sample members */}
      {previewRes?.sample && previewRes.sample.length > 0 && (
        <div className="card space-y-3">
          <h2 className="font-display text-base font-medium text-parchment">Sample Members</h2>
          <div className="space-y-2">
            {previewRes.sample.map((customer) => (
              <div
                key={customer.id}
                className="flex items-center justify-between py-2 border-b border-border/40 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: "rgba(224,150,74,0.15)", border: "1px solid rgba(224,150,74,0.3)" }}
                  >
                    <span className="text-copper text-xs font-bold font-mono">{customer.name[0]}</span>
                  </div>
                  <div>
                    <p className="text-parchment text-sm">{customer.name}</p>
                    <p className="text-muted text-xs font-mono">{customer.email}</p>
                  </div>
                </div>
                <span className="font-mono text-copper text-sm font-bold">
                  ₹{new Intl.NumberFormat("en-IN").format(Math.round(customer.total_spent))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
