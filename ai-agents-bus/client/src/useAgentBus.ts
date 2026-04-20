import { ApexStreamClient } from "apexstream";
import { useCallback, useEffect, useRef, useState } from "react";

export type BusEnvelope =
  | { type: "bus.user"; text: string; ts: number }
  | { type: "bus.agent_a"; phase: "start" | "token" | "done" | "error"; text?: string; ts: number }
  | { type: "bus.agent_b"; phase: "start" | "token" | "done" | "error"; text?: string; ts: number };

export type BusLogEntry = {
  id: string;
  ts: number;
  direction: "in" | "out";
  envelope: BusEnvelope | Record<string, unknown>;
};

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function parseEnvelope(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export type UseAgentBusOptions = {
  session: string;
  wsUrl: string;
  apiKey: string;
};

export function useAgentBus({ session, wsUrl, apiKey }: UseAgentBusOptions) {
  const channel = `agents:${session}:events`;

  const [connectionState, setConnectionState] = useState<"closed" | "connecting" | "connected">("closed");
  const [error, setError] = useState("");
  const [log, setLog] = useState<BusLogEntry[]>([]);

  const clientRef = useRef<ApexStreamClient | null>(null);
  const liveRef = useRef(false);
  /** True only after a successful `open` (distinguish failed handshake from user disconnect). */
  const sawOpenRef = useRef(false);

  const appendLog = useCallback((direction: "in" | "out", envelope: BusEnvelope | Record<string, unknown>) => {
    setLog((prev) => [
      ...prev,
      {
        id: makeId(),
        ts: Date.now(),
        direction,
        envelope,
      },
    ]);
  }, []);

  const disconnect = useCallback(() => {
    const client = clientRef.current;
    liveRef.current = false;
    if (client) {
      client.disconnect();
      clientRef.current = null;
    }
    setConnectionState("closed");
  }, []);

  useEffect(() => () => disconnect(), [disconnect]);

  const publish = useCallback(
    (envelope: BusEnvelope | Record<string, unknown>) => {
      const client = clientRef.current;
      if (!client || !liveRef.current) {
        return;
      }
      try {
        client.publish(channel, envelope);
        /* Do not append "out" — gateway delivers to all subscribers including sender; subscribe adds one row per event. */
      } catch {
        /* ignore */
      }
    },
    [appendLog, channel],
  );

  const connect = useCallback(() => {
    if (clientRef.current) {
      return;
    }
    sawOpenRef.current = false;

    const allowInsecureTransport = wsUrl.startsWith("ws://");
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
      sawOpenRef.current = true;
      liveRef.current = true;
      setConnectionState("connected");
      setError("");
    };

    const handleClose = (ev: CloseEvent) => {
      liveRef.current = false;
      setConnectionState("closed");
      const hadOpen = sawOpenRef.current;
      sawOpenRef.current = false;
      if (hadOpen) {
        return;
      }
      const code = ev.code;
      const reason = (ev.reason && String(ev.reason).trim()) || "";
      const originHint =
        " If the page URL host differs from the gateway host in your WS URL, set gateway env " +
        "`APEXSTREAM_GATEWAY_ALLOW_ORIGINS=*` (dev) or a comma list of full page origins (e.g. " +
        "`http://localhost:5178`).";
      setError(
        `WebSocket closed before connect (code ${code}${reason ? `, ${reason}` : ""}).` +
          " Check `VITE_APEXSTREAM_WS_URL`, API key, and network —" +
          (code === 1006 || code === 1002 || !reason ? originHint : ""),
      );
    };

    const handleError = () => {
      /* Most browsers emit `close` right after with code/reason — message is set there. */
    };

    let unsubscribe = () => {};
    unsubscribe = client.subscribe(channel, (payload) => {
      const e = parseEnvelope(payload);
      if (!e || typeof e.type !== "string" || !e.type.startsWith("bus.")) {
        return;
      }
      appendLog("in", e as BusEnvelope);
    });

    client.on("open", handleOpen);
    client.on("close", handleClose);
    client.on("error", handleError);
    client.connect();

    const originalDisconnect = client.disconnect.bind(client);
    client.disconnect = (code?: number, reason?: string) => {
      unsubscribe();
      client.off("open", handleOpen);
      client.off("close", handleClose);
      client.off("error", handleError);
      originalDisconnect(code, reason);
    };
  }, [appendLog, apiKey, channel, wsUrl]);

  const clearLog = useCallback(() => setLog([]), []);

  return {
    connected: connectionState === "connected",
    connecting: connectionState === "connecting",
    error,
    channel,
    log,
    connect,
    disconnect,
    publish,
    clearLog,
  };
}
