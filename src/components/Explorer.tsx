"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Loader2, Download, Lock, FileDown, X, Star } from "lucide-react";

interface LogTypeOpt { key: string; label: string; desc?: string; featured?: boolean; allowed: boolean }
interface Entry { ts: number; server: string; flag: string; line: string }
interface Vol { t: number; count: number }

const RANGES = ["15m", "1h", "6h", "24h", "7d", "30d"] as const;
type Range = (typeof RANGES)[number] | "custom";

// Fetch the current user's allowed groups + seeAll for one server (permissions are per-server).
async function fetchPerm(server: string): Promise<{ allowed: string[]; seeAll: boolean }> {
  try {
    const res = await fetch(`/api/permissions?server=${encodeURIComponent(server)}`);
    if (res.ok) return await res.json();
  } catch {}
  return { allowed: [], seeAll: false };
}

export default function Explorer({
  region, servers, logTypes: baseLogTypes,
}: {
  region: string;
  servers: { key: string; label: string }[];
  logTypes: LogTypeOpt[];
}) {
  const [server, setServer] = useState(servers[0]?.key ?? region);
  const [perm, setPerm] = useState<{ allowed: Set<string>; seeAll: boolean }>({ allowed: new Set(), seeAll: false });
  const [range, setRange] = useState<Range>("6h");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [q, setQ] = useState("");
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [data, setData] = useState<{ entries: Entry[]; volume: Vol[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // effective per-server allowed flags on the group catalogue
  const logTypes = useMemo(
    () => baseLogTypes.map((t) => ({ ...t, allowed: perm.seeAll || perm.allowed.has(t.key) })),
    [baseLogTypes, perm],
  );
  const authorized = logTypes.filter((t) => t.allowed);

  // (re)load permissions when the server changes; default the selection to all authorized groups
  useEffect(() => {
    let live = true;
    (async () => {
      const p = await fetchPerm(server);
      if (!live) return;
      const allowed = new Set(p.allowed);
      setPerm({ allowed, seeAll: p.seeAll });
      setTypes(new Set(p.seeAll ? baseLogTypes.map((t) => t.key) : p.allowed));
    })();
    return () => { live = false; };
  }, [server, baseLogTypes]);

  const load = useCallback(async () => {
    if (range === "custom" && (!customFrom || !customTo)) return; // wait for both dates
    setLoading(true);
    try {
      const p = new URLSearchParams({ server, q, types: [...types].join(",") });
      if (range === "custom") { p.set("from", customFrom); p.set("to", customTo); }
      else p.set("range", range);
      const res = await fetch(`/api/explore?${p}`);
      const j = await res.json();
      if (res.ok) setData({ entries: j.entries ?? [], volume: j.volume ?? [], total: j.total ?? 0 });
    } finally {
      setLoading(false);
    }
  }, [server, range, q, types, customFrom, customTo]);

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
            <button onClick={() => setRange("custom")} className={`px-3 py-2 text-xs ${range === "custom" ? "bg-accent-2 text-white" : "bg-bg-elev-2 text-text-soft hover:text-text"}`}>custom</button>
          </div>
        </div>
        {range === "custom" && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-text-soft">
            <span>From</span>
            <input type="datetime-local" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-lg border border-border bg-bg-elev-2 px-2 py-1.5 outline-none focus:border-accent-2" />
            <span>To</span>
            <input type="datetime-local" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-lg border border-border bg-bg-elev-2 px-2 py-1.5 outline-none focus:border-accent-2" />
            {(!customFrom || !customTo) && <span className="text-text-dim">pick both dates to load</span>}
          </div>
        )}
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

      {/* recent logs — browsing without a search term is see-all only; others search or request */}
      {!perm.seeAll && !q.trim() ? (
        <div className="rounded-xl border border-border bg-bg-elev p-4 text-sm text-text-soft">
          <span className="flex items-center gap-2 font-semibold text-text"><Lock size={14} className="text-warn" /> Recent logs</span>
          <p className="mt-1">
            Enter a search term above to view matching logs (searches are audited), or build an export request for a character&apos;s history.
          </p>
        </div>
      ) : (
      <div className="rounded-xl border border-border bg-bg-elev">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{q.trim() ? "Matching logs" : "Recent logs"} {loading && <Loader2 size={13} className="ml-1 inline animate-spin text-text-dim" />}</h2>
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
      )}

      {builderOpen && (
        <RequestModal
          onClose={() => setBuilderOpen(false)}
          servers={servers}
          baseLogTypes={baseLogTypes}
          initial={{ server, terms: q ? [q] : [], types: [...types] }}
        />
      )}
    </div>
  );
}

// Export-request builder as a modal (prefilled from the current explorer view). It has its own
// server selector, so it fetches per-server permissions itself.
function RequestModal({
  onClose, servers, baseLogTypes, initial,
}: {
  onClose: () => void;
  servers: { key: string; label: string }[];
  baseLogTypes: LogTypeOpt[];
  initial: { server: string; terms: string[]; types: string[] };
}) {
  const [server, setServer] = useState(initial.server);
  const [perm, setPerm] = useState<{ allowed: Set<string>; seeAll: boolean }>({ allowed: new Set(), seeAll: false });
  const [terms, setTerms] = useState<string[]>(initial.terms);
  const [ti, setTi] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(initial.types));
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ k: "ok" | "queued" | "err"; t: string; id?: number } | null>(null);

  useEffect(() => {
    let live = true;
    fetchPerm(server).then((p) => { if (live) setPerm({ allowed: new Set(p.allowed), seeAll: p.seeAll }); });
    return () => { live = false; };
  }, [server]);

  const logTypes = useMemo(
    () => baseLogTypes.map((t) => ({ ...t, allowed: perm.seeAll || perm.allowed.has(t.key) })),
    [baseLogTypes, perm],
  );
  const needsApproval = [...selected].some((k) => !logTypes.find((t) => t.key === k)?.allowed);

  function addTerm() {
    const v = ti.trim();
    if (!v) return;
    setTerms([...new Set([...terms, v])]);
    setTi("");
  }
  // datetime-local value for a Date, in local time (YYYY-MM-DDTHH:mm)
  function toLocalInput(d: Date): string {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function setPreset(ms: number) {
    const now = new Date();
    setTo(toLocalInput(now));
    setFrom(toLocalInput(new Date(now.getTime() - ms)));
  }
  const DATE_PRESETS: [string, number][] = [
    ["24h", 24 * 3600e3], ["7d", 7 * 24 * 3600e3], ["30d", 30 * 24 * 3600e3], ["90d", 90 * 24 * 3600e3],
  ];

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
          <input value={ti} onChange={(e) => setTi(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTerm(); } }} placeholder="e.g. Adam Akhmetzyanov" className="flex-1 rounded-lg border border-border bg-bg-elev-2 px-3 py-2 text-sm outline-none focus:border-accent-2" />
          <button type="button" onClick={addTerm} disabled={!ti.trim()} className="rounded-lg border border-accent-2/60 px-3 py-2 text-sm text-accent-2 hover:bg-accent-2/10 disabled:opacity-40">Add</button>
        </div>
        <p className="mt-1 text-[11px] text-text-dim">Type a name and press Enter (or click Add) to add it as a chip. Add several to match any of them.</p>
        {terms.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {terms.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded bg-accent-2/15 px-2 py-1 text-xs">{t}<button onClick={() => setTerms(terms.filter((x) => x !== t))}><X size={11} /></button></span>
            ))}
          </div>
        )}

        <label className="mt-4 block text-xs uppercase tracking-wider text-text-dim">Log types</label>
        <div className="mt-1"><TypePicker logTypes={logTypes} selected={selected} setSelected={setSelected} requestable /></div>

        <label className="mt-4 block text-xs uppercase tracking-wider text-text-dim">Timeframe</label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {DATE_PRESETS.map(([lbl, ms]) => (
            <button key={lbl} type="button" onClick={() => setPreset(ms)}
              className="rounded-lg border border-border bg-bg-elev-2 px-2.5 py-1 text-xs text-text-soft hover:border-accent-2 hover:text-text">Last {lbl}</button>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div><label className="block text-[11px] uppercase tracking-wider text-text-dim">From</label><input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-bg-elev-2 px-2 py-2 text-sm outline-none focus:border-accent-2" /></div>
          <div><label className="block text-[11px] uppercase tracking-wider text-text-dim">To</label><input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-bg-elev-2 px-2 py-2 text-sm outline-none focus:border-accent-2" /></div>
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

// Log-type picker over GROUPS: the six featured "super categories" up top as prominent tiles,
// the broad categories below. No wall of 180 flags — staff pick and are authorized by group.
// requestable: locked groups can still be picked (the export builder turns them into an approval request).
function TypePicker({
  logTypes, selected, setSelected, requestable = false,
}: {
  logTypes: LogTypeOpt[];
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  requestable?: boolean;
}) {
  const authorized = logTypes.filter((t) => t.allowed);
  const featured = logTypes.filter((t) => t.featured);
  const general = logTypes.filter((t) => !t.featured);

  function toggle(k: string, allowed: boolean) {
    if (!allowed && !requestable) return;
    const n = new Set(selected);
    n.has(k) ? n.delete(k) : n.add(k);
    setSelected(n);
  }

  const Tile = (t: LogTypeOpt) => {
    const on = selected.has(t.key);
    const blocked = !t.allowed && !requestable;
    return (
      <button
        key={t.key}
        disabled={blocked}
        onClick={() => toggle(t.key, t.allowed)}
        title={t.allowed ? t.desc : requestable ? "Needs approval — selecting it sends this export to the request queue" : "Not authorized — build a request to get approval"}
        className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition ${
          blocked
            ? "cursor-not-allowed border-border-soft opacity-50"
            : on
              ? t.allowed ? "border-accent-2 bg-accent-2/10" : "border-warn bg-warn/10"
              : "border-border bg-bg-elev-2 hover:border-accent-2/50"
        }`}
      >
        <span className={`mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-sm border text-[10px] ${on ? "border-accent-2 bg-accent-2 text-black" : "border-text-dim"}`}>{on ? "✓" : ""}</span>
        <span className="min-w-0">
          <span className="flex items-center gap-1 text-xs font-medium">
            {t.featured && <Star size={11} className="flex-none text-accent" />}
            <span className="truncate">{t.label}</span>
            {!t.allowed && <Lock size={10} className="flex-none text-warn" />}
          </span>
          {t.desc && <span className="mt-0.5 block truncate text-[10px] text-text-dim">{t.desc}</span>}
        </span>
      </button>
    );
  };

  return (
    <div className="rounded-lg border border-border bg-bg-elev-2 p-2.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-text-dim">Featured</span>
        <span className="flex items-center gap-2 text-[10px] text-text-dim">
          {selected.size} selected
          <button onClick={() => setSelected(new Set(authorized.map((t) => t.key)))} className="rounded px-1.5 py-0.5 text-accent-2 hover:bg-bg-elev">all</button>
          <button onClick={() => setSelected(new Set())} className="rounded px-1.5 py-0.5 hover:bg-bg-elev">none</button>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{featured.map(Tile)}</div>
      {general.length > 0 && (
        <>
          <div className="mb-2 mt-3 text-[11px] font-medium uppercase tracking-wider text-text-dim">Categories</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{general.map(Tile)}</div>
        </>
      )}
    </div>
  );
}
