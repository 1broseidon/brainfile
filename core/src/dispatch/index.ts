/**
 * `@brainfile/core/dispatch` — starting the person's own coding agents over
 * the Agent Client Protocol (decision-18): the agents Brainfile knows and how
 * each starts, custom agents and the ACP registry, the dispatch settings and
 * model cache in the data folder, sessions and their turns, permissions as
 * policy, and a hand-off's brief. Node only; spawns agents and loads
 * `@agentclientprotocol/sdk` when a session opens. Not re-exported from the
 * main or browser entry points.
 *
 * @packageDocumentation
 */
export * from './types';
export * from './agentServers';
export * from './custom';
export * from './registry';
export * from './settings';
export * from './effort';
export * from './models';
export * from './startup';
export * from './agents';
export * from './session';
export * from './brief';
