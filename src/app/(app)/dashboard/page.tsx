import { auth } from "@/auth";
import { effectivePermissions } from "@/lib/rbac";
import { getRegion } from "@/lib/regions";
import { groupOptions } from "@/lib/logGroups";
import Explorer from "@/components/Explorer";

export default async function DashboardPage() {
  const session = await auth();
  const perms = await effectivePermissions(session!.user.uid);
  const region = getRegion(session!.user.region);

  const logTypes = groupOptions().map((g) => ({
    key: g.key,
    label: g.label,
    desc: g.desc,
    featured: g.featured,
    allowed: perms.seeAll || perms.allowed.has(g.key),
  }));

  return (
    <Explorer
      region={session!.user.region}
      servers={region?.servers ?? []}
      logTypes={logTypes}
      seeAll={perms.seeAll}
    />
  );
}
