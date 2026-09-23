/**
 * Who acts on the board: an explicit --agent / BRAINFILE_AGENT, else the
 * nearest agent CLI among the process's ancestors, else an agent's
 * environment fingerprint, else the git user.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { agentFromEnvironment, agentFromProcessTree, detectAgent } from '../utils/actor';

describe('actor detection', () => {
  describe('explicit names', () => {
    it('--agent wins over BRAINFILE_AGENT, and both win over detection', () => {
      const env = { BRAINFILE_AGENT: 'env-agent', CLAUDECODE: '1' };
      expect(detectAgent(['node', 'cli', 'note', '--agent', 'flag-agent'], env)).toEqual({ name: 'flag-agent', source: 'flag' });
      expect(detectAgent(['node', 'cli', 'note', '--agent=inline'], env)).toEqual({ name: 'inline', source: 'flag' });
      expect(detectAgent(['node', 'cli', 'note'], env)).toEqual({ name: 'env-agent', source: 'env' });
    });

    it('BRAINFILE_DETECT_AGENT=off keeps only explicit names', () => {
      expect(detectAgent(['node', 'cli'], { CLAUDECODE: '1', BRAINFILE_DETECT_AGENT: 'off' })).toBeNull();
      expect(detectAgent(['node', 'cli'], { BRAINFILE_AGENT: 'codex', BRAINFILE_DETECT_AGENT: 'off' })).toEqual({ name: 'codex', source: 'env' });
    });

    it('strips characters that would break a [name] tag', () => {
      expect(detectAgent(['node', 'cli', '--agent', 'co[dex]'], {})?.name).toBe('codex');
    });
  });

  describe('environment fingerprints', () => {
    it('recognizes the variables Claude Code and Codex set', () => {
      expect(agentFromEnvironment({ CLAUDECODE: '1' })).toBe('claude');
      expect(agentFromEnvironment({ CODEX_THREAD_ID: 'x' })).toBe('codex');
      expect(agentFromEnvironment({ AI_AGENT: 'claude-code_2-1-280_agent' })).toBe('claude');
      expect(agentFromEnvironment({})).toBeNull();
    });

    it('prefers Codex when it inherited a parent Claude session', () => {
      expect(agentFromEnvironment({ CLAUDECODE: '1', AI_AGENT: 'claude-code_x', CODEX_THREAD_ID: 'x' })).toBe('codex');
    });

    it('does not mistake a Codex plugin inside Claude for Codex', () => {
      expect(agentFromEnvironment({ CLAUDECODE: '1', CODEX_COMPANION_SESSION_ID: 'x' })).toBe('claude');
    });
  });

  const posix = process.platform === 'win32' ? describe.skip : describe;
  posix('process tree', () => {
    let dir: string;
    let parent: ChildProcess | null = null;

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-actor-'));
    });

    afterEach(() => {
      parent?.kill('SIGKILL');
      parent = null;
      spawnSync('pkill', ['-f', dir]);
      fs.rmSync(dir, { recursive: true, force: true });
    });

    /** Start `<dir>/<name>` (a script that runs `sleep`) and return the sleep's pid. */
    function childOf(name: string): number {
      const script = path.join(dir, name);
      fs.writeFileSync(script, '#!/bin/sh\nsleep 30\n', { mode: 0o755 });
      parent = spawn(script, [], { stdio: 'ignore' });
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const r = spawnSync('pgrep', ['-P', String(parent.pid)], { encoding: 'utf-8' });
        const pid = Number.parseInt(r.stdout.trim().split('\n')[0] ?? '', 10);
        if (Number.isFinite(pid) && pid > 0) return pid;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
      }
      throw new Error(`no child under ${name}`);
    }

    it('finds the nearest agent CLI above a command', () => {
      expect(agentFromProcessTree(childOf('codex'))).toBe('codex');
    });

    it('maps cursor-agent to cursor', () => {
      expect(agentFromProcessTree(childOf('cursor-agent'))).toBe('cursor');
    });

    it('ignores desktop apps that also host the person\'s own terminals', () => {
      const found = agentFromProcessTree(childOf('claude-desktop'));
      // Whatever runs this suite may itself be an agent; the app never is.
      expect(found).not.toBe('claude-desktop');
      expect(found === null || found === agentFromProcessTree()).toBe(true);
    });
  });
});
