/**
 * Cursor Cloud Agents API — https://api.cursor.com (Basic auth: API key as username, empty password).
 * Dev: use Vite proxy `/api/cursor` → https://api.cursor.com to avoid browser CORS.
 */

/**
 * Base URL for Cursor HTTP calls from the browser.
 *
 * Important: **`https://api.cursor.com` cannot be called directly from the browser** — responses are not
 * CORS-enabled for arbitrary web origins. Use the same-origin path **`/api/cursor`** (Vite dev/preview proxy,
 * or nginx/API gateway in production). Set `VITE_CURSOR_API_URL` only to your **own** proxy origin/path that
 * forwards to Cursor — not to `api.cursor.com` unless you control CORS server-side.
 */
export function getCursorBase(): string {
  const raw = import.meta.env.VITE_CURSOR_API_URL?.trim();
  const normalized = raw?.replace(/\/+$/, "") ?? "";
  const isPublicCursorHost =
    /^https?:\/\/(www\.)?api\.cursor\.com$/i.test(normalized);
  // Footgun: pointing env at api.cursor.com breaks browser fetches (no CORS); fall back to same-origin proxy.
  if (normalized && !isPublicCursorHost) {
    return normalized;
  }
  return "/api/cursor";
}

/** HTTP Basic for Cursor: base64("API_KEY:") */
export function cursorAuthHeader(apiKey: string): Record<string, string> {
  const pair = `${apiKey}:`;
  const b64 = btoa(pair);
  return {
    Authorization: `Basic ${b64}`,
    "Content-Type": "application/json",
  };
}

async function readHttpError(res: Response): Promise<string> {
  const t = await res.text();
  try {
    const j = JSON.parse(t) as { message?: string; error?: string };
    return j.message ?? j.error ?? t;
  } catch {
    return t || `HTTP ${res.status}`;
  }
}

export type CursorMessage = {
  id?: string;
  type?: string;
  text?: string;
};

export type CursorConversation = {
  id?: string;
  messages?: CursorMessage[];
};

export type CursorAgentRecord = {
  id?: string;
  status?: string;
  summary?: string;
};

const TERMINAL_FAILURE = new Set(["FAILED", "STOPPED", "ERROR", "CANCELLED"]);

function isTerminalSuccess(status: string): boolean {
  return status === "FINISHED";
}

function isTerminalFailure(status: string): boolean {
  return TERMINAL_FAILURE.has(status);
}

/** Count assistant_message entries in order (for slicing new replies after follow-up). */
export function countAssistantMessages(messages: CursorMessage[] | undefined): number {
  if (!messages?.length) {
    return 0;
  }
  return messages.filter((m) => m.type === "assistant_message").length;
}

/** All assistant texts, or only those after the first `skip` assistant_message entries. */
export function assistantTexts(
  messages: CursorMessage[] | undefined,
  skipAssistants: number,
): string {
  if (!messages?.length) {
    return "";
  }
  let n = 0;
  const parts: string[] = [];
  for (const m of messages) {
    if (m.type !== "assistant_message") {
      continue;
    }
    n += 1;
    if (n > skipAssistants && typeof m.text === "string") {
      parts.push(m.text);
    }
  }
  return parts.join("\n\n").trim();
}

export async function cursorListModels(base: string, apiKey: string): Promise<string[]> {
  const res = await fetch(`${base}/v0/models`, {
    headers: cursorAuthHeader(apiKey),
  });
  if (!res.ok) {
    throw new Error(await readHttpError(res));
  }
  const data = (await res.json()) as { models?: string[] };
  return data.models ?? [];
}

export async function cursorLaunchAgent(
  base: string,
  apiKey: string,
  body: {
    promptText: string;
    repository: string;
    ref?: string;
    model?: string;
  },
  signal?: AbortSignal,
): Promise<CursorAgentRecord> {
  const payload: Record<string, unknown> = {
    prompt: { text: body.promptText },
    source: {
      repository: body.repository.trim(),
      ...(body.ref?.trim() ? { ref: body.ref.trim() } : {}),
    },
  };
  const m = body.model?.trim();
  if (m && m !== "default") {
    payload.model = m;
  }

  const res = await fetch(`${base}/v0/agents`, {
    method: "POST",
    headers: cursorAuthHeader(apiKey),
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) {
    throw new Error(await readHttpError(res));
  }
  return (await res.json()) as CursorAgentRecord;
}

export async function cursorGetAgent(
  base: string,
  apiKey: string,
  agentId: string,
  signal?: AbortSignal,
): Promise<CursorAgentRecord> {
  const res = await fetch(`${base}/v0/agents/${encodeURIComponent(agentId)}`, {
    headers: cursorAuthHeader(apiKey),
    signal,
  });
  if (!res.ok) {
    throw new Error(await readHttpError(res));
  }
  return (await res.json()) as CursorAgentRecord;
}

export async function cursorFollowup(
  base: string,
  apiKey: string,
  agentId: string,
  promptText: string,
  signal?: AbortSignal,
): Promise<{ id?: string }> {
  const res = await fetch(`${base}/v0/agents/${encodeURIComponent(agentId)}/followup`, {
    method: "POST",
    headers: cursorAuthHeader(apiKey),
    body: JSON.stringify({ prompt: { text: promptText } }),
    signal,
  });
  if (!res.ok) {
    throw new Error(await readHttpError(res));
  }
  return (await res.json()) as { id?: string };
}

export async function cursorGetConversation(
  base: string,
  apiKey: string,
  agentId: string,
  signal?: AbortSignal,
): Promise<CursorConversation> {
  const res = await fetch(`${base}/v0/agents/${encodeURIComponent(agentId)}/conversation`, {
    headers: cursorAuthHeader(apiKey),
    signal,
  });
  if (!res.ok) {
    throw new Error(await readHttpError(res));
  }
  return (await res.json()) as CursorConversation;
}

export type PollCursorOptions = {
  intervalMs?: number;
  maxMs?: number;
  onStatus?: (status: string, summary?: string) => void;
};

export async function pollUntilTerminal(
  base: string,
  apiKey: string,
  agentId: string,
  signal: AbortSignal,
  opts?: PollCursorOptions,
): Promise<CursorAgentRecord> {
  const interval = opts?.intervalMs ?? 3000;
  const maxMs = opts?.maxMs ?? 30 * 60 * 1000;
  const start = Date.now();

  while (true) {
    if (signal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    if (Date.now() - start > maxMs) {
      throw new Error("Cursor agent timed out (still running). Increase max wait or check Cursor dashboard.");
    }

    const agent = await cursorGetAgent(base, apiKey, agentId, signal);
    const st = String(agent.status ?? "UNKNOWN").toUpperCase();
    opts?.onStatus?.(st, agent.summary);

    if (isTerminalSuccess(st)) {
      return agent;
    }
    if (isTerminalFailure(st)) {
      const hint = agent.summary?.trim() ? `: ${agent.summary}` : "";
      throw new Error(`Cursor agent ${st}${hint}`);
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, interval);
    });
  }
}
