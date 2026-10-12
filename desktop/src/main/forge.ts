/**
 * Which forge a project's code lives on, read from its origin remote (task-26),
 * so the window can show that forge's issues beside the board. Only GitHub is
 * known for now; another forge (GitLab, Gitea, …) is one more entry in FORGES.
 * The parsing is pure, so plain `node --test` runs it.
 */
import { execFile } from 'child_process';
import type { ForgeRepo } from '../shared/api';

interface Forge {
  /** The repository at `path` on `host`, when this forge hosts it. */
  match(host: string, path: string): ForgeRepo | null;
}

const GITHUB: Forge = {
  match(host, path) {
    if (host.toLowerCase() !== 'github.com') return null;
    const parts = path.split('/').filter(Boolean);
    if (parts.length !== 2) return null;
    const [owner, name] = parts;
    return { forge: 'github', host: 'github.com', owner, name, url: `https://github.com/${owner}/${name}` };
  },
};

const FORGES: Forge[] = [GITHUB];

/**
 * A remote's host and repository path, from any of git's URL forms:
 * `https://[user@]host/owner/name.git`, `ssh://git@host[:port]/owner/name`,
 * `git://host/owner/name`, or scp-like `git@host:owner/name.git`.
 */
export function parseRemoteUrl(remote: string): { host: string; path: string } | null {
  const url = remote.trim();
  if (!url) return null;
  let host: string;
  let path: string;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (!['https:', 'http:', 'ssh:', 'git:', 'git+ssh:', 'ssh+git:'].includes(parsed.protocol)) return null;
    host = parsed.hostname;
    path = decodeURIComponent(parsed.pathname);
  } else {
    // scp-like: [user@]host:path. A Windows drive or a local path is not a remote.
    const scp = /^(?:[^@/\s]+@)?([^:/\s]+):(.+)$/.exec(url);
    if (!scp || scp[1].length < 2) return null;
    host = scp[1];
    path = scp[2];
  }
  path = path.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\.git$/, '');
  return host && path ? { host, path } : null;
}

/** The forge repository a remote URL points at, or null when it is none the window knows. */
export function forgeFromRemote(remote: string): ForgeRepo | null {
  const parsed = parseRemoteUrl(remote);
  if (!parsed) return null;
  for (const forge of FORGES) {
    const repo = forge.match(parsed.host, parsed.path);
    if (repo) return repo;
  }
  return null;
}

/** The folder's origin URL, or null when it has none (or is not a repository). */
function originUrl(folder: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('git', ['-C', folder, 'remote', 'get-url', 'origin'], { timeout: 4000 }, (err, stdout) => {
      resolve(err ? null : stdout.trim() || null);
    });
  });
}

/** How long a project's remote is trusted before git is asked again. */
const REMOTE_TTL_MS = 30_000;
const remotes = new Map<string, { at: number; repo: ForgeRepo | null }>();

/** The forge repository a project's origin points at. */
export async function detectForge(folder: string): Promise<ForgeRepo | null> {
  const cached = remotes.get(folder);
  if (cached && Date.now() - cached.at < REMOTE_TTL_MS) return cached.repo;
  const url = await originUrl(folder);
  const repo = url ? forgeFromRemote(url) : null;
  remotes.set(folder, { at: Date.now(), repo });
  return repo;
}
