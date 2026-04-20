/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EXTERNAL_API_KEY: string;
  readonly VITE_CONTROL_PLANE_URL?: string;
  readonly VITE_CONTROL_PLANE_PROXY_TARGET?: string;
  /** Polling interval ms (default 2500) */
  readonly VITE_POLL_INTERVAL_MS?: string;
  /** Required for webhook config + delivery tables (same project as your apps). */
  readonly VITE_PROJECT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
