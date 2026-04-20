import type { FormEvent } from "react";

/** Gateway URL + API key — copy-friendly connection block. */

export type PresenceConnectFormProps = {
  wsUrl: string;
  apiKey: string;
  room: string;
  displayName: string;
  connecting: boolean;
  connected: boolean;
  error: string | null;
  presenceOnline: number;
  onlineLabels: string[];
  onWsUrlChange: (v: string) => void;
  onApiKeyChange: (v: string) => void;
  onRoomChange: (v: string) => void;
  onDisplayNameChange: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  onDisconnect: () => void;
};

export function PresenceConnectForm({
  wsUrl,
  apiKey,
  room,
  displayName,
  connecting,
  connected,
  error,
  presenceOnline,
  onlineLabels,
  onWsUrlChange,
  onApiKeyChange,
  onRoomChange,
  onDisplayNameChange,
  onSubmit,
  onDisconnect,
}: PresenceConnectFormProps) {
  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-800/40 p-4 shadow-xl shadow-slate-950/30">
      <h1 className="text-xl font-semibold text-white">Presence + Live Cursors</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-400">
        Open two browsers on the same <span className="text-slate-300">room</span>. Move the mouse in the canvas — other participants see your cursor in realtime
        over <code className="rounded bg-slate-900 px-1 font-mono text-[11px]">cursors:&lt;room&gt;</code>.
      </p>

      <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400">
          WS URL
          <input
            value={wsUrl}
            onChange={(e) => onWsUrlChange(e.target.value)}
            placeholder="ws://localhost:8081/v1/ws"
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-blue-500 transition focus:ring-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400">
          API key
          <input
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder="pk_live_..."
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-blue-500 transition focus:ring-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400">
          Room id
          <input
            value={room}
            onChange={(e) => onRoomChange(e.target.value)}
            placeholder="demo-room"
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-blue-500 transition focus:ring-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400">
          Display name
          <input
            value={displayName}
            onChange={(e) => onDisplayNameChange(e.target.value)}
            placeholder="guest-123"
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-blue-500 transition focus:ring-2"
          />
        </label>

        <div className="md:col-span-2 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={connected || connecting}
            className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-slate-700"
          >
            {connecting ? "Connecting…" : connected ? "Connected" : "Connect"}
          </button>
          <button
            type="button"
            onClick={onDisconnect}
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-400 hover:text-white"
          >
            Disconnect
          </button>
          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          {connected ? (
            <p className="text-sm text-emerald-400/90">
              Gateway presence: <span className="font-mono">{presenceOnline}</span> · Roster: {onlineLabels.join(", ")}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
