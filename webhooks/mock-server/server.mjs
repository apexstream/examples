#!/usr/bin/env node
/**
 * Minimal receiver for ApexStream webhook POSTs — logs headers + body to stdout (your “integration”).
 * Listen address: 0.0.0.0 so Docker-hosted API can reach host.docker.internal:PORT.
 */

import http from "node:http";

const port = Number(process.env.PORT ?? 8787);
let n = 0;

const server = http.createServer((req, res) => {
  const u = new URL(req.url ?? "/", `http://${req.headers.host}`);
  if (req.method === "GET" && u.pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok\n");
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(404);
    res.end();
    return;
  }
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    n += 1;
    const raw = Buffer.concat(chunks).toString("utf8");
    console.error(`\n━━━ webhook #${n} ${new Date().toISOString()} ━━━`);
    console.error("path:", u.pathname);
    console.error("X-Apexstream-Event:", req.headers["x-apexstream-event"]);
    console.error("X-Apexstream-Delivery-ID:", req.headers["x-apexstream-delivery-id"]);
    console.error("body:", raw.slice(0, 4000));
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true }));
  });
});

server.listen(port, "0.0.0.0", () => {
  console.error(`mock webhook receiver listening on 0.0.0.0:${port} (POST any path)`);
  console.error(
    `If Control Plane runs on another machine (e.g. 192.168.x.x), register webhook URL as http://<THIS-PC-LAN-IP>:${port}/webhook — not http://127.0.0.1 (that is loopback on the API server).`,
  );
});
