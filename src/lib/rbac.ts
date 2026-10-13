import { prisma } from "./prisma";
import { rankOf } from "./adminLevels";
import { APPROVAL_EXEMPT_LEVEL, APPROVAL_GROUPS } from "./logGroups";

// Reserved logTypeKey meaning "Can See All Activity" for that (role, server).
export const SEE_ALL_KEY = "__all__";

export interface EffectivePermissions {
  allowed: Set<string>; // group keys the user may view on this server
  seeAll: boolean; // bypasses per-group checks (manager/super, or role see-all on this server)
  isManager: boolean;
  isSuperAdmin: boolean;
  isStaffManagement: boolean; // UCP STAFFMANAGEMENT account flag (synced at sign-in)
  adminLevel: number; // UCP AdminLevel (synced at sign-in)
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
    isStaffManagement: user?.isStaffManagement ?? false,
    adminLevel: user?.adminLevel ?? 0,
  };
}

// The requested groups an export must send to the request queue. Anything may be exported with a
// reason; only the approval groups need sign-off, and each only below its own rank: Chatlogs
// below Senior Admin, Admin Logs below Lead Admin. Staff Management (any rank) and See-All users,
// who can already read those logs directly, never need it.
export function approvalNeededFor(requested: string[], perms: EffectivePermissions): string[] {
  if (perms.seeAll || perms.isStaffManagement) return [];
  const rank = rankOf(perms.adminLevel);
  return requested.filter((k) => APPROVAL_GROUPS.includes(k) && rank < rankOf(APPROVAL_EXEMPT_LEVEL[k]));
}
