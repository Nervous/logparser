import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ADMIN_LEVEL_NAME } from "@/lib/adminLevels";

// List staff (imported from the UCP DB) with their role + access. Managers only, region-scoped.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const u = session.user;
  if (!u.isManager && !u.isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const users = await prisma.user.findMany({
    where: u.isSuperAdmin ? {} : { region: u.region },
    orderBy: [{ region: "asc" }, { adminLevel: "desc" }, { username: "asc" }],
    include: { roles: { include: { role: { select: { name: true } } } } },
    take: 2000,
  });

  return NextResponse.json({
    users: users.map((usr) => {
      const roleNames = usr.roles.map((r) => r.role.name);
      const seeAll = usr.isManager || usr.isSuperAdmin; // per-server grants live in Roles & Permissions
      return {
        id: usr.id,
        region: usr.region,
        username: usr.username,
        discordName: usr.discordName,
        adminLevel: usr.adminLevel,
        rank: ADMIN_LEVEL_NAME[usr.adminLevel] ?? `Level ${usr.adminLevel}`,
        roles: roleNames,
        isManager: usr.isManager,
        seeAll,
        lastLogin: usr.lastLogin,
      };
    }),
  });
}
