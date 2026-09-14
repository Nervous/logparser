// Server-side Loki client. Loki stays private (localhost on the log host); the app is the
// only thing that talks to it, after RBAC checks. LogQL is built here, never from the client.

import { flagsRegexFor } from "./logTypes";
import type { SubQuery } from "./logGroups";

const LOKI_URL = process.env.LOKI_URL ?? "http://127.0.0.1:3100";
const MAX_LINES = Number(process.env.LOKI_MAX_LINES ?? 500000);
const PAGE = 5000; // Loki per-query line cap we page under

export interface LogEntry {
  ts: number; // ms epoch
  line: string;
  region: string;
  server: string;
  flag: string;
}

export interface QuerySpec {
  region: string;
  server?: string;
  subqueries: SubQuery[]; // one or more flag-sets, each optionally line-narrowed
  terms: string[]; // character names / search terms (OR'd)
  fromMs: number;
  toMs: number;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Build the LogQL for ONE sub-query. Backtick raw strings avoid Go double-quote escape errors
// on regex metachars.
function buildSelector(spec: QuerySpec, sub: SubQuery): string {
  const labels: string[] = [`region="${spec.region}"`, `job="fivem"`];
  if (spec.server) labels.push(`server="${spec.server}"`);
  const flagRe = flagsRegexFor(sub.flags);
  if (flagRe) labels.push(`flag=~\`${flagRe}\``);
  let q = `{${labels.join(",")}}`;
  if (sub.lineMatch) q += ` |~ \`${sub.lineMatch}\``;
  if (sub.lineExclude) q += ` !~ \`${sub.lineExclude}\``;
  const terms = spec.terms.map((t) => t.trim().replace(/`/g, "")).filter(Boolean);
  if (terms.length) q += ` |~ \`(?i)(${terms.map(escapeRe).join("|")})\``;
  return q;
}

interface LokiStreamResult {
  stream: Record<string, string>;
  values: [string, string][]; // [ns-ts, line]
}

async function queryRange(
  query: string,
  startNs: string,
  endNs: string,
  limit: number,
  direction: "forward" | "backward",
): Promise<LokiStreamResult[]> {
  const url = new URL("/loki/api/v1/query_range", LOKI_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("start", startNs);
  url.searchParams.set("end", endNs);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("direction", direction);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Loki ${res.status}: ${await res.text().catch(() => "")}`);
  const json = (await res.json()) as { data: { result: LokiStreamResult[] } };
  return json.data.result ?? [];
}

// Count-only estimate (fast) so the UI can warn before a huge export. Summed across sub-queries.
export async function estimateCount(spec: QuerySpec): Promise<number> {
  const rangeSec = Math.max(1, Math.ceil((spec.toMs - spec.fromMs) / 1000));
  let total = 0;
  for (const sub of spec.subqueries) {
    const url = new URL("/loki/api/v1/query", LOKI_URL);
    url.searchParams.set("query", `sum(count_over_time(${buildSelector(spec, sub)} [${rangeSec}s]))`);
    url.searchParams.set("time", String(spec.toMs) + "000000");
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) continue;
    const json = (await res.json()) as { data: { result: { value: [number, string] }[] } };
    const v = json.data.result?.[0]?.value?.[1];
    total += v ? Number(v) : 0;
  }
  return total;
}

// Recent matching lines (newest first) for the live explorer — bounded, merged across sub-queries.
export async function searchRecent(spec: QuerySpec, limit = 200): Promise<LogEntry[]> {
  const out: LogEntry[] = [];
  for (const sub of spec.subqueries) {
    const streams = await queryRange(
      buildSelector(spec, sub),
      String(spec.fromMs) + "000000",
      String(spec.toMs) + "000000",
      Math.min(limit, PAGE),
      "backward",
    );
    for (const s of streams) {
      for (const [ns, line] of s.values) {
        out.push({
          ts: Math.floor(Number(ns) / 1e6),
          line,
          region: s.stream.region ?? spec.region,
          server: s.stream.server ?? "",
          flag: s.stream.flag ?? "",
        });
      }
    }
  }
  out.sort((a, b) => b.ts - a.ts);
  return out.slice(0, limit);
}

// Time-bucketed line counts for the volume chart. Buckets summed across sub-queries.
export async function volume(spec: QuerySpec, buckets = 48): Promise<{ t: number; count: number }[]> {
  const rangeMs = Math.max(60000, spec.toMs - spec.fromMs);
  const stepSec = Math.max(60, Math.floor(rangeMs / 1000 / buckets));
  const agg = new Map<number, number>();
  for (const sub of spec.subqueries) {
    const url = new URL("/loki/api/v1/query_range", LOKI_URL);
    url.searchParams.set("query", `sum(count_over_time(${buildSelector(spec, sub)} [${stepSec}s]))`);
    url.searchParams.set("start", String(spec.fromMs) + "000000");
    url.searchParams.set("end", String(spec.toMs) + "000000");
    url.searchParams.set("step", String(stepSec));
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) continue;
    const json = (await res.json()) as { data: { result: { values: [number, string][] }[] } };
    for (const [t, v] of json.data.result?.[0]?.values ?? []) {
      const ms = t * 1000;
      agg.set(ms, (agg.get(ms) ?? 0) + (Number(v) || 0));
    }
  }
  return [...agg.entries()].sort((a, b) => a[0] - b[0]).map(([t, count]) => ({ t, count }));
}

// Full paginated pull of every matching line in [fromMs, toMs], oldest→newest, capped.
// Runs each sub-query to completion, then merges + sorts + caps.
export async function fetchAll(spec: QuerySpec): Promise<LogEntry[]> {
  const merged: LogEntry[] = [];
  for (const sub of spec.subqueries) {
    const query = buildSelector(spec, sub);
    const endNs = String(spec.toMs) + "000000";
    let cursorNs = String(spec.fromMs) + "000000";
    let guard = 0;
    while (merged.length < MAX_LINES && guard < 100000) {
      guard++;
      const streams = await queryRange(query, cursorNs, endNs, PAGE, "forward");
      const page: LogEntry[] = [];
      for (const s of streams) {
        for (const [ns, line] of s.values) {
          page.push({
            ts: Math.floor(Number(ns) / 1e6),
            line,
            region: s.stream.region ?? spec.region,
            server: s.stream.server ?? "",
            flag: s.stream.flag ?? "",
          });
        }
      }
      if (page.length === 0) break;
      page.sort((a, b) => a.ts - b.ts || a.line.localeCompare(b.line));
      for (const e of page) {
        if (merged.length >= MAX_LINES) break;
        merged.push(e);
      }
      if (page.length < PAGE) break;
      const lastNs = BigInt(page[page.length - 1].ts) * 1000000n + 1n;
      cursorNs = lastNs.toString();
      if (BigInt(cursorNs) >= BigInt(endNs)) break;
    }
  }
  merged.sort((a, b) => a.ts - b.ts || a.line.localeCompare(b.line));
  return merged.slice(0, MAX_LINES);
}
