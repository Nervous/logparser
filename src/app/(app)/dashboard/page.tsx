import { auth } from "@/auth";
import { effectivePermissions } from "@/lib/rbac";
import { getRegion } from "@/lib/regions";
import { LOG_TYPES } from "@/lib/logTypes";
import ExportBuilder from "@/components/ExportBuilder";

export default async function DashboardPage() {
  const session = await auth();
  const perms = await effectivePermissions(session!.user.uid);
  const region = getRegion(session!.user.region);

  const logTypes = LOG_TYPES.map((t) => ({
    key: t.key,
    label: t.label,
    channel: t.channel,
    description: t.description,
    allowed: perms.allowed.has(t.key),
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Log Explorer</h1>
        <p className="mt-1 text-sm text-text-soft">
          Export a character&apos;s logs over a timeframe. Log types you can&apos;t access are sent to the
          request queue for approval.
        </p>
      </div>
      <ExportBuilder
        region={session!.user.region}
        servers={region?.servers ?? []}
        logTypes={logTypes}
      />
    </div>
  );
}
