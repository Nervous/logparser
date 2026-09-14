import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { effectivePermissions } from "@/lib/rbac";
import { groupOptions } from "@/lib/logGroups";
import { getRegion } from "@/lib/regions";

// The current user's allowed groups + seeAll FOR A GIVEN SERVER (permissions are per-server).
// The explorer and export builder call this whenever the selected server changes.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const region = session.user.region; // forced to SSO region
  const allowedServers = new Set((getRegion(region)?.servers ?? []).map((s) => s.key));
  const server = url.searchParams.get("server") ?? region;
  if (!allowedServers.has(server)) return NextResponse.json({ error: "Invalid server" }, { status: 403 });

  const perms = await effectivePermissions(session.user.uid, server);
  const allowed = groupOptions().filter((g) => perms.seeAll || perms.allowed.has(g.key)).map((g) => g.key);
  return NextResponse.json({ server, allowed, seeAll: perms.seeAll });
}
