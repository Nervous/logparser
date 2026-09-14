import { redirect } from "next/navigation";
import { auth } from "@/auth";
import Diagnostics from "@/components/Diagnostics";

export default async function DiagnosticsPage() {
  const s = await auth();
  if (!s?.user || (!s.user.isManager && !s.user.isSuperAdmin)) redirect("/dashboard");
  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Diagnostics</h1>
      <p className="mb-5 text-sm text-text-soft">
        Log ingestion volume and remaining storage on the log host. Storage figures are host-wide.
      </p>
      <Diagnostics superAdmin={!!s.user.isSuperAdmin} />
    </div>
  );
}
