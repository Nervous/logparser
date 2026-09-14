import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { effectivePermissions } from "@/lib/rbac";
import { getFlags } from "@/lib/logTypes";
import { groupOptions, resolveGroupsToPlan } from "@/lib/logGroups";
import { getRegion } from "@/lib/regions";
import { searchRecent, volume, type QuerySpec } from "@/lib/loki";

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

  const perms = await effectivePermissions(session.user.uid, server);
  const groups = groupOptions();
  const allowedKeys = groups.filter((g) => perms.seeAll || perms.allowed.has(g.key)).map((g) => g.key);

  // requested groups ∩ allowed; default to all allowed
  const requested = (url.searchParams.get("types") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const selected = (requested.length ? requested.filter((k) => allowedKeys.includes(k)) : allowedKeys);

  const q = url.searchParams.get("q")?.trim() ?? "";
  const range = url.searchParams.get("range") ?? "6h";
  const now = Date.now();
  const toMs = now;
  const fromMs = now - (RANGES[range] ?? RANGES["6h"]);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 1000);

  if (selected.length === 0) {
    return NextResponse.json({ entries: [], volume: [], total: 0, allowedTypes: [], note: "no_access" });
  }

  const subqueries = resolveGroupsToPlan(selected, await getFlags());
  const spec: QuerySpec = { region, server, subqueries, terms: q ? [q] : [], fromMs, toMs };
  const [entries, vol] = await Promise.all([searchRecent(spec, limit), volume(spec)]);
  const total = vol.reduce((a, b) => a + b.count, 0);

  return NextResponse.json({ entries, volume: vol, total, range });
}
