"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Loader2, Download, Eye, Lock, FileDown, X, Star } from "lucide-react";
import { APPROVAL_GROUPS } from "@/lib/logGroups";
import { REASON_MAX, notifyRequestsChanged } from "@/lib/requests";
import { fmtDateTime, isWallClock, toWallClockInput } from "@/lib/time";
import { useServerTimeZone } from "./ServerTime";
import DateTimeInput from "./DateTimeInput";

interface GroupOpt { key: string; label: string; desc?: string; featured?: boolean }
interface LogTypeOpt extends GroupOpt { allowed: boolean }
interface ServerOpt { key: string; label: string }
interface Entry { ts: number; server: string; flag: string; line: string }
interface Vol { t: number; count: number }

const RANGES = ["15m", "1h", "6h", "24h", "7d", "30d"] as const;
type Range = (typeof RANGES)[number] | "custom";

// [from, to] picker values covering the last `ms`, as SERVER-time wall clocks (the export
// builder's presets — the viewer's own timezone never enters into it).
function lastRange(ms: number, tz: string): [string, string] {
  const now = Date.now();
  return [toWallClockInput(now - ms, tz), toWallClockInput(now, tz)];
}

// Groups an export on this server would send to the request queue for the current user
// (per-server). Falls back to the policy list on failure — the server decides anyway.
async function fetchApprovalRequired(server: string): Promise<string[]> {
  try {
    const res = await fetch(`/api/permissions?server=${encodeURIComponent(server)}`);
    if (res.ok) return (await res.json()).approvalRequired ?? [...APPROVAL_GROUPS];
  } catch {}
  return [...APPROVAL_GROUPS];
}

export default function Explorer({
  servers, liveServers, logTypes: catalogue,
}: {
  servers: ServerOpt[]; // every server in the user's region (export requests)
  liveServers: ServerOpt[]; // the ones they have See All on (live search + recent logs)
  logTypes: GroupOpt[];
}) {
  const canLive = liveServers.length > 0;
  const tz = useServerTimeZone();
  const [server, setServer] = useState(liveServers[0]?.key ?? "");
  const [range, setRange] = useState<Range>("6h");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [q, setQ] = useState("");
  // Nothing ticked by default: a search only runs over categories someone deliberately picked.
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [data, setData] = useState<{ entries: Entry[]; volume: Vol[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // See All covers every group, so nothing in the live picker is locked.
  const liveTypes = useMemo(() => catalogue.map((t) => ({ ...t, allowed: true })), [catalogue]);
  const noTypes = types.size === 0;
  const customReady = isWallClock(customFrom) && isWallClock(customTo);

  const load = useCallback(async () => {
    if (!canLive || types.size === 0) { setData(null); return; } // nothing ticked → no query at all
    // custom from/to are server-time wall clocks; wait until both are complete
    if (range === "custom" && !(isWallClock(customFrom) && isWallClock(customTo))) return;
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams({ server, q, types: [...types].join(",") });
      if (range === "custom") { p.set("from", customFrom); p.set("to", customTo); }
      else p.set("range", range);
      const res = await fetch(`/api/explore?${p}`);
      const j = await res.json().catch(() => ({}));
      if (res.ok) setData({ entries: j.entries ?? [], volume: j.volume ?? [], total: j.total ?? 0 });
      else { setData(null); setError(j.error ?? `Search failed (${res.status})`); }
    } catch {
      setError("Search failed — try again.");
    } finally {
      setLoading(false);
    }
  }, [canLive, server, range, q, types, customFrom, customTo]);

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
            {canLive
              ? <>Search live logs, then export a character&apos;s history for a timeframe.</>
              : <>Request an export of a character&apos;s logs for a timeframe.</>}
          </p>
        </div>
        <button
          onClick={() => setBuilderOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-black hover:brightness-110"
        >
          <FileDown size={16} /> Build export request
        </button>
      </div>

      {canLive ? (
        <>
          {/* search live logs — See All only (the server enforces it too) */}
          <div className="rounded-xl border border-border bg-bg-elev p-4">
            <h2 className="mb-3 text-sm font-semibold">Search live logs</h2>
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
                {liveServers.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
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
                <DateTimeInput value={customFrom} onChange={setCustomFrom} label="From" />
                <span>To</span>
                <DateTimeInput value={customTo} onChange={setCustomTo} label="To" defaultTime="23:59" />
                <span className="text-text-dim">
                  server time ({tz}), 24-hour{!customReady && " — pick both dates and times to load"}
                </span>
              </div>
            )}
            <div className="mt-3"><TypePicker logTypes={liveTypes} selected={types} setSelected={setTypes} /></div>
            {noTypes && (
              <p className="mt-2 text-xs text-text-dim">Tick the categories to search — none are selected by default, so nothing is searched until you pick.</p>
            )}
          </div>

          {error && <div className="rounded-xl border border-bad/30 bg-bad/10 p-4 text-sm text-bad">{error}</div>}

          {/* volume chart */}
          <div className="rounded-xl border border-border bg-bg-elev p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Volume</h2>
              <span className="font-mono text-xs text-text-dim">
                {loading ? "…" : `${data?.total?.toLocaleString() ?? 0} lines · ${range === "custom" ? "custom range" : `last ${range}`}`}
              </span>
            </div>
            <div className="flex h-28 items-end gap-[2px]">
              {(data?.volume ?? []).map((v, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-accent-2/70 transition-all hover:bg-accent-2"
                  style={{ height: `${Math.max(2, (v.count / maxVol) * 100)}%` }}
                  title={`${fmtDateTime(v.t, tz)} ${tz} — ${v.count}`}
                />
              ))}
              {(!data || data.volume.length === 0) && (
                <div className="w-full text-center text-xs text-text-dim">{noTypes ? "no categories selected" : "no data"}</div>
              )}
            </div>
          </div>

          {/* recent logs — See All only */}
          <div className="rounded-xl border border-border bg-bg-elev">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">{q.trim() ? "Matching logs" : "Recent logs"} {loading && <Loader2 size={13} className="ml-1 inline animate-spin text-text-dim" />}</h2>
              <span className="text-xs text-text-dim">{data?.entries.length ?? 0} shown · server time ({tz}) · click a line to search it</span>
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
                      <td className="whitespace-nowrap px-4 py-1.5 align-top text-text-dim">{fmtDateTime(e.ts, tz)}</td>
                      <td className="px-2 py-1.5 align-top"><span className="rounded bg-bg-elev-2 px-1.5 py-0.5 text-[10px] text-text-soft">{e.flag}</span></td>
                      <td className="px-3 py-1.5 align-top text-text">{e.line}</td>
                    </tr>
                  ))}
                  {noTypes ? (
                    <tr><td colSpan={3} className="px-4 py-10 text-center font-sans text-sm text-text-dim">Tick one or more categories above to load logs.</td></tr>
                  ) : !loading && data?.entries.length === 0 && (
                    <tr><td colSpan={3} className="px-4 py-10 text-center font-sans text-sm text-text-dim">No matching logs in this window.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-border bg-bg-elev p-5 text-sm text-text-soft">
          <span className="flex items-center gap-2 font-semibold text-text"><Lock size={14} className="text-warn" /> Live log search is limited to See All roles</span>
          <p className="mt-1">
            Use <span className="font-medium text-text">Build export request</span> to pull a character&apos;s logs for a timeframe.
            Every request needs a reason; Chatlogs and Admin Logs also need approval from a Senior Admin or above
            unless you&apos;re Staff Management.
          </p>
        </div>
      )}

      {builderOpen && (
        <RequestModal
          onClose={() => setBuilderOpen(false)}
          servers={servers}
          catalogue={catalogue}
          initial={{ server: canLive ? server : (servers[0]?.key ?? ""), terms: q.trim() ? [q.trim()] : [], types: [...types] }}
        />
      )}
    </div>
  );
}

// Export-request builder as a modal (prefilled from the current explorer view). It has its own
// server selector, so it fetches that server's approval requirements itself.
function RequestModal({
  onClose, servers, catalogue, initial,
}: {
  onClose: () => void;
  servers: ServerOpt[];
  catalogue: GroupOpt[];
  initial: { server: string; terms: string[]; types: string[] };
}) {
  const tz = useServerTimeZone();
  const [server, setServer] = useState(initial.server);
  // groups that would send this export to the queue — locked until the server says otherwise
  const [approvalRequired, setApprovalRequired] = useState<Set<string>>(new Set(APPROVAL_GROUPS));
  const [reason, setReason] = useState("");
  const [terms, setTerms] = useState<string[]>(initial.terms);
  const [ti, setTi] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(initial.types));
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ k: "ok" | "queued" | "err"; t: string; id?: number } | null>(null);

  useEffect(() => {
    let live = true;
    fetchApprovalRequired(server).then((keys) => { if (live) setApprovalRequired(new Set(keys)); });
    return () => { live = false; };
  }, [server]);

  const logTypes = useMemo(
    () => catalogue.map((t) => ({ ...t, allowed: !approvalRequired.has(t.key) })),
    [catalogue, approvalRequired],
  );
  const approvalPicked = catalogue.filter((t) => selected.has(t.key) && approvalRequired.has(t.key));
  const needsApproval = approvalPicked.length > 0;

  function addTerm() {
    const v = ti.trim();
    if (!v) return;
    setTerms([...new Set([...terms, v])]);
    setTi("");
  }
  function setPreset(ms: number) {
    const [f, t] = lastRange(ms, tz);
    setFrom(f);
    setTo(t);
  }
  const DATE_PRESETS: [string, number][] = [
    ["24h", 24 * 3600e3], ["7d", 7 * 24 * 3600e3], ["30d", 30 * 24 * 3600e3], ["90d", 90 * 24 * 3600e3],
  ];

  async function submit() {
    setMsg(null);
    if (!reason.trim()) return setMsg({ k: "err", t: "Enter a reason for this request." });
    if (!terms.length) return setMsg({ k: "err", t: "Add a character name / term." });
    if (!selected.size) return setMsg({ k: "err", t: "Pick at least one log type." });
    if (!isWallClock(from) || !isWallClock(to))
      return setMsg({ k: "err", t: "Pick a date range — a date and a 24-hour time (HH:mm) for both." });
    setBusy(true);
    try {
      const res = await fetch("/api/export", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server, reason: reason.trim(), terms, logTypes: [...selected], from, to }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      notifyRequestsChanged();
      if (d.status === "PENDING_APPROVAL") setMsg({ k: "queued", t: `Request #${d.id} sent for approval.`, id: d.id });
      else if (d.status === "COMPLETE") setMsg({ k: "ok", t: `Export #${d.id} ready — ${d.lineCount} lines.`, id: d.id });
      else setMsg({ k: "err", t: `Export #${d.id} failed — check My Requests.` });
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

        <label className="mt-4 block text-xs uppercase tracking-wider text-text-dim">Request reason <span className="text-bad">*</span></label>
        <textarea
          value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={REASON_MAX}
          placeholder="Why do you need these logs? e.g. Staff report #1234 — investigating a reported deathmatch"
          className="mt-1 w-full resize-y rounded-lg border border-border bg-bg-elev-2 px-3 py-2 text-sm outline-none focus:border-accent-2"
        />
        <p className="mt-1 text-[11px] text-text-dim">Required — recorded with the request and shown to approvers.</p>

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

        <label className="mt-4 block text-xs uppercase tracking-wider text-text-dim">
          Timeframe <span className="normal-case tracking-normal">· server time ({tz}), 24-hour</span>
        </label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {DATE_PRESETS.map(([lbl, ms]) => (
            <button key={lbl} type="button" onClick={() => setPreset(ms)}
              className="rounded-lg border border-border bg-bg-elev-2 px-2.5 py-1 text-xs text-text-soft hover:border-accent-2 hover:text-text">Last {lbl}</button>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div><label className="mb-1 block text-[11px] uppercase tracking-wider text-text-dim">From</label><DateTimeInput value={from} onChange={setFrom} label="From" block /></div>
          <div><label className="mb-1 block text-[11px] uppercase tracking-wider text-text-dim">To</label><DateTimeInput value={to} onChange={setTo} label="To" defaultTime="23:59" block /></div>
        </div>
        <select value={server} onChange={(e) => setServer(e.target.value)} className="mt-3 w-full rounded-lg border border-border bg-bg-elev-2 px-3 py-2 text-sm outline-none focus:border-accent-2">
          {servers.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>

        {needsApproval && (
          <p className="mt-3 rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">
            {approvalPicked.map((t) => t.label).join(" and ")} {approvalPicked.length > 1 ? "need" : "needs"} approval
            from a Senior Admin or above — this request goes to the Request Queue.
          </p>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button onClick={submit} disabled={busy} className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-40">
            {busy && <Loader2 size={15} className="animate-spin" />} {needsApproval ? "Submit for approval" : "Export"}
          </button>
          {msg?.k === "ok" && msg.id && (
            <>
              <a href={`/api/export/${msg.id}/download?inline=1`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-good hover:underline"><Eye size={14} /> View</a>
              <a href={`/api/export/${msg.id}/download`} className="flex items-center gap-1 text-sm text-good hover:underline"><Download size={14} /> Download</a>
            </>
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
