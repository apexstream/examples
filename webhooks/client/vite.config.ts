import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

/** Dev proxy: forwards /apex-api → Control Plane HTTP (avoid CORS). Target matches VITE_CONTROL_PLANE_URL when set (LAN/k8s). */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const plane =
    process.env.VITE_CONTROL_PLANE_PROXY_TARGET?.trim() ||
    env.VITE_CONTROL_PLANE_PROXY_TARGET?.trim() ||
    env.VITE_CONTROL_PLANE_URL?.trim() ||
    "http://localhost:8080";
  const proxyTarget = plane.replace(/\/$/, "");

  return {
    plugins: [react()],
    server: {
      port: 5175,
      proxy: {
        "/apex-api": {
          target: proxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/apex-api/, ""),
        },
      },
    },
  };
});
