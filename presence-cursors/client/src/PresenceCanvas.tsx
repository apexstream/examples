import type { MouseEvent } from "react";
import type { RemoteCursor } from "./usePresenceCursors";

/** Shared canvas + remote cursors — core “wow” demo surface. */

export type PresenceCanvasProps = {
  connected: boolean;
  remotes: RemoteCursor[];
  onCanvasMove: (event: MouseEvent<HTMLDivElement>) => void;
};

export function PresenceCanvas({ connected, remotes, onCanvasMove }: PresenceCanvasProps) {
  return (
    <section className="flex min-h-[min(70vh,520px)] flex-1 flex-col gap-2">
      <p className="text-xs text-slate-500">Canvas — move your pointer here after connecting. Updates are throttled (~30/s) for the gateway.</p>
      <div
        className="relative flex-1 cursor-crosshair overflow-hidden rounded-2xl border border-slate-600 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 shadow-inner"
        onMouseMove={onCanvasMove}
        role="application"
        aria-label="Shared cursor canvas"
      >
        {!connected ? (
          <div className="pointer-events-none flex h-full items-center justify-center text-sm text-slate-500">Connect to share your cursor</div>
        ) : null}

        {remotes.map((r) => (
          <div
            key={r.userKey}
            className="pointer-events-none absolute z-10 transition-[left,top] duration-75 ease-out"
            style={{
              left: `${r.nx * 100}%`,
              top: `${r.ny * 100}%`,
              transform: "translate(-2px, -2px)",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" className="drop-shadow-lg" aria-hidden>
              <path d="M2 2 L2 18 L8 13 L11 21 L13 20 L10 11 L18 11 Z" fill={r.color} stroke="rgba(15,23,42,0.85)" strokeWidth="1" />
            </svg>
            <span
              className="absolute left-4 top-4 max-w-[10rem] truncate rounded-md px-2 py-0.5 text-xs font-medium text-white shadow-md"
              style={{ backgroundColor: r.color }}
            >
              {r.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
