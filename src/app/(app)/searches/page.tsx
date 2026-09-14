import { redirect } from "next/navigation";
import { auth } from "@/auth";
import SearchesTable from "@/components/SearchesTable";

export default async function SearchesPage() {
  const s = await auth();
  if (!s?.user || (!s.user.isManager && !s.user.isSuperAdmin)) redirect("/dashboard");
  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Search Audit</h1>
      <p className="mb-5 text-sm text-text-soft">
        Every live-explorer search, and who ran it. Exports have their own trail under All Requests.
      </p>
      <SearchesTable superAdmin={!!s.user.isSuperAdmin} />
    </div>
  );
}
