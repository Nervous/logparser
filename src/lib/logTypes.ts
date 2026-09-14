// Log types the UI exposes, each mapped to the Loki `flag` label values produced by
// Vector's parser (the [FLAG] prefix from the gamemode's LoggingFlags, lower-cased).
//
// `channel` mirrors the old Discord channel names shown as chips in the UI.
// `flags` is the set of Loki `flag` values that make up this category — used to build the
// LogQL selector `{region=…, flag=~"a|b|c"}`. Refine as real data confirms the mapping.

export interface LogType {
  key: string; // stable permission key (matches RolePermission.logTypeKey)
  label: string; // UI label
  channel: string; // #chip label
  flags: string[]; // Loki `flag` label values
  description: string;
}

export const LOG_TYPES: LogType[] = [
  {
    key: "logs",
    label: "General Logs",
    channel: "#logs",
    flags: ["command", "log", "job", "vehicle", "properties", "money", "moneycommand", "spawnlog"],
    description: "General activity: commands, jobs, vehicles, property, money.",
  },
  {
    key: "chatlogs",
    label: "Chat Logs",
    channel: "#chatlogs",
    flags: ["characterchat", "character"],
    description: "In-character chat, /me, /do, radio, phone.",
  },
  {
    key: "adminlogs",
    label: "Admin Logs",
    channel: "#admin_logs",
    flags: ["admincommand", "adminpager", "alertadmin", "admin activity handler", "admin"],
    description: "Administrator commands, pages and alerts.",
  },
  {
    key: "furniturelogs",
    label: "Furniture Logs",
    channel: "#furniturelogs",
    flags: ["furniture"],
    description: "Furniture placement, purchase and removal.",
  },
  {
    key: "factionchatlogs",
    label: "Faction Chat Logs",
    channel: "#factionchatlogs",
    flags: ["organizations", "faction"],
    description: "Faction / organization radio and chat.",
  },
];

export const LOG_TYPE_KEYS = LOG_TYPES.map((t) => t.key);

export function getLogType(key: string): LogType | undefined {
  return LOG_TYPES.find((t) => t.key === key);
}

// The `flag=~"…"` regex value covering the requested log-type keys.
export function flagsRegexFor(keys: string[]): string {
  const flags = new Set<string>();
  for (const k of keys) {
    const t = getLogType(k);
    if (t) for (const f of t.flags) flags.add(f);
  }
  return [...flags].map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
}
