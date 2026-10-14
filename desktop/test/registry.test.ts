import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { AgentRegistry, extractRegistryArchive, registryEntries, registryPlatform } from '../src/agents/registry.ts';

const npm = { id: 'npm-agent', name: 'Npm Agent', version: '1.2.3', distribution: { npx: { package: '@example/agent@1.2.3', args: ['--acp', 'two words'], env: { AGENT_MODE: 'acp' } } } };
const binary = { id: 'binary-agent', name: 'Binary Agent', version: '2', distribution: { binary: {
  'darwin-aarch64': { archive: 'https://example.com/agent.tar.gz', cmd: './bin/agent', args: ['acp'], env: { TOKEN: 'value=two' } },
  'darwin-x86_64': { archive: 'https://example.com/intel.zip', cmd: './intel' },
} } };
const registry = (agents: unknown[] = [npm, binary]) => ({ version: '1.0.0', agents });
const fetcher = (impl: (url: string) => Promise<Response>): typeof fetch => ((url: unknown) => impl(String(url))) as typeof fetch;
const temp = async () => fs.mkdtemp(path.join(os.tmpdir(), 'bf-registry-'));

// Tests only use synthetic archives and responses, with no network or installed app data.
test('registry maps npx and the current platform binary, keeping args and env', () => {
  assert.equal(registryPlatform('darwin', 'arm64'), 'darwin-aarch64');
  assert.equal(registryPlatform('win32', 'x64'), 'windows-x86_64');
  const entries = registryEntries(registry(), 'darwin-aarch64');
  assert.deepEqual(entries.find((e) => e.id === npm.id)?.server, { command: 'npx', args: ['--yes', '@example/agent@1.2.3', '--acp', 'two words'], env: { AGENT_MODE: 'acp' } });
  assert.deepEqual(entries.find((e) => e.id === binary.id)?.server, { command: './bin/agent', args: ['acp'], env: { TOKEN: 'value=two' } });
  assert.equal(registryEntries(registry(), 'darwin-x86_64')[0].server.command, './intel');
  assert.deepEqual(registryEntries(registry(), 'linux-x86_64').map((e) => e.id), [npm.id]);
});

test('malformed entries are skipped, unsupported schema and unsafe paths rejected', () => {
  const bad = [
    { ...npm, id: 'bad', distribution: { npx: { package: '--shell' } } },
    { ...npm, id: 'bad', distribution: { npx: { package: 'a', args: [3] } } },
    { ...binary, id: 'bad', distribution: { binary: { 'darwin-aarch64': { archive: 'http://example.com/a', cmd: 'a' } } } },
    { ...binary, id: 'bad', distribution: { binary: { 'darwin-aarch64': { archive: 'https://example.com/a', cmd: '../a' } } } },
  ];
  assert.deepEqual(registryEntries(registry([...bad, npm, npm]), 'darwin-aarch64').map((e) => e.id), [npm.id]);
  assert.throws(() => registryEntries({ agents: [npm] }, 'darwin-aarch64'));
  assert.throws(() => registryEntries({ version: '1.0.0', agents: [] }, 'darwin-aarch64'));
});

test('cache survives a new process, expires, and falls back on network, HTTP and invalid JSON failures', async () => {
  const dir = await temp();
  try {
    let clock = 1000;
    let calls = 0;
    const service = new AgentRegistry(dir, fetcher(async () => { calls++; return Response.json(registry()); }), 'darwin-aarch64', () => clock);
    assert.equal((await service.list()).cached, false);
    assert.equal((await service.list()).cached, true);
    assert.equal(calls, 1);
    const cached = new AgentRegistry(dir, fetcher(async () => { throw new Error('offline'); }), 'darwin-aarch64', () => clock);
    assert.equal((await cached.list()).agents.length, 2);
    clock += 25 * 60 * 60_000;
    for (const failure of [async () => { throw new Error('offline'); }, async () => new Response('', { status: 503 }), async () => Response.json({ agents: [] })]) {
      const offline = new AgentRegistry(dir, fetcher(failure), 'darwin-aarch64', () => clock);
      const view = await offline.list();
      assert.equal(view.agents.length, 2);
      assert.equal(view.cached, true);
      assert.match(view.warning!, /Showing saved agents/);
      assert.deepEqual(await offline.prepare(npm.id), { ok: true, value: registryEntries(registry(), 'darwin-aarch64').find((e) => e.id === npm.id)!.server });
    }
    const saved = JSON.parse(await fs.readFile(path.join(dir, 'acp-registry.json'), 'utf8'));
    assert.equal(saved.fetchedAt, 1000);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('first-run offline and corrupt cache return an empty view with a retry message', async () => {
  const dir = await temp();
  try {
    await fs.writeFile(path.join(dir, 'acp-registry.json'), '{broken');
    const service = new AgentRegistry(dir, fetcher(async () => { throw new Error('offline'); }), 'darwin-aarch64');
    const view = await service.list();
    assert.deepEqual(view.agents, []);
    assert.match(view.warning!, /retry/);
    assert.equal((await service.prepare('unknown')).ok, false);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('binary Add extracts a nested command, preserves args/env and reuses it offline', async () => {
  const dir = await temp();
  try {
    const source = path.join(dir, 'source');
    await fs.mkdir(path.join(source, 'bin'), { recursive: true });
    await fs.writeFile(path.join(source, 'bin', 'agent'), '#!/bin/sh\nprintf "agent"\n');
    const archive = path.join(dir, 'fixture.tar.gz');
    execFileSync('tar', ['-czf', archive, '-C', source, 'bin']);
    const data = await fs.readFile(archive);
    const withHash = structuredClone(binary);
    Object.assign(withHash.distribution.binary['darwin-aarch64'], { sha256: createHash('sha256').update(data).digest('hex') });
    let downloads = 0;
    const service = new AgentRegistry(dir, fetcher(async (url) => {
      if (url.includes('registry.json')) return Response.json(registry([withHash]));
      downloads++;
      return new Response(data);
    }), 'darwin-aarch64');
    const added = await service.prepare(binary.id);
    assert.equal(added.ok, true);
    if (!added.ok) return;
    assert.equal(path.isAbsolute(added.value.command), true);
    assert.deepEqual(added.value.args, ['acp']);
    assert.deepEqual(added.value.env, { TOKEN: 'value=two' });
    assert.equal(execFileSync(added.value.command, { cwd: os.tmpdir(), encoding: 'utf8' }), 'agent');
    const offline = new AgentRegistry(dir, fetcher(async () => { throw new Error('offline'); }), 'darwin-aarch64');
    assert.deepEqual(await offline.prepare(binary.id), added);
    assert.equal(downloads, 1);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('zip binary archives are extracted on macOS', { skip: process.platform !== 'darwin' }, async () => {
  const dir = await temp();
  try {
    await fs.writeFile(path.join(dir, 'agent'), '#!/bin/sh\n');
    const archive = path.join(dir, 'fixture.zip');
    execFileSync('zip', ['-q', archive, 'agent'], { cwd: dir });
    const out = path.join(dir, 'out');
    await fs.mkdir(out);
    await extractRegistryArchive(archive, out);
    assert.equal(await fs.readFile(path.join(out, 'agent'), 'utf8'), '#!/bin/sh\n');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('binary download, checksum and missing command errors leave no installation', async () => {
  for (const mode of ['download', 'checksum', 'missing', 'escape']) {
    const dir = await temp();
    try {
      const entry = structuredClone(binary);
      if (mode === 'checksum') Object.assign(entry.distribution.binary['darwin-aarch64'], { sha256: 'a'.repeat(64) });
      const service = new AgentRegistry(dir, fetcher(async (url) => {
        if (url.includes('registry.json')) return Response.json(registry([entry]));
        if (mode === 'download') return new Response('', { status: 404 });
        return new Response('fixture');
      }), 'darwin-aarch64', Date.now, async (_archive, out) => {
        if (mode === 'escape') { await fs.mkdir(path.join(out, 'bin')); await fs.symlink('/bin/sh', path.join(out, 'bin', 'agent')); }
      });
      const result = await service.prepare(binary.id);
      assert.equal(result.ok, false);
      if (!result.ok) assert.match(result.error, mode === 'download' ? /HTTP 404/ : mode === 'checksum' ? /checksum/ : mode === 'escape' ? /Invalid command/ : /ENOENT/);
      assert.deepEqual(await fs.readdir(path.join(dir, 'registry-agents')), []);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  }
});
