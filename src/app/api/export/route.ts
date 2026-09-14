import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { effectivePermissions, splitByAuthorization } from "@/lib/rbac";
import { getFlags } from "@/lib/logTypes";
import { runExport } from "@/lib/exportRunner";
import { getRegion } from "@/lib/regions";

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
  const validFlags = new Set(await getFlags());
  const logTypes: string[] = Array.isArray(body.logTypes)
    ? body.logTypes.map(String).filter((k: string) => validFlags.has(k))
    : [];
  const from = new Date(body.from);
  const to = new Date(body.to);

  if (!terms.length) return NextResponse.json({ error: "No search terms" }, { status: 400 });
  if (!logTypes.length) return NextResponse.json({ error: "No log types" }, { status: 400 });
  if (isNaN(+from) || isNaN(+to) || from >= to)
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });

  const perms = await effectivePermissions(session.user.uid);
  const { unauthorized } = splitByAuthorization(logTypes, perms);

  const request = await prisma.exportRequest.create({
    data: {
      region: session.user.region,
      server,
      name: terms.join(" | "),
      searchParams: terms.join(" | "),
      logTypes: JSON.stringify(logTypes),
      unauthorizedTypes: JSON.stringify(unauthorized),
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
