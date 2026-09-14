"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Lock, Plus, X, Loader2 } from "lucide-react";

interface LogTypeOpt {
  key: string;
  label: string;
  channel: string;
  description: string;
  allowed: boolean;
}

export default function ExportBuilder({
  region,
  servers,
  logTypes,
}: {
  region: string;
  servers: { key: string; label: string }[];
  logTypes: LogTypeOpt[];
}) {
  const router = useRouter();
  const [server, setServer] = useState(servers[0]?.key ?? region);
  const [terms, setTerms] = useState<string[]>([]);
  const [termInput, setTermInput] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "queued" | "err"; text: string } | null>(null);

  const needsApproval = [...selected].some((k) => !logTypes.find((t) => t.key === k)?.allowed);

  function addTerm() {
    const t = termInput.trim();
    if (t && !terms.includes(t)) setTerms([...terms, t]);
    setTermInput("");
  }
  function toggle(k: string) {
    const n = new Set(selected);
    n.has(k) ? n.delete(k) : n.add(k);
    setSelected(n);
  }

  async function submit() {
    setMsg(null);
    if (terms.length === 0) return setMsg({ kind: "err", text: "Add at least one character name or search term." });
    if (selected.size === 0) return setMsg({ kind: "err", text: "Select at least one log type." });
    if (!from || !to) return setMsg({ kind: "err", text: "Pick a date range." });
    setBusy(true);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server, terms, logTypes: [...selected], from, to }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      if (data.status === "PENDING_APPROVAL") {
        setMsg({ kind: "queued", text: `Request #${data.id} queued — the locked log types need approval.` });
      } else {
        setMsg({ kind: "ok", text: `Export #${data.id} ready (${data.lineCount} lines).` });
      }
      router.refresh();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* left: character + timeframe */}
      <div className="space-y-6">
        <section className="rounded-xl border border-border bg-bg-elev p-5">
          <h2 className="text-sm font-semibold">Character / search terms</h2>
          <p className="mt-1 text-xs text-text-dim">Full character names, partial names, or identifiers. Multiple = OR.</p>
          <div className="mt-3 flex gap-2">
            <input
              value={termInput}
              onChange={(e) => setTermInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTerm())}
              placeholder="e.g. Adam Akhmetzyanov"
              className="flex-1 rounded-lg border border-border bg-bg-elev-2 px-3 py-2 text-sm outline-none focus:border-accent-2"
            />
            <button onClick={addTerm} className="rounded-lg bg-bg-elev-2 px-3 text-text-soft hover:text-text">
              <Plus size={16} />
            </button>
          </div>
          {terms.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {terms.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-md bg-accent-2/15 px-2 py-1 text-xs text-text">
                  {t}
                  <button onClick={() => setTerms(terms.filter((x) => x !== t))} className="text-text-dim hover:text-bad">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border bg-bg-elev p-5">
          <h2 className="text-sm font-semibold">Log types</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {logTypes.map((t) => {
              const on = selected.has(t.key);
              return (
                <button
                  key={t.key}
                  onClick={() => toggle(t.key)}
                  className={`flex items-start gap-3 rounded-lg border px-3 py-3 text-left transition ${
                    on ? "border-accent-2 bg-accent-2/10" : "border-border bg-bg-elev-2 hover:border-border/70"
                  }`}
                >
                  <span className={`mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded border ${on ? "border-accent-2 bg-accent-2 text-black" : "border-text-dim"}`}>
                    {on && "✓"}
                  </span>
                  <span className="flex-1">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {t.label}
                      {!t.allowed && (
                        <span className="inline-flex items-center gap-1 rounded bg-warn/15 px-1.5 py-0.5 text-[10px] text-warn">
                          <Lock size={10} /> approval
                        </span>
                      )}
                    </span>
                    <span className="block font-mono text-[11px] text-text-dim">{t.channel}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* right: params + submit */}
      <div className="space-y-4">
        <section className="rounded-xl border border-border bg-bg-elev p-5">
          <label className="text-xs font-medium uppercase tracking-wider text-text-dim">Server</label>
          <select value={server} onChange={(e) => setServer(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-bg-elev-2 px-3 py-2 text-sm outline-none focus:border-accent-2">
            {servers.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>

          <label className="mt-4 block text-xs font-medium uppercase tracking-wider text-text-dim">From</label>
          <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-bg-elev-2 px-3 py-2 text-sm outline-none focus:border-accent-2" />
          <label className="mt-4 block text-xs font-medium uppercase tracking-wider text-text-dim">To</label>
          <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-bg-elev-2 px-3 py-2 text-sm outline-none focus:border-accent-2" />

          {needsApproval && (
            <p className="mt-4 rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">
              Some selected log types need approval — this will be sent to the request queue.
            </p>
          )}

          <button onClick={submit} disabled={busy} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-black transition enabled:hover:brightness-110 disabled:opacity-40">
            {busy && <Loader2 size={16} className="animate-spin" />}
            {needsApproval ? "Submit for approval" : "Export logs"}
          </button>

          {msg && (
            <p className={`mt-3 text-sm ${msg.kind === "err" ? "text-bad" : msg.kind === "queued" ? "text-warn" : "text-good"}`}>
              {msg.text}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
