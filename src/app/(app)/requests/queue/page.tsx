import { auth } from "@/auth";
import RequestsTable from "@/components/RequestsTable";

export default async function QueuePage() {
  const s = await auth();
  const canApprove = !!(s?.user.isManager || s?.user.isSuperAdmin);
  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Request Queue</h1>
      <p className="mb-5 text-sm text-text-soft">Requests awaiting approval for restricted log types.</p>
      <RequestsTable scope="queue" canApprove={canApprove} />
    </div>
  );
}
