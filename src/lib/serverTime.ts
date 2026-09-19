import { isValidTimeZone } from "./time";

// SERVER TIME — the one timezone every timestamp in the app is shown in and every picked date/time
// is read in (24-hour everywhere). Set SERVER_TIMEZONE to an IANA name ("UTC", "Europe/London", …);
// default UTC, the "server time" the GTA World UCP shows. Server-side only — client components get
// it from ServerTimeProvider, so nothing ever falls back to the viewer's own clock settings.
if (typeof window !== "undefined") throw new Error("serverTime is server-only; use useServerTimeZone() in client components");

function resolveServerTimeZone(): string {
  const tz = process.env.SERVER_TIMEZONE?.trim();
  if (!tz) return "UTC";
  if (isValidTimeZone(tz)) return tz;
  console.warn(`[serverTime] SERVER_TIMEZONE="${tz}" is not a valid IANA timezone — using UTC`);
  return "UTC";
}

export const SERVER_TIME_ZONE = resolveServerTimeZone();
