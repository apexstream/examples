import { WebhooksWorkflow } from "./WebhooksWorkflow";

export default function App() {
  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <p className="text-xs font-semibold uppercase tracking-widest text-violet-400">ApexStream · DEMO 3</p>
      <h1 className="mt-2 text-2xl font-semibold text-white">Webhooks + Events</h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-400">
        Publish on a channel → gateway durable ingest → Control Plane queues <span className="text-zinc-300">channel.message</span> to your HTTP
        endpoint. This is the integration surface businesses pay for.
      </p>

      <WebhooksWorkflow />
    </div>
  );
}
