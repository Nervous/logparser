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

// Group the ~180 raw flags into a handful of browsable categories (first rule wins).
export interface Category { key: string; label: string }
export const CATEGORIES: Category[] = [
  { key: "chat", label: "Chat & Communication" },
  { key: "phone", label: "Phone" },
  { key: "admin", label: "Admin & Anti-Cheat" },
  { key: "money", label: "Economy & Money" },
  { key: "vehicles", label: "Vehicles" },
  { key: "property", label: "Property & Objects" },
  { key: "jobs", label: "Jobs & Activities" },
  { key: "crime", label: "Crime & Illegal" },
  { key: "faction", label: "Factions" },
  { key: "character", label: "Character & Roleplay" },
  { key: "system", label: "System & Other" },
];

const CATEGORY_RULES: [string, RegExp][] = [
  // phone before chat so phonecontroller/phonemessage land in Phone, not Chat
  ["phone", /phone/],
  ["chat", /chat|voice|boombox|sms|message|noticeboard|discord/],
  ["admin", /admin|alert|anticheat|aimmonitor|watchlist|report|rpqm|staff|\bdev\b|specialcommand|commandalias|command$|^command/],
  ["money", /money|bank|atm|casino|shop|business|paycheck|transfer|pricing|donat|points|lucky|poker|fleeca/],
  ["vehicles", /veh|chop|flatbed|garage|fuel|charger|\btow\b|els|siren|racing|golfcart|subwoofer|lightbar/],
  ["property", /propert|furniture|interior|door|safe|container|objectspawner|permanentobject|locker|graffiti|billboard|device|smartteleport|maplocation/],
  ["jobs", /^job|jobs|trucking|mailman|hunt|garbage|brewery|driving|livestock|garden|mining|fish|petrol|weaponsupplier|courier|dock|farming/],
  ["crime", /drug|weed|blackmarket|darkweb|traphouse|hidden|weapon|skimmer|metal|lootkit|robber|jail|arrest|prison|evidence|forensic|gun|shooting|airsoft|xmr/],
  ["faction", /organization|faction/],
  ["character", /character|changechar|death|blood|injur|medic|medication|morgue|tattoo|mask|customization|anim|focus|idcard|license|gym|graffiti|hunger|charactercreator/],
];

export function categorize(flag: string): string {
  for (const [key, re] of CATEGORY_RULES) if (re.test(flag)) return key;
  return "system";
}
