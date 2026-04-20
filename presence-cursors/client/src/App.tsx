import type { FormEvent, MouseEvent } from "react";
import { useMemo, useState } from "react";
import { PresenceCanvas } from "./PresenceCanvas";
import { PresenceConnectForm } from "./PresenceConnectForm";
import { usePresenceCursors } from "./usePresenceCursors";

export default function App() {
  const [wsUrl, setWsUrl] = useState(import.meta.env.VITE_APEXSTREAM_WS_URL ?? "ws://localhost:8081/v1/ws");
  const [apiKey, setApiKey] = useState(import.meta.env.VITE_APEXSTREAM_API_KEY ?? "");
  const [room, setRoom] = useState(import.meta.env.VITE_CURSOR_ROOM ?? "demo-room");
  const [displayName, setDisplayName] = useState(() => {
    const fromEnv = import.meta.env.VITE_CURSOR_USER;
    if (typeof fromEnv === "string" && fromEnv.trim()) return fromEnv.trim();
    return `guest-${Math.floor(Math.random() * 900 + 100)}`;
  });

  const {
    connected,
    connecting,
    error,
    presenceOnline,
    onlineLabels,
    remotes,
    connect,
    disconnect,
    publishCursorNormalized,
  } = usePresenceCursors({
    room,
    displayName,
    wsUrl,
    apiKey,
  });

  const remoteList = useMemo(() => Object.values(remotes), [remotes]);

  const handleConnect = (event: FormEvent): void => {
    event.preventDefault();
    if (!wsUrl.trim() || !apiKey.trim() || !room.trim() || !displayName.trim()) {
      return;
    }
    connect();
  };

  const handleCanvasMove = (event: MouseEvent<HTMLDivElement>): void => {
    if (!connected) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
    const nx = (event.clientX - rect.left) / rect.width;
    const ny = (event.clientY - rect.top) / rect.height;
    publishCursorNormalized(nx, ny);
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 px-4 py-8 text-slate-100">
      <PresenceConnectForm
        wsUrl={wsUrl}
        apiKey={apiKey}
        room={room}
        displayName={displayName}
        connecting={connecting}
        connected={connected}
        error={error}
        presenceOnline={presenceOnline}
        onlineLabels={onlineLabels}
        onWsUrlChange={setWsUrl}
        onApiKeyChange={setApiKey}
        onRoomChange={setRoom}
        onDisplayNameChange={setDisplayName}
        onSubmit={handleConnect}
        onDisconnect={disconnect}
      />

      <PresenceCanvas connected={connected} remotes={remoteList} onCanvasMove={handleCanvasMove} />
    </main>
  );
}
