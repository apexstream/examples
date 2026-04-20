/**
 * Control Plane External API (Vite dev proxy: /apex-api → `VITE_CONTROL_PLANE_URL` or override).
 * Copy with the tables in `App.tsx` or a split view component.
 */

export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (import.meta.env.DEV) return `/apex-api${p}`;
  const base = (import.meta.env.VITE_CONTROL_PLANE_URL ?? "").replace(/\/$/, "");
  return `${base}${p}`;
}

export async function externalFetch(path: string, init?: RequestInit): Promise<Response> {
  const key = import.meta.env.VITE_EXTERNAL_API_KEY ?? "";
  const headers = new Headers(init?.headers);
  if (key && !headers.has("X-External-API-Key")) {
    headers.set("X-External-API-Key", key);
  }
  return fetch(apiUrl(path), { ...init, headers });
}
