import { prisma } from "./prisma";

// Reserved logTypeKey meaning "Can See All Activity" for that (role, server).
export const SEE_ALL_KEY = "__all__";

export interface EffectivePermissions {
  allowed: Set<string>; // group keys the user may view on this server
  seeAll: boolean; // bypasses per-group checks (manager/super, or role see-all on this server)
  isManager: boolean;
  isSuperAdmin: boolean;
}

// A user's effective permissions ON ONE SERVER = the UNION of their roles' allowed groups for that
// server. Permissions are per-server, so the same rank can see different logs on EN-Text vs EN-Voice.
export async function effectivePermissions(userId: number, server: string): Promise<EffectivePermissions> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: { include: { role: { include: { permissions: { where: { server } } } } } },
    },
  });
  const allowed = new Set<string>();
  let seeAll = false;
  if (user) {
    // Managers and super-admins see everything by default (they also administer permissions).
    if (user.isManager || user.isSuperAdmin) seeAll = true;
    for (const ur of user.roles) {
      for (const p of ur.role.permissions) {
        if (!p.allowed) continue;
        if (p.logTypeKey === SEE_ALL_KEY) seeAll = true;
        else allowed.add(p.logTypeKey);
      }
    }
  }
  return {
    allowed,
    seeAll,
    isManager: user?.isManager ?? false,
    isSuperAdmin: user?.isSuperAdmin ?? false,
  };
}

// Split requested groups into the ones the user may run now vs the ones that need approval.
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
