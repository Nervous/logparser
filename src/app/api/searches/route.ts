import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Search audit trail. Managers+ / super-admin only; region-scoped (super-admins see all regions).
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const u = session.user;
  if (!u.isManager && !u.isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const take = Math.min(Number(url.searchParams.get("take") ?? 200), 1000);
  const cursor = Number(url.searchParams.get("cursor") ?? 0);

  const rows = await prisma.searchLog.findMany({
    where: u.isSuperAdmin ? {} : { region: u.region },
    orderBy: { id: "desc" },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const nextCursor = rows.length > take ? rows[take].id : null;

  return NextResponse.json({
    searches: rows.slice(0, take).map((r) => ({
      id: r.id, username: r.username, region: r.region, server: r.server,
      query: r.query, logTypes: JSON.parse(r.logTypes) as string[],
      range: r.range, resultCount: r.resultCount, createdAt: r.createdAt,
    })),
    nextCursor,
  });
}
