import type { ExtensionContext } from '@mariozechner/pi-coding-agent';
import type { Rt } from './types';

// Guard against the race where pi.sendUserMessage() is async internally:
// ctx.isIdle() may still return true for subsequent synchronous calls
// in the same tick before the agent enters non-idle state.
let sentMessageThisTick = false;

/**
 * Send an orchestration message to the agent.
 *
 * Uses module-level `sentMessageThisTick` to prevent the race where
 * multiple synchronous calls in the same tick all see ctx.isIdle() === true.
 */
export function sendOrchestrationMessage(rt: Rt, ctx: ExtensionContext, lines: string[]): void {
  const message = ['[BRAINFILE ORCHESTRATION]', ...lines].join('\n');
  if (!sentMessageThisTick && ctx.isIdle()) {
    sentMessageThisTick = true;
    // Reset after the current synchronous execution completes so that
    // future event loop iterations can send fresh messages normally.
    setTimeout(() => {
      sentMessageThisTick = false;
    }, 0);
    rt.pi.sendUserMessage(message);
  } else {
    rt.pi.sendUserMessage(message, { deliverAs: 'followUp' });
  }
}
