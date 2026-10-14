/**
 * The changelog in fragments (task-64): each change its own file in
 * changes/, folded into CHANGELOG.md at release, so branches never conflict
 * in the changelog. The script lives with the release, in .github/scripts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
// @ts-expect-error: a plain .mjs script, with no types of its own.
import { parseFragment, release, releaseChangelog, unreleased } from '../../.github/scripts/changelog.mjs';

const CHANGELOG = `# Changelog

Intro.

## [Unreleased]

Already written by hand.
### Fixed
- An old fix.

## [0.22.0] - 2026-10-12

Before.
`;

test('a fragment is prose, or a kind and its entries', () => {
  assert.deepEqual(parseFragment('A paragraph.\n', 'a.md'), { name: 'a.md', kind: undefined, body: 'A paragraph.' });
  assert.deepEqual(parseFragment('---\nkind: Fixed\n---\nNo dash.\n', 'b.md'), { name: 'b.md', kind: 'Fixed', body: '- No dash.' });
  assert.throws(() => parseFragment('---\nkind: Tweaked\n---\n- x\n', 'c.md'), /kind is Tweaked/);
  assert.throws(() => parseFragment('---\nkind: Added\n---\n', 'd.md'), /says nothing/);
});

test('a release folds the fragments and what Unreleased holds into one dated section, kinds in order', () => {
  const fragments = [
    parseFragment('---\nkind: Fixed\n---\n- A new fix.\n', 'b.md'),
    parseFragment('---\nkind: Added\n---\n- A new thing.\n', 'a.md'),
    parseFragment('The release in a sentence.\n', 'c.md'),
  ];
  assert.equal(
    release(CHANGELOG, fragments, '0.23.0', '2026-10-14'),
    `# Changelog

Intro.

## [Unreleased]

## [0.23.0] - 2026-10-14

Already written by hand.

The release in a sentence.

### Added
- A new thing.

### Fixed
- An old fix.
- A new fix.

## [0.22.0] - 2026-10-12

Before.
`
  );
  // The preview is the same body, unreleased.
  assert.match(unreleased(CHANGELOG, fragments), /^Already written by hand\.\n\nThe release in a sentence\.\n\n### Added/);
});

test('releasing writes CHANGELOG.md and removes the fragments it took, and the README stays', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-changelog-'));
  try {
    fs.writeFileSync(path.join(root, 'CHANGELOG.md'), CHANGELOG);
    fs.mkdirSync(path.join(root, 'changes'));
    fs.writeFileSync(path.join(root, 'changes', 'README.md'), '# changes/\n');
    fs.writeFileSync(path.join(root, 'changes', 'task-1.md'), '---\nkind: Changed\n---\n- One.\n');
    assert.equal(releaseChangelog('1.0.0', '2026-10-14', root), 1);
    assert.match(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), /## \[1\.0\.0\] - 2026-10-14[\s\S]*### Changed\n- One\./);
    assert.deepEqual(fs.readdirSync(path.join(root, 'changes')), ['README.md']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
