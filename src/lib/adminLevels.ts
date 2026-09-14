// Mirrors the UCP AdminLevel enum (App\Enums\AdminLevel). The enum values are NOT rank-ordered
// (SUPPORT=1, ADMINONE=2, TRIALADMIN=7…), so gating uses an explicit rank map, not `>=`.

export const ADMIN_LEVEL = {
  PLAYER: 0,
  SUPPORT: 1,
  ADMINONE: 2, // "Admin Level 1"
  ADMINTWO: 3,
  SENIORADMIN: 4,
  LEADADMIN: 5,
  MANAGER: 6,
  TRIALADMIN: 7,
  DEVELOPER: 8,
  SENIORDEVELOPER: 9,
  SENIORMANAGER: 10,
  LEADDEVELOPER: 11,
} as const;

export const ADMIN_LEVEL_NAME: Record<number, string> = {
  0: "Player",
  1: "Support",
  2: "Admin Level 1",
  3: "Admin Level 2",
  4: "Senior Admin",
  5: "Lead Admin",
  6: "Manager",
  7: "Trial Admin",
  8: "Developer",
  9: "Senior Developer",
  10: "Senior Manager",
  11: "Lead Developer",
};

// Staff hierarchy rank (higher = more senior). Player = 0.
const RANK: Record<number, number> = {
  [ADMIN_LEVEL.PLAYER]: 0,
  [ADMIN_LEVEL.SUPPORT]: 10,
  [ADMIN_LEVEL.TRIALADMIN]: 20,
  [ADMIN_LEVEL.ADMINONE]: 30, // Admin Level 1 — the SSO floor
  [ADMIN_LEVEL.ADMINTWO]: 40,
  [ADMIN_LEVEL.SENIORADMIN]: 50,
  [ADMIN_LEVEL.LEADADMIN]: 60,
  [ADMIN_LEVEL.MANAGER]: 70,
  [ADMIN_LEVEL.SENIORMANAGER]: 80,
  // developer track — staff, treated at/above Admin Level 1 for log access
  [ADMIN_LEVEL.DEVELOPER]: 45,
  [ADMIN_LEVEL.SENIORDEVELOPER]: 55,
  [ADMIN_LEVEL.LEADDEVELOPER]: 65,
};

// The minimum rank allowed to sign in: "Admin Level 1 minimum" (excludes Player, Support,
// Trial Admin). Change SSO_MIN_LEVEL to ADMIN_LEVEL.SUPPORT / TRIALADMIN to widen access.
export const SSO_MIN_LEVEL = ADMIN_LEVEL.ADMINONE;

// Reverse of the name map (lower-cased) — the UCP /api/user returns the rank as a translated
// NAME string (e.g. "Senior Manager"), not the enum int, so we resolve names back to levels.
const LEVEL_BY_NAME: Record<string, number> = Object.fromEntries(
  Object.entries(ADMIN_LEVEL_NAME).map(([lvl, name]) => [name.toLowerCase(), Number(lvl)]),
);

// Accept a number, a numeric string, or a translated AdminLevel name.
export function resolveLevel(input: unknown): number {
  if (typeof input === "number" && !Number.isNaN(input)) return input;
  if (typeof input === "string") {
    const t = input.trim();
    if (/^\d+$/.test(t)) return Number(t);
    return LEVEL_BY_NAME[t.toLowerCase()] ?? 0;
  }
  return 0;
}

export function rankOf(level: number): number {
  return RANK[level] ?? 0;
}

// Fail-closed: unknown / missing level cannot sign in.
export function canSSO(level: number | null | undefined): boolean {
  if (level == null || Number.isNaN(level)) return false;
  return rankOf(level) >= rankOf(SSO_MIN_LEVEL);
}

// Managers (region log-permission editors) — Manager and above.
export function isManagerLevel(level: number): boolean {
  return rankOf(level) >= rankOf(ADMIN_LEVEL.MANAGER);
}
