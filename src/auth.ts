import NextAuth, { type NextAuthConfig } from "next-auth";
import type { OAuthConfig } from "next-auth/providers";
import { REGIONS, type RegionKey } from "@/lib/regions";
import { prisma } from "@/lib/prisma";
import { canSSO, isManagerLevel } from "@/lib/adminLevels";

interface UcpProfile {
  id: number;
  username?: string;
  name?: string;
  discord_username?: string;
  admin?: number; // UCP AdminLevel enum value (0 = player)
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
      return {
        id: `${region}:${p.id}`,
        name: p.username ?? p.name ?? `#${p.id}`,
        ucpId: p.id,
        region,
        discordName: p.discord_username ?? null,
        adminLevel: Number(p.admin ?? 0),
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
      };
      if (!region || !u.ucpId) return false;

      // GATE: Admin Level 1 minimum (rank-based). Regular players, Support and Trial Admin are
      // rejected at the door — before any log data is reachable. Fail-closed on missing level.
      const level = Number(u.adminLevel ?? 0);
      if (!canSSO(level)) return "/login?error=not_authorized";

      // Managers (Manager+) may edit their region's role permissions; never auto-grant superadmin.
      await prisma.user.upsert({
        where: { region_ucpId: { region, ucpId: u.ucpId } },
        create: {
          region, ucpId: u.ucpId, username: u.name, discordName: u.discordName ?? null,
          adminLevel: level, isManager: isManagerLevel(level), lastLogin: new Date(),
        },
        update: {
          username: u.name, discordName: u.discordName ?? null,
          adminLevel: level, isManager: isManagerLevel(level), lastLogin: new Date(),
        },
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
          token.isManager = dbUser.isManager;
          token.isSuperAdmin = dbUser.isSuperAdmin;
        }
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
          isManager: Boolean(token.isManager),
          isSuperAdmin: Boolean(token.isSuperAdmin),
        } as typeof session.user;
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
