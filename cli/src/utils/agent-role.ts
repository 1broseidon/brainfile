/**
 * The role an agent's own shell carries (task-81): a session the desktop or
 * a runner starts has BRAINFILE_AGENT_ROLE (and a lead BRAINFILE_LEAD_SCOPE)
 * in its environment, as its `brainfile mcp` does, so a command it runs is
 * allowed what that server allows and no more. A person's shell has none.
 */
import { agentRoleOf, type AgentRole } from '@brainfile/core/dispatch';
import { CLIError } from './cli-error';

/** Who runs a command, from its environment: an agent's role and a lead's epic; nothing for a person. */
export function callerAccess(env: NodeJS.ProcessEnv = process.env): { role?: AgentRole; scope?: string } {
  return agentRoleOf(env);
}

/**
 * Refuses, in an agent's own shell, what would start agents inside its turn:
 * a runner (`brainfile run`, `dispatch --now`) or a discussion. The runner
 * that started the agent works the queue.
 */
export function refuseInAgent(access: { role?: AgentRole }, what: string): void {
  if (!access.role) return;
  throw new CLIError(
    `A ${access.role} cannot ${what}: an agent never starts agents inside its own turn`,
    undefined,
    'Queue the work with brainfile dispatch (or the dispatch tool); the runner that started this agent starts it',
  );
}
