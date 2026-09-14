import { redirect } from "next/navigation";
import { auth } from "@/auth";
import UsersRolesTabs from "@/components/UsersRolesTabs";

export default async function UsersPage() {
  const s = await auth();
  if (!s?.user || (!s.user.isManager && !s.user.isSuperAdmin)) redirect("/dashboard");
  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">User List</h1>
      <p className="mb-5 text-sm text-text-soft">
        Staff imported from the UCP. Set which log types each role can view under Roles &amp; Permissions.
      </p>
      <UsersRolesTabs superAdmin={!!s.user.isSuperAdmin} />
    </div>
  );
}
