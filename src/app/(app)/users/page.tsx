import { redirect } from "next/navigation";
import { auth } from "@/auth";
import RolesEditor from "@/components/RolesEditor";

export default async function UsersPage() {
  const s = await auth();
  if (!s?.user || (!s.user.isManager && !s.user.isSuperAdmin)) redirect("/dashboard");
  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Roles &amp; Permissions</h1>
      <p className="mb-5 text-sm text-text-soft">
        Choose which log types each admin role can view. Roles are created automatically as staff
        sign in. &quot;See all&quot; grants every log type.
      </p>
      <RolesEditor superAdmin={!!s.user.isSuperAdmin} />
    </div>
  );
}
