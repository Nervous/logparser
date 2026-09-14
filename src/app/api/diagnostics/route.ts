import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDiagnostics } from "@/lib/diagnostics";

// Log-volume + storage diagnostics. Managers+ only. Super-admins see all regions; a regional
// manager sees only their own community's volume (Loki storage is shared, so the storage
// figures are host-wide either way — labelled as such in the UI).
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const u = session.user;
  if (!u.isManager && !u.isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const diag = await getDiagnostics(u.isSuperAdmin ? undefined : u.region);
  return NextResponse.json({ ...diag, scope: u.isSuperAdmin ? "all" : u.region });
}
