// Time handling for the whole app: every timestamp is SHOWN, and every picked date/time is READ,
// in SERVER time on a 24-hour clock — never the viewer's browser timezone or locale. Pure and
// client-safe; the zone itself comes from the server (serverTime.ts → ServerTimeProvider).

export type TimeInput = number | string | Date;

export interface WallClock { year: number; month: number; day: number; hour: number; minute: number; second: number }

const partsFormatters = new Map<string, Intl.DateTimeFormat>();
const monthFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    partsFormatters.set(tz, f);
  }
  return f;
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const toMs = (t: TimeInput) => (t instanceof Date ? t.getTime() : typeof t === "number" ? t : Date.parse(t));

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// The wall-clock reading in `tz` at an instant.
export function wallClockAt(ms: number, tz: string): WallClock {
  const w: WallClock = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };
  for (const p of partsFormatter(tz).formatToParts(ms)) {
    if (p.type in w) w[p.type as keyof WallClock] = Number(p.value);
  }
  return w;
}

// "2026-09-19"
export function fmtDate(t: TimeInput, tz: string): string {
  const ms = toMs(t);
  if (Number.isNaN(ms)) return "—";
  const w = wallClockAt(ms, tz);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

// "2026-09-19 13:05:09" — { seconds: false } drops the seconds, { ms: true } adds ".042".
export function fmtDateTime(t: TimeInput, tz: string, opts: { seconds?: boolean; ms?: boolean } = {}): string {
  const ms = toMs(t);
  if (Number.isNaN(ms)) return "—";
  const w = wallClockAt(ms, tz);
  let s = `${w.year}-${pad(w.month)}-${pad(w.day)} ${pad(w.hour)}:${pad(w.minute)}`;
  if (opts.seconds !== false || opts.ms) s += `:${pad(w.second)}`;
  if (opts.ms) s += `.${pad(((ms % 1000) + 1000) % 1000, 3)}`;
  return s;
}

// Bulk version of fmtDateTime for export files (up to LOKI_MAX_LINES lines): identical output,
// but the zone offset is looked up once per 15-minute slot instead of per line — real-world
// offset changes (DST, incl. half-hour/45-minute zones) land on those UTC boundaries.
export function bulkDateTimeFormatter(tz: string, opts: { ms?: boolean } = {}): (ms: number) => string {
  const offsets = new Map<number, number>();
  return (ms) => {
    const slot = Math.floor(ms / 900_000);
    let off = offsets.get(slot);
    if (off === undefined) {
      off = offsetMs(slot * 900_000, tz);
      offsets.set(slot, off);
    }
    const d = new Date(ms + off);
    const s = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
      `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    return opts.ms ? `${s}.${pad(d.getUTCMilliseconds(), 3)}` : s;
  };
}

// "13:05"
export function fmtTime(t: TimeInput, tz: string): string {
  const ms = toMs(t);
  if (Number.isNaN(ms)) return "—";
  const w = wallClockAt(ms, tz);
  return `${pad(w.hour)}:${pad(w.minute)}`;
}

// "September 2026"
export function fmtMonth(t: TimeInput, tz: string): string {
  const ms = toMs(t);
  if (Number.isNaN(ms)) return "—";
  let f = monthFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "long" });
    monthFormatters.set(tz, f);
  }
  return f.format(ms);
}

// ── wall clocks: the date/time pickers' "YYYY-MM-DDTHH:mm", read as server time ───────────────

const WALL_CLOCK_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

// How far `tz`'s wall clock is ahead of UTC at an instant, in ms.
function offsetMs(ms: number, tz: string): number {
  const w = wallClockAt(ms, tz);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - (ms - (((ms % 1000) + 1000) % 1000));
}

// The instant at which `tz`'s wall clock reads the given local date/time. Inside a DST gap the
// result is shifted by the gap, like a real clock.
function zonedToMs(year: number, month: number, day: number, hour: number, minute: number, second: number, tz: string): number {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const guess = asUtc - offsetMs(asUtc, tz);
  const offset = offsetMs(guess, tz); // re-check at the guess so times near a DST switch land right
  return asUtc - offset;
}

// A server-time wall clock ("YYYY-MM-DDTHH:mm[:ss]") → epoch ms; NaN if malformed or not a real date.
export function wallClockToMs(s: string, tz: string): number {
  const m = WALL_CLOCK_RE.exec(s.trim());
  if (!m) return NaN;
  const [y, mo, d, h, mi, se] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? "0"].map(Number);
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth || h > 23 || mi > 59 || se > 59) return NaN;
  return zonedToMs(y, mo, d, h, mi, se, tz);
}

// Is this a complete, real picker value ("YYYY-MM-DDTHH:mm", 24-hour)?
export function isWallClock(s: string): boolean {
  return !Number.isNaN(wallClockToMs(s, "UTC"));
}

// An instant → picker value, in `tz`.
export function toWallClockInput(ms: number, tz: string): string {
  const w = wallClockAt(ms, tz);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`;
}

// A from/to value sent by the UI: a server-time wall clock (the pickers' format), or an ISO
// timestamp with an explicit Z / ±hh:mm offset (already absolute). Anything else → NaN.
export function parseTimeInput(s: unknown, tz: string): number {
  if (typeof s !== "string") return NaN;
  const v = s.trim();
  if (WALL_CLOCK_RE.test(v)) return wallClockToMs(v, tz);
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/i.test(v)) return Date.parse(v);
  return NaN;
}

// Midnight starting the `tz` day / month that contains an instant.
export function startOfDay(ms: number, tz: string): number {
  const w = wallClockAt(ms, tz);
  return zonedToMs(w.year, w.month, w.day, 0, 0, 0, tz);
}
export function startOfMonth(ms: number, tz: string): number {
  const w = wallClockAt(ms, tz);
  return zonedToMs(w.year, w.month, 1, 0, 0, 0, tz);
}
