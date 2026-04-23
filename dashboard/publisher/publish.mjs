#!/usr/bin/env node
/**
 * Simulated seller metrics: small random-walk KPIs → ApexStream on an interval.
 * Run the stack (gateway) and issue an API key, then: npm start
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { ApexStreamClient } from "apexstream";

/** Load `publisher/.env` into process.env (does not override non-empty existing vars). */
function loadDotEnvSidecar() {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(dir, ".env");
}

function applyDotEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  let raw = fs.readFileSync(envPath, "utf8");
  raw = raw.replace(/^\ufeff/, "");
  for (const line of raw.split(/\r?\n/)) {
    let s = line.trim();
    if (!s || s.startsWith("#")) continue;
    if (s.toLowerCase().startsWith("export ")) s = s.slice(7).trim();
    const eq = s.indexOf("=");
    if (eq <= 0) continue;
    const key = s.slice(0, eq).trim();
    let val = s.slice(eq + 1).trim();
    val = val.replace(/^["']|["']$/g, "");
    if (!key) continue;
    const prev = process.env[key];
    const prevEmpty = prev === undefined || String(prev).trim() === "";
    if (!prevEmpty) continue;
    process.env[key] = val;
  }
}

const publisherEnvPath = loadDotEnvSidecar();
applyDotEnvFile(publisherEnvPath);

/** Prefer `APEXSTREAM_*`; accept `VITE_*` so a copied client `.env` works in Node. */
function pickEnv(primary, viteAlt, defaultValue = "") {
  const a = (process.env[primary] ?? "").trim();
  if (a) return a;
  const b = (process.env[viteAlt] ?? "").trim();
  if (b) return b;
  return defaultValue;
}

const url = pickEnv("APEXSTREAM_WS_URL", "VITE_APEXSTREAM_WS_URL", "ws://localhost:8081/v1/ws");
const apiKey = pickEnv("APEXSTREAM_API_KEY", "VITE_APEXSTREAM_API_KEY", "");
const channel = pickEnv("APEXSTREAM_METRICS_CHANNEL", "VITE_APEXSTREAM_METRICS_CHANNEL", "metrics");
// Shorter default ≈ “live”; override with APEXSTREAM_PUBLISH_INTERVAL_MS (min 80 ms).
const intervalMs = Math.max(80, Number(process.env.APEXSTREAM_PUBLISH_INTERVAL_MS ?? "300"));
const allowRaw = pickEnv("APEXSTREAM_ALLOW_INSECURE_TRANSPORT", "VITE_APEXSTREAM_ALLOW_INSECURE", "");
const allowInsecureEnv = /^(1|true|yes|on)$/i.test(allowRaw);

if (!apiKey) {
  console.error(
    "API key missing: set APEXSTREAM_API_KEY or VITE_APEXSTREAM_API_KEY in publisher/.env",
    "(publishable pk_live_… or secret sk_live_… from ApexStream dashboard).",
  );
  console.error("\nChecked file:", publisherEnvPath);
  console.error("File exists:", fs.existsSync(publisherEnvPath));
  process.exit(1);
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Bounded random walk: each tick moves a little, so charts look “live” instead of
 * jumping across the full range every publish.
 */
function walkInt(prev, stepMax, lo, hi) {
  const delta = Math.round((Math.random() * 2 - 1) * stepMax);
  return clamp(prev + delta, lo, hi);
}

/** Starting point near the middle of each band (first publish). */
let users = 1524;
let revenue = 15420;
let cpu = 44;

const client = new ApexStreamClient({
  url,
  apiKey,
  allowInsecureTransport: url.startsWith("ws://") || allowInsecureEnv,
});

let timer = null;

client.on("open", () => {
  console.error(`publisher: connected → channel "${channel}" every ${intervalMs}ms`);

  const tick = () => {
    try {
      users = walkInt(users, 14, 1495, 1548);
      revenue = walkInt(revenue, 95, 15200, 15680);
      cpu = walkInt(cpu, 3, 36, 54);
      client.publish(channel, {
        users,
        revenue,
        cpu,
        ts: new Date().toISOString(),
      });
    } catch (e) {
      console.error("publisher: publish failed:", e);
    }
  };

  tick();
  timer = setInterval(tick, intervalMs);
});

client.on("close", () => {
  if (timer) clearInterval(timer);
  timer = null;
  console.error("publisher: disconnected");
});

client.on("error", () => {
  /* logged by runtime */
});

client.connect();
