import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canApproveRequests } from "@/lib/adminLevels";

// Number of requests awaiting approval — the nav's "Request Queue (N)". Same scope as the queue
// listing: approvers only, region-scoped (super-admins count every region).
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const u = session.user;
  if (!canApproveRequests(u)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const count = await prisma.exportRequest.count({
    where: { status: "PENDING_APPROVAL", ...(u.isSuperAdmin ? {} : { region: u.region }) },
  });
  return NextResponse.json({ count });
}
