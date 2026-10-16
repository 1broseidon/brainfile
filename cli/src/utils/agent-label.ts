/**
 * An agent as a run's line names it, in the terminal and on the TUI's rows
 * (task-82): its id (`codex`, `claude`), or a person's own agent by its name
 * (`custom:Muse Code` is `Muse Code`).
 */
export function agentLabel(agentId: string): string {
  return agentId.startsWith('custom:') ? agentId.slice('custom:'.length) : agentId;
}
