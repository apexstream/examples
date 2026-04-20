import {
  formatRate,
  numPayload,
  payloadPreview,
  truncateChars,
} from "./adminDashboardModel";
import { useAdminDashboard } from "./useAdminDashboard";

export default function App() {
  const {
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
  } = useAdminDashboard();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <p className="text-xs font-semibold uppercase tracking-widest text-sky-400">ApexStream · DEMO 5</p>
      <h1 className="mt-2 text-2xl font-semibold text-white">Admin Dashboard / Analytics</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
        Operator view: gateway workers scraped into the Control Plane (requires{" "}
        <span className="text-zinc-300">APEXSTREAM_API_ENABLE_OPS_WORKER</span> and gateways posting metrics). Uses the
        same <span className="font-mono text-zinc-300">External API</span> as billing integrations — not your app’s
        publish key.
      </p>

      {missing ? (
        <div className="mt-6 rounded-lg border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
          Set <span className="font-mono">VITE_EXTERNAL_API_KEY</span> to match API{" "}
          <span className="font-mono">APEXSTREAM_EXTERNAL_API_KEY</span> (see <span className="font-mono">.env.example</span>
          ).
        </div>
      ) : null}

      {err ? (
        <div className="mt-6 rounded-lg border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-100">
          {err}
        </div>
      ) : null}

      {!missing ? (
        <div className="mt-6 max-w-xl">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="block text-xs font-medium text-zinc-500" htmlFor="proj-id">
              Project ID — webhooks & deliveries
            </label>
            {wsApiKey ? (
              <button
                type="button"
                onClick={() => void syncProjectIdFromApiKey()}
                className="text-xs text-violet-400 underline decoration-violet-500/40 hover:text-violet-300"
              >
                Sync from app key
              </button>
            ) : (
              <span className="text-xs text-zinc-600" title="Set VITE_APEXSTREAM_API_KEY (same sk_live… as Demo 3)">
                Set VITE_APEXSTREAM_API_KEY to auto-fill
              </span>
            )}
          </div>
          <input
            id="proj-id"
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 placeholder:text-zinc-600"
            value={projectIdInput}
            onChange={(e) => setProjectIdInput(e.target.value)}
            placeholder="POST /external/v1/keys/resolve or paste from dashboard"
            autoComplete="off"
          />
          {projectSyncHint ? (
            <p
              className={`mt-1 text-xs ${projectSyncHint.ok ? "text-emerald-500/90" : "text-rose-300"}`}
            >
              {projectSyncHint.text}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-zinc-600">
            Must match the <strong className="font-normal text-zinc-500">project_id</strong> under which webhooks were registered (Demo 3).
            Uses <span className="font-mono text-zinc-500">GET /external/v1/webhooks</span> and{" "}
            <span className="font-mono text-zinc-500">…/webhook-deliveries</span>. Leave empty to hide webhook tables.
          </p>
        </div>
      ) : null}

      {webhooksFetchErr ? (
        <div className="mt-4 rounded-lg border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-100">
          Webhook configs: {webhooksFetchErr}
        </div>
      ) : null}
      {deliveriesFetchErr ? (
        <div className="mt-4 rounded-lg border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-100">
          Webhook deliveries: {deliveriesFetchErr}
        </div>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs font-medium text-zinc-500">Open connections (sum)</p>
          <p className="mt-1 font-mono text-2xl text-white">
            {gw ? gw.open_connections_sum.toLocaleString() : loading ? "…" : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs font-medium text-zinc-500">Gateway workers reporting</p>
          <p className="mt-1 font-mono text-2xl text-white">{gw ? gw.worker_count : loading ? "…" : "—"}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs font-medium text-zinc-500">Est. aggregate msg rate</p>
          <p className="mt-1 font-mono text-2xl text-emerald-400">{rates.size ? formatRate(sumRate) : "—"}</p>
          <p className="mt-1 text-xs text-zinc-600">Δ counters between polls (~{pollMs / 1000}s)</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs font-medium text-zinc-500">Control Plane label</p>
          <p className="mt-1 truncate font-mono text-sm text-zinc-200">
            {gw?.control_plane_replicas?.trim() || "—"}
          </p>
        </div>
      </div>

      <div className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Gateway workers</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Open</th>
                <th className="px-4 py-3 font-medium">Msg in→out rate</th>
                <th className="px-4 py-3 font-medium">Publish req</th>
                <th className="px-4 py-3 font-medium">Captured</th>
                <th className="px-4 py-3 font-medium">Stale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {(gw?.workers ?? []).map((w) => {
                const r = rates.get(w.source);
                return (
                  <tr key={w.source} className="bg-zinc-950/40">
                    <td className="px-4 py-3 font-mono text-xs text-sky-300">{w.source}</td>
                    <td className="px-4 py-3 font-mono text-zinc-200">{w.open_conns.toLocaleString()}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-300">
                      {r ? (
                        <>
                          {formatRate(r.inPerSec)} in · {formatRate(r.outPerSec)} out
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-zinc-300">{w.publish_req.toLocaleString()}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-500">
                      {new Date(w.captured_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {w.stale ? (
                        <span className="rounded bg-amber-900/50 px-2 py-0.5 text-xs text-amber-200">yes</span>
                      ) : (
                        <span className="text-emerald-400">ok</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!loading && gw && (gw.workers?.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                    No gateway metrics yet — ensure ops worker is enabled and gateways scrape{" "}
                    <span className="font-mono text-zinc-400">/internal/v1/metrics</span>.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Operational snapshots (gateway)</h2>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-zinc-600">
          The ops worker stores <strong className="text-zinc-500">one snapshot per scrape</strong> (often ~30s). The API can
          return many historical rows for the same pod — below we show{" "}
          <strong className="text-zinc-500">only the latest snapshot per gateway source</strong>.{" "}
          <span className="text-zinc-500">
            Open connections may read <span className="font-mono text-zinc-400">0</span> if no WebSocket client hit that
            replica when scraped (another gateway behind the load balancer may hold the sessions).
          </span>
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Captured</th>
                <th className="px-4 py-3 font-medium">Open (payload)</th>
                <th className="px-4 py-3 font-medium">Msgs in / out</th>
                <th className="px-4 py-3 font-medium">Payload (preview)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {opsLatestPerSource.map((o) => (
                <tr key={o.id} className="bg-zinc-950/40">
                  <td className="px-4 py-3 font-mono text-xs text-zinc-300">{o.source ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-500">
                    {new Date(o.captured_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-200">{numPayload(o.payload, "current_open_connections")}</td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                    {numPayload(o.payload, "ws_messages_in")} / {numPayload(o.payload, "ws_messages_out")}
                  </td>
                  <td className="max-w-sm px-4 py-3 font-mono text-xs text-zinc-500 break-all">
                    {payloadPreview(o.payload)}
                  </td>
                </tr>
              ))}
              {!loading && opsLatestPerSource.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                    No operational rows for service <span className="font-mono">gateway</span>.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {!missing && projectIdInput.trim() ? (
        <>
          <div className="mt-10">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Webhook endpoints (project)</h2>
            <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-800">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">ID</th>
                    <th className="px-4 py-3 font-medium">Target URL</th>
                    <th className="px-4 py-3 font-medium">Events</th>
                    <th className="px-4 py-3 font-medium">Enabled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {webhooks.map((wh) => (
                    <tr key={wh.id} className="bg-zinc-950/40">
                      <td className="px-4 py-3 font-mono text-xs text-zinc-400">{truncateChars(wh.id, 14)}</td>
                      <td className="max-w-xs px-4 py-3 font-mono text-xs text-sky-300 break-all" title={wh.target_url}>
                        {truncateChars(wh.target_url, 56)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                        {(wh.events ?? []).join(", ") || "—"}
                      </td>
                      <td className="px-4 py-3">
                        {wh.enabled ? (
                          <span className="text-emerald-400">yes</span>
                        ) : (
                          <span className="text-zinc-500">no</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-zinc-500">
                        Loading…
                      </td>
                    </tr>
                  ) : null}
                  {!loading && webhooks.length === 0 && !webhooksFetchErr ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-zinc-500">
                        No webhook configs for this project.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-10">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Webhook deliveries (recent)</h2>
            <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-800">
              <table className="w-full min-w-[840px] text-left text-sm">
                <thead className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Event</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Success</th>
                    <th className="px-4 py-3 font-medium">Updated</th>
                    <th className="px-4 py-3 font-medium">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {deliveries.map((d) => (
                    <tr key={d.id} className="bg-zinc-950/40">
                      <td className="px-4 py-3 font-mono text-xs text-zinc-300">{d.event_type}</td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-400">{d.status}</td>
                      <td className="px-4 py-3">
                        {d.success ? (
                          <span className="text-emerald-400">yes</span>
                        ) : (
                          <span className="text-rose-400">no</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-500">
                        {new Date(d.updated_at).toLocaleString()}
                      </td>
                      <td className="max-w-xs px-4 py-3 font-mono text-xs text-rose-300/90 break-all">
                        {d.error_message ? truncateChars(d.error_message, 80) : "—"}
                      </td>
                    </tr>
                  ))}
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                        Loading…
                      </td>
                    </tr>
                  ) : null}
                  {!loading && deliveries.length === 0 && !deliveriesFetchErr ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                        <p>No delivery rows yet for this project.</p>
                        <p className="mt-2 text-xs text-zinc-600">
                          Rows appear when durable/realtime events enqueue HTTP deliveries (e.g. publish with webhooks demo,
                          extended realtime on API + gateway). The API must reach your webhook URL.
                        </p>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : !missing ? (
        <div className="mt-10 rounded-lg border border-zinc-700/80 bg-zinc-900/30 px-4 py-3 text-sm text-zinc-500">
          Set <strong className="text-zinc-400">Project ID</strong> above (or{" "}
          <span className="font-mono text-zinc-400">VITE_PROJECT_ID</span>) to load webhook registrations and delivery
          history.
        </div>
      ) : null}

      <p className="mt-10 text-center text-xs text-zinc-600">
        Compare with product UI at <span className="font-mono text-zinc-500">/dashboard</span> on the Control Plane (session
        auth). This demo uses <span className="font-mono">External API</span> only.
      </p>
    </div>
  );
}
