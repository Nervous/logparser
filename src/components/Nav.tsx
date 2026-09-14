"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useState } from "react";
import { ChevronDown } from "lucide-react";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/requests/mine", label: "My Requests" },
  { href: "/requests/queue", label: "Request Queue" },
  { href: "/requests", label: "All Requests" },
  { href: "/users", label: "User List", managerOnly: true },
];

export default function Nav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const isManager = session?.user?.isManager || session?.user?.isSuperAdmin;

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg-elev/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-8 px-6">
        <Link href="/dashboard" className="text-lg font-bold tracking-tight">
          GTA<span className="text-accent">World</span>
        </Link>
        <nav className="flex flex-1 items-center gap-1">
          {LINKS.filter((l) => !l.managerOnly || isManager).map((l) => {
            const active = pathname === l.href || (l.href !== "/requests" && pathname.startsWith(l.href));
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`relative rounded-md px-3 py-2 text-sm transition ${
                  active ? "text-text" : "text-text-soft hover:text-text"
                }`}
              >
                {l.label}
                {active && <span className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded bg-accent-2" />}
              </Link>
            );
          })}
        </nav>
        <div className="relative">
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-text-soft hover:text-text"
          >
            <span className="max-w-[10rem] truncate">{session?.user?.username ?? "…"}</span>
            <span className="rounded bg-bg-elev-2 px-1.5 py-0.5 text-[10px] uppercase text-text-dim">
              {session?.user?.region}
            </span>
            <ChevronDown size={14} />
          </button>
          {open && (
            <div className="absolute right-0 mt-1 w-40 rounded-lg border border-border bg-bg-elev-2 py-1 shadow-xl">
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="block w-full px-4 py-2 text-left text-sm text-text-soft hover:bg-bg-elev hover:text-text"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
