import { auth } from "@/auth";
import { getRegion } from "@/lib/regions";
import { groupOptions } from "@/lib/logGroups";
import { effectivePermissions } from "@/lib/rbac";
import Explorer from "@/components/Explorer";

export default async function DashboardPage() {
  const session = await auth();
  const servers = getRegion(session!.user.region)?.servers ?? [];

  // Live search + recent logs are See-All only, and See All is per server: offer them only on the
  // servers where this user has it (none → export requests only). /api/explore enforces the same.
  const perms = await Promise.all(servers.map((s) => effectivePermissions(session!.user.uid, s.key)));
  const liveServers = servers.filter((_, i) => perms[i].seeAll);

  // Static group catalogue; which ones need export approval is resolved per selected server
  // client-side via /api/permissions.
  const logTypes = groupOptions().map((g) => ({ key: g.key, label: g.label, desc: g.desc, featured: g.featured }));

  return <Explorer servers={servers} liveServers={liveServers} logTypes={logTypes} />;
}
