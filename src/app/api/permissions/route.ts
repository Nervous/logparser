import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { effectivePermissions, approvalNeededFor } from "@/lib/rbac";
import { groupOptions } from "@/lib/logGroups";
import { getRegion } from "@/lib/regions";

// The current user's standing FOR A GIVEN SERVER (permissions are per-server): seeAll, and which
// groups an export would send to the request queue. The export builder calls this whenever its
// selected server changes.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const region = session.user.region; // forced to SSO region
  const allowedServers = new Set((getRegion(region)?.servers ?? []).map((s) => s.key));
  const server = url.searchParams.get("server") ?? region;
  if (!allowedServers.has(server)) return NextResponse.json({ error: "Invalid server" }, { status: 403 });

  const perms = await effectivePermissions(session.user.uid, server);
  const approvalRequired = approvalNeededFor(groupOptions().map((g) => g.key), perms);
  return NextResponse.json({ server, seeAll: perms.seeAll, approvalRequired });
}
