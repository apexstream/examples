import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import * as LiveDash from "./useLiveMetricsDashboard";

type Props = ReturnType<typeof LiveDash.useLiveMetricsDashboard>;

/** KPI cards + live stream — presentation only; data from `useLiveMetricsDashboard`. */

export function DashboardLiveView({ channel, connected, error, latest, chartData, stream, flashClass, moneyFmt }: Props) {
  return (
    <div className="min-h-screen bg-dashboard-base bg-[radial-gradient(ellipse_at_top,_#1e293b_0%,_#070b14_55%)] pb-16 pt-10">
      <div className="mx-auto max-w-6xl px-4">
        <header className="mb-10 flex flex-col gap-3 border-b border-white/10 pb-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-400/90">ApexStream · DEMO 2</p>
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Live Dashboard <span className="text-slate-400">(B2B seller)</span>
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-400">
              Business KPIs pushed over one WebSocket — no REST polling. Charts and cards update when data arrives (here ~1s from the bundled
              publisher).
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 md:items-end">
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
                connected ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30" : "bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/25"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${connected ? "animate-pulse bg-emerald-400" : "bg-amber-400"}`} />
              {connected ? "Live · subscribed" : "Connecting…"}
            </span>
            <p className="text-[11px] text-slate-500">
              Channel <span className="font-mono text-slate-400">{channel || "metrics"}</span>
            </p>
          </div>
        </header>

        {error ? (
          <div className="mb-8 rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-100">{error}</div>
        ) : null}

        <section className="mb-6 grid gap-4 md:grid-cols-3">
          <article
            className={`rounded-2xl border border-white/10 bg-dashboard-card/90 p-5 backdrop-blur-sm transition-shadow duration-300 ${flashClass}`}
          >
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Active users</p>
            <p className="mt-2 font-mono text-4xl font-semibold tabular-nums text-white">
              {latest ? latest.users.toLocaleString() : "—"}
            </p>
            <div className="chart-glow mt-4 h-[100px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gUsers" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="i" hide />
                  <YAxis hide domain={["dataMin - 50", "dataMax + 50"]} />
                  <Tooltip
                    contentStyle={{
                      background: "#0f172a",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [Math.round(v).toLocaleString(), "users"]}
                  />
                  <Area type="monotone" dataKey="users" stroke="#38bdf8" fill="url(#gUsers)" strokeWidth={2} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article
            className={`rounded-2xl border border-white/10 bg-dashboard-card/90 p-5 backdrop-blur-sm transition-shadow duration-300 ${flashClass}`}
          >
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Revenue</p>
            <p className="mt-2 font-mono text-4xl font-semibold tabular-nums text-emerald-300">
              {latest ? moneyFmt.format(latest.revenue) : "—"}
            </p>
            <div className="chart-glow mt-4 h-[100px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="i" hide />
                  <YAxis hide domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{
                      background: "#0f172a",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [`$${(v * 1000).toLocaleString()}`, "rev"]}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#34d399" fill="url(#gRev)" strokeWidth={2} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article
            className={`rounded-2xl border border-white/10 bg-dashboard-card/90 p-5 backdrop-blur-sm transition-shadow duration-300 ${flashClass}`}
          >
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">CPU load</p>
            <p className="mt-2 font-mono text-4xl font-semibold tabular-nums text-amber-200">{latest ? `${latest.cpu}%` : "—"}</p>
            <div className="chart-glow mt-4 h-[100px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gCpu" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="i" hide />
                  <YAxis hide domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{
                      background: "#0f172a",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [`${Math.round(v)}%`, "cpu"]}
                  />
                  <Area type="monotone" dataKey="cpu" stroke="#fbbf24" fill="url(#gCpu)" strokeWidth={2} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </article>
        </section>

        <section className="rounded-2xl border border-white/10 bg-dashboard-surface/80 p-5 backdrop-blur-md">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-white">Live events stream</h2>
            <p className="text-xs text-slate-500">Updates arrive on the WebSocket — not on a timer polling your API.</p>
          </div>
          <div className="max-h-[280px] overflow-y-auto rounded-xl border border-white/5 bg-black/30 font-mono text-[13px] leading-relaxed">
            {stream.length === 0 ? (
              <p className="p-4 text-slate-500">
                Waiting for metrics on <span className="text-slate-400">{channel}</span>… Run the publisher script or your own producer.
              </p>
            ) : (
              <ul className="divide-y divide-white/5">
                {stream.map((row) => (
                  <li
                    key={row.id}
                    className={`px-4 py-2.5 transition-colors duration-500 ${
                      row.fresh ? "bg-emerald-500/10 text-emerald-100/95" : "text-slate-300"
                    }`}
                  >
                    {row.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <footer className="mt-12 border-t border-white/10 pt-8 text-center text-xs text-slate-600">
          <p className="mb-2 font-medium text-slate-500">What this sells</p>
          <ul className="mx-auto flex max-w-lg flex-col gap-1">
            <li>Replace slow dashboard polling with one realtime channel.</li>
            <li>Push BI-style metrics to sales &amp; ops as they happen.</li>
            <li>Same ApexStream pipe for alerts, presence, and product events.</li>
          </ul>
        </footer>
      </div>
    </div>
  );
}
