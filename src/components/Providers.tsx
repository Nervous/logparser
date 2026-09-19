"use client";
import { SessionProvider } from "next-auth/react";
import { ServerTimeProvider } from "./ServerTime";

export default function Providers({ children, timeZone }: { children: React.ReactNode; timeZone: string }) {
  return (
    <SessionProvider>
      <ServerTimeProvider timeZone={timeZone}>{children}</ServerTimeProvider>
    </SessionProvider>
  );
}
