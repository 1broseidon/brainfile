#!/usr/bin/env node
// Usage: node .github/scripts/sync-version.mjs 0.18.0
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version || '')) {
  console.error('Usage: version:set <semver>  (e.g. 0.18.1)');
  process.exit(1);
}

const edit = (path, fn) => {
  const pkg = JSON.parse(readFileSync(path, 'utf8'));
  fn(pkg);
  writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`set ${path} → ${version}`);
};

edit('package.json', (p) => { p.version = version; });
edit('core/package.json', (p) => { p.version = version; });
edit('cli/package.json', (p) => {
  p.version = version;
  if (p.dependencies?.['@brainfile/core']) p.dependencies['@brainfile/core'] = `^${version}`;
});
console.log('\nNext: commit, tag, and create a GitHub Release to trigger publish.yml.');
