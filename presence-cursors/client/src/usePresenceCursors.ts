import { ApexStreamClient } from "@apexstream/client";
import { useCallback, useEffect, useRef, useState } from "react";

const PRESENCE_EVENT = "presence";
const CURSOR_EVENT = "cursor.position";

/** Target publish rate (~30 Hz max). */
const CURSOR_PUBLISH_MS = 33;
const STALE_CURSOR_MS = 8000;

type Envelope<TType extends string, TPayload extends Record<string, unknown>> = {
  type: TType;
} & TPayload;

type PresencePayload = {
  user: string;
  state: "join" | "leave";
  at: number;
};

type CursorPayload = {
  userKey: string;
  user: string;
  x: number;
  y: number;
  ts: number;
};

export type RemoteCursor = {
  userKey: string;
  label: string;
  color: string;
  nx: number;
  ny: number;
  ts: number;
};

function parseEnvelope(value: unknown): Envelope<string, Record<string, unknown>> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const typed = value as Record<string, unknown>;
  if (typeof typed.type !== "string") {
    return null;
  }
  return typed as Envelope<string, Record<string, unknown>>;
}

function readGatewayPresenceOnline(data: unknown, expectedChannel: string): number | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  const o = data as Record<string, unknown>;
  const t = typeof o.type === "string" ? o.type : "";
  if (t !== "presence_snapshot" && t !== "presence_update") {
    return null;
  }
  if (typeof o.channel !== "string" || o.channel !== expectedChannel) {
    return null;
  }
  const payload = o.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const online = (payload as Record<string, unknown>).online;
  return typeof online === "number" && online >= 0 ? online : null;
}

function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) % 360;
  }
  return h;
}

function colorForKey(userKey: string): string {
  const h = hueFromString(userKey);
  return `hsl(${h} 75% 58%)`;
}

function tabUserKey(): string {
  try {
    const k = "apexstream-presence-tab-id";
    let v = sessionStorage.getItem(k);
    if (!v) {
      v = `u-${Math.random().toString(36).slice(2, 11)}`;
      sessionStorage.setItem(k, v);
    }
    return v;
  } catch {
    return `u-${Math.random().toString(36).slice(2, 11)}`;
  }
}

export type UsePresenceCursorsOptions = {
  room: string;
  displayName: string;
  wsUrl: string;
  apiKey: string;
};

export function usePresenceCursors({ room, displayName, wsUrl, apiKey }: UsePresenceCursorsOptions) {
  const channel = `cursors:${room}`;
  const userKey = useRef(tabUserKey()).current;

  const [connectionState, setConnectionState] = useState<"closed" | "connecting" | "connected">("closed");
  const [error, setError] = useState("");
  const [presenceOnline, setPresenceOnline] = useState(0);
  const [onlineLabels, setOnlineLabels] = useState<string[]>([displayName]);
  const [remotes, setRemotes] = useState<Record<string, RemoteCursor>>({});

  const clientRef = useRef<ApexStreamClient | null>(null);
  const liveRef = useRef(false);
  const joinedRef = useRef(false);
  const lastPublishRef = useRef(0);
  const pendingCursorRef = useRef<{ nx: number; ny: number } | null>(null);
  const flushTimerRef = useRef<number | null>(null);
  const displayNameRef = useRef(displayName);
  displayNameRef.current = displayName;

  const pruneStale = useCallback(() => {
    const now = Date.now();
    setRemotes((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const k of Object.keys(next)) {
        if (now - next[k].ts > STALE_CURSOR_MS) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  useEffect(() => {
    const id = window.setInterval(pruneStale, 2000);
    return () => window.clearInterval(id);
  }, [pruneStale]);

  const disconnect = useCallback(() => {
    const client = clientRef.current;
    const ch = `cursors:${room}`;
    if (client && joinedRef.current) {
      try {
        client.publish(ch, {
          type: PRESENCE_EVENT,
          user: displayNameRef.current,
          state: "leave",
          at: Date.now(),
        });
      } catch {
        /* ignore */
      }
    }
    joinedRef.current = false;
    liveRef.current = false;
    if (client) {
      client.disconnect();
      clientRef.current = null;
    }
    if (flushTimerRef.current) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    pendingCursorRef.current = null;
    setConnectionState("closed");
    setPresenceOnline(0);
    setOnlineLabels([displayNameRef.current]);
    setRemotes({});
  }, [room]);

  useEffect(() => () => disconnect(), [disconnect]);

  const flushCursorPublish = useCallback(() => {
    flushTimerRef.current = null;
    const pending = pendingCursorRef.current;
    const client = clientRef.current;
    if (!pending || !client || !liveRef.current) {
      return;
    }
    const now = Date.now();
    lastPublishRef.current = now;
    try {
      client.publish(channel, {
        type: CURSOR_EVENT,
        userKey,
        user: displayNameRef.current,
        x: pending.nx,
        y: pending.ny,
        ts: now,
      } satisfies CursorPayload & { type: typeof CURSOR_EVENT });
    } catch {
      /* ignore */
    }
  }, [channel, userKey]);

  const publishCursorNormalized = useCallback(
    (nx: number, ny: number) => {
      const clampedX = Math.min(1, Math.max(0, nx));
      const clampedY = Math.min(1, Math.max(0, ny));
      pendingCursorRef.current = { nx: clampedX, ny: clampedY };

      const client = clientRef.current;
      if (!client || !liveRef.current) {
        return;
      }

      const now = Date.now();
      const delta = now - lastPublishRef.current;
      if (delta >= CURSOR_PUBLISH_MS) {
        lastPublishRef.current = now;
        try {
          client.publish(channel, {
            type: CURSOR_EVENT,
            userKey,
            user: displayNameRef.current,
            x: clampedX,
            y: clampedY,
            ts: now,
          } satisfies CursorPayload & { type: typeof CURSOR_EVENT });
        } catch {
          /* ignore */
        }
        return;
      }

      if (flushTimerRef.current === null) {
        const wait = CURSOR_PUBLISH_MS - delta;
        flushTimerRef.current = window.setTimeout(flushCursorPublish, wait);
      }
    },
    [channel, flushCursorPublish, userKey],
  );

  const connect = useCallback(() => {
    if (clientRef.current) {
      return;
    }

    const allowInsecureTransport =
      wsUrl.startsWith("ws://") ||
      import.meta.env.VITE_APEXSTREAM_ALLOW_INSECURE === "1" ||
      import.meta.env.VITE_APEXSTREAM_ALLOW_INSECURE === "true";
    let client: ApexStreamClient;
    try {
      client = new ApexStreamClient({
        url: wsUrl,
        apiKey,
        allowInsecureTransport,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid connection options.");
      setConnectionState("closed");
      return;
    }

    clientRef.current = client;
    setError("");
    setConnectionState("connecting");

    const handleOpen = () => {
      liveRef.current = true;
      setConnectionState("connected");
      setError("");
      if (!joinedRef.current) {
        joinedRef.current = true;
        client.publish(channel, {
          type: PRESENCE_EVENT,
          user: displayNameRef.current,
          state: "join",
          at: Date.now(),
        });
      }
    };

    const handleClose = () => {
      joinedRef.current = false;
      liveRef.current = false;
      setConnectionState("closed");
      setPresenceOnline(0);
      setOnlineLabels([displayNameRef.current]);
      setRemotes({});
    };

    const handleError = () => {
      setError("WebSocket error — check gateway URL, API key, and browser Origin.");
    };

    const handleWireMessage = (data: unknown) => {
      const n = readGatewayPresenceOnline(data, channel);
      if (n !== null) {
        setPresenceOnline(n);
      }
    };

    let unsubscribe = () => {};
    unsubscribe = client.subscribe(channel, (payload) => {
      const event = parseEnvelope(payload);
      if (!event) {
        return;
      }

      if (event.type === PRESENCE_EVENT) {
        const presence = event as Envelope<typeof PRESENCE_EVENT, PresencePayload>;
        if (!presence.user || (presence.state !== "join" && presence.state !== "leave")) {
          return;
        }
        setOnlineLabels((current) => {
          const next = new Set(current);
          if (presence.state === "join") {
            next.add(presence.user);
          } else {
            next.delete(presence.user);
          }
          if (!next.has(displayNameRef.current)) {
            next.add(displayNameRef.current);
          }
          return Array.from(next).sort((a, b) => a.localeCompare(b));
        });
        return;
      }

      if (event.type === CURSOR_EVENT) {
        const c = event as Envelope<typeof CURSOR_EVENT, CursorPayload>;
        const uk = typeof c.userKey === "string" ? c.userKey : "";
        if (!uk || uk === userKey) {
          return;
        }
        const nx = typeof c.x === "number" ? c.x : Number.NaN;
        const ny = typeof c.y === "number" ? c.y : Number.NaN;
        if (!Number.isFinite(nx) || !Number.isFinite(ny)) {
          return;
        }
        const label = typeof c.user === "string" ? c.user : uk;
        const ts = typeof c.ts === "number" ? c.ts : Date.now();
        setRemotes((prev) => ({
          ...prev,
          [uk]: {
            userKey: uk,
            label,
            color: colorForKey(uk),
            nx: Math.min(1, Math.max(0, nx)),
            ny: Math.min(1, Math.max(0, ny)),
            ts,
          },
        }));
      }
    });

    client.on("open", handleOpen);
    client.on("close", handleClose);
    client.on("error", handleError);
    client.on("message", handleWireMessage);
    client.connect();

    const originalDisconnect = client.disconnect.bind(client);
    client.disconnect = (code?: number, reason?: string) => {
      unsubscribe();
      client.off("open", handleOpen);
      client.off("close", handleClose);
      client.off("error", handleError);
      client.off("message", handleWireMessage);
      originalDisconnect(code, reason);
    };
  }, [apiKey, channel, userKey, wsUrl]);

  return {
    connected: connectionState === "connected",
    connecting: connectionState === "connecting",
    error,
    presenceOnline,
    onlineLabels,
    remotes,
    userKey,
    connect,
    disconnect,
    publishCursorNormalized,
  };
}
