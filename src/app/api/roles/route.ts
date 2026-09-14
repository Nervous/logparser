import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { groupOptions } from "@/lib/logGroups";
import { SEE_ALL_KEY } from "@/lib/rbac";
import { getRegion, REGIONS } from "@/lib/regions";

function canManage(u: { isManager: boolean; isSuperAdmin: boolean }) {
  return u.isManager || u.isSuperAdmin;
}

// Servers a manager may edit: their region's, or all regions' for a super-admin.
function editableServers(u: { region: string; isSuperAdmin: boolean }) {
  const regions = u.isSuperAdmin ? REGIONS : [getRegion(u.region)].filter(Boolean);
  return regions.flatMap((r) =>
    (r!.servers ?? []).map((s) => ({ key: s.key, label: s.label, region: r!.key })),
  );
}

// GET ?server=<key>: roles + their per-server permission matrix for that ONE server. Managers only.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const u = session.user;
  if (!canManage(u)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const servers = editableServers(u);
  const url = new URL(req.url);
  const server = url.searchParams.get("server") ?? servers[0]?.key ?? "";
  const srv = servers.find((s) => s.key === server);
  if (!srv) return NextResponse.json({ error: "Invalid server" }, { status: 403 });

  const roles = await prisma.role.findMany({
    where: u.isSuperAdmin ? { region: srv.region } : { region: u.region },
    orderBy: [{ rank: "desc" }],
    include: { permissions: { where: { server } }, _count: { select: { users: true } } },
  });

  return NextResponse.json({
    server,
    servers,
    logTypes: groupOptions().map((g) => ({ key: g.key, label: g.label, desc: g.desc, featured: g.featured })),
    roles: roles.map((r) => ({
      id: r.id,
      region: r.region,
      name: r.name,
      rank: r.rank,
      users: r._count.users,
      seeAll: r.permissions.some((p) => p.logTypeKey === SEE_ALL_KEY && p.allowed),
      permissions: Object.fromEntries(
        r.permissions.filter((p) => p.allowed && p.logTypeKey !== SEE_ALL_KEY).map((p) => [p.logTypeKey, true]),
      ),
    })),
  });
}

// POST: toggle one role's permission (group or seeAll) FOR ONE SERVER. Managers only, region-scoped.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const u = session.user;
  if (!canManage(u)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body?.roleId || !body?.server) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const server: string = String(body.server);
  const srv = editableServers(u).find((s) => s.key === server);
  if (!srv) return NextResponse.json({ error: "Invalid server" }, { status: 403 });

  const role = await prisma.role.findUnique({ where: { id: Number(body.roleId) } });
  if (!role) return NextResponse.json({ error: "No role" }, { status: 404 });
  if (role.region !== srv.region) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!u.isSuperAdmin && role.region !== u.region) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const key =
    typeof body.seeAll === "boolean" ? SEE_ALL_KEY :
    (body.logTypeKey && groupOptions().some((g) => g.key === body.logTypeKey)) ? String(body.logTypeKey) : null;
  const allowed = typeof body.seeAll === "boolean" ? body.seeAll : body.allowed;
  if (!key || typeof allowed !== "boolean") return NextResponse.json({ error: "Bad request" }, { status: 400 });

  await prisma.rolePermission.upsert({
    where: { roleId_server_logTypeKey: { roleId: role.id, server, logTypeKey: key } },
    create: { roleId: role.id, server, logTypeKey: key, allowed },
    update: { allowed },
  });
  return NextResponse.json({ ok: true });
}
