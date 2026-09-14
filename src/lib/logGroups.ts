// Log GROUPS — the single user-facing unit for both filtering and permissions. Instead of the
// ~180 raw Loki `flag` values (too many to browse or to grant one-by-one), staff pick and are
// authorized by group. Six FEATURED groups (the ones ops care about most) sit on top; the rest
// are broad categories. First matching rule wins, so a flag lands in exactly one group.
//
// Client-safe: pure data + regexes, no fs / no Loki fetch. Flag resolution takes the live flag
// list as an argument (callers pass getFlags() from the server).

export interface LogGroup {
  key: string;
  label: string;
  desc: string;
  featured: boolean;
  flags: RegExp;          // which raw flag values belong to this group
  lineMatch?: string;     // narrow to lines matching this RE2 (LogQL |~)
  lineExclude?: string;   // drop lines matching this RE2 (LogQL !~)
}

// Faction chat and faction action-logs share the single `organization` flag, so they are split
// by LINE: chat lines look like `Name (( (123) Rank First Last: message ))`.
const FACTION_CHAT_RE = `\\(\\( \\(`;

export const GROUPS: LogGroup[] = [
  // ── featured (priority) ────────────────────────────────────────────────
  { key: "chatlogs", label: "Chatlogs", desc: "IC / OOC / radio / me / do — all character chat",
    featured: true, flags: /^characterchat$/ },
  { key: "factionchat", label: "Faction Chat", desc: "In-faction (( chat )) messages",
    featured: true, flags: /^organization$/, lineMatch: FACTION_CHAT_RE },
  { key: "factionlogs", label: "Faction Logs", desc: "Faction actions, wages, membership",
    featured: true, flags: /^organization$/, lineExclude: FACTION_CHAT_RE },
  { key: "adminlogs", label: "Admin Logs", desc: "Admin commands, pages and alerts",
    featured: true, flags: /^(admin|admincommand|adminpager|alertadmin|alertlead|alertmanagement|alertall|alertslack|dev|rpqmlogs)$/ },
  { key: "outfitlogs", label: "Outfit Logs", desc: "Outfit / clothing changes",
    featured: true, flags: /^outfitlogs$/ },
  { key: "furniturelogs", label: "Furniture Logs", desc: "Furniture placement & property objects",
    featured: true, flags: /^furniture$/ },

  // ── broad categories (the rest) ────────────────────────────────────────
  { key: "money", label: "Economy & Money", desc: "Banking, shops, businesses, casino",
    featured: false, flags: /money|bank|atm|casino|shop|business|paycheck|transfer|pricing|donat|points|lucky|poker|fleeca/ },
  { key: "vehicles", label: "Vehicles", desc: "Vehicles, garages, fuel, tow, chop",
    featured: false, flags: /veh|chop|flatbed|garage|fuel|charger|\btow\b|els|siren|racing|golfcart|subwoofer|lightbar/ },
  { key: "phone", label: "Phone", desc: "Phone controller, SMS, mail app",
    featured: false, flags: /phone/ },
  { key: "jobs", label: "Jobs & Activities", desc: "Trucking, mailman, hunting, fishing…",
    featured: false, flags: /^job|jobs|trucking|mailman|hunt|garbage|brewery|driving|livestock|garden|mining|fish|petrol|weaponsupplier|courier|dock|farming/ },
  { key: "crime", label: "Crime & Illegal", desc: "Drugs, weapons, robbery, jail, evidence",
    featured: false, flags: /drug|weed|blackmarket|darkweb|traphouse|hidden|weapon|skimmer|metal|lootkit|robber|jail|arrest|prison|evidence|forensic|gun|shooting|airsoft|xmr/ },
  { key: "property", label: "Property & Objects", desc: "Properties, doors, safes, containers",
    featured: false, flags: /propert|interior|door|safe|container|objectspawner|permanentobject|locker|graffiti|billboard|device|smartteleport|maplocation/ },
  { key: "character", label: "Character & Roleplay", desc: "Character, medical, licenses, documents",
    featured: false, flags: /character|changechar|death|blood|injur|medic|medication|morgue|tattoo|mask|customization|anim|focus|idcard|license|gym|hunger|charactercreator|documents/ },
  { key: "comms", label: "Other Comms", desc: "Voice, boombox, notice board, Discord",
    featured: false, flags: /voice|boombox|sms|message|noticeboard|discord/ },
  { key: "system", label: "System & Other", desc: "Everything else",
    featured: false, flags: /.*/ },
];

const BY_KEY = new Map(GROUPS.map((g) => [g.key, g]));

export function groupLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key;
}

// Which group a raw flag belongs to (featured first, then categories; system is the catch-all).
// Faction's two groups share the org flag — a bare flag maps to Faction Logs (chat is the
// line-level subset), which only matters for the recent-log chip display.
export function groupOfFlag(flag: string): LogGroup {
  for (const g of GROUPS) {
    if (g.key === "factionchat") continue; // line-level; can't decide from the flag alone
    if (g.flags.test(flag)) return g;
  }
  return GROUPS[GROUPS.length - 1];
}

// Static options for the UI (no flag list needed — membership is resolved server-side).
export function groupOptions(): { key: string; label: string; desc: string; featured: boolean }[] {
  return GROUPS.map(({ key, label, desc, featured }) => ({ key, label, desc, featured }));
}

// One Loki sub-query: a flag set with optional line narrowing. A selection becomes one or more
// of these (line-filtered faction groups each need their own; everything else merges into one).
export interface SubQuery { flags: string[]; lineMatch?: string; lineExclude?: string }

function memberFlags(group: LogGroup, allFlags: string[]): string[] {
  if (group.key === "system") {
    // catch-all = flags claimed by no earlier group
    return allFlags.filter((f) => groupOfFlag(f).key === "system");
  }
  return allFlags.filter((f) => group.flags.test(f));
}

// Resolve selected group keys into merged Loki sub-queries against the live flag list.
export function resolveGroupsToPlan(groupKeys: string[], allFlags: string[]): SubQuery[] {
  const keys = new Set(groupKeys.filter((k) => BY_KEY.has(k)));
  const plain = new Set<string>();
  const subs: SubQuery[] = [];

  const hasChat = keys.has("factionchat");
  const hasLogs = keys.has("factionlogs");
  const orgFlags = ["organization"];

  for (const k of keys) {
    if (k === "factionchat" || k === "factionlogs") continue; // handled below
    for (const f of memberFlags(BY_KEY.get(k)!, allFlags)) plain.add(f);
  }

  // faction: both selected → all org lines (no line filter); one → line-narrowed sub-query
  if (hasChat && hasLogs) {
    for (const f of orgFlags) plain.add(f);
  } else if (hasChat) {
    subs.push({ flags: orgFlags, lineMatch: FACTION_CHAT_RE });
  } else if (hasLogs) {
    subs.push({ flags: orgFlags, lineExclude: FACTION_CHAT_RE });
  }

  if (plain.size) subs.unshift({ flags: [...plain] });
  return subs;
}
