import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { externalFetch } from "./externalApi";
import {
  type GatewayMetricsResponse,
  latestOperationalPerSource,
  type OperationalItem,
  type RateRow,
  type WebhookConfigRow,
  type WebhookDeliveryRow,
} from "./adminDashboardModel";

export function useAdminDashboard() {
  const extKey = (import.meta.env.VITE_EXTERNAL_API_KEY ?? "").trim();
  /** Same publish key as Demo 1 / 3 — used to resolve `project_id` via External API (must match webhook registration). */
  const wsApiKey = (import.meta.env.VITE_APEXSTREAM_API_KEY ?? "").trim();
  const pollMs = Math.max(
    800,
    Number.parseInt(import.meta.env.VITE_POLL_INTERVAL_MS ?? "2500", 10) || 2500,
  );

  const [gw, setGw] = useState<GatewayMetricsResponse | null>(null);
  const [ops, setOps] = useState<OperationalItem[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookConfigRow[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryRow[]>([]);
  const [projectIdInput, setProjectIdInput] = useState(() => (import.meta.env.VITE_PROJECT_ID ?? "").trim());
  const [projectSyncHint, setProjectSyncHint] = useState<{ ok: boolean; text: string } | null>(null);
  const [webhooksFetchErr, setWebhooksFetchErr] = useState<string | null>(null);
  const [deliveriesFetchErr, setDeliveriesFetchErr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const prevRef = useRef<{
    t: number;
    bySource: Map<string, { in: number; out: number }>;
  } | null>(null);
  const [rates, setRates] = useState<Map<string, RateRow>>(new Map());

  const syncProjectIdFromApiKey = useCallback(async (): Promise<boolean> => {
    setProjectSyncHint(null);
    if (!wsApiKey || !extKey) {
      return false;
    }
    const r = await externalFetch("/external/v1/keys/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: wsApiKey }),
    });
    const j = (await r.json().catch(() => ({}))) as { project_id?: string; error?: string };
    if (!r.ok) {
      setProjectSyncHint({
        ok: false,
        text: typeof j.error === "string" ? j.error : `resolve HTTP ${r.status}`,
      });
      return false;
    }
    const pid = typeof j.project_id === "string" ? j.project_id.trim() : "";
    if (pid) {
      setProjectIdInput(pid);
      setProjectSyncHint({
        ok: true,
        text: "Matched your app publish key — same Project ID as webhook registration.",
      });
      return true;
    }
    setProjectSyncHint({ ok: false, text: "Key resolved but project_id missing." });
    return false;
  }, [wsApiKey, extKey]);

  useEffect(() => {
    void syncProjectIdFromApiKey();
  }, [syncProjectIdFromApiKey]);

  const refresh = useCallback(async () => {
    if (!extKey) {
      setLoading(false);
      return;
    }
    setErr(null);
    try {
      const [rGw, rOps] = await Promise.all([
        externalFetch("/external/v1/metrics/gateway-workers"),
        externalFetch("/external/v1/metrics/operational?service=gateway&limit=100"),
      ]);
      if (!rGw.ok) {
        const j = await rGw.json().catch(() => ({}));
        setErr(typeof j.error === "string" ? j.error : `gateway-workers HTTP ${rGw.status}`);
        setGw(null);
      } else {
        const j = (await rGw.json()) as GatewayMetricsResponse;
        setGw(j);
        const now = Date.now();
        const bySource = new Map<string, { in: number; out: number }>();
        for (const w of j.workers ?? []) {
          bySource.set(w.source, { in: w.messages_in, out: w.messages_out });
        }
        const prev = prevRef.current;
        const nextRates = new Map<string, RateRow>();
        if (prev && now > prev.t) {
          const dt = (now - prev.t) / 1000;
          for (const [src, cur] of bySource) {
            const p = prev.bySource.get(src);
            if (p && dt > 0) {
              const dIn = cur.in - p.in;
              const dOut = cur.out - p.out;
              nextRates.set(src, {
                inPerSec: dIn / dt,
                outPerSec: dOut / dt,
                totalPerSec: (dIn + dOut) / dt,
              });
            }
          }
        }
        setRates(nextRates);
        prevRef.current = { t: now, bySource };
      }
      if (rOps.ok) {
        const j = (await rOps.json()) as { items?: OperationalItem[] };
        setOps(j.items ?? []);
      } else {
        setOps([]);
      }

      const pid = projectIdInput.trim();
      setWebhooksFetchErr(null);
      setDeliveriesFetchErr(null);
      if (!pid) {
        setWebhooks([]);
        setDeliveries([]);
      } else {
        const [rw, rd] = await Promise.all([
          externalFetch(`/external/v1/webhooks?project_id=${encodeURIComponent(pid)}`),
          externalFetch(`/external/v1/webhook-deliveries?project_id=${encodeURIComponent(pid)}&limit=35`),
        ]);
        if (!rw.ok) {
          const j = await rw.json().catch(() => ({}));
          setWebhooksFetchErr(typeof j.error === "string" ? j.error : `webhooks HTTP ${rw.status}`);
          setWebhooks([]);
        } else {
          const j = (await rw.json()) as { items?: WebhookConfigRow[] };
          setWebhooks(j.items ?? []);
        }
        if (!rd.ok) {
          const j = await rd.json().catch(() => ({}));
          setDeliveriesFetchErr(typeof j.error === "string" ? j.error : `deliveries HTTP ${rd.status}`);
          setDeliveries([]);
        } else {
          const j = (await rd.json()) as { items?: WebhookDeliveryRow[] };
          const rawItems = Array.isArray(j.items) ? j.items : [];
          setDeliveries(rawItems);
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "fetch failed");
      setGw(null);
      setWebhooksFetchErr(null);
      setDeliveriesFetchErr(null);
      setWebhooks([]);
      setDeliveries([]);
    } finally {
      setLoading(false);
    }
  }, [extKey, projectIdInput]);

  useEffect(() => {
    void refresh();
    if (!extKey) return undefined;
    const id = window.setInterval(() => void refresh(), pollMs);
    return () => window.clearInterval(id);
  }, [extKey, pollMs, refresh, projectIdInput]);

  const sumRate = useMemo(() => {
    let t = 0;
    for (const r of rates.values()) t += r.totalPerSec;
    return t;
  }, [rates]);

  const opsLatestPerSource = useMemo(() => latestOperationalPerSource(ops), [ops]);

  const missing = !extKey;

  return {
    extKey,
    wsApiKey,
    pollMs,
    gw,
    webhooks,
    deliveries,
    projectIdInput,
    setProjectIdInput,
    projectSyncHint,
    syncProjectIdFromApiKey,
    webhooksFetchErr,
    deliveriesFetchErr,
    err,
    loading,
    rates,
    sumRate,
    opsLatestPerSource,
    missing,
  };
}
