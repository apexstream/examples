import type { FormEvent } from "react";
import type { RefObject } from "react";
import type { ChatMessage } from "./useChat";

function formatTime(epochMillis: number): string {
  const date = new Date(epochMillis);
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Room transcript + composer — core chat UX (copy without the connection form). */

export type ChatRoomPanelProps = {
  panelLabel: string;
  messages: ChatMessage[];
  typingUsers: string[];
  presenceOnline: number;
  connected: boolean;
  connecting: boolean;
  realtimeExtendedAvailable: boolean;
  replayLoadedCount: number;
  messageText: string;
  messageFeedRef: RefObject<HTMLDivElement | null>;
  onMessageChange: (text: string) => void;
  onSend: (e: FormEvent) => void;
};

export function ChatRoomPanel({
  panelLabel,
  messages,
  typingUsers,
  presenceOnline,
  connected,
  connecting,
  realtimeExtendedAvailable,
  replayLoadedCount,
  messageText,
  messageFeedRef,
  onMessageChange,
  onSend,
}: ChatRoomPanelProps) {
  return (
    <section className="flex min-h-[500px] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-xl shadow-slate-950/40">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 bg-slate-800 px-4 py-3">
        <span className="text-sm font-semibold text-slate-100">{panelLabel}</span>
        <div className="flex flex-wrap items-center gap-2">
          {connected && realtimeExtendedAvailable ? (
            <span className="rounded-full bg-emerald-900/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-300">
              extended realtime
            </span>
          ) : null}
          {connected && replayLoadedCount > 0 ? (
            <span className="text-[11px] text-slate-400">replay loaded: {replayLoadedCount}</span>
          ) : null}
          <span className="rounded-full bg-slate-700 px-3 py-1 text-xs text-slate-200">
            {connecting ? "Connecting…" : connected ? `online ${presenceOnline}` : "Not connected"}
          </span>
        </div>
      </header>

      <div ref={messageFeedRef} className="flex-1 space-y-2 overflow-y-auto bg-slate-900 p-4">
        {messages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-700 bg-slate-800/40 p-4 text-sm text-slate-400">
            {!connected && !connecting
              ? "Not connected — click Connect and wait for the status in the header."
              : connecting
                ? "Connecting…"
                : "No messages yet — type and send."}
          </div>
        ) : null}
        {messages.map((message) => (
          <article key={message.id} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-blue-300">{message.user}</p>
                {message.source === "replay" ? (
                  <span className="rounded bg-amber-900/60 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-200">
                    replay
                  </span>
                ) : null}
              </div>
              <time className="shrink-0 text-xs text-slate-400">{formatTime(message.sentAt)}</time>
            </div>
            <p className="mt-1 text-sm text-slate-100">{message.text}</p>
          </article>
        ))}
      </div>

      <footer className="border-t border-slate-700 bg-slate-800 px-4 py-3">
        <div className="mb-2 min-h-5 text-xs text-slate-400">
          {typingUsers.length > 0 ? `${typingUsers.join(", ")} typing...` : " "}
        </div>
        <form className="flex gap-2" onSubmit={onSend}>
          <input
            value={messageText}
            onChange={(event) => onMessageChange(event.target.value)}
            placeholder="type message..."
            className="flex-1 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-blue-500 transition focus:ring-2"
          />
          <button
            type="submit"
            disabled={!connected || !messageText.trim()}
            className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-slate-700"
          >
            send
          </button>
        </form>
      </footer>
    </section>
  );
}
