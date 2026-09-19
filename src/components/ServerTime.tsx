"use client";

import { createContext, useContext } from "react";

// The server's timezone, handed down from the (app) layout. Client components format and parse
// every time with it (src/lib/time.ts) — never with the viewer's browser timezone or locale.
const ServerTimeZone = createContext("UTC");

export function ServerTimeProvider({ timeZone, children }: { timeZone: string; children: React.ReactNode }) {
  return <ServerTimeZone.Provider value={timeZone}>{children}</ServerTimeZone.Provider>;
}

export function useServerTimeZone(): string {
  return useContext(ServerTimeZone);
}
