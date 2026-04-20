import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  assistantTexts,
  countAssistantMessages,
  cursorFollowup,
  cursorGetConversation,
  cursorLaunchAgent,
  cursorListModels,
  getCursorBase,
  pollUntilTerminal,
} from "./cursorCloud";
import { getOllamaBase, ollamaGenerateStream, ollamaListModels } from "./ollama";
import type { BusVerbosity } from "./busTimelineFormat";
import { formatBusTimelineEntry } from "./busTimelineFormat";
import type { BusEnvelope } from "./useAgentBus";
import { useAgentBus } from "./useAgentBus";

const MAX_LOG = 400;

type LlmBackend = "ollama" | "cursor";

export default function App() {
  const [wsUrl, setWsUrl] = useState(import.meta.env.VITE_APEXSTREAM_WS_URL ?? "ws://localhost:8081/v1/ws");
  const [apiKey, setApiKey] = useState(import.meta.env.VITE_APEXSTREAM_API_KEY ?? "");
  const [session, setSession] = useState(import.meta.env.VITE_AGENTS_SESSION ?? "local-session");
  const [model, setModel] = useState(import.meta.env.VITE_OLLAMA_MODEL ?? "llama3.2");
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaOk, setOllamaOk] = useState<boolean | null>(null);

  const [llmBackend, setLlmBackend] = useState<LlmBackend>(
    import.meta.env.VITE_LLM_BACKEND === "cursor" ? "cursor" : "ollama",
  );
  const [cursorApiKey, setCursorApiKey] = useState(import.meta.env.VITE_CURSOR_API_KEY ?? "");
  const [cursorRepo, setCursorRepo] = useState(import.meta.env.VITE_CURSOR_REPO ?? "");
  const [cursorRef, setCursorRef] = useState(import.meta.env.VITE_CURSOR_REF ?? "main");
  const [cursorModels, setCursorModels] = useState<string[]>([]);
  const [cursorOk, setCursorOk] = useState<boolean | null>(null);

  const [prompt, setPrompt] = useState("Summarize why a realtime WebSocket bus is useful for coordinating AI agents.");
  const [autoAgentB, setAutoAgentB] = useState(true);
  /** Default: compact timeline — only start/done/error on the bus. */
  const [busVerbosity, setBusVerbosity] = useState<BusVerbosity>("milestones");
  /** Local-only streaming view while Ollama runs (does not use ApexStream log). */
  const [livePreview, setLivePreview] = useState(true);
  const [previewAgent, setPreviewAgent] = useState<"" | "A" | "B">("");
  const [previewText, setPreviewText] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const busVerbosityRef = useRef(busVerbosity);
  busVerbosityRef.current = busVerbosity;
  const livePreviewRef = useRef(livePreview);
  livePreviewRef.current = livePreview;

  const { connected, connecting, error, channel, log, connect, disconnect, publish, clearLog } = useAgentBus({
    session,
    wsUrl,
    apiKey,
  });

  const ollamaBase = useMemo(() => getOllamaBase(), []);
  const cursorBase = useMemo(() => getCursorBase(), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const m = await ollamaListModels(ollamaBase);
        if (!cancelled) {
          setOllamaModels(m);
          setOllamaOk(m.length > 0);
          setModel((current: string) => {
            if (m.length > 0 && !m.includes(current)) {
              return m[0];
            }
            return current;
          });
        }
      } catch {
        if (!cancelled) {
          setOllamaOk(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ollamaBase]);

  useEffect(() => {
    if (llmBackend !== "cursor") {
      return;
    }
    const key = cursorApiKey.trim();
    if (!key) {
      setCursorOk(null);
      setCursorModels([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const m = await cursorListModels(cursorBase, key);
        if (!cancelled) {
          setCursorModels(m);
          setCursorOk(true);
          setModel((current: string) => {
            const envM = import.meta.env.VITE_CURSOR_MODEL?.trim();
            if (current === "default" || current.trim() === "") {
              return envM || "default";
            }
            if (m.includes(current)) {
              return current;
            }
            if (envM && (envM === "default" || m.includes(envM))) {
              return envM;
            }
            return "default";
          });
        }
      } catch {
        if (!cancelled) {
          setCursorOk(false);
          setCursorModels([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cursorApiKey, cursorBase, llmBackend]);

  useEffect(() => {
    if (llmBackend === "cursor") {
      setModel(import.meta.env.VITE_CURSOR_MODEL?.trim() || "default");
    } else {
      setModel(import.meta.env.VITE_OLLAMA_MODEL ?? "llama3.2");
    }
  }, [llmBackend]);

  const stopRun = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  }, []);

  const flushTokens = useRef<{ buf: string; timer: number | null }>({ buf: "", timer: null });

  const publishAgentToken = useCallback(
    (kind: "bus.agent_a" | "bus.agent_b", text: string) => {
      if (busVerbosityRef.current !== "full") {
        return;
      }
      const env: BusEnvelope = {
        type: kind,
        phase: "token",
        text,
        ts: Date.now(),
      };
      publish(env as unknown as BusEnvelope);
    },
    [publish],
  );

  const scheduleFlush = useCallback(
    (kind: "bus.agent_a" | "bus.agent_b") => {
      const bucket = flushTokens.current;
      if (bucket.timer !== null) {
        return;
      }
      bucket.timer = window.setTimeout(() => {
        bucket.timer = null;
        const chunk = bucket.buf;
        bucket.buf = "";
        if (chunk) {
          publishAgentToken(kind, chunk);
        }
      }, 140);
    },
    [publishAgentToken],
  );

  const pushToken = useCallback(
    (kind: "bus.agent_a" | "bus.agent_b", piece: string) => {
      if (busVerbosityRef.current !== "full") {
        return;
      }
      flushTokens.current.buf += piece;
      scheduleFlush(kind);
    },
    [scheduleFlush],
  );

  const runAgentBOllama = useCallback(
    async (fullAText: string, signal: AbortSignal) => {
      const ts = Date.now();
      publish({
        type: "bus.agent_b",
        phase: "start",
        ts,
      } as BusEnvelope);

      if (livePreviewRef.current) {
        setPreviewAgent("B");
        setPreviewText("");
      }

      const bPrompt =
        `You are Agent B in a short demo. Respond in 2–4 sentences as a distinct voice. React to Agent A's output.\n\nAgent A output:\n${fullAText}`;

      let acc = "";
      try {
        await ollamaGenerateStream(
          ollamaBase,
          model,
          bPrompt,
          (tok) => {
            acc += tok;
            pushToken("bus.agent_b", tok);
            if (livePreviewRef.current) {
              setPreviewAgent("B");
              setPreviewText(acc);
            }
          },
          signal,
        );
        if (flushTokens.current.buf.length > 0 && flushTokens.current.timer) {
          window.clearTimeout(flushTokens.current.timer);
          flushTokens.current.timer = null;
          const rest = flushTokens.current.buf;
          flushTokens.current.buf = "";
          if (rest) {
            publishAgentToken("bus.agent_b", rest);
          }
        }
        publish({
          type: "bus.agent_b",
          phase: "done",
          text: acc,
          ts: Date.now(),
        } as BusEnvelope);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        publish({
          type: "bus.agent_b",
          phase: "error",
          text: msg,
          ts: Date.now(),
        } as BusEnvelope);
      }
    },
    [model, ollamaBase, publish, publishAgentToken, pushToken],
  );

  const runAgentBCursor = useCallback(
    async (
      agentId: string,
      assistantCountBeforeFollowup: number,
      fullAText: string,
      signal: AbortSignal,
    ) => {
      const ts = Date.now();
      publish({
        type: "bus.agent_b",
        phase: "start",
        ts,
      } as BusEnvelope);

      if (livePreviewRef.current) {
        setPreviewAgent("B");
        setPreviewText("");
      }

      const bPrompt =
        `You are Agent B in a short demo. Respond in 2–4 sentences as a distinct voice. React to Agent A's output.\n\nAgent A output:\n${fullAText}`;

      try {
        await cursorFollowup(cursorBase, cursorApiKey, agentId, bPrompt, signal);

        const onStatus = (st: string, summary?: string) => {
          pushToken("bus.agent_b", `[Cursor: ${st}]`);
          if (livePreviewRef.current) {
            setPreviewAgent("B");
            setPreviewText(summary?.trim() ? `${st} — ${summary}` : st);
          }
        };

        await pollUntilTerminal(cursorBase, cursorApiKey, agentId, signal, {
          onStatus,
        });

        const conv = await cursorGetConversation(cursorBase, cursorApiKey, agentId, signal);
        const acc = assistantTexts(conv.messages, assistantCountBeforeFollowup);

        publish({
          type: "bus.agent_b",
          phase: "done",
          text: acc,
          ts: Date.now(),
        } as BusEnvelope);
        if (livePreviewRef.current) {
          setPreviewAgent("B");
          setPreviewText(acc);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        publish({
          type: "bus.agent_b",
          phase: "error",
          text: msg,
          ts: Date.now(),
        } as BusEnvelope);
      }
    },
    [cursorApiKey, cursorBase, publish, pushToken],
  );

  const runPipeline = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed || !connected || busy) {
      return;
    }
    if (llmBackend === "ollama" && !model.trim()) {
      return;
    }
    if (llmBackend === "cursor" && (!cursorApiKey.trim() || !cursorRepo.trim())) {
      return;
    }

    setPrompt("");
    setPreviewText("");
    setPreviewAgent("");

    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);

    flushTokens.current = { buf: "", timer: null };

    publish({
      type: "bus.user",
      text: trimmed,
      ts: Date.now(),
    } as BusEnvelope);

    publish({
      type: "bus.agent_a",
      phase: "start",
      ts: Date.now(),
    } as BusEnvelope);

    if (llmBackend === "cursor") {
      const key = cursorApiKey.trim();
      const repo = cursorRepo.trim();
      const ref = cursorRef.trim() || undefined;
      const mt = model.trim();
      const cursorModel = mt && mt !== "default" ? mt : undefined;

      try {
        const launched = await cursorLaunchAgent(
          cursorBase,
          key,
          {
            promptText: trimmed,
            repository: repo,
            ref,
            model: cursorModel,
          },
          ac.signal,
        );
        const agentId = launched.id;
        if (!agentId) {
          throw new Error("Cursor launch did not return an agent id");
        }

        const onStatusA = (st: string, summary?: string) => {
          pushToken("bus.agent_a", `[Cursor: ${st}]`);
          if (livePreviewRef.current) {
            setPreviewAgent("A");
            setPreviewText(summary?.trim() ? `${st} — ${summary}` : st);
          }
        };

        await pollUntilTerminal(cursorBase, key, agentId, ac.signal, {
          onStatus: onStatusA,
        });

        const convA = await cursorGetConversation(cursorBase, key, agentId, ac.signal);
        const accA = assistantTexts(convA.messages, 0);
        const assistantAfterA = countAssistantMessages(convA.messages);

        publish({
          type: "bus.agent_a",
          phase: "done",
          text: accA,
          ts: Date.now(),
        } as BusEnvelope);
        if (livePreviewRef.current) {
          setPreviewAgent("A");
          setPreviewText(accA);
        }

        if (autoAgentB && accA.trim()) {
          await runAgentBCursor(agentId, assistantAfterA, accA, ac.signal);
        }
      } catch (e) {
        if ((e as Error)?.name === "AbortError") {
          publish({
            type: "bus.agent_a",
            phase: "error",
            text: "aborted",
            ts: Date.now(),
          } as BusEnvelope);
        } else {
          const msg = e instanceof Error ? e.message : String(e);
          publish({
            type: "bus.agent_a",
            phase: "error",
            text: msg,
            ts: Date.now(),
          } as BusEnvelope);
        }
      } finally {
        abortRef.current = null;
        setBusy(false);
        flushTokens.current = { buf: "", timer: null };
      }
      return;
    }

    let accA = "";
    try {
      await ollamaGenerateStream(
        ollamaBase,
        model,
        trimmed,
        (tok) => {
          accA += tok;
          pushToken("bus.agent_a", tok);
          if (livePreviewRef.current) {
            setPreviewAgent("A");
            setPreviewText(accA);
          }
        },
        ac.signal,
      );

      if (flushTokens.current.buf.length > 0) {
        if (flushTokens.current.timer) {
          window.clearTimeout(flushTokens.current.timer);
          flushTokens.current.timer = null;
        }
        const rest = flushTokens.current.buf;
        flushTokens.current.buf = "";
        if (rest) {
          publishAgentToken("bus.agent_a", rest);
        }
      }

      publish({
        type: "bus.agent_a",
        phase: "done",
        text: accA,
        ts: Date.now(),
      } as BusEnvelope);

      if (autoAgentB && accA.trim()) {
        await runAgentBOllama(accA, ac.signal);
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") {
        publish({
          type: "bus.agent_a",
          phase: "error",
          text: "aborted",
          ts: Date.now(),
        } as BusEnvelope);
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        publish({
          type: "bus.agent_a",
          phase: "error",
          text: msg,
          ts: Date.now(),
        } as BusEnvelope);
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      flushTokens.current = { buf: "", timer: null };
    }
  }, [
    autoAgentB,
    busy,
    connected,
    cursorApiKey,
    cursorBase,
    cursorRef,
    cursorRepo,
    llmBackend,
    model,
    ollamaBase,
    prompt,
    publish,
    publishAgentToken,
    pushToken,
    runAgentBCursor,
    runAgentBOllama,
  ]);

  const handleConnect = (event: FormEvent): void => {
    event.preventDefault();
    if (!wsUrl.trim() || !apiKey.trim() || !session.trim()) {
      return;
    }
    connect();
  };

  const trimmedLog = log.length > MAX_LOG ? log.slice(-MAX_LOG) : log;

  const displayLog = useMemo(() => {
    if (busVerbosity === "full") {
      return trimmedLog;
    }
    return trimmedLog.filter((row) => {
      const ev = row.envelope as Record<string, unknown>;
      const t = typeof ev.type === "string" ? ev.type : "";
      const phase = typeof ev.phase === "string" ? ev.phase : "";
      if ((t === "bus.agent_a" || t === "bus.agent_b") && phase === "token") {
        return false;
      }
      return true;
    });
  }, [trimmedLog, busVerbosity]);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 px-4 py-8 text-slate-100">
      <section className="rounded-2xl border border-violet-500/25 bg-slate-900/60 p-5 shadow-xl shadow-violet-950/30">
        <h1 className="text-xl font-semibold text-white">AI Agents Realtime Bus</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Agent <span className="text-violet-300">A</span> runs on{" "}
          <strong className="text-slate-200">{llmBackend === "cursor" ? "Cursor Cloud Agents" : "Ollama"}</strong> and publishes to channel{" "}
          <code className="rounded bg-slate-950 px-1 font-mono text-[11px] text-violet-200">{channel}</code>. Optional Agent{" "}
          <span className="text-fuchsia-300">B</span> follows Agent A. Open a second browser on the same session to watch the bus.
        </p>

        <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={handleConnect}>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400">
            WS URL
            <input
              value={wsUrl}
              onChange={(e) => setWsUrl(e.target.value)}
              className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm outline-none ring-violet-500 focus:ring-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400">
            API key
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm outline-none ring-violet-500 focus:ring-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400">
            Session id
            <input
              value={session}
              onChange={(e) => setSession(e.target.value)}
              className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm outline-none ring-violet-500 focus:ring-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400">
            LLM backend
            <select
              value={llmBackend}
              onChange={(e) => setLlmBackend(e.target.value as LlmBackend)}
              className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm outline-none ring-violet-500 focus:ring-2"
            >
              <option value="ollama">Ollama (local stream)</option>
              <option value="cursor">Cursor Cloud Agent (GitHub repo)</option>
            </select>
          </label>
          {llmBackend === "ollama" ? (
            <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400">
              Ollama model
              <div className="flex gap-2">
                <select
                  value={ollamaModels.includes(model) ? model : ""}
                  onChange={(e) => setModel(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm outline-none ring-violet-500 focus:ring-2"
                >
                  {ollamaModels.length === 0 ? (
                    <option value="">— type below —</option>
                  ) : (
                    ollamaModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))
                  )}
                </select>
                <input
                  value={ollamaModels.includes(model) ? "" : model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="manual model id"
                  className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 font-mono text-xs outline-none ring-violet-500 focus:ring-2"
                />
              </div>
            </label>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400">
                Cursor API key
                <input
                  type="password"
                  autoComplete="off"
                  value={cursorApiKey}
                  onChange={(e) => setCursorApiKey(e.target.value)}
                  placeholder="from Cursor Dashboard → API"
                  className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 font-mono text-xs outline-none ring-violet-500 focus:ring-2"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400 md:col-span-2">
                GitHub repository URL
                <input
                  value={cursorRepo}
                  onChange={(e) => setCursorRepo(e.target.value)}
                  placeholder="https://github.com/org/repo"
                  className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm outline-none ring-violet-500 focus:ring-2"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400">
                Git ref (branch / tag / commit)
                <input
                  value={cursorRef}
                  onChange={(e) => setCursorRef(e.target.value)}
                  placeholder="main"
                  className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 font-mono text-xs outline-none ring-violet-500 focus:ring-2"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400">
                Cursor model
                <div className="flex gap-2">
                  <select
                    value={
                      model === "default" || cursorModels.includes(model) ? model || "default" : ""
                    }
                    onChange={(e) => setModel(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm outline-none ring-violet-500 focus:ring-2"
                  >
                    <option value="default">default</option>
                    {cursorModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <input
                    value={model === "default" || cursorModels.includes(model) ? "" : model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="explicit model id"
                    className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 font-mono text-xs outline-none ring-violet-500 focus:ring-2"
                  />
                </div>
              </label>
            </>
          )}

          <div className="md:col-span-2 flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={connected || connecting}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:bg-slate-700"
            >
              {connecting ? "Connecting…" : connected ? "Connected" : "Connect"}
            </button>
            <button
              type="button"
              onClick={disconnect}
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:border-slate-400"
            >
              Disconnect
            </button>
            <button type="button" onClick={clearLog} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400 hover:text-white">
              Clear log
            </button>
            {error ? <span className="text-sm text-rose-400">{error}</span> : null}
            {llmBackend === "ollama" && ollamaOk === false ? (
              <span className="text-xs text-amber-400">
                Ollama not reachable at {ollamaBase} — start `ollama serve` or set VITE_OLLAMA_URL in .env
              </span>
            ) : null}
            {llmBackend === "ollama" && ollamaOk === true ? (
              <span className="text-xs text-emerald-500/90">Ollama OK ({ollamaModels.length} models)</span>
            ) : null}
            {llmBackend === "cursor" && !cursorApiKey.trim() ? (
              <span className="text-xs text-slate-500">Paste a Cursor API key to load model list (optional models if list fails).</span>
            ) : null}
            {llmBackend === "cursor" && cursorApiKey.trim() && cursorOk === false ? (
              <span className="text-xs text-amber-400">
                Cursor API not reachable at {cursorBase} — check key, network, or set VITE_CURSOR_API_URL and a same-origin proxy in production.
              </span>
            ) : null}
            {llmBackend === "cursor" && cursorOk === true ? (
              <span className="text-xs text-emerald-500/90">
                Cursor API OK ({cursorModels.length} explicit models; &quot;default&quot; uses your dashboard model)
              </span>
            ) : null}
          </div>
        </form>
      </section>

      <section className="grid flex-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-700 bg-slate-900/40 p-4">
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400">
            Prompt (Agent A)
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={8}
              className="rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 font-mono text-sm leading-relaxed text-slate-100 outline-none ring-violet-500 focus:ring-2"
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={autoAgentB} onChange={(e) => setAutoAgentB(e.target.checked)} className="rounded border-slate-600" />
            Run Agent B after Agent A completes
            {llmBackend === "cursor" ? (
              <span className="text-slate-500">(same cloud agent — follow-up prompt)</span>
            ) : (
              <span className="text-slate-500">(second Ollama call)</span>
            )}
          </label>

          <fieldset className="rounded-xl border border-slate-700/80 bg-slate-950/40 px-3 py-2">
            <legend className="px-1 text-[10px] uppercase tracking-wider text-slate-500">Bus &amp; timeline</legend>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <input
                type="radio"
                name="busVerbosity"
                checked={busVerbosity === "milestones"}
                onChange={() => setBusVerbosity("milestones")}
                className="border-slate-600"
              />
              Milestones only — user task + start/done/error (compact; default)
            </label>
            <label className="mt-1 flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <input
                type="radio"
                name="busVerbosity"
                checked={busVerbosity === "full"}
                onChange={() => setBusVerbosity("full")}
                className="border-slate-600"
              />
              Full token stream — every chunk on the bus &amp; timeline (verbose)
            </label>
          </fieldset>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={livePreview} onChange={(e) => setLivePreview(e.target.checked)} className="rounded border-slate-600" />
            Live preview while generating (local panel only — does not affect ApexStream log length)
          </label>

          {livePreview ? (
            <div className="rounded-xl border border-slate-700 bg-slate-950/80 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">
                Live stream {previewAgent ? `(Agent ${previewAgent})` : ""}
              </p>
              <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-300">
                {busy || previewText ? previewText || "…" : <span className="text-slate-600">Runs appear here during generation.</span>}
              </pre>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={
                !connected ||
                busy ||
                (llmBackend === "ollama" && !model.trim()) ||
                (llmBackend === "cursor" && (!cursorApiKey.trim() || !cursorRepo.trim()))
              }
              onClick={() => void runPipeline()}
              className="rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-medium text-white hover:bg-fuchsia-500 disabled:bg-slate-700"
            >
              {busy ? "Running…" : "Run A → bus (+ optional B)"}
            </button>
            <button
              type="button"
              disabled={!busy}
              onClick={stopRun}
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:border-slate-400"
            >
              Stop
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Dev: <code className="font-mono">/api/ollama</code> → local Ollama; <code className="font-mono">/api/cursor</code> →{" "}
            <code className="font-mono">api.cursor.com</code> (Bearer-style key sent as Basic auth from the browser). Production: set{" "}
            <code className="font-mono">VITE_OLLAMA_URL</code> / <code className="font-mono">VITE_CURSOR_API_URL</code> and use a proxy for
            CORS. Cursor mode is asynchronous (polls until FINISHED); it runs against a GitHub repo, not a free-form chat endpoint.
          </p>
        </div>

        <div className="flex min-h-[320px] flex-col rounded-2xl border border-slate-700 bg-slate-950/80 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-300">Bus timeline</h2>
            {busVerbosity === "milestones" ? (
              <span className="text-[10px] text-slate-500">Token rows from others are hidden in milestones mode</span>
            ) : null}
          </div>
          <div className="mt-3 max-h-[min(70vh,560px)] flex-1 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 p-2 font-mono text-[11px] leading-snug">
            {displayLog.length === 0 ? (
              <p className="text-slate-600">Connect and run — events appear here (and on other clients in the same session).</p>
            ) : (
              displayLog.map((row) => {
                const ev = row.envelope as Record<string, unknown>;
                const et = typeof ev.type === "string" ? ev.type : "";
                const phase = typeof ev.phase === "string" ? ev.phase : "";
                const body = typeof ev.text === "string" ? ev.text : "";
                const showReply =
                  (et === "bus.agent_a" || et === "bus.agent_b") && phase === "done" && body.trim().length > 0;

                return (
                  <div
                    key={row.id}
                    className="border-b border-slate-800/80 py-2 text-slate-300 last:border-0"
                  >
                    <div className="leading-snug">
                      <span className="text-slate-600">{new Date(row.ts).toLocaleTimeString()}</span>{" "}
                      <span className="text-emerald-400/90">[bus]</span>{" "}
                      {showReply ? (
                        <span className="font-semibold text-slate-100">
                          Agent {et === "bus.agent_a" ? "A" : "B"} reply ({body.length} chars)
                        </span>
                      ) : (
                        formatBusTimelineEntry(row)
                      )}
                    </div>
                    {showReply ? (
                      <pre className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap break-words border-l-2 border-violet-500/40 py-1 pl-3 font-mono text-[11px] leading-relaxed text-slate-200">
                        {body}
                      </pre>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
