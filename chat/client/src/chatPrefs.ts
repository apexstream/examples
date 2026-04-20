/** Local persistence for demo toggles — copy-friendly alongside `ExtendedRealtimeSection.tsx`. */

export const LS_FEAT_DURABLE = "apexstream-chat-feature-durable";
export const LS_FEAT_RELIABLE = "apexstream-chat-feature-reliable";
/** Solo-demo UX: don’t render replay rows authored as the current display name (cursor still advances). */
export const LS_FEAT_REPLAY_HIDE_OWN = "apexstream-chat-feature-replay-hide-own";

export function readBoolLS(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === "1" || v === "true") return true;
    if (v === "0" || v === "false") return false;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function writeBoolLS(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}
