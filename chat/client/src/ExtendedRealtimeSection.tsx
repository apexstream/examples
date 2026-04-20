import {
  LS_FEAT_DURABLE,
  LS_FEAT_RELIABLE,
  LS_FEAT_REPLAY_HIDE_OWN,
  writeBoolLS,
} from "./chatPrefs";

/** Extended realtime toggles — optional server features (replay / reliable messaging). */

export type ExtendedRealtimeSectionProps = {
  durableReplay: boolean;
  reliableMessaging: boolean;
  replayHideOwnMessages: boolean;
  onDurableReplayChange: (v: boolean) => void;
  onReliableMessagingChange: (v: boolean) => void;
  onReplayHideOwnMessagesChange: (v: boolean) => void;
  featureHint: string | null;
};

export function ExtendedRealtimeSection({
  durableReplay,
  reliableMessaging,
  replayHideOwnMessages,
  onDurableReplayChange,
  onReliableMessagingChange,
  onReplayHideOwnMessagesChange,
  featureHint,
}: ExtendedRealtimeSectionProps) {
  return (
    <>
      <div className="mt-6 rounded-xl border border-amber-500/25 bg-amber-950/20 p-4 text-sm text-slate-200">
        <h2 className="text-sm font-semibold text-amber-100">Extended realtime (server-side API + gateway config)</h2>
        <p className="mt-2 text-slate-400">
          Set{" "}
          <code className="rounded bg-slate-900 px-1 font-mono text-[11px] text-amber-100/90">
            APEXSTREAM_REALTIME_EXTENDED_ENABLED=true
          </code>{" "}
          on the control plane API and gateway, and configure per-app retention (
          <code className="rounded bg-slate-900 px-1 font-mono text-[11px]">PATCH /v1/apps/…/realtime</code>,{" "}
          <code className="font-mono text-[11px]">event_retention_hours</code>
          ). The checkboxes below only control this demo client.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-slate-600/80 bg-slate-900/50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400/90">Durable events &amp; replay</p>
            <p className="mt-2 text-slate-300">
              Under the hood: events persisted in Mongo; clients issue <code className="font-mono text-[11px]">replay</code> over the same
              WebSocket.
            </p>
            <p className="mt-2 text-slate-200">
              In plain terms: if a user drops offline, they don’t lose anything and can catch up when they return.
            </p>
            <p className="mt-1 text-xs text-slate-500">Examples: chat, finance feeds, orders.</p>
            <label className="mt-3 flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={durableReplay}
                onChange={(e) => {
                  const v = e.target.checked;
                  onDurableReplayChange(v);
                  writeBoolLS(LS_FEAT_DURABLE, v);
                }}
                className="mt-1 rounded border-slate-500"
              />
              <span>
                After reconnecting, request what you missed since the last session (replay using disconnect time and durable{" "}
                <code className="font-mono text-[11px]">event_id</code> cursor).
              </span>
            </label>
            <label className="mt-3 flex cursor-pointer items-start gap-2 border-t border-slate-700/80 pt-3">
              <input
                type="checkbox"
                checked={replayHideOwnMessages}
                onChange={(e) => {
                  const v = e.target.checked;
                  onReplayHideOwnMessagesChange(v);
                  writeBoolLS(LS_FEAT_REPLAY_HIDE_OWN, v);
                }}
                className="mt-1 rounded border-slate-500"
              />
              <span>
                Solo-demo mode: hide replay rows that match your display name (the durable cursor still advances — avoids seeing your own
                messages twice after reconnect when you were the only publisher).
              </span>
            </label>
          </div>

          <div className="rounded-lg border border-slate-600/80 bg-slate-900/50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-400/90">Reliable messaging</p>
            <p className="mt-2 text-slate-300">
              Under the hood: stored delivery records, <code className="font-mono text-[11px]">reliable_ack</code>, platform-side retries
              until ack or DLQ.
            </p>
            <p className="mt-2 text-slate-200">
              In plain terms: the message is tracked end-to-end and won’t vanish silently while the client acknowledges receipt.
            </p>
            <p className="mt-1 text-xs text-slate-500">Examples: payments, orders, critical webhooks.</p>
            <label className="mt-3 flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={reliableMessaging}
                onChange={(e) => {
                  const v = e.target.checked;
                  onReliableMessagingChange(v);
                  writeBoolLS(LS_FEAT_RELIABLE, v);
                }}
                className="mt-1 rounded border-slate-500"
              />
              <span>
                Publish chat payloads as reliable (wrapper{" "}
                <code className="font-mono text-[11px]">{`{ reliable, idempotency_key, payload }`}</code>
                ); inbound messages with a reliable id trigger an automatic <code className="font-mono text-[11px]">reliable_ack</code>.
              </span>
            </label>
          </div>
        </div>
      </div>

      {featureHint ? (
        <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">{featureHint}</p>
      ) : null}
    </>
  );
}
