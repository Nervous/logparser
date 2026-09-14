import { auth } from "@/auth";
import { effectivePermissions } from "@/lib/rbac";
import { getRegion } from "@/lib/regions";
import { LOG_TYPES } from "@/lib/logTypes";
import Explorer from "@/components/Explorer";

export default async function DashboardPage() {
  const session = await auth();
  const perms = await effectivePermissions(session!.user.uid);
  const region = getRegion(session!.user.region);

  const logTypes = LOG_TYPES.map((t) => ({
    key: t.key,
    label: t.label,
    channel: t.channel,
    allowed: perms.seeAll || perms.allowed.has(t.key),
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
