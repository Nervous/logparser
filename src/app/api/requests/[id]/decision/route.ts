import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canApproveRequests } from "@/lib/adminLevels";
import { runExport } from "@/lib/exportRunner";
import { REASON_MAX } from "@/lib/requests";

// Approve or deny a pending request. Approver must be Senior Admin+ (or manager/super-admin) in the
// request's region, and never the requester. A denial may carry a reason, shown to the requester.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const u = session.user;
  if (!canApproveRequests(u))
    return NextResponse.json({ error: "Only Senior Admins and above can process requests" }, { status: 403 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const decision = body.decision === "deny" ? "deny" : body.decision === "approve" ? "approve" : null;
  if (!decision) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const denyReason = decision === "deny" && typeof body.reason === "string" ? body.reason.trim() : "";
  if (denyReason.length > REASON_MAX)
    return NextResponse.json({ error: `Reason is too long (max ${REASON_MAX} characters)` }, { status: 400 });

  const requestId = Number(id);
  const reqRow = Number.isInteger(requestId)
    ? await prisma.exportRequest.findUnique({ where: { id: requestId } })
    : null;
  if (!reqRow || reqRow.status !== "PENDING_APPROVAL")
    return NextResponse.json({ error: "Not pending" }, { status: 404 });

  // region isolation
  if (!u.isSuperAdmin && reqRow.region !== u.region)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (reqRow.requesterId === u.uid)
    return NextResponse.json({ error: "You can't process your own request" }, { status: 403 });

  // Claim it atomically: only one approver can move it out of PENDING, so two people deciding at
  // once can't both win (or run the export twice).
  const claimed = await prisma.exportRequest.updateMany({
    where: { id: reqRow.id, status: "PENDING_APPROVAL" },
    data: decision === "deny"
      ? { status: "DENIED", approverId: u.uid, denyReason: denyReason || null }
      : { status: "APPROVED", approverId: u.uid },
  });
  if (claimed.count === 0)
    return NextResponse.json({ error: "Already processed by another approver" }, { status: 409 });

  if (decision === "deny") return NextResponse.json({ status: "DENIED" });

  await runExport(reqRow.id);
  const done = await prisma.exportRequest.findUnique({ where: { id: reqRow.id } });
  return NextResponse.json({ status: done?.status, lineCount: done?.lineCount ?? 0 });
}
