/**
 * A session over the real SDK against a fake agent that refuses: one that
 * answers initialize and then throws from newSession (not logged in, say) is
 * killed rather than left running with no session to answer for it, what was
 * set up for it is let go once, and the failure says why.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { open, type Session } from '../dispatch/session';

// The SDK is ESM only: loaded through node's own require (jest's cannot), as the agents process loads it.
const nodeRequire = (process as unknown as { getBuiltinModule(id: 'module'): typeof import('module') }).getBuiltinModule('module').createRequire(__filename);
jest.mock('@agentclientprotocol/sdk', () => nodeRequire('@agentclientprotocol/sdk'));

jest.setTimeout(30_000);

const SDK = pathToFileURL(nodeRequire.resolve('@agentclientprotocol/sdk')).href;

/** An agent that starts, says its pid, refuses every session, and stays up as a real agent server does. */
const REFUSING_AGENT = `
import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from ${JSON.stringify(SDK)};
import { Readable, Writable } from 'node:stream';
import fs from 'node:fs';
fs.writeFileSync(process.env.PID_FILE, String(process.pid));
new AgentSideConnection((conn) => ({
  async initialize() { return { protocolVersion: PROTOCOL_VERSION, agentCapabilities: {} }; },
  async newSession() { throw new Error('not logged in'); },
  async authenticate() { return {}; },
  async prompt() { return { stopReason: 'end_turn' }; },
  async cancel() {},
}), ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)));
setInterval(() => {}, 1000);
`;

let base: string;

beforeEach(() => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bf-session-')));
});

afterEach(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

/** Whether a process is still there (a zombie counts until it is reaped). */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function until(what: string, check: () => boolean, ms = 10_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

test('an agent that refuses a session is killed, let go of once, and the failure says why', async () => {
  const dataDir = path.join(base, 'data');
  fs.mkdirSync(dataDir);
  const agent = path.join(base, 'agent.mjs');
  fs.writeFileSync(agent, REFUSING_AGENT);
  const pidFile = path.join(base, 'pid');
  fs.writeFileSync(path.join(dataDir, 'dispatch.json'), JSON.stringify({ agentServers: { Fake: { command: process.execPath, args: [agent], env: { PID_FILE: pidFile } } } }));
  const sessions = new Map<string, Session>();
  let released = 0;
  const ctx = { dataDir, sessions, update: () => {}, ask: async () => null };
  await expect(open(ctx, base, 'custom:Fake', 'k1', undefined, { board: false, release: () => released++ })).rejects.toThrow('Fake did not start: Internal error: not logged in');
  const pid = Number(fs.readFileSync(pidFile, 'utf-8'));
  expect(pid).toBeGreaterThan(0);
  await until('the agent to be gone', () => !alive(pid));
  expect(sessions.size).toBe(0);
  // Once, however many ways the agent's going is heard of (the failure, then its exit).
  await new Promise((r) => setTimeout(r, 200));
  expect(released).toBe(1);
});
