import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { effectivePermissions, approvalNeededFor } from "@/lib/rbac";
import { groupOptions } from "@/lib/logGroups";
import { runExport } from "@/lib/exportRunner";
import { getRegion } from "@/lib/regions";
import { REASON_MAX } from "@/lib/requests";
import { SERVER_TIME_ZONE } from "@/lib/serverTime";
import { parseTimeInput } from "@/lib/time";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  // COMMUNITY ISOLATION: the region is ALWAYS the user's SSO region — never taken from the
  // request — and the chosen server must belong to that region. A user can only ever reach
  // their own community's logs.
  const region = session.user.region;
  const allowedServers = new Set((getRegion(region)?.servers ?? []).map((s) => s.key));
  const server: string = String(body.server ?? region);
  if (!allowedServers.has(server))
    return NextResponse.json({ error: "Invalid server for your community" }, { status: 403 });

  const terms: string[] = Array.isArray(body.terms) ? body.terms.map(String).filter(Boolean) : [];
  const validGroups = new Set(groupOptions().map((g) => g.key));
  const logTypes: string[] = Array.isArray(body.logTypes)
    ? body.logTypes.map(String).filter((k: string) => validGroups.has(k))
    : [];
  // from/to are server-time wall clocks from the pickers (or ISO with an explicit offset)
  const from = new Date(parseTimeInput(body.from, SERVER_TIME_ZONE));
  const to = new Date(parseTimeInput(body.to, SERVER_TIME_ZONE));
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  // Every export must state why it's needed — it's the audit trail approvers and managers read.
  if (!reason) return NextResponse.json({ error: "A request reason is required" }, { status: 400 });
  if (reason.length > REASON_MAX)
    return NextResponse.json({ error: `Reason is too long (max ${REASON_MAX} characters)` }, { status: 400 });
  if (!terms.length) return NextResponse.json({ error: "No search terms" }, { status: 400 });
  if (!logTypes.length) return NextResponse.json({ error: "No log types" }, { status: 400 });
  if (isNaN(+from) || isNaN(+to) || from >= to)
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });

  // With a reason, any group exports straight away except Chatlogs / Admin Logs, which queue for
  // a Senior Admin+ unless the requester is Staff Management or See All on this server.
  const perms = await effectivePermissions(session.user.uid, server);
  const unauthorized = approvalNeededFor(logTypes, perms);

  const request = await prisma.exportRequest.create({
    data: {
      region: session.user.region,
      server,
      name: terms.join(" | "),
      searchParams: terms.join(" | "),
      logTypes: JSON.stringify(logTypes),
      unauthorizedTypes: JSON.stringify(unauthorized),
      reason,
      fromDate: from,
      toDate: to,
      status: unauthorized.length ? "PENDING_APPROVAL" : "APPROVED",
      requesterId: session.user.uid,
    },
  });

  if (unauthorized.length) {
    // needs an authorized user to approve the locked types in the queue
    return NextResponse.json({ id: request.id, status: "PENDING_APPROVAL" });
  }

  // fully authorized — run now (awaited; the pull is bounded by LOKI_MAX_LINES)
  await runExport(request.id);
  const done = await prisma.exportRequest.findUnique({ where: { id: request.id } });
  return NextResponse.json({ id: request.id, status: done?.status, lineCount: done?.lineCount ?? 0 });
}
