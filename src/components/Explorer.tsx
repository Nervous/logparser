"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Loader2, Download, Lock, FileDown, X } from "lucide-react";
import { CATEGORIES, categorize } from "@/lib/logTypes";

interface LogTypeOpt { key: string; label: string; allowed: boolean }
interface Entry { ts: number; server: string; flag: string; line: string }
interface Vol { t: number; count: number }

const RANGES = ["15m", "1h", "6h", "24h", "7d", "30d"] as const;
type Range = (typeof RANGES)[number];

export default function Explorer({
  region, servers, logTypes, seeAll,
}: {
  region: string;
  servers: { key: string; label: string }[];
  logTypes: LogTypeOpt[];
  seeAll: boolean;
}) {
  const authorized = logTypes.filter((t) => t.allowed);
  const [server, setServer] = useState(servers[0]?.key ?? region);
  const [range, setRange] = useState<Range>("6h");
  const [q, setQ] = useState("");
  const [types, setTypes] = useState<Set<string>>(new Set(authorized.map((t) => t.key)));
  const [data, setData] = useState<{ entries: Entry[]; volume: Vol[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ server, range, q, types: [...types].join(",") });
      const res = await fetch(`/api/explore?${p}`);
      const j = await res.json();
      if (res.ok) setData({ entries: j.entries ?? [], volume: j.volume ?? [], total: j.total ?? 0 });
    } finally {
      setLoading(false);
    }
  }, [server, range, q, types]);

  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(load, q ? 350 : 0);
    return () => clearTimeout(debounce.current);
  }, [load, q]);

  const maxVol = useMemo(() => Math.max(1, ...(data?.volume ?? []).map((v) => v.count)), [data]);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Log Explorer</h1>
          <p className="mt-1 text-sm text-text-soft">
            Search live logs, then export a character&apos;s history for a timeframe.
          </p>
        </div>
        <button
          onClick={() => setBuilderOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-black hover:brightness-110"
        >
          <FileDown size={16} /> Build export request
        </button>
      </div>

      {/* filter bar */}
      <div className="rounded-xl border border-border bg-bg-elev p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search a character name, plate, id, phrase…"
              className="w-full rounded-lg border border-border bg-bg-elev-2 py-2 pl-9 pr-3 text-sm outline-none focus:border-accent-2"
            />
          </div>
          <select value={server} onChange={(e) => setServer(e.target.value)} className="rounded-lg border border-border bg-bg-elev-2 px-3 py-2 text-sm outline-none focus:border-accent-2">
            {servers.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <div className="flex overflow-hidden rounded-lg border border-border">
            {RANGES.map((r) => (
              <button key={r} onClick={() => setRange(r)} className={`px-3 py-2 text-xs ${range === r ? "bg-accent-2 text-white" : "bg-bg-elev-2 text-text-soft hover:text-text"}`}>{r}</button>
            ))}
          </div>
        </div>
        <TypePicker logTypes={logTypes} selected={types} setSelected={setTypes} />
      </div>

      {authorized.length === 0 && (
        <div className="rounded-xl border border-warn/30 bg-warn/10 p-4 text-sm text-warn">
          You don&apos;t have access to any log types yet. A manager needs to grant your role permissions
          (or use the export builder to request approval).
        </div>
      )}

      {/* volume chart */}
      <div className="rounded-xl border border-border bg-bg-elev p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Volume</h2>
          <span className="font-mono text-xs text-text-dim">
            {loading ? "…" : `${data?.total?.toLocaleString() ?? 0} lines · last ${range}`}
          </span>
        </div>
        <div className="flex h-28 items-end gap-[2px]">
          {(data?.volume ?? []).map((v, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-accent-2/70 transition-all hover:bg-accent-2"
              style={{ height: `${Math.max(2, (v.count / maxVol) * 100)}%` }}
              title={`${new Date(v.t).toLocaleString()} — ${v.count}`}
            />
          ))}
          {(!data || data.volume.length === 0) && <div className="w-full text-center text-xs text-text-dim">no data</div>}
        </div>
      </div>

      {/* recent logs */}
      <div className="rounded-xl border border-border bg-bg-elev">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Recent logs {loading && <Loader2 size={13} className="ml-1 inline animate-spin text-text-dim" />}</h2>
          <span className="text-xs text-text-dim">{data?.entries.length ?? 0} shown · click a line to search it</span>
        </div>
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full text-left text-[13px]">
            <tbody className="font-mono">
              {(data?.entries ?? []).map((e, i) => (
                <tr
                  key={i}
                  onClick={() => setQ(e.line.slice(0, 60))}
                  className="cursor-pointer border-b border-border-soft hover:bg-bg-elev-2/60"
                >
                  <td className="whitespace-nowrap px-4 py-1.5 align-top text-text-dim">{new Date(e.ts).toLocaleString()}</td>
                  <td className="px-2 py-1.5 align-top"><span className="rounded bg-bg-elev-2 px-1.5 py-0.5 text-[10px] text-text-soft">{e.flag}</span></td>
                  <td className="px-3 py-1.5 align-top text-text">{e.line}</td>
                </tr>
              ))}
              {!loading && data?.entries.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-10 text-center font-sans text-sm text-text-dim">No matching logs in this window.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {builderOpen && (
        <RequestModal
          onClose={() => setBuilderOpen(false)}
          servers={servers}
          logTypes={logTypes}
          initial={{ server, terms: q ? [q] : [], types: [...types] }}
        />
      )}
    </div>
  );
}

// Export-request builder as a modal (prefilled from the current explorer view).
function RequestModal({
  onClose, servers, logTypes, initial,
}: {
  onClose: () => void;
  servers: { key: string; label: string }[];
  logTypes: LogTypeOpt[];
  initial: { server: string; terms: string[]; types: string[] };
}) {
  const [server, setServer] = useState(initial.server);
  const [terms, setTerms] = useState<string[]>(initial.terms);
  const [ti, setTi] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(initial.types));
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ k: "ok" | "queued" | "err"; t: string; id?: number } | null>(null);
  const needsApproval = [...selected].some((k) => !logTypes.find((t) => t.key === k)?.allowed);

  async function submit() {
    setMsg(null);
    if (!terms.length) return setMsg({ k: "err", t: "Add a character name / term." });
    if (!selected.size) return setMsg({ k: "err", t: "Pick at least one log type." });
    if (!from || !to) return setMsg({ k: "err", t: "Pick a date range." });
    setBusy(true);
    try {
      const res = await fetch("/api/export", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server, terms, logTypes: [...selected], from, to }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      if (d.status === "PENDING_APPROVAL") setMsg({ k: "queued", t: `Request #${d.id} sent for approval.`, id: d.id });
      else setMsg({ k: "ok", t: `Export #${d.id} ready — ${d.lineCount} lines.`, id: d.id });
    } catch (e) { setMsg({ k: "err", t: (e as Error).message }); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-border bg-bg-elev p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Export request</h2>
          <button onClick={onClose} className="text-text-dim hover:text-text"><X size={18} /></button>
        </div>

        <label className="mt-4 block text-xs uppercase tracking-wider text-text-dim">Character(s) / terms</label>
        <div className="mt-1 flex gap-2">
          <input value={ti} onChange={(e) => setTi(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), ti.trim() && (setTerms([...new Set([...terms, ti.trim()])]), setTi("")))} placeholder="Adam Akhmetzyanov" className="flex-1 rounded-lg border border-border bg-bg-elev-2 px-3 py-2 text-sm outline-none focus:border-accent-2" />
        </div>
        {terms.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {terms.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded bg-accent-2/15 px-2 py-1 text-xs">{t}<button onClick={() => setTerms(terms.filter((x) => x !== t))}><X size={11} /></button></span>
            ))}
          </div>
        )}

        <label className="mt-4 block text-xs uppercase tracking-wider text-text-dim">Log types</label>
        <div className="mt-1"><TypePicker logTypes={logTypes} selected={selected} setSelected={setSelected} /></div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div><label className="block text-xs uppercase tracking-wider text-text-dim">From</label><input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-bg-elev-2 px-2 py-2 text-sm outline-none focus:border-accent-2" /></div>
          <div><label className="block text-xs uppercase tracking-wider text-text-dim">To</label><input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-bg-elev-2 px-2 py-2 text-sm outline-none focus:border-accent-2" /></div>
        </div>
        <select value={server} onChange={(e) => setServer(e.target.value)} className="mt-3 w-full rounded-lg border border-border bg-bg-elev-2 px-3 py-2 text-sm outline-none focus:border-accent-2">
          {servers.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>

        {needsApproval && <p className="mt-3 rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">Some selected types need approval — this goes to the request queue.</p>}

        <div className="mt-4 flex items-center gap-3">
          <button onClick={submit} disabled={busy} className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-40">
            {busy && <Loader2 size={15} className="animate-spin" />} {needsApproval ? "Submit for approval" : "Export"}
          </button>
          {msg?.k === "ok" && msg.id && (
            <a href={`/api/export/${msg.id}/download`} className="flex items-center gap-1 text-sm text-good hover:underline"><Download size={14} /> Download</a>
          )}
          {msg && <span className={`text-sm ${msg.k === "err" ? "text-bad" : msg.k === "queued" ? "text-warn" : "text-good"}`}>{msg.t}</span>}
        </div>
      </div>
    </div>
  );
}

// Searchable log-type multi-select — handles the ~100 real flag columns without a wall of chips.
function TypePicker({
  logTypes, selected, setSelected,
}: {
  logTypes: LogTypeOpt[];
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const authorized = logTypes.filter((t) => t.allowed);
  const s = search.toLowerCase();

  // group flags by category, honouring CATEGORIES order
  const groups = CATEGORIES.map((c) => ({
    ...c,
    items: logTypes.filter((t) => categorize(t.key) === c.key && (!s || t.key.includes(s))),
  })).filter((g) => g.items.length > 0);

  function toggle(k: string) {
    const n = new Set(selected);
    n.has(k) ? n.delete(k) : n.add(k);
    setSelected(n);
  }
  function toggleCategory(items: LogTypeOpt[], on: boolean) {
    const n = new Set(selected);
    for (const t of items) if (t.allowed) (on ? n.add(t.key) : n.delete(t.key));
    setSelected(n);
  }

  return (
    <div className="rounded-lg border border-border bg-bg-elev-2">
      <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
        <Search size={13} className="text-text-dim" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter log types…" className="flex-1 bg-transparent text-xs outline-none" />
        <span className="text-[10px] text-text-dim">{selected.size} selected</span>
        <button onClick={() => setSelected(new Set(authorized.map((t) => t.key)))} className="rounded px-1.5 py-0.5 text-[10px] text-accent-2 hover:bg-bg-elev">all</button>
        <button onClick={() => setSelected(new Set())} className="rounded px-1.5 py-0.5 text-[10px] text-text-dim hover:bg-bg-elev">none</button>
      </div>
      <div className="max-h-64 overflow-auto p-1.5">
        {groups.map((g) => {
          const sel = g.items.filter((t) => selected.has(t.key)).length;
          const allSel = sel > 0 && sel === g.items.filter((t) => t.allowed).length;
          const expanded = open.has(g.key) || !!s;
          return (
            <div key={g.key} className="mb-0.5">
              <div className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-bg-elev">
                <button onClick={() => { const n = new Set(open); n.has(g.key) ? n.delete(g.key) : n.add(g.key); setOpen(n); }} className="flex flex-1 items-center gap-1.5 text-left">
                  <span className="text-text-dim">{expanded ? "▾" : "▸"}</span>
                  <span className="text-xs font-medium">{g.label}</span>
                  <span className="text-[10px] text-text-dim">{sel}/{g.items.length}</span>
                </button>
                <button onClick={() => toggleCategory(g.items, !allSel)} className={`rounded px-1.5 py-0.5 text-[10px] ${allSel ? "bg-accent-2/20 text-accent-2" : "text-text-dim hover:text-text"}`}>{allSel ? "clear" : "all"}</button>
              </div>
              {expanded && (
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 py-1 pl-5 sm:grid-cols-3">
                  {g.items.map((t) => {
                    const on = selected.has(t.key);
                    return (
                      <button key={t.key} disabled={!t.allowed} onClick={() => toggle(t.key)} title={t.allowed ? t.key : "Not authorized — needs approval"}
                        className={`flex items-center gap-1.5 rounded px-1.5 py-1 text-left font-mono text-[11px] ${!t.allowed ? "cursor-not-allowed text-text-dim opacity-50" : on ? "text-text" : "text-text-dim hover:text-text"}`}>
                        <span className={`flex h-3.5 w-3.5 flex-none items-center justify-center rounded-sm border text-[9px] ${on ? "border-accent-2 bg-accent-2 text-black" : "border-text-dim"}`}>{on ? "✓" : ""}</span>
                        {!t.allowed && <Lock size={9} className="flex-none text-warn" />}
                        <span className="truncate">{t.key}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {groups.length === 0 && <span className="block py-2 text-center text-[11px] text-text-dim">no match</span>}
      </div>
    </div>
  );
}
