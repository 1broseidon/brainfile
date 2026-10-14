#!/usr/bin/env node
/**
 * The update manifest for a desktop release (task-72): what the app reads
 * to update itself (src/main/updater.ts). Usage:
 *
 *   BRAINFILE_UPDATE_KEY="$(cat key.pem)" node scripts/update-manifest.mjs <version> <release dir> <notes.md> <owner/repo>
 *
 * Writes brainfile-desktop.json beside the zips (each Mac's url, sha256 and
 * size, the version and its notes) and brainfile-desktop.json.sig, its
 * Ed25519 signature under the private key; the app holds the public half.
 */
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [version, dir, notesFile, repo] = process.argv.slice(2);
if (!version || !dir || !notesFile || !repo) {
  console.error('Usage: update-manifest.mjs <version> <release dir> <notes.md> <owner/repo>');
  process.exit(1);
}
const pem = process.env.BRAINFILE_UPDATE_KEY;
if (!pem) {
  console.error('BRAINFILE_UPDATE_KEY is not set: the manifest cannot be signed');
  process.exit(1);
}

/** electron-builder's arch names, as the app's `process.arch` says them. */
const ARCHES = { arm64: 'arm64', x64: 'x64' };
const assets = {};
for (const name of readdirSync(dir)) {
  const m = /^Brainfile-(.+)-(arm64|x64)-mac\.zip$/.exec(name);
  if (!m) continue;
  if (m[1] !== version) throw new Error(`${name} is not ${version}`);
  const bytes = readFileSync(join(dir, name));
  assets[`darwin-${ARCHES[m[2]]}`] = {
    url: `https://github.com/${repo}/releases/download/desktop-v${version}/${name}`,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    size: statSync(join(dir, name)).size,
  };
}
if (!Object.keys(assets).length) throw new Error(`No Brainfile-${version}-<arch>-mac.zip in ${dir}`);

// The key must be the one the app was built to trust, or no installed app would take this update.
const builtIn = /-----BEGIN PUBLIC KEY-----[\s\S]+?-----END PUBLIC KEY-----/.exec(readFileSync(new URL('../src/main/update-key.ts', import.meta.url), 'utf8'))?.[0];
const ours = createPublicKey(createPrivateKey(pem)).export({ type: 'spki', format: 'pem' }).toString().trim();
if (!builtIn || builtIn.trim() !== ours) throw new Error('BRAINFILE_UPDATE_KEY is not the key src/main/update-key.ts trusts');

const manifest = Buffer.from(JSON.stringify({ version, notes: readFileSync(notesFile, 'utf8').trim(), assets }, null, 2) + '\n');
const key = createPrivateKey(pem);
const signature = sign(null, manifest, key);
// Signed as the app will check it, before anything is published.
if (!verify(null, manifest, createPublicKey(key), signature)) throw new Error('The signature does not verify');
writeFileSync(join(dir, 'brainfile-desktop.json'), manifest);
writeFileSync(join(dir, 'brainfile-desktop.json.sig'), signature.toString('base64') + '\n');
console.log(`brainfile-desktop.json: ${version}, ${Object.keys(assets).join(', ')}`);
