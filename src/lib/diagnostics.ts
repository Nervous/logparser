// Managers+ diagnostics: how much log data Loki holds (per day / per month) and how much
// disk remains on the log host. Loki is localhost-only; the app is the only caller (after the
// managers+ gate in the API route). Read-only — no LogQL comes from the client here.

import { statfs } from "node:fs/promises";

const LOKI_URL = process.env.LOKI_URL ?? "http://127.0.0.1:3100";
// Filesystem that holds the Loki chunks. Same mount as everything on 51.91 by default.
const STORAGE_PATH = process.env.STORAGE_PATH ?? "/";
const RETENTION_DAYS = Number(process.env.LOKI_RETENTION_DAYS ?? 90);

export interface Bucket {
  t: number; // ms epoch (bucket start)
  bytes: number;
  lines: number;
}

export interface StorageInfo {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usedPct: number;
  retentionDays: number;
  path: string;
}

export interface Diagnostics {
  daily: Bucket[]; // last N days
  monthly: Bucket[]; // last N months
  totals: { bytes: number; lines: number; days: number };
  storage: StorageInfo | null;
}

// A Loki matrix response: one series of [unixSec, "value"] samples.
type Matrix = { data?: { result?: { values?: [number, string][] }[] } };

async function lokiMatrix(url: URL): Promise<[number, number][]> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const j = (await res.json()) as Matrix;
    const values = j.data?.result?.[0]?.values ?? [];
    return values.map(([t, v]) => [t * 1000, Number(v) || 0]);
  } catch {
    return [];
  }
}

// Bytes ingested per `stepSec` window, from Loki's index (cheap, no chunk scan).
async function volumeRange(query: string, startMs: number, endMs: number, stepSec: number) {
  const url = new URL("/loki/api/v1/index/volume_range", LOKI_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("start", String(startMs) + "000000");
  url.searchParams.set("end", String(endMs) + "000000");
  url.searchParams.set("step", `${stepSec}s`);
  return lokiMatrix(url);
}

// Line counts per `stepSec` window.
async function countRange(query: string, startMs: number, endMs: number, stepSec: number) {
  const url = new URL("/loki/api/v1/query_range", LOKI_URL);
  url.searchParams.set("query", `sum(count_over_time(${query} [${stepSec}s]))`);
  url.searchParams.set("start", String(startMs) + "000000");
  url.searchParams.set("end", String(endMs) + "000000");
  url.searchParams.set("step", String(stepSec));
  return lokiMatrix(url);
}

// Snap a ms timestamp to the start of its UTC day.
function dayStart(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
function monthStart(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

// Align two matrices (bytes, lines) into buckets keyed by a snap function.
function bucketize(
  bytes: [number, number][],
  lines: [number, number][],
  snap: (ms: number) => number,
): Bucket[] {
  const map = new Map<number, Bucket>();
  for (const [t, b] of bytes) {
    const k = snap(t);
    const cur = map.get(k) ?? { t: k, bytes: 0, lines: 0 };
    cur.bytes += b;
    map.set(k, cur);
  }
  for (const [t, l] of lines) {
    const k = snap(t);
    const cur = map.get(k) ?? { t: k, bytes: 0, lines: 0 };
    cur.lines += l;
    map.set(k, cur);
  }
  return [...map.values()].sort((a, b) => a.t - b.t);
}

async function storage(): Promise<StorageInfo | null> {
  try {
    const s = await statfs(STORAGE_PATH);
    const totalBytes = s.blocks * s.bsize;
    const freeBytes = s.bavail * s.bsize;
    const usedBytes = totalBytes - freeBytes;
    return {
      totalBytes,
      freeBytes,
      usedBytes,
      usedPct: totalBytes ? (usedBytes / totalBytes) * 100 : 0,
      retentionDays: RETENTION_DAYS,
      path: STORAGE_PATH,
    };
  } catch {
    return null;
  }
}

// region "" (or undefined) = all regions (super-admin); else scoped to one region.
export async function getDiagnostics(region?: string): Promise<Diagnostics> {
  const selector = region ? `{job="fivem",region="${region}"}` : `{job="fivem"}`;
  const now = Date.now();
  const days = 30;
  const months = 12;
  const dayStartMs = dayStart(now) - (days - 1) * 86400_000;
  const monthStartMs = monthStart(now - (months - 1) * 30 * 86400_000);

  const [dayBytes, dayLines, monBytes, monLines, storageInfo] = await Promise.all([
    volumeRange(selector, dayStartMs, now, 86400),
    countRange(selector, dayStartMs, now, 86400),
    volumeRange(selector, monthStartMs, now, 86400), // day-stepped, then folded into months
    countRange(selector, monthStartMs, now, 86400),
    storage(),
  ]);

  const daily = bucketize(dayBytes, dayLines, dayStart);
  const monthly = bucketize(monBytes, monLines, monthStart);
  const totals = daily.reduce(
    (a, d) => ({ bytes: a.bytes + d.bytes, lines: a.lines + d.lines, days: a.days + 1 }),
    { bytes: 0, lines: 0, days: 0 },
  );

  return { daily, monthly, totals, storage: storageInfo };
}
