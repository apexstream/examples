import { ApexStreamClient, type ChannelMessageMeta } from "apexstream";
import { useCallback, useEffect, useRef, useState } from "react";

export type ChatMessage = {
  id: string;
  user: string;
  text: string;
  sentAt: number;
  /** From durable `replay_event` (missed while offline). */
  source?: "live" | "replay";
};

type Envelope<TType extends string, TPayload extends Record<string, unknown>> = {
  type: TType;
} & TPayload;

type PresencePayload = {
  user: string;
  state: "join" | "leave";
  at: number;
};

type TypingPayload = {
  user: string;
  active: boolean;
  at: number;
};

type ConnectionState = "connecting" | "connected" | "closed";

export type UseChatOptions = {
  channel: string;
  user: string;
  wsUrl: string;
  apiKey: string;
  /** Request missed messages after reconnect (needs API+gateway extended realtime + app retention). */
  durableReplay: boolean;
  /** Publish with server-side reliable record + client `reliable_ack` (extended realtime). */
  reliableMessaging: boolean;
  /**
   * If true, replay frames from your own display name are not shown as chat rows (still advance durable cursor).
   * Helps solo-channel demos; turn off if the same username can appear on another device and must see own history via replay.
   */
  replayHideOwnMessages: boolean;
};

const MESSAGE_EVENT = "chat.message";
const PRESENCE_EVENT = "presence";
const TYPING_EVENT = "typing";

const LS_CLOSE = "apexstream-chat-last-close-";
const LS_EVENT = "apexstream-chat-last-event-";

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

function readWelcomeExtended(data: unknown): boolean | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  const o = data as Record<string, unknown>;
  if (o.type !== "welcome") {
    return null;
  }
  const p = o.payload;
  if (!p || typeof p !== "object" || Array.isArray(p)) {
    return null;
  }
  const po = p as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(po, "realtime_extended")) {
    return null;
  }
  const re = po.realtime_extended;
  if (!re || typeof re !== "object" || Array.isArray(re)) {
    return false;
  }
  return !!(re as { enabled?: boolean }).enabled;
}

export function useChat({
  channel,
  user,
  wsUrl,
  apiKey,
  durableReplay,
  reliableMessaging,
  replayHideOwnMessages,
}: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [presenceOnline, setPresenceOnline] = useState(0);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([user]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>("closed");
  const [error, setError] = useState<string>("");
  const [realtimeExtendedAvailable, setRealtimeExtendedAvailable] = useState(false);
  const [featureHint, setFeatureHint] = useState<string>("");
  const [replayLoadedCount, setReplayLoadedCount] = useState(0);

  const clientRef = useRef<ApexStreamClient | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const joinedRef = useRef(false);
  const extendedRef = useRef(false);
  const replaySeenRef = useRef<Set<string>>(new Set());
  /** After a stale `after_event_id`, we retry once without it (API returns 404 → gateway "replay failed"). */
  const replayFailRecoveryRef = useRef(false);
  const durableReplayRef = useRef(durableReplay);
  const reliableMessagingRef = useRef(reliableMessaging);
  const replayHideOwnRef = useRef(replayHideOwnMessages);

  durableReplayRef.current = durableReplay;
  reliableMessagingRef.current = reliableMessaging;
  replayHideOwnRef.current = replayHideOwnMessages;

  const persistCloseTime = useCallback(() => {
    try {
      localStorage.setItem(`${LS_CLOSE}${channel}`, new Date().toISOString());
    } catch {
      /* ignore */
    }
  }, [channel]);

  const persistLastDurableEventId = useCallback((eventId: string) => {
    const id = eventId.trim();
    if (!id) return;
    try {
      localStorage.setItem(`${LS_EVENT}${channel}`, id);
    } catch {
      /* ignore */
    }
  }, [channel]);

  const requestReplayIfNeeded = useCallback(
    (client: ApexStreamClient) => {
      if (!durableReplayRef.current || !extendedRef.current) {
        return;
      }
      let fromTs: string | undefined;
      let afterId: string | undefined;
      try {
        fromTs = localStorage.getItem(`${LS_CLOSE}${channel}`) ?? undefined;
        afterId = localStorage.getItem(`${LS_EVENT}${channel}`) ?? undefined;
      } catch {
        return;
      }
      if (!fromTs?.trim() && !afterId?.trim()) {
        return;
      }
      try {
        // Server merges `from_timestamp` with `after_event_id` by taking the *later* time and drops `after_id`
        // (see control plane ReplayDurableEvents). That can skip durable rows saved *before* `last-close` if the
        // tab closed after those messages — e.g. replay shows "4..10" but not "1..3". Prefer the durable cursor alone.
        const aid = afterId?.trim();
        const fts = fromTs?.trim();
        client.replay(channel, {
          ...(aid
            ? { afterEventId: aid, limit: 150 }
            : fts
              ? { fromTimestamp: fts, limit: 150 }
              : {}),
        });
      } catch {
        /* ignore */
      }
    },
    [channel],
  );

  const appendReplayChat = useCallback(
    (inner: unknown, eventId: string) => {
      if (replaySeenRef.current.has(eventId)) {
        return;
      }
      replaySeenRef.current.add(eventId);
      const event = parseEnvelope(inner);
      if (!event || event.type !== MESSAGE_EVENT) {
        return;
      }
      const text = typeof event.text === "string" ? event.text.trim() : "";
      const author = typeof event.user === "string" ? event.user : "unknown";
      if (!text) {
        return;
      }
      const sentAt = typeof event.sentAt === "number" ? event.sentAt : Date.now();
      const id = typeof event.id === "string" ? event.id : `${author}-${sentAt}`;
      persistLastDurableEventId(eventId);
      if (replayHideOwnRef.current && author.trim() === user.trim()) {
        return;
      }
      setReplayLoadedCount((n) => n + 1);
      setMessages((current) => [
        ...current,
        { id: `durable:${eventId}`, user: author, text, sentAt, source: "replay" },
      ]);
      setTypingUsers((current) => current.filter((name) => name !== author));
    },
    [persistLastDurableEventId, user],
  );

  const subscribeToChannel = useCallback(
    (client: ApexStreamClient) =>
      client.subscribe(channel, (payload, meta?: ChannelMessageMeta) => {
        const event = parseEnvelope(payload);
        if (!event) {
          return;
        }

        if (event.type === MESSAGE_EVENT) {
          const text = typeof event.text === "string" ? event.text.trim() : "";
          const author = typeof event.user === "string" ? event.user : "unknown";
          if (!text) {
            return;
          }
          const sentAt = typeof event.sentAt === "number" ? event.sentAt : Date.now();
          const id = typeof event.id === "string" ? event.id : `${author}-${sentAt}`;
          setMessages((current) => [...current, { id, user: author, text, sentAt, source: "live" }]);
          setTypingUsers((current) => current.filter((name) => name !== author));
          if (meta?.durableEventId) {
            persistLastDurableEventId(meta.durableEventId);
          }
          if (meta?.reliableMessageId) {
            try {
              client.reliableAck(meta.reliableMessageId);
            } catch {
              /* ignore */
            }
          }
          return;
        }

        if (event.type === PRESENCE_EVENT) {
          const presence = event as Envelope<typeof PRESENCE_EVENT, PresencePayload>;
          if (!presence.user || (presence.state !== "join" && presence.state !== "leave")) {
            return;
          }
          setOnlineUsers((current) => {
            const next = new Set(current);
            if (presence.state === "join") {
              next.add(presence.user);
            } else {
              next.delete(presence.user);
            }
            if (!next.has(user)) {
              next.add(user);
            }
            return Array.from(next).sort((a, b) => a.localeCompare(b));
          });
          return;
        }

        if (event.type === TYPING_EVENT) {
          const typing = event as Envelope<typeof TYPING_EVENT, TypingPayload>;
          if (!typing.user || typing.user === user || typeof typing.active !== "boolean") {
            return;
          }
          setTypingUsers((current) => {
            if (typing.active) {
              return current.includes(typing.user) ? current : [...current, typing.user];
            }
            return current.filter((name) => name !== typing.user);
          });
        }
      }),
    [channel, persistLastDurableEventId, user],
  );

  const disconnect = useCallback(() => {
    const client = clientRef.current;
    persistCloseTime();
    if (!client) {
      setConnectionState("closed");
      setMessages([]);
      setTypingUsers([]);
      setOnlineUsers([user]);
      setPresenceOnline(0);
      setReplayLoadedCount(0);
      replaySeenRef.current = new Set();
      return;
    }
    if (joinedRef.current) {
      try {
        client.publish(channel, {
          type: PRESENCE_EVENT,
          user,
          state: "leave",
          at: Date.now(),
        });
      } catch {
        /* ignore */
      }
    }
    joinedRef.current = false;
    client.disconnect();
    clientRef.current = null;
    setMessages([]);
    setTypingUsers([]);
    setOnlineUsers([user]);
    setPresenceOnline(0);
    setReplayLoadedCount(0);
    replaySeenRef.current = new Set();
    setConnectionState("closed");
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  }, [channel, persistCloseTime, user]);

  useEffect(() => () => disconnect(), [disconnect]);

  useEffect(() => {
    if (connectionState !== "connected") {
      return;
    }
    const onLeave = (): void => {
      persistCloseTime();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [connectionState, persistCloseTime]);

  const connect = useCallback(() => {
    if (clientRef.current && connectionState !== "closed") {
      return;
    }

    const allowInsecureTransport = wsUrl.startsWith("ws://");
    let client: ApexStreamClient;
    try {
      client = new ApexStreamClient({
        url: wsUrl,
        apiKey,
        allowInsecureTransport,
      });
    } catch (connectError) {
      const message = connectError instanceof Error ? connectError.message : "Invalid chat connection options.";
      setError(message);
      setConnectionState("closed");
      return;
    }

    clientRef.current = client;
    setError("");
    setFeatureHint("");
    setRealtimeExtendedAvailable(false);
    extendedRef.current = false;
    setReplayLoadedCount(0);
    replaySeenRef.current = new Set();
    replayFailRecoveryRef.current = false;
    setConnectionState("connecting");

    let unsubscribe = () => {};
    const handleOpen = () => {
      setConnectionState("connected");
      setError("");
      if (!joinedRef.current) {
        joinedRef.current = true;
        client.publish(channel, {
          type: PRESENCE_EVENT,
          user,
          state: "join",
          at: Date.now(),
        });
      }
    };
    const handleClose = () => {
      setConnectionState("closed");
      setMessages([]);
      setTypingUsers([]);
      setOnlineUsers([user]);
      setPresenceOnline(0);
      joinedRef.current = false;
      extendedRef.current = false;
      setRealtimeExtendedAvailable(false);
    };
    const handleError = () => {
      setError("WebSocket connection error. Verify gateway URL, API key, and allowed Origin.");
    };

    const handleWireMessage = (data: unknown) => {
      const n = readGatewayPresenceOnline(data, channel);
      if (n !== null) {
        setPresenceOnline(n);
      }

      const ext = readWelcomeExtended(data);
      if (ext !== null) {
        extendedRef.current = ext;
        setRealtimeExtendedAvailable(ext);
        if (!ext && (durableReplayRef.current || reliableMessagingRef.current)) {
          setFeatureHint(
            "Extended realtime is disabled on the API/gateway (set APEXSTREAM_REALTIME_EXTENDED_ENABLED=true). Replay and reliable messaging are unavailable.",
          );
        }
        if (ext) {
          setFeatureHint("");
          if (durableReplayRef.current) {
            requestReplayIfNeeded(client);
          }
        }
      }

      if (!data || typeof data !== "object" || Array.isArray(data)) {
        return;
      }
      const o = data as Record<string, unknown>;
      const t = typeof o.type === "string" ? o.type : "";

      if (t === "replay_event" && typeof o.channel === "string" && o.channel === channel) {
        const outer = o.payload;
        if (!outer || typeof outer !== "object" || Array.isArray(outer)) {
          return;
        }
        const pl = outer as Record<string, unknown>;
        const eventId = typeof pl.event_id === "string" ? pl.event_id : "";
        if (!eventId) {
          return;
        }
        appendReplayChat(pl.payload, eventId);
        return;
      }

      if (t === "error") {
        const msg = typeof o.message === "string" ? o.message : "";
        const isReplayFailed =
          msg === "replay failed" || msg.toLowerCase().includes("replay failed");
        if (
          isReplayFailed &&
          durableReplayRef.current &&
          extendedRef.current &&
          client.connected &&
          !replayFailRecoveryRef.current
        ) {
          let afterId: string | undefined;
          let fromTs: string | undefined;
          try {
            afterId = localStorage.getItem(`${LS_EVENT}${channel}`) ?? undefined;
            fromTs = localStorage.getItem(`${LS_CLOSE}${channel}`) ?? undefined;
          } catch {
            afterId = undefined;
            fromTs = undefined;
          }
          if (afterId?.trim()) {
            replayFailRecoveryRef.current = true;
            try {
              localStorage.removeItem(`${LS_EVENT}${channel}`);
              client.replay(channel, {
                fromTimestamp: fromTs?.trim() || undefined,
                limit: 150,
              });
            } catch {
              /* fall through to hint */
            }
            return;
          }
        }
        if (msg.includes("replay") || msg.includes("realtime")) {
          setFeatureHint(msg);
        }
      }
    };

    client.on("open", handleOpen);
    client.on("close", handleClose);
    client.on("error", handleError);
    client.on("message", handleWireMessage);
    unsubscribe = subscribeToChannel(client);
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
  }, [
    apiKey,
    channel,
    connectionState,
    appendReplayChat,
    requestReplayIfNeeded,
    subscribeToChannel,
    user,
    wsUrl,
  ]);

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !clientRef.current || connectionState !== "connected") {
        return;
      }
      const id = `${user}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const envelope = {
        type: MESSAGE_EVENT,
        id,
        user,
        text: trimmed,
        sentAt: Date.now(),
      };
      if (reliableMessagingRef.current) {
        clientRef.current.publish(channel, {
          reliable: true,
          idempotency_key: id,
          payload: envelope,
        });
      } else {
        clientRef.current.publish(channel, envelope);
      }
    },
    [channel, connectionState, user],
  );

  const sendTyping = useCallback(() => {
    if (!clientRef.current || connectionState !== "connected") {
      return;
    }
    clientRef.current.publish(channel, {
      type: TYPING_EVENT,
      user,
      active: true,
      at: Date.now(),
    });
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = window.setTimeout(() => {
      if (!clientRef.current) {
        return;
      }
      clientRef.current.publish(channel, {
        type: TYPING_EVENT,
        user,
        active: false,
        at: Date.now(),
      });
    }, 1300);
  }, [channel, connectionState, user]);

  return {
    connected: connectionState === "connected",
    connecting: connectionState === "connecting",
    messages,
    presenceOnline,
    usersOnline: onlineUsers,
    typingUsers,
    error,
    featureHint,
    realtimeExtendedAvailable,
    replayLoadedCount,
    connect,
    disconnect,
    sendMessage,
    sendTyping,
  };
}
