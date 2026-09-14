import { auth } from "@/auth";
import { getRegion } from "@/lib/regions";
import { groupOptions } from "@/lib/logGroups";
import Explorer from "@/components/Explorer";

export default async function DashboardPage() {
  const session = await auth();
  const region = getRegion(session!.user.region);

  // Static group catalogue; whether each is ALLOWED is resolved per-selected-server client-side
  // (permissions are per server) via /api/permissions.
  const logTypes = groupOptions().map((g) => ({
    key: g.key, label: g.label, desc: g.desc, featured: g.featured, allowed: false,
  }));

  return (
    <Explorer
      region={session!.user.region}
      servers={region?.servers ?? []}
      logTypes={logTypes}
    />
  );
}
