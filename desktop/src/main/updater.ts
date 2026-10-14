/**
 * Updates (task-71), after Hotline's (crates/hotline-app/src/updater.rs):
 * checked a little after launch and every six hours, the answer cached so
 * the badge shows before the network does; installed in place, the restart
 * waiting while agents are at work.
 *
 * Electron's own updater needs an Apple-signed app and its feed, so the app
 * does it itself. Each desktop release (a `desktop-v*` tag; the repository's
 * other releases are the CLI's) carries `brainfile-desktop.json`, the
 * version, its notes and each Mac's zip with its sha256 and size, signed
 * with Brainfile's Ed25519 key in `brainfile-desktop.json.sig`. The app
 * trusts a manifest only under the public key it was built with, and a zip
 * only when its sha256 is the manifest's. The zip is unpacked with ditto,
 * its version and code signature checked, and the bundle swapped in place:
 * the old one set aside (gone on the next launch), the new one where it
 * stood, and the app relaunched from the same path.
 *
 * Nothing here touches Electron: main passes in what it needs, so it is
 * tested on its own.
 */
import { spawn } from 'child_process';
import { createHash, createPublicKey, verify } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { UpdatePhase, UpdateStatus } from '../shared/api';

/** Where desktop releases are listed. */
export const RELEASES_URL = 'https://api.github.com/repos/1broseidon/brainfile/releases?per_page=30';
export const MANIFEST = 'brainfile-desktop.json';
const TAG = /^desktop-v(\d+\.\d+\.\d+)$/;
/** The first check, a little after launch, then every six hours. */
export const FIRST_CHECK_MS = 20_000;
export const INTERVAL_MS = 6 * 60 * 60_000;
const MAX_NOTES = 16_000;

export interface Asset {
  url: string;
  sha256: string;
  size: number;
}

export interface Manifest {
  version: string;
  notes: string;
  /** By `<platform>-<arch>`: `darwin-arm64`, `darwin-x64`. */
  assets: Record<string, Asset>;
}

/** x.y.z as numbers; anything else is not a version. */
function parts(version: string): number[] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Whether `candidate` is a later version than `current`. */
export function isNewer(current: string, candidate: string): boolean {
  const a = parts(current);
  const b = parts(candidate);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return b[i] > a[i];
  return false;
}

interface ReleaseLike {
  tag_name: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: { name: string; browser_download_url: string }[];
}

/** The newest published desktop release later than `current`, with its manifest and signature; null when there is none. */
export function pickRelease(releases: ReleaseLike[], current: string): { version: string; manifest: string; signature: string } | null {
  let best: { version: string; manifest: string; signature: string } | null = null;
  for (const r of releases) {
    const version = TAG.exec(r.tag_name)?.[1];
    if (!version || r.draft || r.prerelease || !isNewer(current, version)) continue;
    if (best && !isNewer(best.version, version)) continue;
    const manifest = r.assets?.find((a) => a.name === MANIFEST)?.browser_download_url;
    const signature = r.assets?.find((a) => a.name === `${MANIFEST}.sig`)?.browser_download_url;
    if (manifest && signature) best = { version, manifest, signature };
  }
  return best;
}

/**
 * The manifest, when its signature is good under `publicKeyPem` and it says
 * what it should; throws otherwise. The signature is over the bytes as
 * published, so nothing is re-encoded before it is checked.
 */
export function verifyManifest(bytes: Buffer, signature: string, publicKeyPem: string): Manifest {
  const key = createPublicKey(publicKeyPem);
  let ok = false;
  try {
    ok = verify(null, bytes, key, Buffer.from(signature.trim(), 'base64'));
  } catch {
    ok = false;
  }
  if (!ok) throw new Error('The update is not signed by Brainfile');
  const data = JSON.parse(bytes.toString('utf-8')) as Partial<Manifest>;
  if (typeof data.version !== 'string' || !parts(data.version) || !data.assets || typeof data.assets !== 'object') throw new Error('The update says nothing usable');
  for (const asset of Object.values(data.assets)) {
    if (!asset || !/^https:\/\//.test(asset.url) || !/^[a-f0-9]{64}$/.test(asset.sha256) || !(asset.size > 0)) throw new Error('The update says nothing usable');
  }
  return { version: data.version, notes: String(data.notes ?? '').slice(0, MAX_NOTES), assets: data.assets };
}

/** The bundle a packaged app runs from: `…/Brainfile.app` above `Contents/MacOS/Brainfile`; null when it is not one. */
export function bundleOf(exe: string): string | null {
  const bundle = path.resolve(exe, '..', '..', '..');
  return bundle.endsWith('.app') && path.basename(path.dirname(exe)) === 'MacOS' ? bundle : null;
}

/** Runs a command; its output when it succeeds, else throws with what it said. */
export function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (c: Buffer) => (out += c.toString()));
    child.stderr.on('data', (c: Buffer) => (err += c.toString()));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(`${command} failed: ${(err || out).trim().split('\n').pop()}`))));
  });
}

export interface UpdaterDeps {
  current: string;
  /** `darwin-arm64`, as the manifest names it. */
  target: string;
  /** The running bundle; null when the app is not one (a dev run). */
  bundle: string | null;
  /** Where the cache and downloads live. */
  dataDir: string;
  publicKey: string;
  fetch: typeof fetch;
  /** How many agents are at work: the restart waits for none. */
  busy: () => Promise<number>;
  /** Start the app again from the same path and quit this one. */
  relaunch: () => void;
  onChange: (status: UpdateStatus) => void;
  now?: () => number;
  /** Why this app does not update itself (a dev run); it still says a preview's version. */
  disabledReason?: string;
  /** Development aid: a version that pretends to be out. */
  preview?: string;
  releasesUrl?: string;
  run?: typeof run;
}

interface Cache {
  current: string;
  checkedAt: number;
  available: UpdateStatus['available'];
  /** Where the manifest was, to install without listing the releases again. */
  manifest?: { url: string; signature: string };
}

export class Updater {
  private status: UpdateStatus;
  private abort: AbortController | null = null;
  private manifestAt: { url: string; signature: string } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private restartNow = false;
  private readonly cacheFile: string;
  private readonly run: typeof run;
  private readonly deps: UpdaterDeps;

  constructor(deps: UpdaterDeps) {
    this.deps = deps;
    this.cacheFile = path.join(deps.dataDir, 'update.json');
    this.run = deps.run ?? run;
    const cached = this.readCache();
    this.status = {
      current: deps.current,
      available: deps.preview ? { version: deps.preview, notes: 'A preview: nothing will be installed.' } : (cached?.available ?? null),
      checkedAt: cached?.checkedAt ?? null,
      phase: 'idle',
      downloaded: 0,
      total: null,
      error: null,
      disabledReason: deps.disabledReason ?? null,
      waitingFor: 0,
    };
    this.manifestAt = cached?.manifest ?? null;
  }

  view(): UpdateStatus {
    return { ...this.status };
  }

  /** Checks a little after launch, then every six hours, unless this app does not update itself. */
  start(): void {
    this.cleanUp();
    if (this.status.disabledReason) return;
    const next = (ms: number) => {
      this.timer = setTimeout(() => {
        void this.check().finally(() => next(INTERVAL_MS));
      }, ms);
      // A check to come never keeps the process alive on its own.
      this.timer.unref?.();
    };
    next(FIRST_CHECK_MS);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.abort?.abort();
  }

  private set(patch: Partial<UpdateStatus>): void {
    this.status = { ...this.status, ...patch };
    this.deps.onChange(this.view());
  }

  private readCache(): Cache | null {
    try {
      const cache = JSON.parse(fs.readFileSync(this.cacheFile, 'utf-8')) as Cache;
      // A cache from before this version updated says nothing now.
      return cache.current === this.deps.current ? cache : null;
    } catch {
      return null;
    }
  }

  private writeCache(): void {
    try {
      fs.mkdirSync(this.deps.dataDir, { recursive: true });
      const cache: Cache = { current: this.deps.current, checkedAt: this.status.checkedAt ?? 0, available: this.status.available, ...(this.manifestAt ? { manifest: this.manifestAt } : {}) };
      fs.writeFileSync(this.cacheFile, JSON.stringify(cache, null, 2));
    } catch {
      /* the next check asks again */
    }
  }

  /** Last launch's set-aside bundle and download go once this one runs. */
  private cleanUp(): void {
    if (this.deps.bundle) fs.rmSync(`${this.deps.bundle}.old`, { recursive: true, force: true });
    fs.rmSync(path.join(this.deps.dataDir, 'updates'), { recursive: true, force: true });
  }

  private async get(url: string, signal?: AbortSignal): Promise<Response> {
    const response = await this.deps.fetch(url, { headers: { 'User-Agent': 'Brainfile-Desktop', Accept: url.startsWith('https://api.github.com') ? 'application/vnd.github+json' : '*/*' }, signal, redirect: 'follow' });
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
    return response;
  }

  /** Asks GitHub for a later desktop release; the badge follows what it says. */
  async check(): Promise<UpdateStatus> {
    if (this.status.disabledReason || this.status.phase !== 'idle') return this.view();
    this.set({ phase: 'checking', error: null });
    try {
      const releases = (await (await this.get(this.deps.releasesUrl ?? RELEASES_URL)).json()) as ReleaseLike[];
      const found = pickRelease(Array.isArray(releases) ? releases : [], this.deps.current);
      let available: UpdateStatus['available'] = null;
      if (found) {
        const manifest = await this.manifest({ url: found.manifest, signature: found.signature });
        if (!manifest.assets[this.deps.target]) throw new Error(`${manifest.version} has no build for this Mac`);
        available = { version: manifest.version, notes: manifest.notes };
        this.manifestAt = { url: found.manifest, signature: found.signature };
      } else {
        this.manifestAt = null;
      }
      this.set({ phase: 'idle', available, checkedAt: (this.deps.now ?? Date.now)() });
      this.writeCache();
    } catch (err) {
      this.set({ phase: 'idle', error: `Could not check for updates: ${err instanceof Error ? err.message : String(err)}` });
    }
    return this.view();
  }

  private async manifest(at: { url: string; signature: string }, signal?: AbortSignal): Promise<Manifest> {
    const bytes = Buffer.from(await (await this.get(at.url, signal)).arrayBuffer());
    const signature = await (await this.get(at.signature, signal)).text();
    return verifyManifest(bytes, signature, this.deps.publicKey);
  }

  /** Stops a download or a wait; nothing changes on disk but the download, which goes. */
  cancel(): void {
    if (this.status.phase !== 'downloading' && this.status.phase !== 'installing' && this.status.phase !== 'waiting') return;
    this.abort?.abort();
  }

  /** While the restart waits for agents: restart now, whatever they are doing. */
  restart(): void {
    this.restartNow = true;
  }

  /**
   * Downloads `version`, checks it, swaps it in place and relaunches, once no
   * agent is at work (or the person says now). Any failure leaves the app as
   * it was and says why.
   */
  async install(version: string): Promise<UpdateStatus> {
    if (this.deps.preview) {
      this.set({ error: 'A preview: nothing is installed in development.' });
      return this.view();
    }
    if (this.status.disabledReason || this.status.phase !== 'idle') return this.view();
    if (this.status.available?.version !== version || !this.manifestAt) return this.view();
    const bundle = this.deps.bundle;
    if (!bundle) return this.view();
    const abort = new AbortController();
    this.abort = abort;
    this.restartNow = false;
    const dir = path.join(this.deps.dataDir, 'updates', version);
    try {
      if (bundle.startsWith('/Volumes/')) throw new Error('Brainfile is running from its disk image: move it to Applications first');
      fs.accessSync(path.dirname(bundle), fs.constants.W_OK);
      this.set({ phase: 'downloading', error: null, downloaded: 0, total: null });
      const manifest = await this.manifest(this.manifestAt, abort.signal);
      const asset = manifest.assets[this.deps.target];
      if (manifest.version !== version || !asset) throw new Error(`${version} has no build for this Mac`);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      const zip = path.join(dir, 'Brainfile.zip');
      await this.download(asset, zip, abort.signal);

      this.set({ phase: 'installing' });
      const unpacked = path.join(dir, 'unpacked');
      await this.run('ditto', ['-x', '-k', zip, unpacked]);
      const app = fs.readdirSync(unpacked).find((n) => n.endsWith('.app'));
      if (!app) throw new Error('The update holds no app');
      const fresh = path.join(unpacked, app);
      const said = await this.run('plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', path.join(fresh, 'Contents', 'Info.plist')]);
      if (said !== version) throw new Error(`The update says it is ${said}, not ${version}`);
      await this.run('codesign', ['--verify', '--deep', '--strict', fresh]);
      if (abort.signal.aborted) throw new Error('Cancelled');

      // The restart waits while agents are at work, unless the person says now.
      for (;;) {
        const working = this.restartNow ? 0 : await this.deps.busy();
        if (working === 0) break;
        if ((this.status.phase as UpdatePhase) !== 'waiting' || this.status.waitingFor !== working) this.set({ phase: 'waiting', waitingFor: working });
        await new Promise((r) => setTimeout(r, 3000));
        if (abort.signal.aborted) throw new Error('Cancelled');
      }

      this.set({ phase: 'restarting', waitingFor: 0 });
      swapBundle(bundle, fresh);
      this.deps.relaunch();
    } catch (err) {
      fs.rmSync(dir, { recursive: true, force: true });
      const cancelled = abort.signal.aborted;
      this.set({ phase: 'idle', downloaded: 0, total: null, waitingFor: 0, error: cancelled ? null : err instanceof Error ? err.message : String(err) });
    } finally {
      this.abort = null;
    }
    return this.view();
  }

  /** Streams the zip to disk with progress, and keeps it only when its size and sha256 are the manifest's. */
  private async download(asset: Asset, file: string, signal: AbortSignal): Promise<void> {
    const response = await this.get(asset.url, signal);
    if (!response.body) throw new Error('The download came back empty');
    const hash = createHash('sha256');
    const out = fs.createWriteStream(file);
    let got = 0;
    let said = 0;
    this.set({ total: asset.size });
    try {
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        hash.update(value);
        got += value.byteLength;
        if (!out.write(value)) await new Promise<void>((r) => out.once('drain', () => r()));
        // The window hears of progress a few times a second, not once a chunk.
        if (Date.now() - said > 150 || got === asset.size) {
          said = Date.now();
          this.set({ downloaded: got });
        }
      }
    } finally {
      await new Promise<void>((r) => out.end(() => r()));
    }
    if (got !== asset.size || hash.digest('hex') !== asset.sha256) throw new Error('The download does not match what Brainfile signed');
  }
}

/**
 * Puts `fresh` where `bundle` stands: the running bundle set aside beside it
 * (removed on the next launch), the new one moved in, or copied when it is
 * on another volume. Puts the old one back if the new one cannot go in.
 */
export function swapBundle(bundle: string, fresh: string): void {
  const aside = `${bundle}.old`;
  fs.rmSync(aside, { recursive: true, force: true });
  fs.renameSync(bundle, aside);
  try {
    try {
      fs.renameSync(fresh, bundle);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err;
      fs.cpSync(fresh, bundle, { recursive: true, verbatimSymlinks: true });
    }
  } catch (err) {
    fs.rmSync(bundle, { recursive: true, force: true });
    fs.renameSync(aside, bundle);
    throw err;
  }
}

export type { UpdatePhase };
