// Log types = the real Loki `flag` label values (the gamemode's log categories: log, job,
// command, character, vehicle, furniture, organizations, admincommand, …). No Discord-channel
// grouping — each flag IS a selectable type. Fetched live from Loki so the list is always complete.

const LOKI_URL = process.env.LOKI_URL ?? "http://127.0.0.1:3100";
const TTL_MS = 5 * 60 * 1000;

// Internal/noise flags never worth exposing as a browsable log category.
const HIDDEN = new Set([
  "none", "gtawresource", "gtawhost", "offthread", "threadhandler", "hitchmonitor",
  "serverwidetickshandler", "scheduler", "dbsync", "txadmin", "tx", "t", "tsource",
  "success", "info", "commandregistrysync", "gtawhttpclient", "loadscreenevents",
  "charactertickengine", "charactersideeffectstickhandler", "jobshifttickhandler",
  "paycheckstickhandler", "nativetrail", "worldtrail",
]);

let cache: { at: number; flags: string[] } | null = null;

// Distinct, cleaned, sorted flag values (compound "a, b" split into a and b).
export async function getFlags(): Promise<string[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.flags;
  try {
    const res = await fetch(new URL("/loki/api/v1/label/flag/values", LOKI_URL), { cache: "no-store" });
    const j = (await res.json()) as { data?: string[] };
    const set = new Set<string>();
    for (const raw of j.data ?? []) {
      for (const part of raw.split(",")) {
        const f = part.trim().toLowerCase();
        if (f && !HIDDEN.has(f)) set.add(f);
      }
    }
    const flags = [...set].sort();
    cache = { at: Date.now(), flags };
    return flags;
  } catch {
    return cache?.flags ?? [];
  }
}

// Pretty label for a flag (Title Case), e.g. "admincommand" -> "Admincommand".
export function flagLabel(flag: string): string {
  return flag.replace(/\b\w/g, (c) => c.toUpperCase());
}

// LogQL regex alternation for the selected flags (used inside a backtick raw string).
export function flagsRegexFor(keys: string[]): string {
  return [...new Set(keys)].map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
}
