export type GatewayWorkerRow = {
  source: string;
  open_conns: number;
  messages_in: number;
  messages_out: number;
  publish_req: number;
  captured_at: string;
  stale: boolean;
};

export type GatewayMetricsResponse = {
  updated_at: string;
  worker_count: number;
  open_connections_sum: number;
  control_plane_replicas?: string;
  workers: GatewayWorkerRow[];
};

export type OperationalItem = {
  id: string;
  service: string;
  source?: string;
  captured_at: string;
  payload?: Record<string, unknown>;
};

export type RateRow = { inPerSec: number; outPerSec: number; totalPerSec: number };

export function formatRate(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k/s`;
  return `${n.toFixed(1)}/s`;
}

export function payloadPreview(p: Record<string, unknown> | undefined): string {
  if (!p || Object.keys(p).length === 0) return "—";
  try {
    const s = JSON.stringify(p);
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  } catch {
    return "…";
  }
}

/** Latest snapshot per gateway `source` — API returns scrape history (often ~30s apart). */
export function latestOperationalPerSource(items: OperationalItem[]): OperationalItem[] {
  const best = new Map<string, OperationalItem>();
  for (const o of items) {
    const key = (o.source ?? "").trim() || o.id;
    const prev = best.get(key);
    const t = Date.parse(o.captured_at);
    const pt = prev ? Date.parse(prev.captured_at) : 0;
    if (!prev || (Number.isFinite(t) && t >= pt)) {
      best.set(key, o);
    }
  }
  return [...best.values()].sort((a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at));
}

export function numPayload(p: Record<string, unknown> | undefined, key: string): string {
  if (!p) return "—";
  const v = p[key];
  return typeof v === "number" && Number.isFinite(v) ? String(v) : "—";
}

export function truncateChars(s: string, max = 52): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export type WebhookConfigRow = {
  id: string;
  project_id: string;
  target_url: string;
  enabled: boolean;
  events?: string[];
  created_at: string;
};

export type WebhookDeliveryRow = {
  id: string;
  webhook_id: string;
  project_id: string;
  event_type: string;
  success: boolean;
  status: string;
  updated_at: string;
  error_message?: string;
};
