// Client-safe pieces of the export-request workflow shared by the API routes and the UI.

// Max length of a request reason or a denial reason.
export const REASON_MAX = 1000;

// Window event fired after a request is created or decided, so the nav's queue count refreshes
// immediately instead of on its next poll.
export const REQUESTS_CHANGED = "explore:requests-changed";

export function notifyRequestsChanged(): void {
  window.dispatchEvent(new Event(REQUESTS_CHANGED));
}
