import NextAuth, { type NextAuthConfig } from "next-auth";
import type { OAuthConfig } from "next-auth/providers";
import { REGIONS, type RegionKey } from "@/lib/regions";
import { prisma } from "@/lib/prisma";
import { canSSO, isManagerLevel, resolveLevel, ADMIN_LEVEL_NAME } from "@/lib/adminLevels";

interface UcpUser {
  id: number;
  username?: string;
  name?: string;
  discord_username?: string;
  admin?: number; // legacy users.admin column (0 for most staff — NOT the rank)
  // real staff rank: user_has_roles.role_id, returned by /api/user as role.role_id,
  // already translated to an AdminLevel NAME string (e.g. "Senior Manager").
  role?: { role_id?: string | number } | null;
  // UCP account flags (users.flags, pipe-delimited, e.g. "STAFFMANAGEMENT|RPQM") or a derived
  // staff_management boolean — only present if /api/user exposes them. Absent = no flags.
  flags?: string | string[] | null;
  staff_management?: boolean | number | string | null;
}
// GTAW UCP /api/user (DataController@details) wraps the payload: { "user": { … } }.
type UcpProfile = { user?: UcpUser } & Partial<UcpUser>;

// Mirrors UCP User::getFlag(): flags are pipe-delimited and matched case-insensitively.
function hasUcpFlag(u: UcpUser, flag: string): boolean {
  const list = Array.isArray(u.flags) ? u.flags : typeof u.flags === "string" ? u.flags.split("|") : [];
  return list.some((f) => String(f).trim().toLowerCase() === flag.toLowerCase());
}

// One OAuth provider per region, each pointed at that region's UCP (Laravel Passport).
// The admin picks region+server on the login page, which calls signIn(`ucp-<region>`).
function ucpProvider(region: RegionKey): OAuthConfig<UcpProfile> {
  const U = process.env[`UCP_${region.toUpperCase()}_URL`];
  return {
    id: `ucp-${region}`,
    name: `UCP ${region.toUpperCase()}`,
    type: "oauth",
    clientId: process.env[`UCP_${region.toUpperCase()}_CLIENT_ID`],
    clientSecret: process.env[`UCP_${region.toUpperCase()}_CLIENT_SECRET`],
    authorization: { url: `${U}/oauth/authorize`, params: { scope: "" } },
    token: `${U}/oauth/token`,
    userinfo: `${U}/api/user`,
    checks: ["state"],
    profile(p) {
      const u: UcpUser = (p.user ?? p) as UcpUser; // /api/user wraps as { user: {…} }
      // rank comes from the role relation (name string); fall back to the legacy admin column
      const level = resolveLevel(u.role?.role_id) || Number(u.admin ?? 0);
      return {
        id: `${region}:${u.id}`,
        name: u.username ?? u.name ?? `#${u.id}`,
        ucpId: u.id,
        region,
        discordName: u.discord_username ?? null,
        adminLevel: level,
        staffManagement: Number(u.staff_management) === 1 || hasUcpFlag(u, "STAFFMANAGEMENT"),
      } as unknown as { id: string; name: string };
    },
  };
}

export const authConfig: NextAuthConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: REGIONS.map((r) => ucpProvider(r.key)),
  callbacks: {
    async signIn({ user, account }) {
      const region = account?.provider?.replace("ucp-", "");
      const u = user as unknown as {
        ucpId: number; region: string; name: string; discordName?: string; adminLevel?: number;
        staffManagement?: boolean;
      };
      if (!region || !u.ucpId) return false;

      // GATE: Trial Admin minimum (rank-based). Regular players and Support are
      // rejected at the door — before any log data is reachable. Fail-closed on missing level.
      const level = Number(u.adminLevel ?? 0);
      if (!canSSO(level)) return "/login?error=not_authorized";

      // Managers (Manager+) may edit their region's role permissions; never auto-grant superadmin.
      // The STAFFMANAGEMENT flag is re-synced from the UCP on every sign-in (fail-closed if absent).
      const isStaffManagement = Boolean(u.staffManagement);
      const dbUser = await prisma.user.upsert({
        where: { region_ucpId: { region, ucpId: u.ucpId } },
        create: {
          region, ucpId: u.ucpId, username: u.name, discordName: u.discordName ?? null,
          adminLevel: level, isManager: isManagerLevel(level), isStaffManagement, lastLogin: new Date(),
        },
        update: {
          username: u.name, discordName: u.discordName ?? null,
          adminLevel: level, isManager: isManagerLevel(level), isStaffManagement, lastLogin: new Date(),
        },
      });

      // Ensure a Role exists for this rank in this region, and the user is assigned to it, so
      // managers have concrete roles to edit permissions on. Role key = the AdminLevel int.
      const roleKey = String(level);
      const role = await prisma.role.upsert({
        where: { region_key: { region, key: roleKey } },
        create: { region, key: roleKey, name: ADMIN_LEVEL_NAME[level] ?? `Level ${level}`, rank: level },
        update: {},
      });
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: dbUser.id, roleId: role.id } },
        create: { userId: dbUser.id, roleId: role.id },
        update: {},
      });
      return true;
    },
    async jwt({ token, user, account }) {
      if (account && user) {
        const u = user as unknown as { ucpId: number; region: string };
        const dbUser = await prisma.user.findUnique({
          where: { region_ucpId: { region: u.region, ucpId: u.ucpId } },
        });
        if (dbUser) {
          token.uid = dbUser.id;
          token.region = dbUser.region;
          token.username = dbUser.username;
          token.adminLevel = dbUser.adminLevel;
          token.isManager = dbUser.isManager;
          token.isSuperAdmin = dbUser.isSuperAdmin;
          token.isStaffManagement = dbUser.isStaffManagement;
        }
      } else if (token.uid && token.adminLevel === undefined) {
        // Tokens minted before rank/flag were carried: backfill once from the DB (values as of the
        // user's last sign-in) so existing Senior Admins get the queue without signing in again.
        const dbUser = await prisma.user.findUnique({ where: { id: token.uid as number } });
        token.adminLevel = dbUser?.adminLevel ?? 0;
        token.isStaffManagement = dbUser?.isStaffManagement ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) {
        session.user = {
          ...session.user,
          id: String(token.uid),
          uid: token.uid as number,
          region: token.region as string,
          username: token.username as string,
          adminLevel: Number(token.adminLevel ?? 0),
          isManager: Boolean(token.isManager),
          isSuperAdmin: Boolean(token.isSuperAdmin),
          isStaffManagement: Boolean(token.isStaffManagement),
        } as typeof session.user;
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
