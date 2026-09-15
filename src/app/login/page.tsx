"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { REGIONS } from "@/lib/regions";

// Step 1 of access: the admin picks their region + server BEFORE connecting, which selects
// the correct UCP SSO. (Requirement: "admin will choose before connecting their language /
// server so it chooses the proper ucp connection sso".)
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [regionKey, setRegionKey] = useState<string | null>(null);
  const region = REGIONS.find((r) => r.key === regionKey);
  const [busy, setBusy] = useState(false);
  const error = useSearchParams().get("error");

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-2xl font-bold tracking-tight">
            GTA<span className="text-accent">World</span>
          </div>
          <div className="mt-1 text-xs uppercase tracking-[0.2em] text-text-dim">Log Explorer</div>
        </div>

        <div className="rounded-xl border border-border bg-bg-elev p-6 shadow-2xl">
          <h1 className="text-lg font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-text-soft">
            Choose your server, then sign in through its UCP.
          </p>

          {error && (
            <p className="mt-4 rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">
              {error === "not_authorized"
                ? "Your account must be Trial Admin or above to access the Log Explorer."
                : "Sign-in failed. Please try again."}
            </p>
          )}

          <div className="mt-5">
            <label className="text-xs font-medium uppercase tracking-wider text-text-dim">Server</label>
            <div className="mt-2 grid grid-cols-1 gap-2">
              {REGIONS.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setRegionKey(r.key)}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition ${
                    regionKey === r.key
                      ? "border-accent bg-accent/10"
                      : "border-border bg-bg-elev-2 hover:border-border/80 hover:bg-bg-elev-2/70"
                  }`}
                >
                  <span className="text-xl">{r.flag}</span>
                  <span className="flex-1">
                    <span className="block text-sm font-medium">{r.label}</span>
                    <span className="block text-xs text-text-dim">
                      {r.servers.map((s) => s.label).join(" · ")}
                    </span>
                  </span>
                  {regionKey === r.key && <span className="text-accent">●</span>}
                </button>
              ))}
            </div>
          </div>

          <button
            disabled={!region || busy}
            onClick={() => {
              if (!region) return;
              setBusy(true);
              signIn(`ucp-${region.key}`, { callbackUrl: "/dashboard" });
            }}
            className="mt-6 w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-black transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {region ? `Continue with ${region.label} UCP` : "Select a server"}
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-text-dim">
          You will be redirected to your region&apos;s UCP to authorize access.
        </p>
      </div>
    </main>
  );
}
