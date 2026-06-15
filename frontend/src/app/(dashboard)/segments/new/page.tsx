"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { segmentsApi, SegmentRule, RuleGroup } from "@/lib/api/segments";
import { RuleGroupEditor, emptyGroup } from "@/components/segments/RuleBuilder";
import { toast } from "sonner";

/* ── Live preview panel ────────────────────────────────────────────────────── */

function PreviewPanel({ rules }: { rules: SegmentRule }) {
  const { data, isFetching, error } = useQuery({
    queryKey: ["segment-preview", JSON.stringify(rules)],
    queryFn: () => segmentsApi.preview(rules).then((r) => r.data.data),
    staleTime: 0,
    retry: false,
  });

  return (
    <div className="card sticky top-6 space-y-4">
      <p className="text-muted text-xs uppercase tracking-wider">Live Preview</p>
      <div className="text-center py-4">
        {isFetching ? (
          <div className="w-8 h-8 border-2 border-copper/30 border-t-copper rounded-full animate-spin mx-auto" />
        ) : error ? (
          <p className="text-brick text-sm">Invalid rules</p>
        ) : (
          <>
            <p className="font-mono text-5xl font-bold text-copper">{data?.count ?? 0}</p>
            <p className="text-muted text-sm mt-1">customers match</p>
          </>
        )}
      </div>

      {data?.sample && data.sample.length > 0 && (
        <div className="space-y-1">
          <p className="text-muted text-[11px] uppercase tracking-wider">Sample</p>
          {data.sample.slice(0, 5).map((c) => (
            <div key={c.id} className="flex justify-between text-xs py-1 border-b border-border/50">
              <span className="text-parchment truncate">{c.name}</span>
              <span className="text-copper font-mono ml-2 shrink-0">
                ₹{new Intl.NumberFormat("en-IN").format(Math.round(c.total_spent))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── New Segment page ─────────────────────────────────────────────────────────── */

type Tab = "build" | "nl";

export default function NewSegmentPage() {
  const router = useRouter();
  const qc     = useQueryClient();
  const [tab, setTab]         = useState<Tab>("build");
  const [name, setName]       = useState("");
  const [rules, setRules]     = useState<RuleGroup>(emptyGroup());
  const [nlText, setNLText]   = useState("");
  const [nlRules, setNLRules] = useState<SegmentRule | null>(null);
  const [nlLoading, setNLLoading] = useState(false);
  const [nlError, setNLError]     = useState<string | null>(null);

  const activeRules: SegmentRule = tab === "nl" && nlRules ? nlRules : rules;

  const saveMut = useMutation({
    mutationFn: () => segmentsApi.create(name, activeRules),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["segments"] });
      toast.success(`Segment "${name}" saved with ${res.data.data.member_count ?? 0} members`);
      router.push("/segments");
    },
    onError: () => toast.error("Failed to save segment — check your rules"),
  });

  const handleGenerate = async () => {
    if (!nlText.trim()) return;
    setNLLoading(true);
    setNLError(null);
    try {
      const res = await segmentsApi.fromNL(nlText);
      setNLRules(res.data.data.rules);
      toast.success("Rules generated from your description");
    } catch {
      setNLError("Could not generate rules. Try rephrasing.");
      toast.error("Failed to generate rules");
    } finally {
      setNLLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="heading">New Segment</h1>
        <p className="text-muted text-sm mt-1">Define who belongs in this audience</p>
      </div>

      <input
        className="input max-w-md text-base"
        placeholder="Segment name, e.g. Lapsed High-Value Mumbai"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

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

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-4">
          {tab === "build" ? (
            <div className="card">
              <RuleGroupEditor group={rules} onChange={setRules} />
            </div>
          ) : (
            <div className="card space-y-4">
              <textarea
                className="input w-full h-28 resize-none"
                placeholder="e.g. High-value customers in Mumbai who haven't ordered in 30 days"
                value={nlText}
                onChange={(e) => setNLText(e.target.value)}
              />
              <button
                className="btn-primary"
                onClick={handleGenerate}
                disabled={nlLoading || !nlText.trim()}
              >
                {nlLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-espresso/40 border-t-espresso rounded-full animate-spin" />
                    Generating…
                  </span>
                ) : "✨ Generate Rules"}
              </button>
              {nlError && <p className="text-brick text-sm">{nlError}</p>}
              {nlRules && (
                <div className="mt-2 border border-copper/20 rounded p-4 bg-espresso/50">
                  <p className="text-muted text-xs uppercase tracking-wider mb-3">AI-Generated Rules (read-only)</p>
                  {"operator" in nlRules ? (
                    <RuleGroupEditor
                      group={nlRules as RuleGroup}
                      onChange={() => {}}
                    />
                  ) : (
                    <pre className="text-xs font-mono text-parchment">{JSON.stringify(nlRules, null, 2)}</pre>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <PreviewPanel rules={activeRules} />
      </div>

      <div className="flex items-center gap-3">
        <button
          className="btn-primary"
          disabled={!name.trim() || saveMut.isPending}
          onClick={() => saveMut.mutate()}
        >
          {saveMut.isPending ? "Saving…" : "Save Segment"}
        </button>
        <button className="btn-ghost" onClick={() => router.back()}>Cancel</button>
        {saveMut.isError && (
          <p className="text-brick text-sm">Save failed — check rules and try again.</p>
        )}
      </div>
    </div>
  );
}
