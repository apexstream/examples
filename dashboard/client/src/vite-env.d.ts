/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APEXSTREAM_WS_URL: string;
  readonly VITE_APEXSTREAM_API_KEY: string;
  readonly VITE_APEXSTREAM_METRICS_CHANNEL?: string;
  readonly VITE_APEXSTREAM_ALLOW_INSECURE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
