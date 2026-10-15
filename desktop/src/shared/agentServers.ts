/**
 * Custom agents (task-47), as dispatch keeps them: core's own module
 * (@brainfile/core/dispatch). The window takes it from core's source, since
 * it cannot load core's node build; it is pure, so the agents process, the
 * window and plain `node --test` share it.
 */
export * from '../../../core/src/dispatch/agentServers.ts';
