import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { effectivePermissions } from "@/lib/rbac";
import { getFlags } from "@/lib/logTypes";
import { groupOptions, resolveGroupsToPlan } from "@/lib/logGroups";
import { getRegion } from "@/lib/regions";
import { searchRecent, volume, type QuerySpec } from "@/lib/loki";
import { SERVER_TIME_ZONE } from "@/lib/serverTime";
import { parseTimeInput } from "@/lib/time";

const RANGES: Record<string, number> = {
  "15m": 15 * 60e3, "1h": 60 * 60e3, "6h": 6 * 60 * 60e3,
  "24h": 24 * 60 * 60e3, "7d": 7 * 24 * 60 * 60e3, "30d": 30 * 24 * 60 * 60e3,
};

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const region = session.user.region; // forced to SSO region
  const allowedServers = new Set((getRegion(region)?.servers ?? []).map((s) => s.key));
  const server = url.searchParams.get("server") ?? region;
  if (!allowedServers.has(server)) return NextResponse.json({ error: "Invalid server" }, { status: 403 });

  // Live search and recent-log browsing are See-All only (managers+, or a role with "See all" on
  // this server). Everyone else pulls logs through export requests, which carry a reason.
  const perms = await effectivePermissions(session.user.uid, server);
  if (!perms.seeAll)
    return NextResponse.json({ error: "Live log search is limited to See All roles" }, { status: 403 });

  // Only the categories explicitly ticked — never default to all of them, so a phrase can't be
  // searched across every log type by accident.
  const valid = new Set(groupOptions().map((g) => g.key));
  const selected = (url.searchParams.get("types") ?? "").split(",").map((s) => s.trim()).filter((k) => valid.has(k));

  const q = url.searchParams.get("q")?.trim() ?? "";
  const now = Date.now();
  // Custom window overrides the preset range when both ends are valid: server-time wall clocks from
  // the pickers ("YYYY-MM-DDTHH:mm", read in SERVER_TIME_ZONE) or ISO with an explicit offset.
  const cf = parseTimeInput(url.searchParams.get("from"), SERVER_TIME_ZONE);
  const ct = parseTimeInput(url.searchParams.get("to"), SERVER_TIME_ZONE);
  const custom = !isNaN(cf) && !isNaN(ct) && cf < ct;
  const range = custom ? "custom" : (url.searchParams.get("range") ?? "6h");
  const toMs = custom ? ct : now;
  const fromMs = custom ? cf : now - (RANGES[range] ?? RANGES["6h"]);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 1000);

  if (selected.length === 0) {
    return NextResponse.json({ entries: [], volume: [], total: 0, note: "no_types" });
  }

  const subqueries = resolveGroupsToPlan(selected, await getFlags());
  const spec: QuerySpec = { region, server, subqueries, terms: q ? [q] : [], fromMs, toMs };
  const [entries, vol] = await Promise.all([searchRecent(spec, limit), volume(spec)]);
  const total = vol.reduce((a, b) => a + b.count, 0);

  // Audit trail: record actual searches (a search term was entered). Plain volume/browse loads
  // (empty query) are not logged. Best-effort — never fail the response on a logging error.
  if (q) {
    prisma.searchLog.create({
      data: {
        userId: session.user.uid, username: session.user.username ?? String(session.user.uid),
        region, server, query: q, logTypes: JSON.stringify(selected), range, resultCount: total,
      },
    }).catch(() => {});
  }

  return NextResponse.json({ entries, volume: vol, total, range });
}
