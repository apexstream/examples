import { ApexStreamClient } from "apexstream";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MAX_HISTORY,
  MAX_STREAM,
  type HistoryPoint,
  type MetricsPayload,
  type StreamLine,
  money,
  parseMetrics,
} from "./metricsModel";

/**
 * Subscribes to a metrics channel using env-based gateway URL + API key (no manual “connect” button).
 * Copy together with `metricsModel.ts` and `DashboardLiveView.tsx`.
 */
export function useLiveMetricsDashboard() {
  const wsUrl = (import.meta.env.VITE_APEXSTREAM_WS_URL ?? "").trim();
  const apiKey = (import.meta.env.VITE_APEXSTREAM_API_KEY ?? "").trim();
  const channel = (import.meta.env.VITE_APEXSTREAM_METRICS_CHANNEL ?? "metrics").trim();

  const clientRef = useRef<ApexStreamClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<MetricsPayload | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [stream, setStream] = useState<StreamLine[]>([]);
  const [pulse, setPulse] = useState(0);

  const chartData = useMemo(() => {
    return history.map((h, i) => ({
      i,
      users: h.users,
      revenue: h.revenue / 1000,
      cpu: h.cpu,
    }));
  }, [history]);

  const pushSample = useCallback((m: MetricsPayload) => {
    setLatest(m);
    setHistory((prev) => {
      const row: HistoryPoint = {
        t: m.ts ?? new Date().toISOString(),
        users: m.users,
        revenue: m.revenue,
        cpu: m.cpu,
      };
      const next = [...prev, row];
      return next.slice(-MAX_HISTORY);
    });
    const line = `${new Date(m.ts ?? Date.now()).toLocaleTimeString()} · users=${m.users.toLocaleString()} · revenue=${money.format(m.revenue)} · cpu=${m.cpu}%`;
    setStream((prev) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const next = [{ id, text: line, fresh: true }, ...prev].slice(0, MAX_STREAM);
      return next.map((row, idx) => ({ ...row, fresh: idx === 0 }));
    });
    setPulse((p) => p + 1);
  }, []);

  useEffect(() => {
    if (!wsUrl || !apiKey) {
      setError("Set VITE_APEXSTREAM_WS_URL and VITE_APEXSTREAM_API_KEY (.env from .env.example).");
      return;
    }

    const allowInsecureTransport =
      wsUrl.startsWith("ws://") ||
      import.meta.env.VITE_APEXSTREAM_ALLOW_INSECURE === "1" ||
      import.meta.env.VITE_APEXSTREAM_ALLOW_INSECURE === "true";

    const client = new ApexStreamClient({
      url: wsUrl,
      apiKey,
      allowInsecureTransport,
    });
    clientRef.current = client;

    const unsub = client.subscribe(channel, (payload) => {
      const m = parseMetrics(payload);
      if (m) pushSample(m);
    });

    client.on("open", () => {
      setConnected(true);
      setError(null);
    });
    client.on("close", () => {
      setConnected(false);
    });
    client.on("error", () => {
      setError("WebSocket error — check gateway URL and API key.");
    });

    client.connect();

    return () => {
      unsub();
      client.disconnect();
      clientRef.current = null;
    };
  }, [wsUrl, apiKey, channel, pushSample]);

  const flashClass = pulse > 0 ? "shadow-[0_0_24px_rgba(56,189,248,0.25)] ring-1 ring-sky-500/40" : "";

  return {
    channel,
    connected,
    error,
    latest,
    chartData,
    stream,
    flashClass,
    moneyFmt: money,
  };
}
