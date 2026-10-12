/**
 * The lean entry for `brainfile hooks session-start` (spec-11).
 *
 * `dist/cli.js` runs this bundle instead of the full CLI for exactly that
 * command, so an agent's session start pays for core and the brief, not for
 * commander, the MCP server or the TUI. See `hooks/session-start.ts`.
 */
import { runSessionStartHook } from './hooks/session-start';

runSessionStartHook().catch(() => {
  // A hook never fails a session.
});
