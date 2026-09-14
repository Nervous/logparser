// Server-side Loki client. Loki stays private (localhost on the log host); the app is the
// only thing that talks to it, after RBAC checks. LogQL is built here, never from the client.

import { flagsRegexFor } from "./logTypes";

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
  logTypeKeys: string[]; // which categories
  terms: string[]; // character names / search terms (OR'd)
  fromMs: number;
  toMs: number;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSelector(spec: QuerySpec): string {
  const labels: string[] = [`region="${spec.region}"`, `job="fivem"`];
  if (spec.server) labels.push(`server="${spec.server}"`);
  // flags ARE the selectable log types now; match any of the chosen ones exactly.
  // Backtick raw strings avoid LogQL/Go double-quote escape errors on regex metachars.
  const flagRe = flagsRegexFor(spec.logTypeKeys);
  if (flagRe) labels.push(`flag=~\`${flagRe}\``);
  let q = `{${labels.join(",")}}`;
  const terms = spec.terms.map((t) => t.trim().replace(/`/g, "")).filter(Boolean);
  if (terms.length) {
    q += ` |~ \`(?i)(${terms.map(escapeRe).join("|")})\``;
  }
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

// Count-only estimate (fast) so the UI can warn before a huge export.
export async function estimateCount(spec: QuerySpec): Promise<number> {
  const url = new URL("/loki/api/v1/query", LOKI_URL);
  const rangeSec = Math.max(1, Math.ceil((spec.toMs - spec.fromMs) / 1000));
  url.searchParams.set("query", `sum(count_over_time(${buildSelector(spec)} [${rangeSec}s]))`);
  url.searchParams.set("time", String(spec.toMs) + "000000");
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return -1;
  const json = (await res.json()) as { data: { result: { value: [number, string] }[] } };
  const v = json.data.result?.[0]?.value?.[1];
  return v ? Number(v) : 0;
}

// Recent matching lines (newest first) for the live explorer — bounded, single page.
export async function searchRecent(spec: QuerySpec, limit = 200): Promise<LogEntry[]> {
  const streams = await queryRange(
    buildSelector(spec),
    String(spec.fromMs) + "000000",
    String(spec.toMs) + "000000",
    Math.min(limit, PAGE),
    "backward",
  );
  const out: LogEntry[] = [];
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
  out.sort((a, b) => b.ts - a.ts);
  return out.slice(0, limit);
}

// Time-bucketed line counts for the volume chart. Returns [{ t: ms, count }].
export async function volume(spec: QuerySpec, buckets = 48): Promise<{ t: number; count: number }[]> {
  const rangeMs = Math.max(60000, spec.toMs - spec.fromMs);
  const stepSec = Math.max(60, Math.floor(rangeMs / 1000 / buckets));
  const url = new URL("/loki/api/v1/query_range", LOKI_URL);
  url.searchParams.set("query", `sum(count_over_time(${buildSelector(spec)} [${stepSec}s]))`);
  url.searchParams.set("start", String(spec.fromMs) + "000000");
  url.searchParams.set("end", String(spec.toMs) + "000000");
  url.searchParams.set("step", String(stepSec));
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];
  const json = (await res.json()) as { data: { result: { values: [number, string][] }[] } };
  const series = json.data.result?.[0]?.values ?? [];
  return series.map(([t, v]) => ({ t: t * 1000, count: Number(v) || 0 }));
}

// Full paginated pull of every matching line in [fromMs, toMs], oldest→newest, capped.
export async function fetchAll(spec: QuerySpec): Promise<LogEntry[]> {
  const query = buildSelector(spec);
  const endNs = String(spec.toMs) + "000000";
  let cursorNs = String(spec.fromMs) + "000000";
  const out: LogEntry[] = [];
  let guard = 0;

  while (out.length < MAX_LINES && guard < 100000) {
    guard++;
    const streams = await queryRange(query, cursorNs, endNs, PAGE, "forward");
    // flatten + sort this page by ts
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
      if (out.length >= MAX_LINES) break;
      out.push(e);
    }
    if (page.length < PAGE) break; // last page
    // advance cursor to 1ns past the last entry we took
    const lastNs = BigInt(page[page.length - 1].ts) * 1000000n + 1n;
    cursorNs = lastNs.toString();
    if (BigInt(cursorNs) >= BigInt(endNs)) break;
  }
  return out;
}
