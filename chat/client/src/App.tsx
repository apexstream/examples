import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChatRoomPanel } from "./ChatRoomPanel";
import { ConnectForm } from "./ConnectForm";
import { ExtendedRealtimeSection } from "./ExtendedRealtimeSection";
import { LS_FEAT_DURABLE, LS_FEAT_RELIABLE, LS_FEAT_REPLAY_HIDE_OWN, readBoolLS } from "./chatPrefs";
import { useChat } from "./useChat";

export default function App() {
  const [wsUrl, setWsUrl] = useState(import.meta.env.VITE_APEXSTREAM_WS_URL ?? "ws://localhost:8081/v1/ws");
  const [apiKey, setApiKey] = useState(import.meta.env.VITE_APEXSTREAM_API_KEY ?? "");
  const [room, setRoom] = useState(import.meta.env.VITE_CHAT_ROOM ?? "general");
  const [name, setName] = useState(() => {
    const fromEnv = import.meta.env.VITE_CHAT_USER;
    if (typeof fromEnv === "string" && fromEnv.trim()) return fromEnv.trim();
    return `dev-${Math.floor(Math.random() * 900 + 100)}`;
  });
  const [messageText, setMessageText] = useState("");
  const [typingNotifiedAt, setTypingNotifiedAt] = useState(0);
  const [durableReplay, setDurableReplay] = useState(() => readBoolLS(LS_FEAT_DURABLE, true));
  const [reliableMessaging, setReliableMessaging] = useState(() => readBoolLS(LS_FEAT_RELIABLE, false));
  const [replayHideOwnMessages, setReplayHideOwnMessages] = useState(() =>
    readBoolLS(LS_FEAT_REPLAY_HIDE_OWN, true),
  );

  const {
    connected,
    connecting,
    error,
    presenceOnline,
    typingUsers,
    messages,
    featureHint,
    realtimeExtendedAvailable,
    replayLoadedCount,
    connect,
    disconnect,
    sendMessage,
    sendTyping,
  } = useChat({
    channel: `chat:${room}`,
    user: name,
    wsUrl,
    apiKey,
    durableReplay,
    reliableMessaging,
    replayHideOwnMessages,
  });
  const panelLabel = useMemo(() => `Room: ${room}`, [room]);
  const messageFeedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messageFeedRef.current) {
      messageFeedRef.current.scrollTop = messageFeedRef.current.scrollHeight;
    }
  }, [messages]);

  const handleConnect = (event: FormEvent): void => {
    event.preventDefault();
    if (!wsUrl.trim() || !apiKey.trim() || !room.trim() || !name.trim()) {
      return;
    }
    connect();
  };

  const handleDisconnect = (): void => {
    disconnect();
    setMessageText("");
    setTypingNotifiedAt(0);
  };

  const handleSend = (event: FormEvent): void => {
    event.preventDefault();
    const trimmed = messageText.trim();
    if (!trimmed) return;
    sendMessage(trimmed);
    setMessageText("");
  };

  const handleTyping = (nextText: string): void => {
    setMessageText(nextText);
    const now = Date.now();
    if (now - typingNotifiedAt >= 1200) {
      sendTyping();
      setTypingNotifiedAt(now);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-4 px-4 py-8 text-slate-100">
      <section className="rounded-2xl border border-slate-700 bg-slate-800/40 p-4 shadow-xl shadow-slate-950/30">
        <ConnectForm
          wsUrl={wsUrl}
          apiKey={apiKey}
          room={room}
          name={name}
          connecting={connecting}
          connected={connected}
          error={error}
          onWsUrlChange={setWsUrl}
          onApiKeyChange={setApiKey}
          onRoomChange={setRoom}
          onNameChange={setName}
          onSubmit={handleConnect}
          onDisconnect={handleDisconnect}
        />
        <ExtendedRealtimeSection
          durableReplay={durableReplay}
          reliableMessaging={reliableMessaging}
          replayHideOwnMessages={replayHideOwnMessages}
          onDurableReplayChange={setDurableReplay}
          onReliableMessagingChange={setReliableMessaging}
          onReplayHideOwnMessagesChange={setReplayHideOwnMessages}
          featureHint={featureHint}
        />
      </section>

      <ChatRoomPanel
        panelLabel={panelLabel}
        messages={messages}
        typingUsers={typingUsers}
        presenceOnline={presenceOnline}
        connected={connected}
        connecting={connecting}
        realtimeExtendedAvailable={realtimeExtendedAvailable}
        replayLoadedCount={replayLoadedCount}
        messageText={messageText}
        messageFeedRef={messageFeedRef}
        onMessageChange={handleTyping}
        onSend={handleSend}
      />
    </main>
  );
}
