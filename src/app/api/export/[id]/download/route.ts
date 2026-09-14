import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Stream a completed export. Re-checks access: the requester, an approver, or a manager/
// super-admin of the same region may download. Files never leave the server otherwise.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const reqRow = await prisma.exportRequest.findUnique({ where: { id: Number(id) } });
  if (!reqRow || reqRow.status !== "COMPLETE" || !reqRow.resultPath)
    return NextResponse.json({ error: "Not available" }, { status: 404 });

  const u = session.user;
  const canSee =
    reqRow.requesterId === u.uid ||
    reqRow.approverId === u.uid ||
    ((u.isManager || u.isSuperAdmin) && (u.isSuperAdmin || reqRow.region === u.region));
  if (!canSee) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const data = await fs.readFile(reqRow.resultPath).catch(() => null);
  if (!data) return NextResponse.json({ error: "File missing" }, { status: 410 });

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${path.basename(reqRow.resultPath)}"`,
    },
  });
}
