import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ApexStreamClient } from "apexstream";
import { controlPlaneFetch } from "./externalApi";

const DEMO_CHANNEL = "webhooks-demo";

type DeliveryRow = {
  event_type?: string;
  success?: boolean;
  status?: string;
  updated_at?: string;
  created_at?: string;
};

/** If the browser talks to a remote gateway, 127.0.0.1 in the webhook URL is the API host, not this PC. */
function remoteGatewayButLoopbackWebhook(wsUrl: string, webhookUrl: string): boolean {
  const ws = wsUrl.trim().toLowerCase();
  const wh = webhookUrl.trim().toLowerCase();
  if (!ws) return false;
  const gatewayIsLocal = ws.includes("localhost") || ws.includes("127.0.0.1");
  if (gatewayIsLocal) return false;
  return wh.includes("localhost") || wh.includes("127.0.0.1");
}

/** Register webhook + trigger publish — copy without ApexStreamClient wiring if you already connect elsewhere. */

export function WebhooksWorkflow() {
  const wsUrl = (import.meta.env.VITE_APEXSTREAM_WS_URL ?? "").trim();
  const apiKey = (import.meta.env.VITE_APEXSTREAM_API_KEY ?? "").trim();
  const extKey = (import.meta.env.VITE_EXTERNAL_API_KEY ?? "").trim();
  const [projectId, setProjectId] = useState((import.meta.env.VITE_PROJECT_ID ?? "").trim());
  const [webhookTarget, setWebhookTarget] = useState(
    (import.meta.env.VITE_WEBHOOK_TARGET_URL ?? "http://127.0.0.1:8787/webhook").trim(),
  );
  const [webhookSecret, setWebhookSecret] = useState((import.meta.env.VITE_WEBHOOK_SECRET ?? "whsec_demo").trim());
  const [projectResolveHint, setProjectResolveHint] = useState<string | null>(null);

  const clientRef = useRef<ApexStreamClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [registerMsg, setRegisterMsg] = useState<string | null>(null);
  const [triggerMsg, setTriggerMsg] = useState<string | null>(null);
  const [pipeline, setPipeline] = useState<"idle" | "published" | "hook_ok" | "waiting">("idle");

  useEffect(() => {
    const resolvedWs = wsUrl || "ws://localhost:8081/v1/ws";
    const allowInsecureTransport =
      resolvedWs.startsWith("ws://") ||
      import.meta.env.VITE_APEXSTREAM_ALLOW_INSECURE === "1" ||
      import.meta.env.VITE_APEXSTREAM_ALLOW_INSECURE === "true";
    const c = new ApexStreamClient({
      url: resolvedWs,
      apiKey,
      allowInsecureTransport,
    });
    clientRef.current = c;
    c.on("open", () => setConnected(true));
    c.on("close", () => setConnected(false));
    c.connect();
    return () => {
      c.disconnect();
      clientRef.current = null;
    };
  }, [wsUrl, apiKey]);

  /** Aligns Project ID with the dashboard app tied to `VITE_APEXSTREAM_API_KEY` (fixes stale/wrong `VITE_PROJECT_ID`). */
  const syncProjectIdFromApiKey = useCallback(async (): Promise<boolean> => {
    setProjectResolveHint(null);
    const k = apiKey.trim();
    const ext = extKey.trim();
    if (!k || !ext) {
      return false;
    }
    const r = await controlPlaneFetch("/external/v1/keys/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: k }),
    });
    const j = (await r.json().catch(() => ({}))) as { project_id?: string; app_id?: string; error?: string };
    if (!r.ok) {
      setProjectResolveHint(typeof j.error === "string" ? j.error : `resolve HTTP ${r.status}`);
      return false;
    }
    const pid = typeof j.project_id === "string" ? j.project_id.trim() : "";
    if (pid) {
      setProjectId(pid);
      setProjectResolveHint("Project ID loaded from your API key (same app as the WebSocket).");
      return true;
    }
    setProjectResolveHint("Key resolved to an app but project_id was missing — check control plane DB.");
    return false;
  }, [apiKey, extKey]);

  useEffect(() => {
    void syncProjectIdFromApiKey();
  }, [syncProjectIdFromApiKey]);

  const registerWebhook = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setRegisterMsg(null);
      const pid = projectId.trim();
      if (!pid || !webhookTarget.trim() || !webhookSecret.trim()) {
        setRegisterMsg("Fill project id, webhook URL, and secret.");
        return;
      }
      if (!extKey.trim()) {
        setRegisterMsg("VITE_EXTERNAL_API_KEY missing — must match API APEXSTREAM_EXTERNAL_API_KEY.");
        return;
      }
      const r = await controlPlaneFetch("/external/v1/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: pid,
          url: webhookTarget.trim(),
          secret: webhookSecret.trim(),
          events: ["channel.message"],
          enabled: true,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setRegisterMsg(typeof j.error === "string" ? j.error : `HTTP ${r.status}`);
        return;
      }
      setRegisterMsg("Webhook registered (channel.message → your URL).");
    },
    [projectId, webhookTarget, webhookSecret, extKey],
  );

  const waitForDelivery = useCallback(async (sinceMs: number, pid: string) => {
    const deadline = Date.now() + 25_000;
    while (Date.now() < deadline) {
      const r = await controlPlaneFetch(`/external/v1/webhook-deliveries?project_id=${encodeURIComponent(pid)}&limit=15`);
      if (!r.ok) {
        await new Promise((r2) => setTimeout(r2, 500));
        continue;
      }
      const j = (await r.json()) as { items?: DeliveryRow[] };
      const items = j.items ?? [];
      for (const it of items) {
        if (it.event_type !== "channel.message") continue;
        if (!it.success) continue;
        const tDel = Math.max(Date.parse(it.updated_at ?? ""), Date.parse(it.created_at ?? ""));
        if (!Number.isFinite(tDel) || tDel < sinceMs) continue;
        return true;
      }
      await new Promise((r2) => setTimeout(r2, 450));
    }
    return false;
  }, []);

  const trigger = useCallback(async () => {
    setTriggerMsg(null);
    setPipeline("waiting");
    const c = clientRef.current;
    const pid = projectId.trim();
    if (!c?.connected) {
      setTriggerMsg("WebSocket not connected yet.");
      setPipeline("idle");
      return;
    }
    if (!pid) {
      setTriggerMsg("Set project id (same as webhook).");
      setPipeline("idle");
      return;
    }
    const payload = {
      kind: "demo_trigger",
      at: new Date().toISOString(),
      note: "Webhooks + Events demo",
    };
    const t0 = Date.now();
    try {
      c.publish(DEMO_CHANNEL, payload);
    } catch (err) {
      setTriggerMsg(err instanceof Error ? err.message : "publish failed");
      setPipeline("idle");
      return;
    }
    setPipeline("published");
    setTriggerMsg("Event published — durable ingest + webhook delivery (extended realtime must be ON).");
    const ok = await waitForDelivery(t0 - 4000, pid);
    if (ok) {
      setPipeline("hook_ok");
      setTriggerMsg("Webhook delivery recorded as successful.");
    } else {
      setPipeline("published");
      setTriggerMsg(
        "No successful delivery seen yet — check mock server logs, API webhook worker, and that the webhook URL is reachable from the API (use host.docker.internal if API runs in Docker).",
      );
    }
  }, [projectId, waitForDelivery]);

  const missing = !wsUrl || !apiKey || !extKey;

  return (
    <>
      {missing ? (
        <div className="mt-6 rounded-lg border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
          Copy <span className="font-mono">.env.example</span> to <span className="font-mono">.env</span> and set{" "}
          <span className="font-mono">VITE_APEXSTREAM_WS_URL</span>, <span className="font-mono">VITE_APEXSTREAM_API_KEY</span>, and{" "}
          <span className="font-mono">VITE_EXTERNAL_API_KEY</span> (same value as API{" "}
          <span className="font-mono">APEXSTREAM_EXTERNAL_API_KEY</span>).
        </div>
      ) : null}

      {!missing && remoteGatewayButLoopbackWebhook(wsUrl, webhookTarget) ? (
        <div className="mt-6 rounded-lg border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-100">
          Your gateway is not on <span className="font-mono">localhost</span>, but the webhook URL uses{" "}
          <span className="font-mono">127.0.0.1</span> or <span className="font-mono">localhost</span>. Control Plane will POST there on the{" "}
          <em>server</em>, so your mock on this PC never receives it. Use <span className="font-mono">http://&lt;this-PC-LAN-ip&gt;:8787/webhook</span>{" "}
          (and open Windows Firewall for port 8787), then click <strong>1 · Register webhook</strong> again.
        </div>
      ) : null}

      <div className="mt-8 space-y-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-zinc-500">Gateway WS</span>
          <span className={connected ? "text-emerald-400" : "text-amber-400"}>{connected ? "connected" : "connecting…"}</span>
        </div>

        <form className="space-y-4" onSubmit={registerWebhook}>
          <div>
            <div className="flex items-center justify-between gap-2">
              <label className="block text-xs font-medium text-zinc-500">Project ID</label>
              <button
                type="button"
                onClick={() => void syncProjectIdFromApiKey()}
                className="text-xs text-violet-400 underline decoration-violet-500/40 hover:text-violet-300"
              >
                Sync from API key
              </button>
            </div>
            <input
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder="auto-filled via POST /external/v1/keys/resolve"
              autoComplete="off"
            />
            {projectResolveHint ? <p className="mt-1 text-xs text-zinc-500">{projectResolveHint}</p> : null}
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Webhook target URL (mock server)</label>
            <input
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100"
              value={webhookTarget}
              onChange={(e) => setWebhookTarget(e.target.value)}
              placeholder="http://127.0.0.1:8787/webhook"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Webhook signing secret</label>
            <input
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder="whsec_…"
            />
          </div>
          <button type="submit" className="w-full rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-500">
            1 · Register webhook
          </button>
          {registerMsg ? <p className="text-sm text-zinc-400">{registerMsg}</p> : null}
        </form>

        <div className="border-t border-zinc-800 pt-6">
          <button
            type="button"
            disabled={!connected}
            onClick={() => void trigger()}
            className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
          >
            2 · Trigger event
          </button>
          {triggerMsg ? <p className="mt-3 text-sm text-zinc-400">{triggerMsg}</p> : null}
        </div>

        <div className="border-t border-zinc-800 pt-4 text-center">
          {pipeline === "idle" ? <p className="text-sm text-zinc-500">Event sent → Webhook received …</p> : null}
          {pipeline === "waiting" || pipeline === "published" ? (
            <p className="text-sm text-amber-200/90">Event sent → waiting for webhook…</p>
          ) : null}
          {pipeline === "hook_ok" ? <p className="text-lg font-semibold text-emerald-400">Event sent → Webhook received ✅</p> : null}
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-zinc-600">
        Channel: <span className="font-mono text-zinc-500">{DEMO_CHANNEL}</span> · Requires extended realtime + webhook worker on the API.
      </p>
    </>
  );
}
