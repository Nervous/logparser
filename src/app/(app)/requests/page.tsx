import { auth } from "@/auth";
import { canApproveRequests } from "@/lib/adminLevels";
import RequestsTable from "@/components/RequestsTable";

export default async function AllRequestsPage() {
  const s = await auth();
  const canApprove = !!s?.user && canApproveRequests(s.user);
  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">All Requests</h1>
      <p className="mb-5 text-sm text-text-soft">Every export request in your community.</p>
      <RequestsTable scope="all" canApprove={canApprove} />
    </div>
  );
}
