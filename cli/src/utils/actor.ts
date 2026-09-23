/**
 * Who is acting on the board. Board commits are always authored by the git
 * user; the actor is what the board itself records: the `[name]` on a note
 * and the `[name]` suffix on a board commit message.
 *
 *   1. `--agent <name>` or `BRAINFILE_AGENT`, when the agent says who it is
 *   2. the nearest agent CLI among this process's ancestors (claude, codex, …)
 *   3. an agent's environment fingerprint (for sandboxes that hide the
 *      process tree, like Codex's)
 *   4. the git user
 *
 * `BRAINFILE_DETECT_AGENT=off` turns off 2 and 3.
 *
 * Only agent command-line tools count. Desktop apps and editors (the Claude
 * app, Cursor, VS Code) also host the person's own terminals, so a command
 * under them is the person's.
 */
import * as fs from 'fs';
import { spawnSync } from 'child_process';
import { git } from './board-repo';

export type ActorSource = 'flag' | 'env' | 'process' | 'fingerprint' | 'git';

export interface Actor {
  name: string;
  source: ActorSource;
}

/** Executable name → the name recorded on the board. */
const AGENT_BINARIES: Record<string, string> = {
  claude: 'claude',
  codex: 'codex',
  'cursor-agent': 'cursor',
  gemini: 'gemini',
  opencode: 'opencode',
  goose: 'goose',
  droid: 'droid',
  crush: 'crush',
  aider: 'aider',
  cline: 'cline',
  amp: 'amp',
  qwen: 'qwen',
  copilot: 'copilot',
};

const MAX_DEPTH = 32;

function sanitize(name: string): string {
  return name.replace(/[[\]<>\r\n]/g, '').trim();
}

function agentFromCommand(words: string[]): string | null {
  // A native binary shows as argv[0]; a node/python-wrapped CLI as argv[1].
  for (const word of words.slice(0, 2)) {
    const base = word.split('/').pop()?.replace(/\.(c|m)?js$/, '') ?? '';
    if (AGENT_BINARIES[base]) return AGENT_BINARIES[base];
  }
  return null;
}

interface ProcInfo {
  ppid: number;
  words: string[];
}

function linuxProc(pid: number): ProcInfo | null {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf-8');
    // The command name is in parentheses and may contain spaces.
    const ppid = Number.parseInt(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1], 10);
    const comm = stat.slice(stat.indexOf('(') + 1, stat.lastIndexOf(')'));
    const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf-8').split('\0').filter(Boolean);
    return { ppid, words: [comm, ...cmdline] };
  } catch {
    return null;
  }
}

function psTable(): Map<number, ProcInfo> | null {
  const r = spawnSync('ps', ['-A', '-o', 'pid=,ppid=,args='], { encoding: 'utf-8', timeout: 2000 });
  if (r.status !== 0 || !r.stdout) return null;
  const table = new Map<number, ProcInfo>();
  for (const line of r.stdout.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (m) table.set(Number(m[1]), { ppid: Number(m[2]), words: m[3].split(/\s+/) });
  }
  return table;
}

/** The nearest agent CLI among this process's ancestors, or null. */
export function agentFromProcessTree(startPid: number = process.ppid): string | null {
  const useProc = process.platform === 'linux' && fs.existsSync('/proc/self/stat');
  const table = useProc ? null : process.platform === 'win32' ? null : psTable();
  if (!useProc && !table) return null;
  let pid = startPid;
  for (let depth = 0; depth < MAX_DEPTH && pid > 1; depth++) {
    const info = useProc ? linuxProc(pid) : table?.get(pid) ?? null;
    if (!info) return null;
    const agent = agentFromCommand(info.words);
    if (agent) return agent;
    pid = info.ppid;
  }
  return null;
}

/**
 * Environment variables agents set for the commands they run. Specific
 * markers only: a Claude session can carry `CODEX_COMPANION_*` from a plugin,
 * so a loose `CODEX_` prefix would misattribute it. Codex comes first because
 * its sandbox hides the process tree while inheriting a parent Claude's
 * variables when it was started from one.
 */
export function agentFromEnvironment(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.CODEX_THREAD_ID || env.CODEX_SESSION_ID) return 'codex';
  if (env.GEMINI_CLI === '1') return 'gemini';
  if (env.CLAUDECODE === '1') return 'claude';
  // A shared convention some agents follow, e.g. `claude-code_2-1-280_agent`.
  const generic = env.AI_AGENT?.split('_')[0];
  if (generic) return generic === 'claude-code' ? 'claude' : sanitize(generic) || null;
  return null;
}

function flagValue(argv: string[]): string | null {
  const at = argv.indexOf('--agent');
  if (at >= 0 && argv[at + 1] && !argv[at + 1].startsWith('-')) return argv[at + 1];
  const inline = argv.find((a) => a.startsWith('--agent='));
  return inline ? inline.slice('--agent='.length) : null;
}

let detected: { value: string | null } | null = null;

/** The agent running this process, when one can be told; never the git user. */
export function detectAgent(argv: string[] = process.argv, env: NodeJS.ProcessEnv = process.env): Actor | null {
  const flag = sanitize(flagValue(argv) ?? '');
  if (flag) return { name: flag, source: 'flag' };
  const named = sanitize(env.BRAINFILE_AGENT ?? '');
  if (named) return { name: named, source: 'env' };
  // `BRAINFILE_DETECT_AGENT=off` keeps only explicit names (the test runner
  // sets it, so running the suite inside an agent does not change results).
  if (env.BRAINFILE_DETECT_AGENT === 'off') return null;
  if (!detected) {
    let value: string | null = null;
    try {
      value = agentFromProcessTree();
    } catch {
      value = null;
    }
    detected = { value };
  }
  if (detected.value) return { name: detected.value, source: 'process' };
  const fingerprint = agentFromEnvironment(env);
  return fingerprint ? { name: fingerprint, source: 'fingerprint' } : null;
}

/** The agent, else the git user (`user.name`) for `cwd`, else null. */
export function resolveActor(cwd: string = process.cwd(), argv: string[] = process.argv): Actor | null {
  const agent = detectAgent(argv);
  if (agent) return agent;
  const user = sanitize(git(['config', '--get', 'user.name'], cwd).stdout);
  return user ? { name: user, source: 'git' } : null;
}

/** For tests: forget the cached process-tree answer. */
export function resetActorCache(): void {
  detected = null;
}
