"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ChevronDown } from "lucide-react";
import { canApproveRequests } from "@/lib/adminLevels";
import { REQUESTS_CHANGED } from "@/lib/requests";
import { fmtTime } from "@/lib/time";
import { useServerTimeZone } from "./ServerTime";

const QUEUE_HREF = "/requests/queue";

// Current server time, minute resolution. Read as an external store: it re-renders once a minute
// and renders nothing on the server / during hydration, so server and browser clocks can't clash.
function subscribeClock(onTick: () => void) {
  const id = setInterval(onTick, 5_000);
  return () => clearInterval(id);
}
const currentMinute = () => Math.floor(Date.now() / 60_000);
const noMinute = () => null;

function ServerClock() {
  const tz = useServerTimeZone();
  const minute = useSyncExternalStore(subscribeClock, currentMinute, noMinute);
  if (minute === null) return null;
  return (
    <span className="whitespace-nowrap text-xs text-text-dim" title="Every time in the explorer is server time, 24-hour">
      Server time <span className="font-mono text-text-soft">{fmtTime(minute * 60_000, tz)}</span> {tz}
    </span>
  );
}

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/requests/mine", label: "My Requests" },
  { href: QUEUE_HREF, label: "Request Queue", approverOnly: true },
  { href: "/requests", label: "All Requests" },
  { href: "/users", label: "User List", managerOnly: true },
  { href: "/searches", label: "Search Audit", managerOnly: true },
  { href: "/diagnostics", label: "Diagnostics", managerOnly: true },
];

export default function Nav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const isManager = session?.user?.isManager || session?.user?.isSuperAdmin;
  const canApprove = !!session?.user && canApproveRequests(session.user);

  // Pending-request count for "Request Queue (N)": on load / navigation, on window focus, when a
  // request is created or decided in this tab, and on a slow poll for other approvers' decisions.
  useEffect(() => {
    if (!canApprove) return;
    let live = true;
    const refresh = () => {
      fetch("/api/requests/pending-count")
        .then((res) => (res.ok ? res.json() : null))
        .then((j) => { if (live && typeof j?.count === "number") setPending(j.count); })
        .catch(() => {});
    };
    refresh();
    const timer = setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    window.addEventListener(REQUESTS_CHANGED, refresh);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(REQUESTS_CHANGED, refresh);
    };
  }, [canApprove, pathname]);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg-elev/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-8 px-6">
        <Link href="/dashboard" className="text-lg font-bold tracking-tight">
          GTA<span className="text-accent">World</span>
        </Link>
        <nav className="flex flex-1 items-center gap-1">
          {LINKS.filter((l) => (!l.managerOnly || isManager) && (!l.approverOnly || canApprove)).map((l) => {
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
                {l.href === QUEUE_HREF && pending > 0 && (
                  <span className="font-semibold tabular-nums text-warn"> ({pending})</span>
                )}
                {active && <span className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded bg-accent-2" />}
              </Link>
            );
          })}
        </nav>
        <ServerClock />
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
