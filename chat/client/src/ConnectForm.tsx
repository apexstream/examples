import type { FormEvent } from "react";

/** Connection fields + actions — copy as a starting point for your own UI. */

export type ConnectFormProps = {
  wsUrl: string;
  apiKey: string;
  room: string;
  name: string;
  connecting: boolean;
  connected: boolean;
  error: string | null;
  onWsUrlChange: (v: string) => void;
  onApiKeyChange: (v: string) => void;
  onRoomChange: (v: string) => void;
  onNameChange: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  onDisconnect: () => void;
};

export function ConnectForm({
  wsUrl,
  apiKey,
  room,
  name,
  connecting,
  connected,
  error,
  onWsUrlChange,
  onApiKeyChange,
  onRoomChange,
  onNameChange,
  onSubmit,
  onDisconnect,
}: ConnectFormProps) {
  return (
    <>
      <h1 className="text-xl font-semibold text-white">ApexStream Chat Demo</h1>
      <p className="mt-1 text-sm text-slate-400">Connected in seconds. Pusher-style pub/sub with your own gateway.</p>

      <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400">
          WS URL
          <input
            value={wsUrl}
            onChange={(event) => onWsUrlChange(event.target.value)}
            placeholder="ws://localhost:8081/v1/ws"
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-blue-500 transition focus:ring-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400">
          API key
          <input
            value={apiKey}
            onChange={(event) => onApiKeyChange(event.target.value)}
            placeholder="pk_live_..."
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-blue-500 transition focus:ring-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400">
          Room
          <input
            value={room}
            onChange={(event) => onRoomChange(event.target.value)}
            placeholder="general"
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-blue-500 transition focus:ring-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400">
          Username
          <input
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="dev-123"
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-blue-500 transition focus:ring-2"
          />
        </label>

        <div className="md:col-span-2 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={connected || connecting}
            className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-slate-700"
          >
            {connecting ? "Connecting..." : connected ? "Connected" : "Connect"}
          </button>
          <button
            type="button"
            onClick={onDisconnect}
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-400 hover:text-white"
          >
            Disconnect
          </button>
          {error ? <p className="self-center text-sm text-rose-400">{error}</p> : null}
        </div>
      </form>
    </>
  );
}
