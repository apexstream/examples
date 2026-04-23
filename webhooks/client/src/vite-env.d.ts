/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APEXSTREAM_WS_URL: string;
  readonly VITE_APEXSTREAM_API_KEY: string;
  readonly VITE_EXTERNAL_API_KEY: string;
  readonly VITE_CONTROL_PLANE_URL?: string;
  /** Optional: Vite dev proxy target if it must differ from VITE_CONTROL_PLANE_URL */
  readonly VITE_CONTROL_PLANE_PROXY_TARGET?: string;
  readonly VITE_PROJECT_ID?: string;
  readonly VITE_WEBHOOK_TARGET_URL?: string;
  readonly VITE_WEBHOOK_SECRET?: string;
  /** Optional: explicit dev/LAN — set `1` or `true` with `ws://` gateway (see packages/client README). */
  readonly VITE_APEXSTREAM_ALLOW_INSECURE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
