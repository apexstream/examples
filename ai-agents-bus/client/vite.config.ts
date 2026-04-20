import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Ollama target for the Vite dev/preview proxy (set in docker-compose: host Ollama). */
const ollamaTarget = process.env.OLLAMA_PROXY_TARGET?.trim() || "http://127.0.0.1:11434";

const ollamaProxy = {
  target: ollamaTarget,
  changeOrigin: true,
  rewrite: (path: string) => path.replace(/^\/api\/ollama/, ""),
};

const cursorProxy = {
  target: "https://api.cursor.com",
  changeOrigin: true,
  secure: true,
  rewrite: (path: string) => path.replace(/^\/api\/cursor/, ""),
};

/** Proxy so the browser can call Ollama and Cursor without CORS (same for `vite dev` and `vite preview`). */
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api/ollama": ollamaProxy,
      "/api/cursor": cursorProxy,
    },
  },
  preview: {
    proxy: {
      "/api/ollama": ollamaProxy,
      "/api/cursor": cursorProxy,
    },
  },
});
