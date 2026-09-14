import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { effectivePermissions } from "@/lib/rbac";
import { runExport } from "@/lib/exportRunner";

// Approve or deny a pending request. Approver must be a manager (or super-admin) of the request's
// region, OR hold access to every log type the request needed approval for.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const u = session.user;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const decision = body.decision === "deny" ? "deny" : "approve";

  const reqRow = await prisma.exportRequest.findUnique({ where: { id: Number(id) } });
  if (!reqRow || reqRow.status !== "PENDING_APPROVAL")
    return NextResponse.json({ error: "Not pending" }, { status: 404 });

  // region isolation
  if (!u.isSuperAdmin && reqRow.region !== u.region)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // authority: manager/superadmin, or holds all the unauthorized types
  const perms = await effectivePermissions(u.uid);
  const needed: string[] = JSON.parse(reqRow.unauthorizedTypes);
  const canApprove = u.isManager || u.isSuperAdmin || perms.seeAll || needed.every((k) => perms.allowed.has(k));
  if (!canApprove) return NextResponse.json({ error: "Not authorized to approve these log types" }, { status: 403 });

  if (decision === "deny") {
    await prisma.exportRequest.update({ where: { id: reqRow.id }, data: { status: "DENIED", approverId: u.uid } });
    return NextResponse.json({ status: "DENIED" });
  }

  await prisma.exportRequest.update({ where: { id: reqRow.id }, data: { status: "APPROVED", approverId: u.uid } });
  await runExport(reqRow.id);
  const done = await prisma.exportRequest.findUnique({ where: { id: reqRow.id } });
  return NextResponse.json({ status: done?.status, lineCount: done?.lineCount ?? 0 });
}
