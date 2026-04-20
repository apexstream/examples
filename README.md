# Examples

End-to-end **demos** in this folder: each has its own `README` with run steps, env vars, and edge cases (Docker, LAN, `host.docker.internal`).

| # | Demo | Folder | Port (default) | One-line |
|---|------|--------|----------------|----------|
| **1** | Realtime Chat | [`chat/`](./chat/README.md) | `5173` | Room-based pub/sub, presence, optional **durable replay** / **reliable messaging** (extended realtime) |
| **2** | Live Dashboard (B2B) | [`dashboard/`](./dashboard/README.md) | `5174` | KPIs + charts + event stream over **one WebSocket** (no HTTP polling for numbers) |
| **3** | Webhooks + Events | [`webhooks/`](./webhooks/README.md) | `5175` | **Publish** → durable ingest → **signed HTTP POST** to a URL you control (mock server + External API) |
| **4** | Presence + Live Cursors | [`presence-cursors/`](./presence-cursors/README.md) | `5176` | Shared room: **live cursor positions** + **who’s online** — collaboration / SaaS “wow” demo |
| **5** | Admin Dashboard / Analytics | [`admin-analytics/`](./admin-analytics/README.md) | `5177` | **Operator** view: gateway workers + operational snapshots via **External API** — ops + **enterprise** |
| **6** | AI Agents Realtime Bus | [`ai-agents-bus/`](./ai-agents-bus/README.md) | `5178` | **Ollama** → Agent A stream → optional Agent B + **live bus** UI — **AI infra** narrative |

---

## What to use in a story

| You are showing… | Use |
|------------------|-----|
| “**Live product**” — chat, presence, low-latency UI | **1 — Chat** |
| “**No dashboard polling**” / **ops or revenue metrics** in real time | **2 — Dashboard** + its `publisher/` |
| “**Integrations** / **revenue from enterprise**” — we call *their* systems | **3 — Webhooks** (this is the “we connect to Salesforce/Slack/your ERP” pitch) |
| “**Collaboration**” / **live multiplayer UI** — cursors, awareness, SaaS wow | **4 — Presence + Live Cursors** — [`presence-cursors/README.md`](./presence-cursors/README.md) |
| “**How do we run it?**” — ops visibility, connections, errors, enterprise procurement | **5 — Admin Dashboard / Analytics** — [`admin-analytics/README.md`](./admin-analytics/README.md) |
| “**AI agents**” / **orchestration** / **event bus** — trendy infra story | **6 — AI Agents Realtime Bus** — [`ai-agents-bus/README.md`](./ai-agents-bus/README.md) |

Demos **1–6** ship runnable clients under `examples/` (each folder’s `README` + `client/` where applicable). Demos **1–2** and **4** use dashboard-issued keys on **`/v1/ws`**; **5** uses **`VITE_EXTERNAL_API_KEY`** (same as **`APEXSTREAM_EXTERNAL_API_KEY`** on the API). **Demo 3** also uses that key to **register** webhooks over `POST /external/v1/webhooks`.

---

## Shared setup (all demos)

1. Run ApexStream (API + gateway) using **your** deployment (Docker Compose, Kubernetes, a local helper script, etc.).
2. In the **ApexStream dashboard**: create org → project → app → **issue a key**; use that key in the example’s `.env` (and the right `VITE_APEXSTREAM_WS_URL` / `APEXSTREAM_WS_URL`).

**JavaScript SDK:** each demo ships its own `package.json` under `examples/<demo>/client` (and `publisher` for the dashboard). From those folders run **`npm install`** — the **`apexstream`** dependency resolves from **npm** (`^1.0.5`).

**Never commit real keys** — only `.env.example` in git; keep secrets in local `.env` / `.env.local`.

---

## Extra prerequisites by demo (read the per-demo README)

| Demo | In addition to “shared setup” |
|------|--------------------------------|
| **1 — Chat** | Optional: extended realtime for replay / reliable toggles; see [`chat/README.md`](./chat/README.md) |
| **2 — Dashboard** | Run `examples/dashboard/publisher` (or your own producer) to push metrics; same key as the client where possible |
| **3 — Webhooks** | **Extended realtime** on **API + gateway**; API must have **`APEXSTREAM_EXTERNAL_API_KEY`**; run the **mock HTTP server** in `webhooks/mock-server/`; webhook URL must be **reachable from the API** (use `http://host.docker.internal:…` if the API is in Docker) — see [`webhooks/README.md`](./webhooks/README.md) |
| **4 — Presence + Live Cursors** | Same gateway + API key pattern as Demo 1 — see [`presence-cursors/README.md`](./presence-cursors/README.md) |
| **5 — Admin Dashboard / Analytics** | **`APEXSTREAM_EXTERNAL_API_KEY`** + ops worker scraping gateways — see [`admin-analytics/README.md`](./admin-analytics/README.md) |
| **6 — AI Agents Realtime Bus** | **Ollama** on the dev machine (`ollama serve`); Vite proxies `/api/ollama` in dev — see [`ai-agents-bus/README.md`](./ai-agents-bus/README.md) |

---

## Layout (where things live)

```
examples/
  README.md           ← you are here
  chat/               # Demo 1 (+ docker-compose.yml)
  dashboard/          # Demo 2 (client + publisher + docker-compose.yml)
  webhooks/           # Demo 3 (client + mock-server + docker-compose.yml)
  presence-cursors/   # Demo 4 (client + docker-compose.yml)
  admin-analytics/    # Demo 5 (client + docker-compose.yml)
  ai-agents-bus/      # Demo 6 (client + docker-compose.yml; Ollama on host)
```

Optional **`docker-compose.yml`** next to each demo mounts only that demo’s **`client/`** (and **`publisher/`** / **`mock-server`** where relevant), runs **`npm ci`** into a named volume for `node_modules`, then **`npm run dev`**. Same layout works from a standalone copy of the demo folder (needs **`package-lock.json`** in **`client/`** — use **`npm install`** instead of **`npm ci`** only if you have no lockfile).

**Docker notes:** demos that proxy the Control Plane (**admin-analytics**, **webhooks**) may need **`VITE_CONTROL_PLANE_PROXY_TARGET=http://host.docker.internal:8080`** in **`client/.env`** when the API runs on the host. **AI agents** compose sets **`OLLAMA_PROXY_TARGET`** so Vite’s **`/api/ollama`** proxy reaches Ollama on the host.
