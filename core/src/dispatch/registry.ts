/** Official ACP registry, cached on disk. Binary commands live outside the task's working directory. */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AgentServer, RegistryAgent, RegistryView, Result } from './types';

export const REGISTRY_URL = 'https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json';
const TTL = 24 * 60 * 60_000;
const run = promisify(execFile);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string' && !s.includes('\0'));
const environment = (v: unknown): v is Record<string, string> => object(v) && Object.entries(v).every(([k, s]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) && typeof s === 'string' && !s.includes('\0'));
const https = (v: unknown): v is string => {
  try { return typeof v === 'string' && new URL(v).protocol === 'https:'; } catch { return false; }
};
const relative = (v: unknown): v is string => typeof v === 'string' && !!v && !v.includes('\0') && !/^[\\/]|^[A-Za-z]:/.test(v) && !v.split(/[\\/]/).includes('..');

interface Entry extends RegistryAgent {
  server: AgentServer;
  archive?: string;
  sha256?: string;
}

export function registryPlatform(platform: string, arch: string): string {
  return `${platform === 'win32' ? 'windows' : platform}-${arch === 'arm64' ? 'aarch64' : arch === 'x64' ? 'x86_64' : arch}`;
}

/** Ignore unsupported distributions and malformed entries; never trust a response that is not a registry. */
export function registryEntries(raw: unknown, platform: string): Entry[] {
  if (!object(raw) || raw.version !== '1.0.0' || !Array.isArray(raw.agents)) throw new Error('Invalid ACP registry');
  const entries: Entry[] = [];
  for (const agent of raw.agents) {
    if (!object(agent) || typeof agent.id !== 'string' || !agent.id || typeof agent.name !== 'string' || !agent.name.trim() || /[\u0000-\u001f\u007f]/.test(agent.name) || typeof agent.version !== 'string' || !object(agent.distribution)) continue;
    const npm = agent.distribution.npx;
    const binary = object(agent.distribution.binary) ? agent.distribution.binary[platform] : undefined;
    const npx = object(npm) && typeof npm.package === 'string' && /^(?:@[\w.-]+\/)?[\w.-]+(?:@[^\s]+)?$/.test(npm.package) && !npm.package.startsWith('-');
    const dist = npx ? npm : binary;
    if (!object(dist) || (dist.args !== undefined && !strings(dist.args)) || (dist.env !== undefined && !environment(dist.env))) continue;
    if (!npx && (!relative(dist.cmd) || !https(dist.archive) || (dist.sha256 !== undefined && (typeof dist.sha256 !== 'string' || !/^[a-f\d]{64}$/i.test(dist.sha256))))) continue;
    if (entries.some((entry) => entry.id === agent.id)) continue;
    entries.push({
      id: agent.id, name: agent.name.trim().replace(/\s+/g, ' '), version: agent.version,
      description: typeof agent.description === 'string' ? agent.description : '',
      distribution: npx ? 'npx' : 'binary',
      server: { command: npx ? 'npx' : dist.cmd as string, args: [...(npx ? ['--yes', npm.package as string] : []), ...(dist.args as string[] ?? [])], env: { ...(dist.env as Record<string, string> ?? {}) } },
      ...(!npx ? { archive: dist.archive as string, sha256: dist.sha256 as string | undefined } : {}),
    });
  }
  if (!entries.length) throw new Error('No compatible agents in the ACP registry');
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

/** Validate archive paths before extracting. Commands must resolve inside the installed directory too. */
export async function extractRegistryArchive(archive: string, destination: string): Promise<void> {
  const { stdout } = await run('tar', ['-tf', archive], { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
  if (stdout.split('\n').filter(Boolean).some((entry) => !relative(entry))) throw new Error('Unsafe path in agent archive');
  await run('tar', ['-xf', archive, '-C', destination], { timeout: 60_000 });
}

export class AgentRegistry {
  private entries: Entry[] = [];
  private pending: Promise<RegistryView> | null = null;
  private readonly platform: string;
  private readonly file: string;
  private readonly dir: string;
  private readonly request: typeof fetch;
  private readonly now: () => number;
  private readonly extract: typeof extractRegistryArchive;
  constructor(
    dir: string,
    request: typeof fetch = fetch,
    platform = registryPlatform(process.platform, process.arch),
    now: () => number = Date.now,
    extract: typeof extractRegistryArchive = extractRegistryArchive,
  ) {
    this.dir = dir;
    this.request = request;
    this.now = now;
    this.extract = extract;
    this.platform = platform;
    this.file = path.join(dir, 'acp-registry.json');
  }

  list(): Promise<RegistryView> {
    if (!this.pending) this.pending = this.load().finally(() => { this.pending = null; });
    return this.pending;
  }

  private view(cached: boolean, warning?: string): RegistryView {
    return { agents: this.entries.map(({ id, name, description, version, distribution }) => ({ id, name, description, version, distribution })), cached, ...(warning ? { warning } : {}) };
  }

  private async load(): Promise<RegistryView> {
    let saved: { fetchedAt: number; registry: unknown } | undefined;
    try {
      saved = JSON.parse(await fs.readFile(this.file, 'utf8'));
      const cached = registryEntries(saved?.registry, this.platform);
      if (saved && Number.isFinite(saved.fetchedAt)) this.entries = cached;
      else saved = undefined;
    } catch { saved = undefined; }
    if (saved && this.now() >= saved.fetchedAt && this.now() - saved.fetchedAt < TTL) return this.view(true);
    try {
      const response = await this.request(REGISTRY_URL, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const raw: unknown = await response.json();
      const entries = registryEntries(raw, this.platform);
      this.entries = entries;
      // A read-only or full disk must not prevent using a successful response.
      try {
        await fs.mkdir(this.dir, { recursive: true });
        await fs.writeFile(`${this.file}.tmp`, JSON.stringify({ fetchedAt: this.now(), registry: raw }));
        await fs.rename(`${this.file}.tmp`, this.file);
      } catch { /* the current session can still use the registry */ }
      return this.view(false);
    } catch {
      return this.view(true, this.entries.length ? 'Cannot refresh the ACP registry. Showing saved agents.' : 'Cannot load the ACP registry. Check your connection and retry, or add an agent manually.');
    }
  }

  async prepare(id: string): Promise<Result<AgentServer>> {
    try {
      if (!this.entries.length) await this.list();
      const entry = this.entries.find((entry) => entry.id === id);
      if (!entry) throw new Error('Choose an agent from the registry');
      if (entry.distribution === 'npx') return { ok: true, value: structuredClone(entry.server) };
      // The identity includes the distribution so a changed archive never reuses old files.
      const key = createHash('sha256').update(JSON.stringify(entry)).digest('hex');
      const root = path.join(this.dir, 'registry-agents');
      const destination = path.join(root, key);
      const command = path.resolve(destination, entry.server.command);
      const validCommand = async (dir: string) => {
        const file = path.resolve(dir, entry.server.command);
        const resolved = await fs.realpath(file);
        if (!resolved.startsWith(`${await fs.realpath(dir)}${path.sep}`) || !(await fs.stat(resolved)).isFile()) throw new Error('Invalid command in agent archive');
        return file;
      };
      try { await validCommand(destination); await fs.access(command, fs.constants.X_OK); }
      catch {
        await fs.mkdir(root, { recursive: true });
        const staging = await fs.mkdtemp(path.join(root, '.install-'));
        try {
          const response = await this.request(entry.archive!, { signal: AbortSignal.timeout(120_000) });
          if (!response.ok) throw new Error(`Agent download failed: HTTP ${response.status}`);
          const data = Buffer.from(await response.arrayBuffer());
          if (entry.sha256 && createHash('sha256').update(data).digest('hex') !== entry.sha256.toLowerCase()) throw new Error('Agent archive checksum does not match');
          const archive = path.join(staging, 'download');
          const unpacked = path.join(staging, 'unpacked');
          await fs.writeFile(archive, data);
          await fs.mkdir(unpacked);
          await this.extract(archive, unpacked);
          await fs.chmod(await validCommand(unpacked), 0o755);
          await fs.rm(destination, { recursive: true, force: true });
          await fs.rename(unpacked, destination);
        } finally { await fs.rm(staging, { recursive: true, force: true }); }
      }
      return { ok: true, value: { ...structuredClone(entry.server), command } };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Cannot prepare the agent' };
    }
  }
}
