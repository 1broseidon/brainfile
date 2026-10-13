import { spawnSync } from 'child_process';

const MARKER = '__BRAINFILE_PATH__';

/**
 * PATH as the user's login shell sets it, merged ahead of `current`. Falls
 * back to `current` plus the usual Homebrew and npm locations when the shell
 * cannot be asked.
 */
export function loginShellPath(current: string): string {
  if (process.platform === 'win32') return current;
  const shell = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/sh');
  let fromShell = '';
  try {
    const r = spawnSync(shell, ['-ilc', `printf '${MARKER}%s${MARKER}' "$PATH"`], {
      encoding: 'utf-8',
      timeout: 4000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const match = new RegExp(`${MARKER}(.*)${MARKER}`).exec(r.stdout ?? '');
    fromShell = match?.[1] ?? '';
  } catch {
    /* fall back below */
  }
  const fallback = ['/opt/homebrew/bin', '/usr/local/bin'];
  const parts = [...fromShell.split(':'), ...current.split(':'), ...fallback].filter(Boolean);
  return [...new Set(parts)].join(':');
}
