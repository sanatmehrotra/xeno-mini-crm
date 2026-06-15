"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { segmentsApi, SegmentRule, RuleGroup } from "@/lib/api/segments";
import { RuleGroupEditor, emptyGroup } from "@/components/segments/RuleBuilder";
import { toast } from "sonner";

/* ── Live preview panel ────────────────────────────────────────────────────── */

function PreviewPanel({ rules }: { rules: SegmentRule }) {
  // Validate rules have at least one real condition before calling API
  const hasConditions = useMemo(() => {
    function check(r: SegmentRule): boolean {
      if ("operator" in r) return r.conditions.length > 0 && r.conditions.some(check);
      return !!(r.field && r.op && (r.value !== "" && r.value !== undefined));
    }
    return check(rules);
  }, [rules]);

  const { data, isFetching, error } = useQuery({
    queryKey: ["segment-preview", JSON.stringify(rules)],
    queryFn: () => segmentsApi.preview(rules).then((r) => r.data.data),
    staleTime: 0,
    retry: false,
    enabled: hasConditions,
  });

  return (
    <div className="card sticky top-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted text-xs uppercase tracking-wider">Live Preview</p>
        {isFetching && (
          <div className="w-3 h-3 border border-copper/40 border-t-copper rounded-full animate-spin" />
        )}
      </div>

      <div className="text-center py-4">
        {!hasConditions ? (
          <p className="text-muted text-sm">Add a condition to preview</p>
        ) : error ? (
          <div className="space-y-1">
            <p className="text-brick text-sm">Invalid rules</p>
            <p className="text-muted text-xs">Check your field/value combination</p>
          </div>
        ) : (
          <>
            <p className="font-mono text-5xl font-bold text-copper">{data?.count ?? "—"}</p>
            <p className="text-muted text-sm mt-1">customers match</p>
          </>
        )}
      </div>

      {data?.sample && data.sample.length > 0 && (
        <div className="space-y-1">
          <p className="text-muted text-[11px] uppercase tracking-wider">Sample customers</p>
          {data.sample.slice(0, 6).map((c) => (
            <div key={c.id} className="flex justify-between text-xs py-1.5 border-b border-border/40">
              <span className="text-parchment truncate">{c.name}</span>
              <span className="text-copper font-mono ml-2 shrink-0">
                ₹{new Intl.NumberFormat("en-IN").format(Math.round(c.total_spent))}
              </span>
            </div>
          ))}
        </div>
      )}

      {data?.count === 0 && (
        <p className="text-muted text-xs text-center bg-espresso rounded p-2">
          No customers match — try loosening the rules
        </p>
      )}
    </div>
  );
}

/* ── New Segment page ──────────────────────────────────────────────────────── */

type Tab = "build" | "nl";

export default function NewSegmentPage() {
  const router = useRouter();
  const qc     = useQueryClient();
  const [tab, setTab]             = useState<Tab>("build");
  const [name, setName]           = useState("");
  const [rules, setRules]         = useState<RuleGroup>(emptyGroup());
  const [nlText, setNLText]       = useState("");
  const [nlRules, setNLRules]     = useState<SegmentRule | null>(null);
  const [nlLoading, setNLLoading] = useState(false);
  const [nlError, setNLError]     = useState<string | null>(null);

  // When in NL tab and rules are generated, use those; otherwise use rule builder state
  const activeRules: SegmentRule = tab === "nl" && nlRules ? nlRules : rules;

  const saveMut = useMutation({
    mutationFn: () => segmentsApi.create(name, activeRules),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["segments"] });
      const count = res.data.data.member_count ?? 0;
      toast.success(`Segment "${name}" saved — ${count} member${count !== 1 ? "s" : ""}`);
      router.push("/segments");
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail;
      toast.error(detail ? `Save failed: ${detail}` : "Save failed — check your rules");
    },
  });

  const handleGenerate = async () => {
    if (!nlText.trim()) return;
    setNLLoading(true);
    setNLError(null);
    setNLRules(null);
    try {
      const res = await segmentsApi.fromNL(nlText);
      setNLRules(res.data.data.rules);
      toast.success("Rules generated! Review them in the preview panel.");
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? "Could not generate rules. Try rephrasing.";
      setNLError(msg);
      toast.error("Failed to generate rules");
    } finally {
      setNLLoading(false);
    }
  };

  const canSave = name.trim().length > 0 && !saveMut.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="heading">New Segment</h1>
        <p className="text-muted text-sm mt-1">Define who belongs in this audience</p>
      </div>

      {/* Segment name */}
      <div>
        <label className="block text-xs text-muted uppercase tracking-wider mb-1.5">Segment Name</label>
        <input
          className="input max-w-md text-base"
          placeholder="e.g. Lapsed High-Value Mumbai"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 border-b border-border">
        {(["build", "nl"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
              tab === t
                ? "border-copper text-copper"
                : "border-transparent text-muted hover:text-parchment"
            }`}
          >
            {t === "build" ? "🔧 Build Rules" : "✨ Describe in English"}
          </button>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-4">

          {/* Rule builder tab */}
          {tab === "build" && (
            <div className="card">
              <RuleGroupEditor group={rules} onChange={setRules} />
            </div>
          )}

          {/* NL tab */}
          {tab === "nl" && (
            <div className="card space-y-4">
              <div>
                <label className="block text-xs text-muted uppercase tracking-wider mb-1.5">
                  Describe your audience in plain English
                </label>
                <textarea
                  className="input w-full h-28 resize-none"
                  placeholder="e.g. High-value customers in Mumbai who haven't ordered in 30 days and have spent more than ₹10,000"
                  value={nlText}
                  onChange={(e) => setNLText(e.target.value)}
                />
              </div>
              <button
                className="btn-primary"
                onClick={handleGenerate}
                disabled={nlLoading || !nlText.trim()}
              >
                {nlLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-espresso/40 border-t-espresso rounded-full animate-spin" />
                    Generating rules…
                  </span>
                ) : "✨ Generate Rules"}
              </button>

              {nlError && (
                <div className="bg-brick/10 border border-brick/30 rounded p-3">
                  <p className="text-brick text-sm">{nlError}</p>
                </div>
              )}

              {nlRules && (
                <div className="border border-copper/20 rounded p-4 bg-espresso/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-muted text-xs uppercase tracking-wider">AI-Generated Rules</p>
                    <button
                      className="text-copper text-xs hover:underline"
                      onClick={() => {
                        // Copy rules to build tab so user can edit
                        if ("operator" in nlRules) {
                          setRules(nlRules as RuleGroup);
                          setTab("build");
                          toast.success("Rules copied to editor — you can now tweak them");
                        }
                      }}
                    >
                      Edit in builder →
                    </button>
                  </div>
                  {"operator" in nlRules ? (
                    <RuleGroupEditor
                      group={nlRules as RuleGroup}
                      onChange={(updated) => setNLRules(updated)}
                    />
                  ) : (
                    <pre className="text-xs font-mono text-parchment overflow-auto">
                      {JSON.stringify(nlRules, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Live preview */}
        <PreviewPanel rules={activeRules} />
      </div>

      {/* Save actions */}
      <div className="flex items-center gap-3">
        <button
          className="btn-primary"
          disabled={!canSave}
          onClick={() => saveMut.mutate()}
        >
          {saveMut.isPending ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-espresso/40 border-t-espresso rounded-full animate-spin" />
              Saving…
            </span>
          ) : "Save Segment"}
        </button>
        <button className="btn-ghost" onClick={() => router.back()}>Cancel</button>
      </div>
    </div>
  );
}
