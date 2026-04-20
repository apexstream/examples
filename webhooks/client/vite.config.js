import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
/** Dev proxy: forwards /apex-api → Control Plane HTTP (avoid CORS). Target matches VITE_CONTROL_PLANE_URL when set (LAN/k8s). */
export default defineConfig(function (_a) {
    var _b, _c;
    var mode = _a.mode;
    var env = loadEnv(mode, process.cwd(), "");
    var plane = ((_b = env.VITE_CONTROL_PLANE_PROXY_TARGET) === null || _b === void 0 ? void 0 : _b.trim()) ||
        ((_c = env.VITE_CONTROL_PLANE_URL) === null || _c === void 0 ? void 0 : _c.trim()) ||
        "http://localhost:8080";
    var proxyTarget = plane.replace(/\/$/, "");
    return {
        plugins: [react()],
        server: {
            port: 5175,
            proxy: {
                "/apex-api": {
                    target: proxyTarget,
                    changeOrigin: true,
                    rewrite: function (path) { return path.replace(/^\/apex-api/, ""); },
                },
            },
        },
    };
});
