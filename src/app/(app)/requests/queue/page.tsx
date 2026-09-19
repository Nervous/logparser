import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { canApproveRequests } from "@/lib/adminLevels";
import RequestsTable from "@/components/RequestsTable";

export default async function QueuePage() {
  const s = await auth();
  if (!s?.user || !canApproveRequests(s.user)) redirect("/dashboard");
  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Request Queue</h1>
      <p className="mb-5 text-sm text-text-soft">
        Export requests awaiting approval for Chatlogs / Admin Logs. You can&apos;t process your own requests.
      </p>
      <RequestsTable scope="queue" canApprove />
    </div>
  );
}
