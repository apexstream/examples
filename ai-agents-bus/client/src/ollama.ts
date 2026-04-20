/**
 * Ollama HTTP API helpers.
 * In dev, use Vite proxy `/api/ollama` → http://127.0.0.1:11434 to avoid CORS.
 */

export function getOllamaBase(): string {
  const raw = import.meta.env.VITE_OLLAMA_URL?.trim();
  if (raw) {
    return raw.replace(/\/+$/, "");
  }
  if (import.meta.env.DEV) {
    return "/api/ollama";
  }
  return "http://127.0.0.1:11434";
}

export async function ollamaListModels(base: string): Promise<string[]> {
  const url = `${base}/api/tags`;
  const res = await fetch(url);
  if (!res.ok) {
    return [];
  }
  const data = (await res.json()) as { models?: Array<{ name?: string }> };
  const names = data.models?.map((m) => m.name).filter((n): n is string => typeof n === "string") ?? [];
  return names;
}

/** NDJSON streaming /api/generate */
export async function ollamaGenerateStream(
  base: string,
  model: string,
  prompt: string,
  onToken: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${base}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: true,
    }),
    signal,
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Ollama HTTP ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const dec = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      let j: { response?: string; done?: boolean };
      try {
        j = JSON.parse(trimmed) as { response?: string; done?: boolean };
      } catch {
        continue;
      }
      if (typeof j.response === "string" && j.response.length > 0) {
        onToken(j.response);
      }
      if (j.done) {
        return;
      }
    }
  }
}
