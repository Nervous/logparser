"use client";

import { groupLabel } from "@/lib/logGroups";
import { REASON_MAX, notifyRequestsChanged } from "@/lib/requests";
import { fmtDate, fmtDateTime } from "@/lib/time";
import { useServerTimeZone } from "./ServerTime";
import { useCallback, useEffect, useState } from "react";
import { Download, Eye, Check, X, Loader2, RefreshCw } from "lucide-react";

interface Req {
  id: number; region: string; server: string; name: string; searchParams: string;
  logTypes: string[]; unauthorizedTypes: string[]; reason: string | null; denyReason: string | null;
  fromDate: string; toDate: string; status: string; requester: string; mine: boolean;
  approver: string | null; lineCount: number | null; createdAt: string;
}

const STATUS_STYLE: Record<string, string> = {
  COMPLETE: "text-good", APPROVED: "text-good", RUNNING: "text-accent-2",
  PENDING_APPROVAL: "text-warn", DENIED: "text-bad", FAILED: "text-bad",
};

// Server-time dates of a request's window: one date if it starts and ends the same day.
function fmtRange(a: string, b: string, tz: string) {
  const [da, db] = [fmtDate(a, tz), fmtDate(b, tz)];
  return da === db ? da : `${da} – ${db}`;
}

export default function RequestsTable({ scope, canApprove }: { scope: "all" | "mine" | "queue"; canApprove: boolean }) {
  const tz = useServerTimeZone();
  const [rows, setRows] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [denying, setDenying] = useState<Req | null>(null); // request whose denial reason is being entered
  const [denyReason, setDenyReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/requests?scope=${scope}`);
    const j = await res.json().catch(() => ({}));
    setRows(res.ok ? j.requests : []);
    setLoading(false);
  }, [scope]);

  useEffect(() => { load(); }, [load]);

  async function decide(id: number, decision: "approve" | "deny", reason?: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/requests/${id}/decision`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, reason }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(`Request #${id}: ${j.error ?? `failed (${res.status})`}`);
      }
    } catch {
      setError(`Request #${id}: failed`);
    } finally {
      setBusyId(null);
    }
    notifyRequestsChanged();
    load();
  }

  function openDeny(r: Req) {
    setDenyReason("");
    setDenying(r);
  }
  function confirmDeny() {
    if (!denying) return;
    const id = denying.id;
    setDenying(null);
    decide(id, "deny", denyReason.trim());
  }

  const shown = rows.filter((r) =>
    !filter || `${r.id} ${r.name} ${r.searchParams} ${r.reason ?? ""} ${r.requester} ${r.status}`.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search requests…"
          className="flex-1 rounded-lg border border-border bg-bg-elev-2 px-3 py-2 text-sm outline-none focus:border-accent-2" />
        <button onClick={load} className="flex items-center gap-1.5 rounded-lg bg-bg-elev-2 px-3 py-2 text-sm text-text-soft hover:text-text"><RefreshCw size={14} /> Refresh</button>
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-bad/70 hover:text-bad"><X size={14} /></button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-bg-elev">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wider text-text-dim">
            <tr>
              <th className="px-4 py-3">#</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3">Types</th><th className="px-4 py-3">Date(s)</th><th className="px-4 py-3">Search</th>
              <th className="px-4 py-3">Status</th><th className="px-4 py-3">Requester</th><th className="px-4 py-3">Approver</th>
              <th className="px-4 py-3">Created <span className="normal-case tracking-normal">({tz})</span></th><th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-b border-border-soft hover:bg-bg-elev-2/40">
                <td className="px-4 py-3 text-text-dim">{r.id}</td>
                <td className="max-w-[220px] truncate px-4 py-3">{r.name}</td>
                <td className="max-w-[260px] px-4 py-3">
                  {r.reason
                    ? <span className="line-clamp-2 text-xs text-text-soft" title={r.reason}>{r.reason}</span>
                    : <span className="text-text-dim">—</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {r.logTypes.map((t) => (
                      <span key={t} className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${r.unauthorizedTypes.includes(t) ? "bg-warn/15 text-warn" : "bg-bg-elev-2 text-text-soft"}`}>{groupLabel(t)}</span>
                    ))}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-text-soft"
                  title={`${fmtDateTime(r.fromDate, tz, { seconds: false })} → ${fmtDateTime(r.toDate, tz, { seconds: false })} (server time, ${tz})`}>
                  {fmtRange(r.fromDate, r.toDate, tz)}
                </td>
                <td className="max-w-[200px] truncate px-4 py-3 font-mono text-xs text-text-soft">{r.searchParams}</td>
                <td className="px-4 py-3">
                  <span className={`whitespace-nowrap ${STATUS_STYLE[r.status] ?? ""}`}>{r.status.replace("_", " ").toLowerCase()}</span>
                  {r.status === "DENIED" && r.denyReason && (
                    <span className="mt-0.5 line-clamp-2 block max-w-[240px] text-xs text-text-soft" title={r.denyReason}>
                      &ldquo;{r.denyReason}&rdquo;
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-text-soft">{r.requester}</td>
                <td className="px-4 py-3 text-text-dim">{r.approver ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-text-dim">{fmtDateTime(r.createdAt, tz)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  {r.status === "COMPLETE" && (
                    <span className="inline-flex items-center gap-3">
                      <a href={`/api/export/${r.id}/download?inline=1`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent-2 hover:underline"><Eye size={14} /> View</a>
                      <a href={`/api/export/${r.id}/download`} className="inline-flex items-center gap-1 text-accent-2 hover:underline"><Download size={14} /> Download</a>
                    </span>
                  )}
                  {r.status === "PENDING_APPROVAL" && canApprove && !r.mine && (
                    <span className="inline-flex gap-2">
                      <button disabled={busyId === r.id} onClick={() => decide(r.id, "approve")} className="inline-flex items-center gap-1 rounded bg-good/15 px-2 py-1 text-good hover:bg-good/25 disabled:opacity-40">
                        {busyId === r.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Approve
                      </button>
                      <button disabled={busyId === r.id} onClick={() => openDeny(r)} className="inline-flex items-center gap-1 rounded bg-bad/15 px-2 py-1 text-bad hover:bg-bad/25 disabled:opacity-40"><X size={13} /> Deny</button>
                    </span>
                  )}
                  {r.status === "PENDING_APPROVAL" && canApprove && r.mine && (
                    <span className="text-xs text-text-dim">awaiting another approver</span>
                  )}
                </td>
              </tr>
            ))}
            {!loading && shown.length === 0 && (
              <tr><td colSpan={11} className="px-4 py-12 text-center text-text-dim">No requests.</td></tr>
            )}
            {loading && (
              <tr><td colSpan={11} className="px-4 py-12 text-center text-text-dim"><Loader2 className="inline animate-spin" /></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {denying && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setDenying(null)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-bg-elev p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Deny request #{denying.id}</h2>
              <button onClick={() => setDenying(null)} className="text-text-dim hover:text-text"><X size={18} /></button>
            </div>
            <p className="mt-1 truncate text-sm text-text-soft">{denying.requester} · {denying.name}</p>
            {denying.reason && (
              <p className="mt-3 rounded-lg bg-bg-elev-2 px-3 py-2 text-xs text-text-soft">
                <span className="text-text-dim">Their reason: </span>{denying.reason}
              </p>
            )}
            <label className="mt-4 block text-xs uppercase tracking-wider text-text-dim">Reason for denial</label>
            <textarea
              autoFocus value={denyReason} onChange={(e) => setDenyReason(e.target.value)} rows={3} maxLength={REASON_MAX}
              placeholder="e.g. Not enough justification for chatlogs — link the staff report and resubmit."
              className="mt-1 w-full resize-y rounded-lg border border-border bg-bg-elev-2 px-3 py-2 text-sm outline-none focus:border-accent-2"
            />
            <p className="mt-1 text-[11px] text-text-dim">Optional — {denying.requester} sees this under My Requests.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setDenying(null)} className="rounded-lg px-3 py-2 text-sm text-text-soft hover:text-text">Cancel</button>
              <button onClick={confirmDeny} className="inline-flex items-center gap-1 rounded-lg bg-bad/15 px-3 py-2 text-sm font-medium text-bad hover:bg-bad/25">
                <X size={14} /> Deny request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
