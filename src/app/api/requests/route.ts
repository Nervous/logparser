import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canApproveRequests } from "@/lib/adminLevels";
import type { Prisma } from "@prisma/client";

// List export requests. scope: mine | queue | all. Region-scoped (superadmin = all regions).
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const u = session.user;
  const scope = new URL(req.url).searchParams.get("scope") ?? "all";

  const where: Prisma.ExportRequestWhereInput = {};
  if (!u.isSuperAdmin) where.region = u.region; // community isolation

  if (scope === "mine") {
    where.requesterId = u.uid;
  } else if (scope === "queue") {
    // the approval queue is for approvers only (Senior Admin+)
    if (!canApproveRequests(u)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    where.status = "PENDING_APPROVAL";
  } else if (!u.isManager && !u.isSuperAdmin) {
    where.requesterId = u.uid; // non-managers only see their own
  }

  const rows = await prisma.exportRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { requester: { select: { username: true } }, approver: { select: { username: true } } },
  });

  return NextResponse.json({
    requests: rows.map((r) => ({
      id: r.id,
      region: r.region,
      server: r.server,
      name: r.name,
      searchParams: r.searchParams,
      logTypes: JSON.parse(r.logTypes) as string[],
      unauthorizedTypes: JSON.parse(r.unauthorizedTypes) as string[],
      reason: r.reason,
      denyReason: r.denyReason,
      fromDate: r.fromDate,
      toDate: r.toDate,
      status: r.status,
      requester: r.requester?.username ?? "?",
      mine: r.requesterId === u.uid, // nobody may approve/deny their own request
      approver: r.approver?.username ?? null,
      lineCount: r.lineCount,
      createdAt: r.createdAt,
    })),
  });
}
