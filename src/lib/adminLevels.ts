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
