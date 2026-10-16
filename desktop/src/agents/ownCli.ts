/**
 * The app's own command line (the brainfile CLI built from this repository),
 * for the agents it starts: their board server is `brainfile mcp` run from
 * it, and `brainfile …` in their shell reaches it through a shim first on
 * their PATH. Never the `brainfile` installed on the Mac, which may be older
 * (without dispatch, its status or the lead's tools) or missing, so the
 * chat's hand-offs and an epic's lead do not depend on what is installed.
 *
 * It is run by the app's own Electron binary as node (ELECTRON_RUN_AS_NODE),
 * so it needs no node on the Mac. A packaged app ships it beside app.asar
 * (Resources/cli, package.json's extraResources): the CLI reads its
 * package.json and schemas from beside itself, so it is kept whole as real
 * files. In development it is the repository's own `cli/dist`. Main finds
 * it (appCliPath) and the agents process hands it to core (useBrainfile).
 */
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { BrainfileLaunch, OwnBrainfile } from '@brainfile/core/dispatch';

/** Where main says the app's CLI is (cli/dist/cli.js). */
export const APP_CLI_ENV = 'BRAINFILE_APP_CLI';
/** The app's own binary, which runs it as node; main passes it, the agents process being a helper. */
export const ELECTRON_BIN_ENV = 'BRAINFILE_ELECTRON_BIN';

/** Where the app's CLI is: shipped in the app's Resources, or the repository's own build beside the desktop's folder. */
export function appCliPath(app: { packaged: boolean; resourcesPath: string; appPath: string }): string {
  return app.packaged ? path.join(app.resourcesPath, 'cli', 'dist', 'cli.js') : path.join(app.appPath, '..', 'cli', 'dist', 'cli.js');
}

/** The app's CLI as its agents run it: the app's binary as node, the CLI's own file. */
export function appCliLaunch(electron: string, cli: string): BrainfileLaunch {
  return { command: electron, args: [cli], env: { ELECTRON_RUN_AS_NODE: '1' } };
}

const quoted = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** A `brainfile` for a shell: runs the launch with what it was given. */
export function shimScript(launch: BrainfileLaunch): string {
  const env = Object.entries(launch.env ?? {}).map(([name, value]) => `${name}=${quoted(value)} `).join('');
  return `#!/bin/sh\n# Brainfile's own command line, as the app runs it for its agents (written by the app).\n${env}exec ${[launch.command, ...launch.args].map(quoted).join(' ')} "$@"\n`;
}

/**
 * Writes the shim into a folder of its own under `dir`, named for what it
 * runs, so a development build and the installed app, which share a data
 * folder, never write over each other's. Returns the folder.
 */
export function writeShim(dir: string, launch: BrainfileLaunch): string {
  const script = shimScript(launch);
  const folder = path.join(dir, createHash('sha1').update(script).digest('hex').slice(0, 12));
  const file = path.join(folder, 'brainfile');
  let current: string | null = null;
  try {
    current = fs.readFileSync(file, 'utf-8');
  } catch {
    /* not written yet */
  }
  if (current !== script) {
    fs.mkdirSync(folder, { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, script, { mode: 0o755 });
    fs.renameSync(temp, file);
  }
  return folder;
}

/**
 * The app's own brainfile for its agents, from what main passed: the launch
 * and the shim's folder (under the data folder's bin/); or, when it cannot
 * be had, why, which fails the session that would have the board with it,
 * so the window says so rather than give the agent an older one or none.
 */
export function appBrainfile(env: NodeJS.ProcessEnv, dataDir: string): OwnBrainfile {
  const cli = env[APP_CLI_ENV];
  const electron = env[ELECTRON_BIN_ENV];
  if (!cli || !electron) return "Brainfile's own command line was not handed to its agents process: quit Brainfile and open it again";
  if (!fs.existsSync(cli)) {
    const fix = cli.includes(`.app${path.sep}Contents${path.sep}Resources${path.sep}`) ? 'install Brainfile again' : 'build it with `npm run build` at the repository’s root';
    return `Brainfile's own command line is not at ${cli}: ${fix}`;
  }
  const launch = appCliLaunch(electron, cli);
  try {
    return { launch, shim: writeShim(path.join(dataDir, 'bin'), launch) };
  } catch (err) {
    // The board server needs no shim: only `brainfile` in an agent's shell goes without it.
    console.error(`Could not write the brainfile shim: ${err instanceof Error ? err.message : String(err)}`);
    return { launch };
  }
}
