import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SERVER_TIME_ZONE } from "@/lib/serverTime";
import Providers from "@/components/Providers";
import Nav from "@/components/Nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return (
    <Providers timeZone={SERVER_TIME_ZONE}>
      <Nav />
      <main className="mx-auto max-w-[1600px] px-6 py-8">{children}</main>
    </Providers>
  );
}
