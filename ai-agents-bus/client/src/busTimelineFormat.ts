/** Bus / timeline: token spam vs milestones only. Incoming token rows are hidden in milestones mode too. */
export type BusVerbosity = "milestones" | "full";

/** One-line label for timeline / ApexStream log rows (pure; safe to reuse). */
export function formatBusTimelineEntry(e: { direction: string; envelope: Record<string, unknown> }): string {
  const t = typeof e.envelope.type === "string" ? e.envelope.type : "?";
  if (t === "bus.user") {
    return `User task: ${String(e.envelope.text ?? "")}`;
  }
  if (t === "bus.agent_a" || t === "bus.agent_b") {
    const phase = String(e.envelope.phase ?? "");
    const agent = t === "bus.agent_a" ? "A" : "B";
    const tx = typeof e.envelope.text === "string" ? e.envelope.text : "";
    if (phase === "token") {
      return `Agent ${agent} chunk: ${tx.length > 120 ? `${tx.slice(0, 120)}…` : tx}`;
    }
    if (phase === "done") {
      return tx.trim() ? `Agent ${agent} done` : `Agent ${agent} done (empty)`;
    }
    if (phase === "error") {
      return `Agent ${agent} error: ${tx || "unknown"}`;
    }
    return `Agent ${agent} ${phase}`;
  }
  return JSON.stringify(e.envelope).slice(0, 200);
}
