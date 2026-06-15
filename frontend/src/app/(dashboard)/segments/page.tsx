"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { segmentsApi, Segment } from "@/lib/api/segments";
import Link from "next/link";

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function SegmentsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["segments"],
    queryFn: () => segmentsApi.list().then((r) => r.data.data),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => segmentsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["segments"] }),
  });

  const segments = (data ?? []) as Segment[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="heading">Segments</h1>
          <p className="text-muted text-sm mt-1">{segments.length} saved segments</p>
        </div>
        <Link href="/segments/new" className="btn-primary">+ New Segment</Link>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0,1,2].map((i) => (
            <div key={i} className="card h-20 animate-pulse" />
          ))}
        </div>
      ) : segments.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 py-16 text-center">
          <span className="text-4xl opacity-20">📊</span>
          <p className="text-muted">No segments yet</p>
          <Link href="/segments/new" className="btn-primary mt-2">Build your first segment</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {segments.map((seg) => (
            <div key={seg.id} className="card flex items-center gap-4 hover:border-copper/40 transition-colors">
              {/* Member count */}
              <div className="text-right shrink-0 w-20">
                <p className="font-mono text-2xl font-bold text-copper">{seg.member_count ?? 0}</p>
                <p className="text-muted text-[11px]">members</p>
              </div>
              <div className="w-px h-10 bg-border" />
              {/* Info */}
              <div className="flex-1 min-w-0">
                <Link href={`/segments/${seg.id}`} className="text-parchment font-medium hover:text-copper transition-colors">
                  {seg.name}
                </Link>
                <p className="text-muted text-xs mt-0.5 font-mono">
                  {seg.last_computed_at ? `Computed ${fmtDate(seg.last_computed_at)}` : "Not yet computed"}
                </p>
              </div>
              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <Link href={`/campaigns/new?segment=${seg.id}`} className="btn-ghost text-xs px-3 py-1.5">
                  Launch Campaign
                </Link>
                <button
                  className="btn-ghost text-xs px-2 py-1.5 hover:border-brick/50 hover:text-brick"
                  onClick={() => {
                    if (confirm(`Delete "${seg.name}"?`)) deleteMut.mutate(seg.id);
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
