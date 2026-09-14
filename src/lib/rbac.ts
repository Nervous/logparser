import { prisma } from "./prisma";

export interface EffectivePermissions {
  allowed: Set<string>; // log-type keys the user may view
  seeAll: boolean; // "Can See All Activity" — bypasses per-type checks
  isManager: boolean;
  isSuperAdmin: boolean;
}

// A user's effective log-type permissions = the UNION of their roles' allowed types
// (per-role model). seeAll on any role grants everything.
export async function effectivePermissions(userId: number): Promise<EffectivePermissions> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: { include: { permissions: true } } } } },
  });
  const allowed = new Set<string>();
  let seeAll = false;
  if (user) {
    // Managers and super-admins see everything by default (they also administer permissions).
    if (user.isManager || user.isSuperAdmin) seeAll = true;
    for (const ur of user.roles) {
      if (ur.role.seeAll) seeAll = true;
      for (const p of ur.role.permissions) if (p.allowed) allowed.add(p.logTypeKey);
    }
  }
  // seeAll is a flag consumers honour directly (flags are dynamic; we don't enumerate them here).
  return {
    allowed,
    seeAll,
    isManager: user?.isManager ?? false,
    isSuperAdmin: user?.isSuperAdmin ?? false,
  };
}

// Split requested log types into the ones the user may run now vs the ones that need approval.
export function splitByAuthorization(
  requested: string[],
  perms: EffectivePermissions,
): { authorized: string[]; unauthorized: string[] } {
  if (perms.seeAll) return { authorized: [...requested], unauthorized: [] };
  const authorized: string[] = [];
  const unauthorized: string[] = [];
  for (const k of requested) {
    (perms.allowed.has(k) ? authorized : unauthorized).push(k);
  }
  return { authorized, unauthorized };
}
