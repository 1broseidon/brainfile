/**
 * Updates (task-71): which release is newer, which manifest is trusted, and
 * an install end to end on a scratch bundle, with ditto, plutil and codesign
 * as the app uses them. GitHub is a fake that serves what a release would.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { bundleOf, isNewer, MANIFEST, pickRelease, Updater, verifyManifest, type Manifest } from '../src/main/updater.ts';
import type { UpdateStatus } from '../src/shared/api.ts';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const PUBLIC = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const signed = (bytes: Buffer, key = privateKey) => sign(null, bytes, key).toString('base64');

test('a later version is x.y.z and larger, nothing else', () => {
  assert.equal(isNewer('0.1.0', '0.1.1'), true);
  assert.equal(isNewer('0.1.9', '0.2.0'), true);
  assert.equal(isNewer('0.9.0', '0.10.0'), true);
  assert.equal(isNewer('0.1.0', '0.1.0'), false);
  assert.equal(isNewer('0.2.0', '0.1.9'), false);
  assert.equal(isNewer('0.1.0', '0.2.0-beta'), false);
});

const asset = (tag: string, name: string) => ({ name, browser_download_url: `https://github.com/x/releases/download/${tag}/${name}` });
const release = (tag: string, extra: object = {}) => ({ tag_name: tag, assets: [asset(tag, MANIFEST), asset(tag, `${MANIFEST}.sig`)], ...extra });

test('the newest published desktop release with a manifest, never the CLI\'s or a draft', () => {
  const releases = [
    release('v0.23.0'),
    release('desktop-v0.3.0', { draft: true }),
    release('desktop-v0.2.5', { prerelease: true }),
    release('desktop-v0.2.0'),
    { tag_name: 'desktop-v0.2.4', assets: [] },
    release('desktop-v0.1.1'),
    release('desktop-v0.0.9'),
  ];
  const found = pickRelease(releases, '0.1.0');
  assert.equal(found?.version, '0.2.0');
  assert.match(found!.manifest, /desktop-v0\.2\.0\/brainfile-desktop\.json$/);
  assert.equal(pickRelease(releases, '0.2.0'), null);
});

const manifestOf = (m: Manifest) => Buffer.from(JSON.stringify(m, null, 2));
const good: Manifest = { version: '0.2.0', notes: 'Notes.', assets: { 'darwin-arm64': { url: 'https://github.com/x/a.zip', sha256: 'a'.repeat(64), size: 10 } } };

test('a manifest is trusted only under Brainfile\'s key, as published', () => {
  const bytes = manifestOf(good);
  assert.deepEqual(verifyManifest(bytes, signed(bytes), PUBLIC), good);
  // Changed after signing.
  assert.throws(() => verifyManifest(Buffer.from(bytes.toString().replace('0.2.0', '0.9.0')), signed(bytes), PUBLIC), /not signed by Brainfile/);
  // Signed by another key.
  const other = generateKeyPairSync('ed25519').privateKey;
  assert.throws(() => verifyManifest(bytes, signed(bytes, other), PUBLIC), /not signed by Brainfile/);
  assert.throws(() => verifyManifest(bytes, 'not base64 at all', PUBLIC), /not signed by Brainfile/);
  // Signed, but saying nothing usable.
  const plain = manifestOf({ ...good, assets: { 'darwin-arm64': { url: 'http://insecure/a.zip', sha256: 'a'.repeat(64), size: 10 } } });
  assert.throws(() => verifyManifest(plain, signed(plain), PUBLIC), /nothing usable/);
});

test('the bundle is the .app above Contents/MacOS', () => {
  assert.equal(bundleOf('/Applications/Brainfile.app/Contents/MacOS/Brainfile'), '/Applications/Brainfile.app');
  assert.equal(bundleOf('/usr/local/bin/electron'), null);
});

// ── A check and an install, against a fake GitHub ──────────────────────────

let base: string;
beforeEach(() => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bf-update-')));
});
afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

const sh = (cmd: string, args: string[], cwd?: string) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf-8' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};

/** A small app bundle at `version`, ad-hoc signed as a release's would be checked. */
function makeApp(dir: string, version: string): string {
  const app = path.join(dir, 'Brainfile.app');
  fs.mkdirSync(path.join(app, 'Contents', 'MacOS'), { recursive: true });
  fs.writeFileSync(
    path.join(app, 'Contents', 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>CFBundleExecutable</key><string>Brainfile</string><key>CFBundleIdentifier</key><string>md.brainfile.test</string><key>CFBundleShortVersionString</key><string>${version}</string></dict></plist>\n`
  );
  fs.copyFileSync('/usr/bin/true', path.join(app, 'Contents', 'MacOS', 'Brainfile'));
  sh('codesign', ['--force', '--deep', '-s', '-', app]);
  return app;
}

/** A desktop release of `version`: its zip, its manifest and signature, served by URL. */
function publish(version: string, opts: { tamper?: boolean } = {}): Map<string, Buffer> {
  const out = path.join(base, `release-${version}`);
  fs.mkdirSync(out);
  const zip = path.join(out, 'Brainfile.zip');
  sh('ditto', ['-c', '-k', '--keepParent', makeApp(out, version), zip]);
  const bytes = fs.readFileSync(zip);
  const tag = `desktop-v${version}`;
  const zipUrl = `https://github.com/x/releases/download/${tag}/Brainfile-${version}-arm64-mac.zip`;
  const manifest = manifestOf({
    version,
    notes: `What ${version} brings.`,
    assets: { 'darwin-arm64': { url: zipUrl, sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length } },
  });
  const files = new Map<string, Buffer>();
  files.set('https://api.github.com/releases', Buffer.from(JSON.stringify([release(tag), release('v0.22.1')])));
  files.set(`https://github.com/x/releases/download/${tag}/${MANIFEST}`, manifest);
  files.set(`https://github.com/x/releases/download/${tag}/${MANIFEST}.sig`, Buffer.from(signed(manifest)));
  files.set(zipUrl, opts.tamper ? Buffer.concat([bytes.subarray(0, bytes.length - 1), Buffer.from([bytes[bytes.length - 1] ^ 1])]) : bytes);
  return files;
}

function fakeFetch(files: Map<string, Buffer>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const body = files.get(String(input));
    return body ? new Response(new Uint8Array(body)) : new Response('missing', { status: 404 });
  }) as typeof fetch;
}

function updater(files: Map<string, Buffer>, extra: { busy?: () => Promise<number>; relaunch?: () => void } = {}) {
  const installed = path.join(base, 'Applications');
  fs.mkdirSync(installed, { recursive: true });
  const bundle = fs.existsSync(path.join(installed, 'Brainfile.app')) ? path.join(installed, 'Brainfile.app') : makeApp(installed, '0.1.0');
  const seen: UpdateStatus[] = [];
  let relaunched = 0;
  const u = new Updater({
    current: '0.1.0',
    target: 'darwin-arm64',
    bundle,
    dataDir: path.join(base, 'data'),
    publicKey: PUBLIC,
    fetch: fakeFetch(files),
    busy: extra.busy ?? (async () => 0),
    relaunch: extra.relaunch ?? (() => relaunched++),
    onChange: (s) => seen.push(s),
    releasesUrl: 'https://api.github.com/releases',
  });
  return { u, bundle, seen, relaunched: () => relaunched };
}

const versionOf = (app: string) => sh('plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', path.join(app, 'Contents', 'Info.plist')]);

test('a check finds the later release, and the next launch shows it before asking again', async () => {
  const files = publish('0.2.0');
  const first = updater(files);
  const status = await first.u.check();
  assert.deepEqual(status.available, { version: '0.2.0', notes: 'What 0.2.0 brings.' });
  assert.equal(status.error, null);
  assert.ok(status.checkedAt);
  // The cache: a new launch at the same version has the badge at once.
  const again = updater(new Map());
  assert.equal(again.u.view().available?.version, '0.2.0');
});

test('an install checks the download, swaps the bundle in place, and relaunches', async () => {
  const files = publish('0.2.0');
  const { u, bundle, seen, relaunched } = updater(files);
  await u.check();
  const done = await u.install('0.2.0');
  assert.equal(done.error, null);
  assert.equal(versionOf(bundle), '0.2.0');
  assert.equal(versionOf(`${bundle}.old`), '0.1.0');
  assert.equal(relaunched(), 1);
  assert.deepEqual([...new Set(seen.map((s) => s.phase))], ['checking', 'idle', 'downloading', 'installing', 'restarting']);
  // The next launch lets the old bundle and the download go.
  const next = updater(new Map()).u;
  next.start();
  next.stop();
  assert.ok(!fs.existsSync(`${bundle}.old`));
  assert.ok(!fs.existsSync(path.join(base, 'data', 'updates')));
});

test('a download that is not what Brainfile signed is refused, and the app stays as it was', async () => {
  const files = publish('0.2.0', { tamper: true });
  const { u, bundle, relaunched } = updater(files);
  await u.check();
  const done = await u.install('0.2.0');
  assert.match(done.error ?? '', /does not match what Brainfile signed/);
  assert.equal(done.phase, 'idle');
  assert.equal(versionOf(bundle), '0.1.0');
  assert.equal(relaunched(), 0);
});

test('the restart waits while agents are at work, and Restart now does not', async () => {
  const files = publish('0.2.0');
  let working = 2;
  const { u, bundle, seen, relaunched } = updater(files, { busy: async () => working });
  await u.check();
  const installing = u.install('0.2.0');
  for (let i = 0; i < 100 && u.view().phase !== 'waiting'; i++) await new Promise((r) => setTimeout(r, 50));
  assert.equal(u.view().phase, 'waiting');
  assert.equal(u.view().waitingFor, 2);
  assert.equal(versionOf(bundle), '0.1.0');
  u.restart();
  working = 2;
  await installing;
  assert.equal(versionOf(bundle), '0.2.0');
  assert.equal(relaunched(), 1);
  assert.ok(seen.some((s) => s.phase === 'waiting'));
});
