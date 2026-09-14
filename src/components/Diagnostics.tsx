"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, HardDrive, Database, FileText, CalendarDays } from "lucide-react";

interface Bucket { t: number; bytes: number; lines: number }
interface Storage {
  totalBytes: number; freeBytes: number; usedBytes: number;
  usedPct: number; retentionDays: number; path: string;
}
interface Diag {
  daily: Bucket[];
  monthly: Bucket[];
  totals: { bytes: number; lines: number; days: number };
  storage: Storage | null;
  scope: string;
}

function fmtBytes(n: number): string {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}
function fmtNum(n: number): string {
  return Math.round(n).toLocaleString();
}

export default function Diagnostics({ superAdmin }: { superAdmin: boolean }) {
  const [d, setD] = useState<Diag | null>(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<"bytes" | "lines">("bytes");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/diagnostics");
      if (res.ok) setD(await res.json());
      setLoading(false);
    })();
  }, []);

  const maxDaily = useMemo(
    () => Math.max(1, ...(d?.daily ?? []).map((b) => (metric === "bytes" ? b.bytes : b.lines))),
    [d, metric],
  );
  const avgPerDay = d && d.totals.days ? d.totals.bytes / d.totals.days : 0;
  // Rough runway: at the current daily average, how long until the free space is consumed —
  // capped by retention (older chunks are deleted, so steady-state never exceeds retention).
  const runwayDays = d?.storage && avgPerDay > 0 ? Math.floor(d.storage.freeBytes / avgPerDay) : 0;

  if (loading) {
    return <div className="flex justify-center py-20 text-text-dim"><Loader2 className="animate-spin" /></div>;
  }
  if (!d) return <p className="text-sm text-text-dim">Failed to load diagnostics.</p>;

  const st = d.storage;

  return (
    <div className="space-y-6">
      {/* stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card icon={<FileText size={16} />} label="Lines · last 30d"
          value={fmtNum(d.totals.lines)} sub={superAdmin ? "all regions" : d.scope?.toUpperCase()} />
        <Card icon={<Database size={16} />} label="Ingested · last 30d"
          value={fmtBytes(d.totals.bytes)} sub={`${fmtBytes(avgPerDay)}/day avg`} />
        <Card icon={<HardDrive size={16} />} label="Disk free (host)"
          value={st ? fmtBytes(st.freeBytes) : "—"}
          sub={st ? `of ${fmtBytes(st.totalBytes)}` : "unavailable"} />
        <Card icon={<CalendarDays size={16} />} label="Est. runway"
          value={st ? `${runwayDays.toLocaleString()} d` : "—"}
          sub={st ? `retention ${st.retentionDays}d` : ""} />
      </div>

      {/* storage bar */}
      {st && (
        <div className="rounded-xl border border-border bg-bg-elev p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <h2 className="font-semibold">Storage — {st.path}</h2>
            <span className="font-mono text-xs text-text-dim">
              {fmtBytes(st.usedBytes)} used · {fmtBytes(st.freeBytes)} free · {st.usedPct.toFixed(1)}%
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-bg-elev-2">
            <div
              className={`h-full rounded-full ${st.usedPct > 90 ? "bg-red-500" : st.usedPct > 75 ? "bg-amber-500" : "bg-accent-2"}`}
              style={{ width: `${Math.min(100, st.usedPct)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-text-dim">
            Loki keeps {st.retentionDays} days of logs, then deletes the oldest chunks — steady-state
            usage is bounded by retention, not unbounded growth.
          </p>
        </div>
      )}

      {/* daily volume chart */}
      <div className="rounded-xl border border-border bg-bg-elev p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Daily volume — last 30 days</h2>
          <div className="flex gap-1 rounded-md border border-border p-0.5">
            {(["bytes", "lines"] as const).map((m) => (
              <button key={m} onClick={() => setMetric(m)}
                className={`rounded px-2 py-0.5 text-xs ${metric === m ? "bg-accent-2/20 text-text" : "text-text-dim hover:text-text"}`}>
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="flex h-40 items-end gap-[2px]">
          {d.daily.map((b, i) => {
            const val = metric === "bytes" ? b.bytes : b.lines;
            return (
              <div key={i} className="flex-1 rounded-t bg-accent-2/70 transition-all hover:bg-accent-2"
                style={{ height: `${Math.max(2, (val / maxDaily) * 100)}%` }}
                title={`${new Date(b.t).toLocaleDateString()} — ${fmtBytes(b.bytes)} · ${fmtNum(b.lines)} lines`} />
            );
          })}
          {d.daily.length === 0 && <div className="w-full text-center text-xs text-text-dim">no data</div>}
        </div>
      </div>

      {/* monthly table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-bg-elev">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wider text-text-dim">
            <tr>
              <th className="px-4 py-3">Month</th>
              <th className="px-4 py-3 text-right">Lines</th>
              <th className="px-4 py-3 text-right">Ingested</th>
            </tr>
          </thead>
          <tbody>
            {[...d.monthly].reverse().map((b) => (
              <tr key={b.t} className="border-b border-border-soft hover:bg-bg-elev-2/40">
                <td className="px-4 py-3">{new Date(b.t).toLocaleDateString(undefined, { year: "numeric", month: "long" })}</td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">{fmtNum(b.lines)}</td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">{fmtBytes(b.bytes)}</td>
              </tr>
            ))}
            {d.monthly.length === 0 && <tr><td colSpan={3} className="px-4 py-12 text-center text-text-dim">No data yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-bg-elev p-4">
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-text-dim">{icon}{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-text-dim">{sub}</div>}
    </div>
  );
}
