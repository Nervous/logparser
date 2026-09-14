import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { LOG_TYPES, LOG_TYPE_KEYS } from "@/lib/logTypes";

function canManage(u: { isManager: boolean; isSuperAdmin: boolean }) {
  return u.isManager || u.isSuperAdmin;
}

// GET: roles of the user's region + their per-log-type permission matrix. Managers only.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const u = session.user;
  if (!canManage(u)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const roles = await prisma.role.findMany({
    where: u.isSuperAdmin ? {} : { region: u.region },
    orderBy: [{ region: "asc" }, { rank: "desc" }],
    include: { permissions: true, _count: { select: { users: true } } },
  });

  return NextResponse.json({
    logTypes: LOG_TYPES.map((t) => ({ key: t.key, label: t.label, channel: t.channel })),
    roles: roles.map((r) => ({
      id: r.id,
      region: r.region,
      name: r.name,
      rank: r.rank,
      seeAll: r.seeAll,
      users: r._count.users,
      permissions: Object.fromEntries(
        LOG_TYPE_KEYS.map((k) => [k, r.permissions.find((p) => p.logTypeKey === k)?.allowed ?? false]),
      ),
    })),
  });
}

// POST: update one role's permission (a log type toggle) or seeAll. Managers only, region-scoped.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const u = session.user;
  if (!canManage(u)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body?.roleId) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const role = await prisma.role.findUnique({ where: { id: Number(body.roleId) } });
  if (!role) return NextResponse.json({ error: "No role" }, { status: 404 });
  if (!u.isSuperAdmin && role.region !== u.region)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (typeof body.seeAll === "boolean") {
    await prisma.role.update({ where: { id: role.id }, data: { seeAll: body.seeAll } });
    return NextResponse.json({ ok: true });
  }

  if (body.logTypeKey && typeof body.allowed === "boolean" && LOG_TYPE_KEYS.includes(body.logTypeKey)) {
    await prisma.rolePermission.upsert({
      where: { roleId_logTypeKey: { roleId: role.id, logTypeKey: body.logTypeKey } },
      create: { roleId: role.id, logTypeKey: body.logTypeKey, allowed: body.allowed },
      update: { allowed: body.allowed },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Bad request" }, { status: 400 });
}
