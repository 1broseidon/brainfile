import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  briefItemLine,
  checkClaimKeyPrefix,
  checkDecision,
  checkExitCode,
  composeBrief,
  DEFAULT_BRIEF_MAX_CHARS,
  renderBriefText,
  setSqliteLoaderForTesting,
  sqliteAvailable,
} from '../memory';
import { decideFile, retireDecisionFile } from '../decisionOperations';
import { writeTaskFile } from '../taskFile';
import { appendLedgerRecord } from '../ledger';
import { getV2Dirs, type V2Dirs } from '../workspace';

const HAS_SQLITE = sqliteAvailable();
const itIndex = HAS_SQLITE ? it : it.skip;
const NOW = '2026-10-12T12:00:00.000Z';

interface Fixture {
  root: string;
  brainfilePath: string;
  dirs: V2Dirs;
}

function makeBoard(): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-memory-'));
  spawnSync('git', ['init', '-q'], { cwd: root });
  const dot = path.join(root, '.brainfile');
  fs.mkdirSync(path.join(dot, 'board'), { recursive: true });
  fs.mkdirSync(path.join(dot, 'logs'), { recursive: true });
  const brainfilePath = path.join(dot, 'brainfile.md');
  fs.writeFileSync(brainfilePath, '---\ntitle: Memory Board\ncolumns:\n  - id: todo\n    title: To Do\n  - id: in-progress\n    title: In Progress\n---\n');
  return { root, brainfilePath, dirs: getV2Dirs(brainfilePath) };
}

describe('composeBrief', () => {
  let fx: Fixture;
  beforeEach(() => {
    fx = makeBoard();
    fs.writeFileSync(path.join(fx.root, 'README.md'), '# Service\n\n## Index design\n\nThe search index lives in sqlite with fts5.\n');
    decideFile(fx.dirs, { claimKey: 'storage.index', text: 'Index with sqlite fts5', stance: 'prefers', subject: 'sqlite' });
    const old = decideFile(fx.dirs, { claimKey: 'dependency.http-client', text: 'Use axios' });
    decideFile(fx.dirs, { claimKey: 'dependency.http-client', text: 'Use undici' });
    decideFile(fx.dirs, { claimKey: 'release.window', text: 'Release on Tuesdays', validUntil: '2026-01-01', recheck: 'ask the release manager' });
    writeTaskFile(path.join(fx.dirs.boardDir, 'task-1.md'), {
      id: 'task-1', title: 'Build the search index', column: 'in-progress', assignee: 'claude', priority: 'high',
      decisions: [old.decision!.id], createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-11T00:00:00.000Z',
    }, '## Log\n- 2026-10-11T10:00:00.000Z [codex]: wired the fts table\n');
    writeTaskFile(path.join(fx.dirs.boardDir, 'task-2.md'), { id: 'task-2', title: 'Someone else', column: 'todo', assignee: 'codex' });
    appendLedgerRecord(fx.dirs.logsDir, { id: 'task-9', type: 'task', title: 'Shipped the scanner', filesChanged: [], createdAt: '2026-10-01T00:00:00Z', completedAt: '2026-10-11T08:00:00Z', cycleTimeHours: 3, summary: '', assignee: 'claude' });
  });
  afterEach(() => {
    setSqliteLoaderForTesting(undefined);
    fs.rmSync(fx.root, { recursive: true, force: true });
  });

  it('builds the lanes: heads up, decisions, your tasks, what changed', () => {
    const brief = composeBrief(fx.dirs, 'claude', { lastBriefAt: null, now: NOW, docs: false });
    const lane = (id: string) => brief.sections.find((s) => s.id === id)!;
    expect(brief.sections.map((s) => s.id)).toEqual(['warnings', 'decisions', 'tasks', 'changes', 'docs']);
    expect(lane('warnings').items.map((i) => i.taskId)).toEqual(['task-1', 'decision-4']);
    expect(lane('warnings').items[0].text).toBe('Build the search index: rests on superseded decision-2 (now decision-3)');
    expect(lane('warnings').items[1].text).toContain('valid until expired · recheck: ask the release manager');
    expect(lane('decisions').items.map((i) => i.text)).toEqual([
      'dependency.http-client: Use undici',
      'release.window: Release on Tuesdays',
      'storage.index: Index with sqlite fts5',
    ]);
    expect(lane('decisions').items[2].why).toBe('prefers sqlite');
    expect(lane('tasks')).toMatchObject({ label: 'Your tasks', items: [{ taskId: 'task-1', why: 'In Progress · high' }] });
    expect(lane('changes').label).toBe('Lately');
    expect(lane('changes').items.map((i) => i.text)).toEqual(['note: wired the fts table', 'completed: Shipped the scanner']);
    expect(brief.mode).toBe('full');
    expect(brief.text.startsWith('Brainfile brief for claude · Memory Board (first brief)')).toBe(true);
    expect(brief.text).toContain('! task-1 Build the search index: rests on superseded decision-2 (now decision-3)');
    expect(brief.text).toContain('## Current decisions');
    expect(brief.maxChars).toBe(DEFAULT_BRIEF_MAX_CHARS);
    expect(brief.text.length).toBeLessThanOrEqual(DEFAULT_BRIEF_MAX_CHARS);
    expect(brief.docsMode).toBe('none');
  });

  it('shows work in flight when nothing is assigned, and decisions made since the checkpoint', () => {
    const since = new Date(Date.now() - 60_000).toISOString();
    retireDecisionFile(fx.dirs, 'decision-1', 'rejected', { note: 'not now' });
    const brief = composeBrief(fx.dirs, 'gemini', { lastBriefAt: since, docs: false });
    const tasks = brief.sections.find((s) => s.id === 'tasks')!;
    expect(tasks.label).toBe('In flight');
    expect(tasks.items.map((i) => i.taskId)).toEqual(['task-1']);
    const changes = brief.sections.find((s) => s.id === 'changes')!;
    expect(changes.label).toBe('Since your last brief');
    expect(changes.items.map((i) => i.text)).toEqual(expect.arrayContaining(['rejected: Index with sqlite fts5']));
    expect(brief.text).toMatch(/\(since (just now|\d+m ago)\)/);
  });

  itIndex('adds the docs that bear on the tasks from the index', () => {
    const brief = composeBrief(fx.dirs, 'claude', { lastBriefAt: null, now: NOW, refreshBudgetMs: 5000 });
    expect(brief.docsMode).toBe('index');
    const docs = brief.sections.find((s) => s.id === 'docs')!;
    expect(docs.items).toEqual([{ text: 'Service', why: 'README.md:1-5' }]);
    expect(brief.text).toContain('- README.md:1-5 Service');
  });

  it('skips the docs lane without node:sqlite', () => {
    setSqliteLoaderForTesting(() => null);
    const brief = composeBrief(fx.dirs, 'claude', { lastBriefAt: null, now: NOW });
    expect(brief.docsMode).toBe('none');
    expect(brief.sections.find((s) => s.id === 'docs')!.items).toEqual([]);
  });

  it('keeps to the budget and says what it left out', () => {
    const brief = composeBrief(fx.dirs, 'claude', { lastBriefAt: null, now: NOW, maxChars: 300, docs: false });
    expect(brief.text.length).toBeLessThanOrEqual(300);
    expect(brief.truncated).toBe(true);
    expect(brief.text).toMatch(/\(\+\d+ more: brainfile brief --agent claude --max-chars 0\)$/);
    const all = composeBrief(fx.dirs, 'claude', { lastBriefAt: null, now: NOW, maxChars: 0, docs: false });
    expect(all.truncated).toBe(false);
    expect(all.text).toContain('Release on Tuesdays');
  });
});

describe('renderBriefText', () => {
  const lanes = [
    { id: 'warnings', label: 'Heads up', items: [{ taskId: 'task-1', text: 'rests on superseded decision-1', why: 'w' }] },
    { id: 'decisions', label: 'Current decisions', items: Array.from({ length: 6 }, (_, i) => ({ taskId: `decision-${i}`, text: `Decision number ${i} with words`, why: 'prefers x' })) },
    { id: 'tasks', label: 'Your tasks', items: [{ taskId: 'task-2', text: 'Do it', why: 'To Do' }] },
    { id: 'changes', label: 'Lately', items: [] },
    { id: 'docs', label: 'Docs', items: [{ text: 'Guide', why: 'docs/g.md:1-9' }] },
  ];

  it('gives every lane its first item before any lane gets a second', () => {
    const { text, truncated } = renderBriefText('Header', lanes, 260, 'claude');
    expect(truncated).toBe(true);
    expect(text.length).toBeLessThanOrEqual(260);
    expect(text).toContain('- task-2 Do it · To Do');
    expect(text).toContain('- docs/g.md:1-9 Guide');
    expect(text).toContain('- decision-0 Decision number 0 with words (prefers x)');
    expect(text).not.toContain('## Lately');
  });

  it('prints everything with no budget, says when there is nothing, and cuts a tiny budget hard', () => {
    expect(renderBriefText('Header', lanes, 0).text.split('\n')).toHaveLength(1 + 1 + 1 + 6 + 1 + 1 + 1 + 1);
    expect(renderBriefText('Header', [], 0)).toEqual({ text: 'Header\nNothing on the board for you yet.', truncated: false });
    expect(renderBriefText('Header', [], 10).text.length).toBeLessThanOrEqual(10);
    expect(renderBriefText('A long header line', lanes, 12).text.length).toBeLessThanOrEqual(12);
    expect(briefItemLine('changes', { text: 'x', why: '' })).toBe('- x');
  });
});

describe('check', () => {
  let fx: Fixture;
  beforeEach(() => {
    fx = makeBoard();
    fs.writeFileSync(path.join(fx.root, 'package.json'), JSON.stringify({ dependencies: { undici: '6.2.0' } }));
    decideFile(fx.dirs, { claimKey: 'dependency.http-client', text: 'Use axios for HTTP' });
    decideFile(fx.dirs, { claimKey: 'dependency.http-client', text: 'Use undici for HTTP, never axios', stance: 'forbids', subject: 'axios', packageVersion: 'undici>=6' });
    decideFile(fx.dirs, { claimKey: 'dependency.json', text: 'Parse JSON with the built-in parser', stance: 'prefers', subject: 'JSON.parse' });
    decideFile(fx.dirs, { claimKey: 'release.window', text: 'Release on Tuesdays', validUntil: '2026-01-01' });
  });
  afterEach(() => {
    setSqliteLoaderForTesting(undefined);
    fs.rmSync(fx.root, { recursive: true, force: true });
  });

  const both = (name: string, run: (scan: boolean) => void) => {
    (HAS_SQLITE ? it : it.skip)(`${name} (index)`, () => run(false));
    it(`${name} (scan)`, () => run(true));
  };

  both('blocks an action that contradicts a forbidding decision', (scan) => {
    const { matchedBy, result } = checkDecision(fx.brainfilePath, { query: 'add axios for retries', scan, now: Date.parse(NOW) });
    expect(matchedBy).toBe(scan ? 'scan' : 'index');
    expect(result).toMatchObject({ claimKey: 'dependency.http-client', verdict: 'review', recommendation: 'block_action', reason: 'request_contradicts_decision', subject: 'axios', predicateStatus: 'holds' });
    expect(result.current?.id).toBe('decision-2');
    expect(result.family.map((d) => d.id)).toEqual(['decision-2', 'decision-1']);
    expect(checkExitCode(result.verdict)).toBe(2);
  });

  both('says use for a consistent action', (scan) => {
    const { result } = checkDecision(fx.brainfilePath, { query: 'remove axios from the http layer', scan });
    expect(result).toMatchObject({ verdict: 'use', reason: 'request_consistent_with_decision' });
    expect(checkExitCode(result.verdict)).toBe(0);
  });

  both('says no_decision when nothing speaks to the action', (scan) => {
    const { result } = checkDecision(fx.brainfilePath, { query: 'rename the logger module', scan });
    expect(result).toMatchObject({ verdict: 'no_decision', recommendation: 'proceed_without_memory' });
  });

  it('checks a decision by ID: history points at its replacement', () => {
    const { matchedBy, result } = checkDecision(fx.brainfilePath, { query: 'decision-1' });
    expect(matchedBy).toBe('decision');
    expect(result).toMatchObject({ verdict: 'use_replacement', replacement: { id: 'decision-2' }, matched: { id: 'decision-1', status: 'superseded' } });
    expect(checkExitCode(result.verdict)).toBe(3);
  });

  it('checks a claim key, as a flag or as the query, and reviews an expired decision', () => {
    expect(checkDecision(fx.brainfilePath, { claimKey: 'release.window', now: Date.parse(NOW) }).result)
      .toMatchObject({ verdict: 'review', recommendation: 'revalidate', reason: 'valid_until_expired' });
    expect(checkDecision(fx.brainfilePath, { query: 'dependency.json' })).toMatchObject({ matchedBy: 'claim_key', result: { verdict: 'use' } });
    expect(checkDecision(fx.brainfilePath, { claimKey: 'nothing.here' }).result).toMatchObject({ verdict: 'no_decision', reason: 'empty_family' });
    expect(checkDecision(fx.brainfilePath, { claimKey: 'decision-3' }).result.claimKey).toBe('dependency.json');
    expect(checkDecision(fx.brainfilePath, {}).result.verdict).toBe('no_decision');
  });

  it('reviews a broken package predicate', () => {
    fs.writeFileSync(path.join(fx.root, 'package.json'), JSON.stringify({ dependencies: { undici: '5.0.0' } }));
    expect(checkDecision(fx.brainfilePath, { claimKey: 'dependency.http-client' }).result)
      .toMatchObject({ verdict: 'review', recommendation: 'revalidate', reason: 'package_version_mismatch' });
  });

  it('gives the worst verdict under a prefix', () => {
    const prefix = checkClaimKeyPrefix(fx.brainfilePath, 'dependency', { query: 'add axios' });
    expect(prefix).toMatchObject({ claimKeyPrefix: 'dependency', verdict: 'review', decidingClaimKey: 'dependency.http-client', familyCount: 2 });
    expect(checkClaimKeyPrefix(fx.brainfilePath, 'dependency.json')).toMatchObject({ verdict: 'use', familyCount: 1 });
    expect(checkClaimKeyPrefix(fx.brainfilePath, 'nope')).toMatchObject({ verdict: 'no_decision', familyCount: 0, families: [] });
  });

  it('matches by scan when node:sqlite is unavailable', () => {
    setSqliteLoaderForTesting(() => null);
    const { matchedBy, result } = checkDecision(fx.brainfilePath, { query: 'parse json with a faster library' });
    expect(matchedBy).toBe('scan');
    expect(result.claimKey).toBe('dependency.json');
  });
});
