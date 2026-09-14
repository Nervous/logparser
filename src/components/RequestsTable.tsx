"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Check, X, Loader2, RefreshCw } from "lucide-react";

interface Req {
  id: number; region: string; server: string; name: string; searchParams: string;
  logTypes: string[]; unauthorizedTypes: string[]; fromDate: string; toDate: string;
  status: string; requester: string; approver: string | null; lineCount: number | null; createdAt: string;
}

const STATUS_STYLE: Record<string, string> = {
  COMPLETE: "text-good", APPROVED: "text-good", RUNNING: "text-accent-2",
  PENDING_APPROVAL: "text-warn", DENIED: "text-bad", FAILED: "text-bad",
};

function fmtDate(s: string) { return new Date(s).toLocaleString(); }
function fmtRange(a: string, b: string) {
  const d = (x: string) => new Date(x).toISOString().slice(0, 10);
  return d(a) === d(b) ? d(a) : `${d(a)} – ${d(b)}`;
}

export default function RequestsTable({ scope, canApprove }: { scope: "all" | "mine" | "queue"; canApprove: boolean }) {
  const [rows, setRows] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/requests?scope=${scope}`);
    const j = await res.json();
    setRows(res.ok ? j.requests : []);
    setLoading(false);
  }, [scope]);

  useEffect(() => { load(); }, [load]);

  async function decide(id: number, decision: "approve" | "deny") {
    setBusyId(id);
    await fetch(`/api/requests/${id}/decision`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }),
    });
    setBusyId(null);
    load();
  }

  const shown = rows.filter((r) =>
    !filter || `${r.id} ${r.name} ${r.searchParams} ${r.requester} ${r.status}`.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search requests…"
          className="flex-1 rounded-lg border border-border bg-bg-elev-2 px-3 py-2 text-sm outline-none focus:border-accent-2" />
        <button onClick={load} className="flex items-center gap-1.5 rounded-lg bg-bg-elev-2 px-3 py-2 text-sm text-text-soft hover:text-text"><RefreshCw size={14} /> Refresh</button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-bg-elev">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wider text-text-dim">
            <tr>
              <th className="px-4 py-3">#</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Types</th>
              <th className="px-4 py-3">Date(s)</th><th className="px-4 py-3">Search</th><th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Requester</th><th className="px-4 py-3">Approver</th><th className="px-4 py-3">Created</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-b border-border-soft hover:bg-bg-elev-2/40">
                <td className="px-4 py-3 text-text-dim">{r.id}</td>
                <td className="max-w-[220px] truncate px-4 py-3">{r.name}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {r.logTypes.map((t) => (
                      <span key={t} className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${r.unauthorizedTypes.includes(t) ? "bg-warn/15 text-warn" : "bg-bg-elev-2 text-text-soft"}`}>#{t}</span>
                    ))}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-text-soft">{fmtRange(r.fromDate, r.toDate)}</td>
                <td className="max-w-[200px] truncate px-4 py-3 font-mono text-xs text-text-soft">{r.searchParams}</td>
                <td className={`whitespace-nowrap px-4 py-3 ${STATUS_STYLE[r.status] ?? ""}`}>{r.status.replace("_", " ").toLowerCase()}</td>
                <td className="px-4 py-3 text-text-soft">{r.requester}</td>
                <td className="px-4 py-3 text-text-dim">{r.approver ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-text-dim">{fmtDate(r.createdAt)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  {r.status === "COMPLETE" && (
                    <a href={`/api/export/${r.id}/download`} className="inline-flex items-center gap-1 text-accent-2 hover:underline"><Download size={14} /> Download</a>
                  )}
                  {r.status === "PENDING_APPROVAL" && canApprove && (
                    <span className="inline-flex gap-2">
                      <button disabled={busyId === r.id} onClick={() => decide(r.id, "approve")} className="inline-flex items-center gap-1 rounded bg-good/15 px-2 py-1 text-good hover:bg-good/25 disabled:opacity-40">
                        {busyId === r.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Approve
                      </button>
                      <button disabled={busyId === r.id} onClick={() => decide(r.id, "deny")} className="inline-flex items-center gap-1 rounded bg-bad/15 px-2 py-1 text-bad hover:bg-bad/25 disabled:opacity-40"><X size={13} /> Deny</button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {!loading && shown.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-12 text-center text-text-dim">No requests.</td></tr>
            )}
            {loading && (
              <tr><td colSpan={10} className="px-4 py-12 text-center text-text-dim"><Loader2 className="inline animate-spin" /></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
