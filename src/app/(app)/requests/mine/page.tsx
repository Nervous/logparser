import RequestsTable from "@/components/RequestsTable";

export default function MyRequestsPage() {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">My Requests</h1>
      <p className="mb-5 text-sm text-text-soft">
        Exports you have requested. If a request is denied, the approver&apos;s reason is shown under its status.
      </p>
      <RequestsTable scope="mine" canApprove={false} />
    </div>
  );
}
