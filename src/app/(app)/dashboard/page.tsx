import { auth } from "@/auth";
import { effectivePermissions } from "@/lib/rbac";
import { getRegion } from "@/lib/regions";
import { getFlags, flagLabel } from "@/lib/logTypes";
import Explorer from "@/components/Explorer";

export default async function DashboardPage() {
  const session = await auth();
  const perms = await effectivePermissions(session!.user.uid);
  const region = getRegion(session!.user.region);

  const flags = await getFlags();
  const logTypes = flags.map((k) => ({
    key: k,
    label: flagLabel(k),
    allowed: perms.seeAll || perms.allowed.has(k),
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
