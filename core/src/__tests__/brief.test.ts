import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildBrief, isEmptyBrief, parseNoteLine, parseNotes } from '../brief';
import {
  getBriefStatePath,
  readBriefState,
  sanitizeAgentFilename,
  writeBriefState,
} from '../briefState';
import { appendLedgerRecord } from '../ledger';
import { writeTaskFile } from '../taskFile';
import { getV2Dirs } from '../workspace';
import { getDotBrainfileGitignorePath } from '../utils/files';
import type { LedgerRecord, Task } from '../types';
import type { V2Dirs } from '../workspace';

const T0 = '2026-08-01T00:00:00.000Z'; // well before everything
const LAST_BRIEF = '2026-08-10T00:00:00.000Z';
const NOW = '2026-08-11T00:00:00.000Z';

interface Fixture {
  dir: string;
  dirs: V2Dirs;
  brainfilePath: string;
}

function makeFixture(boardExtra = ''): Fixture {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-brief-test-'));
  const dot = path.join(dir, '.brainfile');
  fs.mkdirSync(path.join(dot, 'board'), { recursive: true });
  fs.mkdirSync(path.join(dot, 'logs'), { recursive: true });

  const brainfilePath = path.join(dot, 'brainfile.md');
  fs.writeFileSync(
    brainfilePath,
    `---
title: Brief Test Board
columns:
  - id: todo
    title: To Do
  - id: in-progress
    title: In Progress
  - id: done
    title: Done
    completionColumn: true
agent:
  instructions:
    - Always run the tests
${boardExtra}---
`,
    'utf-8',
  );

  return { dir, dirs: getV2Dirs(brainfilePath), brainfilePath };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Default task',
    column: 'todo',
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

/** An ADR already accepted via `adr promote` — lives in logs/ with status set. */
function addAcceptedAdr(fx: Fixture, id: string, title: string): void {
  writeTaskFile(
    path.join(fx.dirs.logsDir, `${id}.md`),
    { id, title, type: 'adr', status: 'promoted', createdAt: T0 } as Task,
    '',
  );
}

function addTask(fx: Fixture, task: Task, body = ''): string {
  const filePath = path.join(fx.dirs.boardDir, `${task.id}.md`);
  writeTaskFile(filePath, task, body);
  return filePath;
}

/**
 * Pin the board's mtime. `buildBrief` reads a real filesystem mtime for config
 * change detection (no BoardConfig.updatedAt exists), so a fixture written at
 * real wall-clock time would otherwise always postdate a fake checkpoint.
 */
function setBoardMtime(fx: Fixture, iso: string): void {
  const stamp = new Date(Date.parse(iso));
  fs.utimesSync(fx.brainfilePath, stamp, stamp);
}

function makeRecord(overrides: Partial<LedgerRecord> = {}): LedgerRecord {
  return {
    id: 'task-99',
    type: 'task',
    title: 'A finished thing',
    filesChanged: [],
    createdAt: T0,
    completedAt: '2026-08-10T12:00:00.000Z',
    cycleTimeHours: 3,
    summary: 'done',
    ...overrides,
  };
}

function lane(result: ReturnType<typeof buildBrief>, id: string) {
  const found = result.lanes.find((l) => l.id === id);
  if (!found) throw new Error(`lane ${id} missing from ${result.lanes.map((l) => l.id).join(',')}`);
  return found;
}

describe('buildBrief', () => {
  let fx: Fixture;

  beforeEach(() => {
    fx = makeFixture();
  });

  afterEach(() => {
    fs.rmSync(fx.dir, { recursive: true, force: true });
  });

  // ── full / first-run ──────────────────────────────────────────────────────

  describe('first-ever brief (full orientation)', () => {
    it('returns mode full with all four orientation lanes populated', () => {
      addTask(fx, makeTask({ id: 'task-1', title: 'Mine', assignee: 'codex' }),
        '## Log\n- 2026-08-09T00:00:00.000Z: [codex] earlier note\n');
      addTask(fx, makeTask({ id: 'task-2', title: 'Not mine', assignee: 'cursor' }));
      appendLedgerRecord(fx.dirs.logsDir, makeRecord({ assignee: 'codex' }));

      const result = buildBrief(fx.dirs, 'codex', { lastBriefAt: null, now: NOW });

      expect(result.mode).toBe('full');
      expect(result.lastBriefAt).toBeNull();
      expect(result.generatedAt).toBe(NOW);
      expect(result.lanes.map((l) => l.id)).toEqual([
        'orientation', 'assigned', 'notes', 'completions',
      ]);

      // Board title + agent instruction (adr-2: no rules lane).
      const orientation = lane(result, 'orientation');
      expect(orientation.items.map((i) => i.text)).toEqual([
        'Brief Test Board', 'Always run the tests',
      ]);
      expect(orientation.items.map((i) => i.why)).toEqual([
        'board', 'agent instructions',
      ]);

      expect(lane(result, 'assigned').items).toHaveLength(1);
      expect(lane(result, 'assigned').items[0].taskId).toBe('task-1');
      expect(lane(result, 'notes').items).toHaveLength(1);
      expect(lane(result, 'completions').items[0].taskId).toBe('task-99');
    });

    it('lists accepted ADRs in the orientation lane (adr-2 replaces rules)', () => {
      addAcceptedAdr(fx, 'adr-2', 'Kill the rules block');
      addAcceptedAdr(fx, 'adr-10', 'Per-repo boards');
      // A board-resident ADR with no accepted status is still a proposal.
      addTask(fx, makeTask({ id: 'adr-3', title: 'Undecided', type: 'adr' }));

      const result = buildBrief(fx.dirs, 'codex', { lastBriefAt: null, now: NOW });
      const orientation = lane(result, 'orientation');

      expect(orientation.items.map((i) => i.text)).toEqual([
        'Brief Test Board', 'Always run the tests', 'Kill the rules block', 'Per-repo boards',
      ]);
      expect(orientation.items.slice(2).map((i) => i.taskId)).toEqual(['adr-2', 'adr-10']);
      expect(orientation.items.slice(2).map((i) => i.why)).toEqual([
        'accepted adr', 'accepted adr',
      ]);
    });

    it('inlines contract status as current truth, never as a transition', () => {
      addTask(fx, makeTask({
        id: 'task-1',
        assignee: 'codex',
        column: 'in-progress',
        priority: 'high',
        contract: { status: 'in_progress' },
      }));

      const result = buildBrief(fx.dirs, 'codex', { lastBriefAt: null, now: NOW });
      const why = lane(result, 'assigned').items[0].why;

      expect(why).toBe('in-progress · high · contract:in_progress');
      expect(why).not.toMatch(/from|→|changed/);
    });

    it('makes no delta claims when there is no checkpoint', () => {
      addTask(fx, makeTask({ id: 'task-1', assignee: 'codex' }));
      const result = buildBrief(fx.dirs, 'codex', { lastBriefAt: null, now: NOW });
      expect(result.lanes.map((l) => l.id)).not.toContain('changes');
      expect(result.lanes.map((l) => l.id)).not.toContain('config');
    });
  });

  // ── delta ─────────────────────────────────────────────────────────────────

  describe('delta brief', () => {
    it('includes only tasks whose updatedAt/createdAt exceed lastBriefAt', () => {
      addTask(fx, makeTask({ id: 'task-old', assignee: 'codex', updatedAt: T0 }));
      addTask(fx, makeTask({
        id: 'task-touched', assignee: 'codex', updatedAt: '2026-08-10T06:00:00.000Z',
      }));
      addTask(fx, makeTask({
        id: 'task-new',
        assignee: 'codex',
        createdAt: '2026-08-10T09:00:00.000Z',
        updatedAt: '2026-08-10T09:00:00.000Z',
      }));

      const result = buildBrief(fx.dirs, 'codex', { lastBriefAt: LAST_BRIEF, now: NOW });

      expect(result.mode).toBe('delta');
      const ids = lane(result, 'changes').items.map((i) => i.taskId);
      expect(ids).toContain('task-touched');
      expect(ids).toContain('task-new');
      expect(ids).not.toContain('task-old');
    });

    it('labels a brand-new task as created, not updated', () => {
      addTask(fx, makeTask({
        id: 'task-new',
        assignee: 'codex',
        createdAt: '2026-08-10T09:00:00.000Z',
        updatedAt: '2026-08-10T09:00:00.000Z',
      }));

      const result = buildBrief(fx.dirs, 'codex', { lastBriefAt: LAST_BRIEF, now: NOW });
      expect(lane(result, 'changes').items[0].why).toMatch(/^created /);
    });

    // Finding 1: `brainfile note` does NOT bump updatedAt, so notes must be an
    // independent signal — a note on an otherwise-untouched task must surface.
    it('detects a new note purely from its timestamp, with updatedAt unchanged', () => {
      addTask(
        fx,
        makeTask({ id: 'task-1', assignee: 'codex', updatedAt: T0, createdAt: T0 }),
        '## Log\n- 2026-08-10T12:00:00.000Z: [codex] found the root cause\n',
      );

      const result = buildBrief(fx.dirs, 'codex', { lastBriefAt: LAST_BRIEF, now: NOW });

      // Task itself is NOT in changes (updatedAt never moved) ...
      expect(lane(result, 'changes').items).toHaveLength(0);
      // ... but the note still reaches the agent.
      const notes = lane(result, 'notes').items;
      expect(notes).toHaveLength(1);
      expect(notes[0].taskId).toBe('task-1');
      expect(notes[0].text).toBe('[codex] found the root cause');
      expect(notes[0].at).toBe('2026-08-10T12:00:00.000Z');
    });

    // Finding 2b: the two writers insert at opposite ends, so position in the
    // section does not encode recency.
    it('sorts mixed-format notes by timestamp, not by position in the section', () => {
      addTask(
        fx,
        makeTask({ id: 'task-1', assignee: 'codex' }),
        [
          '## Log',
          // core appendLog format, prepended (bracket BEFORE colon) — but OLDER
          '- 2026-08-10T02:00:00.000Z [claude]: core-format entry',
          // CLI note format, appended (bracket AFTER colon) — but NEWER
          '- 2026-08-10T20:00:00.000Z: [codex] cli-format entry',
          '',
        ].join('\n'),
      );

      const result = buildBrief(fx.dirs, 'codex', { lastBriefAt: LAST_BRIEF, now: NOW });
      const notes = lane(result, 'notes').items;

      expect(notes).toHaveLength(2);
      expect(notes[0].at).toBe('2026-08-10T20:00:00.000Z');
      expect(notes[1].at).toBe('2026-08-10T02:00:00.000Z');
      expect(notes[0].text).toBe('[codex] cli-format entry');
      expect(notes[1].text).toBe('[claude] core-format entry');
    });

    it('silently excludes hand-edited log lines with no parseable timestamp', () => {
      addTask(
        fx,
        makeTask({ id: 'task-1', assignee: 'codex' }),
        [
          '## Log',
          '- just a human writing a thought',
          '- 2026 was a rough year for this task',
          '- 2026-08-10T12:00:00.000Z: [codex] real entry',
          '',
        ].join('\n'),
      );

      const result = buildBrief(fx.dirs, 'codex', { lastBriefAt: LAST_BRIEF, now: NOW });
      const notes = lane(result, 'notes').items;

      expect(notes).toHaveLength(1);
      expect(notes[0].text).toBe('[codex] real entry');
    });

    // Finding 7: queryLedger's dateRange.from is INCLUSIVE; brief must be strict.
    it('excludes a completion whose completedAt equals lastBriefAt exactly', () => {
      appendLedgerRecord(fx.dirs.logsDir, makeRecord({
        id: 'task-boundary', assignee: 'codex', completedAt: LAST_BRIEF,
      }));
      appendLedgerRecord(fx.dirs.logsDir, makeRecord({
        id: 'task-after', assignee: 'codex', completedAt: '2026-08-10T00:00:00.001Z',
      }));

      const result = buildBrief(fx.dirs, 'codex', { lastBriefAt: LAST_BRIEF, now: NOW });
      const ids = lane(result, 'completions').items.map((i) => i.taskId);

      expect(ids).not.toContain('task-boundary');
      expect(ids).toContain('task-after');
    });

    // Finding 4: no BoardConfig.updatedAt exists — mtime is the only signal, and
    // it can only report THAT something changed.
    it('fires the config lane on board mtime with exactly one non-specific item', () => {
      const future = new Date(Date.parse('2026-08-10T18:00:00.000Z'));
      fs.utimesSync(fx.brainfilePath, future, future);

      const result = buildBrief(fx.dirs, 'codex', { lastBriefAt: LAST_BRIEF, now: NOW });
      const config = lane(result, 'config').items;

      expect(config).toHaveLength(1);
      expect(config[0].why).toBe('brainfile.md changed since last brief');
      // Must not name a specific rule — that diff does not exist.
      expect(config[0].text).not.toMatch(/Write tests first|Commit secrets/);
    });

    it('leaves the config lane empty when the board predates the checkpoint', () => {
      const past = new Date(Date.parse('2026-08-02T00:00:00.000Z'));
      fs.utimesSync(fx.brainfilePath, past, past);

      const result = buildBrief(fx.dirs, 'codex', { lastBriefAt: LAST_BRIEF, now: NOW });
      expect(lane(result, 'config').items).toHaveLength(0);
    });

    it('treats an all-empty delta as a valid result, not an error', () => {
      const past = new Date(Date.parse('2026-08-02T00:00:00.000Z'));
      fs.utimesSync(fx.brainfilePath, past, past);
      addTask(fx, makeTask({ id: 'task-1', assignee: 'codex', updatedAt: T0 }));

      const result = buildBrief(fx.dirs, 'codex', { lastBriefAt: LAST_BRIEF, now: NOW });

      expect(result.mode).toBe('delta');
      expect(isEmptyBrief(result)).toBe(true);
      expect(result.lanes).toHaveLength(4);
    });
  });

  // ── assignee matching (finding 9) ─────────────────────────────────────────

  describe('assignee matching', () => {
    it('matches case-insensitively', () => {
      addTask(fx, makeTask({ id: 'task-1', assignee: 'Codex' }));
      const result = buildBrief(fx.dirs, 'codex', { lastBriefAt: null, now: NOW });
      expect(lane(result, 'assigned').items).toHaveLength(1);
    });

    it('does NOT substring-match, unlike search.ts', () => {
      addTask(fx, makeTask({ id: 'task-1', assignee: 'cursor-2' }));
      const result = buildBrief(fx.dirs, 'cursor', { lastBriefAt: null, now: NOW });
      expect(lane(result, 'assigned').items).toHaveLength(0);
    });

    it('ignores unassigned tasks', () => {
      addTask(fx, makeTask({ id: 'task-1' }));
      const result = buildBrief(fx.dirs, 'codex', { lastBriefAt: null, now: NOW });
      expect(lane(result, 'assigned').items).toHaveLength(0);
    });

    // queryLedger's own assignee filter is case-SENSITIVE, so brief filters itself.
    it('matches ledger assignees case-insensitively too', () => {
      appendLedgerRecord(fx.dirs.logsDir, makeRecord({ id: 'task-l', assignee: 'Codex' }));
      const result = buildBrief(fx.dirs, 'codex', { lastBriefAt: null, now: NOW });
      expect(lane(result, 'completions').items.map((i) => i.taskId)).toContain('task-l');
    });
  });

  // ── robustness ────────────────────────────────────────────────────────────

  it('treats an unparseable stored checkpoint as a first brief', () => {
    addTask(fx, makeTask({ id: 'task-1', assignee: 'codex' }));
    const result = buildBrief(fx.dirs, 'codex', { lastBriefAt: 'not-a-date', now: NOW });
    expect(result.mode).toBe('full');
    expect(result.lastBriefAt).toBeNull();
  });

  it('shows an unstamped fallback note in full mode only', () => {
    addTask(fx, makeTask({ id: 'task-1', assignee: 'codex' }), '## Log\n- hand written thought\n');

    const full = buildBrief(fx.dirs, 'codex', { lastBriefAt: null, now: NOW });
    expect(lane(full, 'notes').items[0].why).toBe('unstamped entry');
    expect(lane(full, 'notes').items[0].at).toBeUndefined();

    const delta = buildBrief(fx.dirs, 'codex', { lastBriefAt: LAST_BRIEF, now: NOW });
    expect(lane(delta, 'notes').items).toHaveLength(0);
  });
});

describe('parseNoteLine', () => {
  it('parses the core appendLog format (bracket before colon)', () => {
    const parsed = parseNoteLine('- 2026-08-10T02:00:00.000Z [claude]: did a thing');
    expect(parsed).toEqual({
      at: '2026-08-10T02:00:00.000Z', text: 'did a thing', agent: 'claude',
    });
  });

  it('parses the CLI note format (bracket after colon)', () => {
    const parsed = parseNoteLine('- 2026-08-10T02:00:00.000Z: [codex] did a thing');
    expect(parsed).toEqual({
      at: '2026-08-10T02:00:00.000Z', text: 'did a thing', agent: 'codex',
    });
  });

  it('parses an unattributed entry in both formats', () => {
    expect(parseNoteLine('- 2026-08-10T02:00:00.000Z: plain')?.text).toBe('plain');
    expect(parseNoteLine('- 2026-08-10T02:00:00.000Z: plain')?.agent).toBeUndefined();
  });

  it('rejects lines without a leading ISO-8601 token', () => {
    expect(parseNoteLine('- just text')).toBeNull();
    expect(parseNoteLine('- 2026 was rough')).toBeNull();
    expect(parseNoteLine('not a list item')).toBeNull();
    expect(parseNoteLine('')).toBeNull();
  });

  it('returns an empty list for a body with no log section', () => {
    expect(parseNotes('## Description\nhello\n')).toEqual([]);
  });
});

describe('brief state', () => {
  let fx: Fixture;

  beforeEach(() => {
    fx = makeFixture();
  });

  afterEach(() => {
    fs.rmSync(fx.dir, { recursive: true, force: true });
  });

  it('reports null for an agent that has never briefed', () => {
    expect(readBriefState(fx.brainfilePath, 'codex').lastBriefAt).toBeNull();
    expect(fs.existsSync(getBriefStatePath(fx.brainfilePath, 'codex'))).toBe(false);
  });

  it('round-trips a checkpoint through an atomic write', () => {
    writeBriefState(fx.brainfilePath, 'codex', NOW);
    const state = readBriefState(fx.brainfilePath, 'codex');

    expect(state).toEqual({ version: 1, agent: 'codex', lastBriefAt: NOW });
    expect(getBriefStatePath(fx.brainfilePath, 'codex'))
      .toBe(path.join(fx.dir, '.brainfile', 'state', 'codex.json'));
  });

  it('keeps per-agent checkpoints isolated', () => {
    writeBriefState(fx.brainfilePath, 'codex', NOW);
    expect(readBriefState(fx.brainfilePath, 'claude').lastBriefAt).toBeNull();
  });

  it('leaves no temp files behind', () => {
    writeBriefState(fx.brainfilePath, 'codex', NOW);
    const entries = fs.readdirSync(path.join(fx.dir, '.brainfile', 'state'));
    expect(entries).toEqual(['codex.json']);
  });

  it('degrades gracefully on a corrupt state file', () => {
    const statePath = getBriefStatePath(fx.brainfilePath, 'codex');
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, '{ not json', 'utf-8');

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(readBriefState(fx.brainfilePath, 'codex').lastBriefAt).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  // Finding 3: without this, per-agent state gets committed.
  it('gitignores the state directory on write', () => {
    writeBriefState(fx.brainfilePath, 'codex', NOW);
    const ignore = fs.readFileSync(getDotBrainfileGitignorePath(fx.brainfilePath), 'utf-8');
    expect(ignore.split('\n').map((l) => l.trim())).toContain('state/');
  });

  it('does not duplicate the ignore entry across repeated writes', () => {
    writeBriefState(fx.brainfilePath, 'codex', NOW);
    writeBriefState(fx.brainfilePath, 'codex', NOW);
    writeBriefState(fx.brainfilePath, 'claude', NOW);

    const ignore = fs.readFileSync(getDotBrainfileGitignorePath(fx.brainfilePath), 'utf-8');
    const hits = ignore.split('\n').filter((l) => l.trim() === 'state/');
    expect(hits).toHaveLength(1);
  });

  it('sanitizes agent names into safe filenames', () => {
    expect(sanitizeAgentFilename('Codex')).toBe('codex');
    expect(sanitizeAgentFilename('../../etc/passwd')).toBe('.._.._etc_passwd');
    expect(sanitizeAgentFilename('agent name!')).toBe('agent_name_');
    expect(sanitizeAgentFilename('  ')).toBe('_');
  });
});

// ── two-agent integration (§6.2 of the spec) ────────────────────────────────

describe('two-agent brief flow', () => {
  let fx: Fixture;

  beforeEach(() => {
    fx = makeFixture();
  });

  afterEach(() => {
    fs.rmSync(fx.dir, { recursive: true, force: true });
  });

  it('carries a note and a move from agent A to agent B, then goes quiet', () => {
    addTask(fx, makeTask({ id: 'task-a', assignee: 'agent-a' }));
    addTask(fx, makeTask({ id: 'task-b', assignee: 'agent-b' }));
    setBoardMtime(fx, T0);

    // 1. Agent A briefs → full.
    const aFirst = buildBrief(fx.dirs, 'agent-a', {
      lastBriefAt: readBriefState(fx.brainfilePath, 'agent-a').lastBriefAt,
      now: '2026-08-11T00:00:00.000Z',
    });
    expect(aFirst.mode).toBe('full');
    writeBriefState(fx.brainfilePath, 'agent-a', aFirst.generatedAt);

    // 2. Agent B briefs for the first time → full, establishing a checkpoint.
    const bFirst = buildBrief(fx.dirs, 'agent-b', {
      lastBriefAt: readBriefState(fx.brainfilePath, 'agent-b').lastBriefAt,
      now: '2026-08-11T01:00:00.000Z',
    });
    expect(bFirst.mode).toBe('full');
    writeBriefState(fx.brainfilePath, 'agent-b', bFirst.generatedAt);

    // 3. Agent A adds a note to B's task (CLI note format — MCP has no note
    //    tool) and moves it. The note does NOT bump updatedAt; the move does.
    addTask(
      fx,
      makeTask({
        id: 'task-b',
        assignee: 'agent-b',
        column: 'in-progress',
        updatedAt: '2026-08-11T02:00:00.000Z',
      }),
      '## Log\n- 2026-08-11T02:00:00.000Z: [agent-a] please pick this up\n',
    );

    // 4. Agent B briefs again → delta showing BOTH the note and the move.
    const bDelta = buildBrief(fx.dirs, 'agent-b', {
      lastBriefAt: readBriefState(fx.brainfilePath, 'agent-b').lastBriefAt,
      now: '2026-08-11T03:00:00.000Z',
    });
    expect(bDelta.mode).toBe('delta');
    expect(lane(bDelta, 'notes').items[0].text).toBe('[agent-a] please pick this up');
    expect(lane(bDelta, 'changes').items[0].taskId).toBe('task-b');
    expect(lane(bDelta, 'changes').items[0].why).toContain('in-progress');
    writeBriefState(fx.brainfilePath, 'agent-b', bDelta.generatedAt);

    // 5. Agent B briefs immediately again → empty delta.
    const bQuiet = buildBrief(fx.dirs, 'agent-b', {
      lastBriefAt: readBriefState(fx.brainfilePath, 'agent-b').lastBriefAt,
      now: '2026-08-11T03:00:01.000Z',
    });
    expect(bQuiet.mode).toBe('delta');
    expect(isEmptyBrief(bQuiet)).toBe(true);
  });

  it('peek shows new work without advancing the checkpoint', () => {
    addTask(fx, makeTask({ id: 'task-b', assignee: 'agent-b' }));
    setBoardMtime(fx, T0);

    const first = buildBrief(fx.dirs, 'agent-b', {
      lastBriefAt: null,
      now: '2026-08-11T00:00:00.000Z',
    });
    writeBriefState(fx.brainfilePath, 'agent-b', first.generatedAt);
    const checkpoint = readBriefState(fx.brainfilePath, 'agent-b').lastBriefAt;

    // A note lands.
    addTask(
      fx,
      makeTask({ id: 'task-b', assignee: 'agent-b' }),
      '## Log\n- 2026-08-11T01:00:00.000Z: [agent-a] new info\n',
    );

    // Peek: build, but deliberately do NOT write state.
    const peeked = buildBrief(fx.dirs, 'agent-b', {
      lastBriefAt: checkpoint,
      now: '2026-08-11T02:00:00.000Z',
    });
    expect(lane(peeked, 'notes').items).toHaveLength(1);
    expect(readBriefState(fx.brainfilePath, 'agent-b').lastBriefAt).toBe(checkpoint);

    // A subsequent real brief still shows the same note.
    const real = buildBrief(fx.dirs, 'agent-b', {
      lastBriefAt: readBriefState(fx.brainfilePath, 'agent-b').lastBriefAt,
      now: '2026-08-11T03:00:00.000Z',
    });
    expect(lane(real, 'notes').items).toHaveLength(1);
  });

  it('peek on a first-ever brief creates no state file', () => {
    addTask(fx, makeTask({ id: 'task-1', assignee: 'fresh' }));

    const result = buildBrief(fx.dirs, 'fresh', {
      lastBriefAt: readBriefState(fx.brainfilePath, 'fresh').lastBriefAt,
      now: NOW,
    });

    expect(result.mode).toBe('full');
    expect(fs.existsSync(getBriefStatePath(fx.brainfilePath, 'fresh'))).toBe(false);
  });
});
