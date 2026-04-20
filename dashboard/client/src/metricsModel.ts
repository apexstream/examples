/** Shared types + parsing for the live metrics channel — copy with `useLiveMetricsDashboard.ts`. */

export type MetricsPayload = {
  users: number;
  revenue: number;
  cpu: number;
  ts?: string;
};

export type HistoryPoint = {
  t: string;
  users: number;
  revenue: number;
  cpu: number;
};

export type StreamLine = {
  id: string;
  text: string;
  fresh: boolean;
};

export const MAX_HISTORY = 48;
export const MAX_STREAM = 40;

export function parseMetrics(payload: unknown): MetricsPayload | null {
  if (!payload || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;
  const users = Number(o.users);
  const revenue = Number(o.revenue);
  const cpu = Number(o.cpu);
  if (!Number.isFinite(users) || !Number.isFinite(revenue) || !Number.isFinite(cpu)) {
    return null;
  }
  return {
    users,
    revenue,
    cpu,
    ts: typeof o.ts === "string" ? o.ts : undefined,
  };
}

export const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
