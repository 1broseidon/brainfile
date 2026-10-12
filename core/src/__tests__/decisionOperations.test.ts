import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  decideFile,
  evaluateDecisionPredicates,
  evaluatePackageVersion,
  evaluateSourceUnchanged,
  findDeclaredVersion,
  goModVersion,
  hashFileSha256,
  packageJsonVersion,
  projectRootOf,
  pyprojectVersion,
  readDecisionDocs,
  retireDecisionFile,
  supersedeDecisionFile,
  validateDecideInput,
} from '../decisionOperations';
import { readTaskFile, readTasksDir, writeTaskFile } from '../taskFile';
import { getV2Dirs, type V2Dirs } from '../workspace';
import { readLedger } from '../ledger';

interface Fixture {
  root: string;
  dirs: V2Dirs;
}

function makeBoard(extra = ''): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-decide-'));
  const dot = path.join(root, '.brainfile');
  fs.mkdirSync(path.join(dot, 'board'), { recursive: true });
  fs.mkdirSync(path.join(dot, 'logs'), { recursive: true });
  const brainfilePath = path.join(dot, 'brainfile.md');
  fs.writeFileSync(brainfilePath, `---\ntitle: Decide\ncolumns:\n  - id: todo\n    title: To Do\n${extra}---\n`);
  return { root, dirs: getV2Dirs(brainfilePath) };
}

describe('decideFile', () => {
  let fx: Fixture;
  beforeEach(() => { fx = makeBoard(); });
  afterEach(() => fs.rmSync(fx.root, { recursive: true, force: true }));

  it('writes a current decision in board/ with its fields and no column', () => {
    const result = decideFile(fx.dirs, {
      claimKey: 'Dependency.HTTP-Client',
      text: 'Use undici for HTTP\n\nIt ships with Node; nothing to install.',
      kind: 'Preference',
      stance: 'Prefers',
      subject: 'undici',
      holdsWhile: 'we target Node 20+',
      recheck: 'when fetch gains retries',
      validUntil: '2027-01-01',
      packageVersion: 'undici >= 6',
      tags: ['http'],
    });
    expect(result.success).toBe(true);
    expect(result.familyWasEmpty).toBe(true);
    expect(result.superseded).toEqual([]);
    const doc = readTaskFile(result.filePath!)!;
    expect(doc.task).toMatchObject({
      id: 'decision-1',
      title: 'Use undici for HTTP',
      type: 'decision',
      status: 'current',
      claimKey: 'dependency.http-client',
      kind: 'preference',
      stance: 'prefers',
      subject: 'undici',
      holdsWhile: 'we target Node 20+',
      recheck: 'when fetch gains retries',
      validUntil: '2027-01-01',
      packageVersion: 'undici>=6',
      tags: ['http'],
    });
    expect(doc.task.column).toBeUndefined();
    expect(doc.body).toContain('It ships with Node');
  });

  it('writes no body for a one-line decision', () => {
    const result = decideFile(fx.dirs, { claimKey: 'a.b', text: 'Keep it simple' });
    expect(readTaskFile(result.filePath!)!.body.trim()).toBe('');
  });

  it('supersedes the family current decision: status, links both ways, moved to logs/', () => {
    const first = decideFile(fx.dirs, { claimKey: 'dependency.http-client', text: 'Use axios' });
    const second = decideFile(fx.dirs, { claimKey: 'dependency.http-client', text: 'Use undici' });
    expect(second.success).toBe(true);
    expect(second.familyWasEmpty).toBe(false);
    expect(second.related).toEqual([]);
    expect(second.superseded.map((t) => t.id)).toEqual([first.decision!.id]);
    expect(second.decision!.supersedes).toBe(first.decision!.id);

    expect(fs.existsSync(path.join(fx.dirs.boardDir, `${first.decision!.id}.md`))).toBe(false);
    const old = readTaskFile(path.join(fx.dirs.logsDir, `${first.decision!.id}.md`))!;
    expect(old.task).toMatchObject({ status: 'superseded', supersededBy: second.decision!.id });
    expect(old.task.completedAt).toBeUndefined();
    // Decisions never write ledger records.
    expect(readLedger(fx.dirs.logsDir)).toEqual([]);
    expect(fs.existsSync(path.join(fx.dirs.logsDir, 'ledger.jsonl'))).toBe(false);

    const third = decideFile(fx.dirs, { claimKey: 'dependency.http-client', text: 'Use fetch' });
    expect(third.superseded.map((t) => t.id)).toEqual([second.decision!.id]);
    expect(readDecisionDocs(fx.dirs).map((d) => [d.task.id, d.inLogs])).toEqual([
      [third.decision!.id, false],
      [first.decision!.id, true],
      [second.decision!.id, true],
    ].sort((a, b) => Number(a[1]) - Number(b[1]) || String(a[0]).localeCompare(String(b[0]))));
  });

  it('leaves the family alone with noSupersede (two current)', () => {
    decideFile(fx.dirs, { claimKey: 'x.y', text: 'One' });
    const second = decideFile(fx.dirs, { claimKey: 'x.y', text: 'Two' }, { noSupersede: true });
    expect(second.superseded).toEqual([]);
    expect(readTasksDir(fx.dirs.boardDir)).toHaveLength(2);
  });

  it('returns the current decision as a duplicate when it already says this', () => {
    const first = decideFile(fx.dirs, { claimKey: 'x.y', text: 'Same words', stance: 'prefers', subject: 'a' });
    const again = decideFile(fx.dirs, { claimKey: 'X.Y', text: 'same   words', stance: 'prefers', subject: 'a' });
    expect(again).toMatchObject({ success: true, duplicate: true, superseded: [] });
    expect(again.decision!.id).toBe(first.decision!.id);
    expect(readTasksDir(fx.dirs.boardDir)).toHaveLength(1);
  });

  it('names related families when the family was empty', () => {
    decideFile(fx.dirs, { claimKey: 'storage.index', text: 'Index with sqlite fts5' });
    const result = decideFile(fx.dirs, { claimKey: 'storage.cache', text: 'Cache in memory' });
    expect(result.related.map((r) => [r.claimKey, r.reason])).toEqual([['storage.index', 'prefix']]);
  });

  it('links the work that rests on it', () => {
    writeTaskFile(path.join(fx.dirs.boardDir, 'task-1.md'), { id: 'task-1', title: 'Build it', column: 'todo', decisions: ['decision-9'] });
    const result = decideFile(fx.dirs, { claimKey: 'a.b', text: 'Decide', forWork: ['task-1', 'task-404', '../x'] });
    expect(result.linked).toEqual(['task-1']);
    expect(result.notFound).toEqual(['task-404', '../x']);
    expect(readTaskFile(path.join(fx.dirs.boardDir, 'task-1.md'))!.task.decisions).toEqual(['decision-9', 'decision-1']);
  });

  it('records a source file relative to the project root with its sha256', () => {
    fs.mkdirSync(path.join(fx.root, 'docs'));
    fs.writeFileSync(path.join(fx.root, 'docs', 'arch.md'), '# Arch\n');
    const result = decideFile(fx.dirs, { claimKey: 'a.b', text: 'Per the doc', sourcePath: 'docs/arch.md' });
    expect(result.decision!.sourcePath).toBe('docs/arch.md');
    const hash = crypto.createHash('sha256').update('# Arch\n').digest('hex');
    expect(result.decision!.sourceHash).toBe(`sha256:${hash}`);
    expect(decideFile(fx.dirs, { claimKey: 'a.c', text: 'x', sourcePath: 'docs/missing.md' }).error).toMatch(/cannot read source/);
  });

  it('refuses bad input', () => {
    expect(validateDecideInput({ text: '' })).toMatch(/empty/);
    expect(validateDecideInput({ text: 'x' }, { requireClaimKey: true })).toMatch(/claim-key is required/);
    expect(validateDecideInput({ text: 'x', claimKey: 'bad key' })).toMatch(/invalid claim key/);
    expect(validateDecideInput({ text: 'x', kind: 'wish' })).toMatch(/invalid kind/);
    expect(validateDecideInput({ text: 'x', stance: 'likes', subject: 'a' })).toMatch(/invalid stance/);
    expect(validateDecideInput({ text: 'x', stance: 'prefers' })).toMatch(/go together/);
    expect(validateDecideInput({ text: 'x', subject: 'a' })).toMatch(/go together/);
    expect(validateDecideInput({ text: 'x', validUntil: 'soon' })).toMatch(/invalid valid-until/);
    expect(validateDecideInput({ text: 'x', packageVersion: 'zod' })).toMatch(/invalid package version/);
    expect(validateDecideInput({ text: 'x', claimKey: 'a.b', kind: 'rule', stance: 'forbids', subject: 's', validUntil: '2026-01-01', packageVersion: 'go>=1.22' })).toBeNull();
    expect(decideFile(fx.dirs, { text: ' ' }).success).toBe(false);
  });
});

describe('supersedeDecisionFile', () => {
  let fx: Fixture;
  beforeEach(() => { fx = makeBoard(); });
  afterEach(() => fs.rmSync(fx.root, { recursive: true, force: true }));

  it('replaces a decision by hand, keeping its family and kind', () => {
    const first = decideFile(fx.dirs, { claimKey: 'deploy.target', text: 'Ship to Fly', kind: 'constraint', stance: 'requires', subject: 'fly' });
    const result = supersedeDecisionFile(fx.dirs, first.decision!.id, { text: 'Ship to Render' });
    expect(result.success).toBe(true);
    expect(result.decision).toMatchObject({ claimKey: 'deploy.target', kind: 'constraint', supersedes: first.decision!.id });
    expect(result.decision!.stance).toBeUndefined();
    expect(result.superseded[0]).toMatchObject({ id: first.decision!.id, status: 'superseded', supersededBy: result.decision!.id });
  });

  it('refuses what is already history, what is missing, and what is not a decision', () => {
    const first = decideFile(fx.dirs, { claimKey: 'a.b', text: 'One' });
    decideFile(fx.dirs, { claimKey: 'a.b', text: 'Two' });
    expect(supersedeDecisionFile(fx.dirs, first.decision!.id, { text: 'Three' }).error).toMatch(/already superseded by decision-2/);
    expect(supersedeDecisionFile(fx.dirs, 'decision-99', { text: 'x' }).error).toMatch(/Decision not found/);
    writeTaskFile(path.join(fx.dirs.boardDir, 'task-1.md'), { id: 'task-1', title: 'Work', column: 'todo' });
    expect(supersedeDecisionFile(fx.dirs, 'task-1', { text: 'x' }).error).toMatch(/not a decision/);
    expect(supersedeDecisionFile(fx.dirs, 'decision-2', { text: '' }).error).toMatch(/empty/);
  });

  it('gives a legacy ADR without a claim key a successor', () => {
    writeTaskFile(path.join(fx.dirs.boardDir, 'adr-1.md'), { id: 'adr-1', title: 'Old', type: 'adr', status: 'accepted' });
    const result = supersedeDecisionFile(fx.dirs, 'adr-1', { text: 'New', claimKey: 'storage.board' });
    expect(result.success).toBe(true);
    expect(result.decision).toMatchObject({ claimKey: 'storage.board', supersedes: 'adr-1' });
    expect(readTaskFile(path.join(fx.dirs.logsDir, 'adr-1.md'))!.task).toMatchObject({ status: 'superseded', supersededBy: result.decision!.id });
  });
});

describe('retireDecisionFile', () => {
  let fx: Fixture;
  beforeEach(() => { fx = makeBoard(); });
  afterEach(() => fs.rmSync(fx.root, { recursive: true, force: true }));

  it('rejects a decision into logs/ with a note', () => {
    const made = decideFile(fx.dirs, { claimKey: 'a.b', text: 'Maybe' });
    const result = retireDecisionFile(fx.dirs, made.decision!.id, 'rejected', { note: 'too costly', agent: 'codex', now: '2026-10-12T00:00:00.000Z' });
    expect(result.success).toBe(true);
    const doc = readTaskFile(path.join(fx.dirs.logsDir, 'decision-1.md'))!;
    expect(doc.task).toMatchObject({ status: 'rejected', updatedAt: '2026-10-12T00:00:00.000Z' });
    expect(doc.body).toContain('- 2026-10-12T00:00:00.000Z [codex]: rejected: too costly');
    expect(fs.existsSync(path.join(fx.dirs.boardDir, 'decision-1.md'))).toBe(false);
  });

  it('updates a decision already in logs/ in place, and appends to an existing Log', () => {
    writeTaskFile(path.join(fx.dirs.logsDir, 'adr-2.md'), { id: 'adr-2', title: 'Promoted', type: 'adr', status: 'promoted', supersededBy: 'x' }, '## Log\n- 2026-01-01T00:00:00.000Z: promoted\n');
    const result = retireDecisionFile(fx.dirs, 'adr-2', 'stale', { note: 'no longer true' });
    expect(result.success).toBe(true);
    const doc = readTaskFile(path.join(fx.dirs.logsDir, 'adr-2.md'))!;
    expect(doc.task.status).toBe('stale');
    expect(doc.task.supersededBy).toBeUndefined();
    expect(doc.body.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(2);
  });

  it('refuses bad requests', () => {
    expect(retireDecisionFile(fx.dirs, '../x', 'stale').error).toMatch(/Invalid decision ID/);
    expect(retireDecisionFile(fx.dirs, 'decision-1', 'stale').error).toMatch(/not found/);
    writeTaskFile(path.join(fx.dirs.boardDir, 'task-1.md'), { id: 'task-1', title: 'Work', column: 'todo' });
    expect(retireDecisionFile(fx.dirs, 'task-1', 'stale').error).toMatch(/not a decision/);
    decideFile(fx.dirs, { claimKey: 'a.b', text: 'One' });
    expect(retireDecisionFile(fx.dirs, 'decision-1', 'superseded').error).toMatch(/needs supersededBy/);
    fs.writeFileSync(path.join(fx.dirs.logsDir, 'decision-1.md'), '---\nid: decision-1\ntitle: clash\n---\n');
    expect(retireDecisionFile(fx.dirs, 'decision-1', 'stale').error).toMatch(/already exists in logs/);
  });
});

describe('file predicates', () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-pred-')); });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('hashes and compares a source file against the project root, not the cwd', () => {
    fs.writeFileSync(path.join(root, 'policy.md'), 'v1');
    const hash = hashFileSha256(path.join(root, 'policy.md'))!;
    expect(hashFileSha256(path.join(root, 'nope'))).toBeNull();
    expect(evaluateSourceUnchanged('policy.md', `sha256:${hash}`, { projectRoot: root })).toMatchObject({ status: 'holds', reason: 'source_hash_matches' });
    fs.writeFileSync(path.join(root, 'policy.md'), 'v2');
    expect(evaluateSourceUnchanged('policy.md', hash, { projectRoot: root })).toMatchObject({ status: 'broken', reason: 'source_hash_changed' });
    expect(evaluateSourceUnchanged('gone.md', hash, { projectRoot: root })).toMatchObject({ status: 'broken', reason: 'source_unreadable' });
    expect(evaluateSourceUnchanged('', hash, { projectRoot: root }).reason).toBe('missing_source_path');
    expect(evaluateSourceUnchanged('policy.md', '', { projectRoot: root }).reason).toBe('missing_source_hash');
  });

  it('reads versions from package.json, go.mod and pyproject.toml', () => {
    expect(packageJsonVersion({ dependencies: { zod: '4.3.6' }, devDependencies: { jest: '^30' } }, 'jest')).toBe('^30');
    expect(packageJsonVersion({ engines: { node: '>=20' } }, 'engines.node')).toBe('>=20');
    expect(packageJsonVersion({}, 'engines.node')).toBeUndefined();
    const gomod = 'module x\n\ngo 1.22\n\nrequire github.com/spf13/cobra v1.8.0\nrequire (\n  golang.org/x/sys v0.20.0 // indirect\n)\n';
    expect(goModVersion(gomod, 'go')).toBe('1.22');
    expect(goModVersion(gomod, 'github.com/spf13/cobra')).toBe('1.8.0');
    expect(goModVersion(gomod, 'golang.org/x/sys')).toBe('0.20.0');
    expect(goModVersion(gomod, 'nope')).toBeUndefined();
    const py = '[project]\nrequires-python = ">=3.11"\ndependencies = [\n  "httpx>=0.27",\n  "rich[jupyter]==13.7",\n]\n';
    expect(pyprojectVersion(py, 'requires-python')).toBe('>=3.11');
    expect(pyprojectVersion(py, 'python')).toBe('>=3.11');
    expect(pyprojectVersion(py, 'httpx')).toBe('>=0.27');
    expect(pyprojectVersion(py, 'rich')).toBe('==13.7');
    expect(pyprojectVersion(py, 'nope')).toBeUndefined();
  });

  it('evaluates the package version predicate', () => {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { zod: '4.3.6' }, engines: { node: '>=20' } }));
    fs.writeFileSync(path.join(root, 'go.mod'), 'module x\ngo 1.22\n');
    expect(evaluatePackageVersion('zod>=4.3', { projectRoot: root })).toMatchObject({ status: 'holds', reason: 'package_version_matches', actual: '4.3.6 (package.json)' });
    expect(evaluatePackageVersion('zod<4', { projectRoot: root })).toMatchObject({ status: 'broken', reason: 'package_version_mismatch' });
    expect(evaluatePackageVersion('engines.node>=20', { projectRoot: root }).status).toBe('holds');
    expect(evaluatePackageVersion('go>=1.21', { projectRoot: root })).toMatchObject({ status: 'holds', actual: '1.22 (go.mod)' });
    expect(evaluatePackageVersion('left-pad>=1', { projectRoot: root }).reason).toBe('package_version_missing');
    expect(evaluatePackageVersion('nonsense', { projectRoot: root }).reason).toBe('invalid_package_version');
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { pkg: 'latest' } }));
    expect(evaluatePackageVersion('pkg>=1', { projectRoot: root }).reason).toBe('predicate_comparison_unknown');
    fs.writeFileSync(path.join(root, 'package.json'), 'not json');
    expect(findDeclaredVersion(root, 'go')).toEqual({ version: '1.22', manifest: 'go.mod' });
  });

  it('combines every predicate a decision carries', () => {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { zod: '4.3.6' } }));
    const now = Date.UTC(2026, 9, 12);
    const holds = evaluateDecisionPredicates({ id: 'd', title: 't', validUntil: '2027-01-01', packageVersion: 'zod>=4' }, { projectRoot: root, now });
    expect(holds.status).toBe('holds');
    expect(holds.checks.map((c) => c.kind)).toEqual(['valid_until', 'package_version']);
    const broken = evaluateDecisionPredicates({ id: 'd', title: 't', validUntil: '2026-01-01', sourcePath: 'x.md', sourceHash: 'abc' }, { projectRoot: root, now });
    expect(broken).toMatchObject({ status: 'broken', reason: 'valid_until_expired' });
    expect(evaluateDecisionPredicates({ id: 'd', title: 't' }, { projectRoot: root })).toEqual({ status: 'unknown', checks: [] });
  });

  it('finds the project root of a board', () => {
    expect(projectRootOf('/a/b/.brainfile/brainfile.md')).toBe(path.resolve('/a/b'));
  });
});
