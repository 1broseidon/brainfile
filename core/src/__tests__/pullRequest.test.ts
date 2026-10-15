import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { openPullRequestOf, parsePullRequest, pullRequestText, withPullRequest } from '../pullRequest';
import { readTaskFile, writeTaskFile } from '../taskFile';
import type { PullRequestRecord, Task } from '../types';

/**
 * `pullRequest:` on a task (decision-16, spec-18): read when whole, written
 * and read back as it was, and what a hand-off's pull request says.
 */

const record: PullRequestRecord = {
  number: 12,
  url: 'https://github.com/o/r/pull/12',
  state: 'open',
  base: 'main',
  head: 'dispatch/task-3',
  at: '2026-10-15T12:00:00.000Z',
};

describe('pullRequest on a task', () => {
  it('is read when whole, and refused when not', () => {
    expect(parsePullRequest(record)).toEqual(record);
    // YAML reads an unquoted time as a Date.
    expect(parsePullRequest({ ...record, at: new Date(record.at) })).toEqual(record);
    for (const broken of [null, 'pr', [], { ...record, number: 0 }, { ...record, number: '12' }, { ...record, state: 'draft' }, { ...record, url: '' }, { ...record, head: undefined }, { ...record, at: 'soon' }]) {
      expect(parsePullRequest(broken)).toBeNull();
    }
  });

  it('only an open one holds the hand-off out of Ready to merge', () => {
    expect(openPullRequestOf({ pullRequest: record })).toEqual(record);
    expect(openPullRequestOf({ pullRequest: { ...record, state: 'closed' } })).toBeNull();
    expect(openPullRequestOf({ pullRequest: { ...record, state: 'merged' } })).toBeNull();
    expect(openPullRequestOf({})).toBeNull();
  });

  it('is set and taken off without touching the rest of the task', () => {
    const task: Task = { id: 'task-3', title: 'Three', column: 'review', source: 'https://github.com/o/r/issues/1' };
    const set = withPullRequest(task, record);
    expect(set).toEqual({ ...task, pullRequest: record });
    expect(withPullRequest(set, null)).toEqual(task);
  });

  it('round-trips through the task file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-pr-'));
    try {
      const file = path.join(dir, 'task-3.md');
      writeTaskFile(file, withPullRequest({ id: 'task-3', title: 'Three', column: 'review' }, record), '## Description\nThree\n');
      const text = fs.readFileSync(file, 'utf-8');
      expect(text).toMatch(/pullRequest:\n {2}number: 12\n/);
      const read = readTaskFile(file);
      expect(parsePullRequest(read?.task.pullRequest)).toEqual(record);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("a hand-off's pull request", () => {
  it("is titled with the task's title and says its ID, the start of its description and the last notes", () => {
    const description = ['Make it so.', 'Second line.', '3', '4', '5', '6', '7 is left out'].join('\n');
    const log = [
      '- 2026-10-15T10:00:00.000Z: Started',
      '- 2026-10-15T11:00:00.000Z [claude]: Wrote the parser',
      '- 2026-10-15T12:00:00.000Z [claude]: Tests pass',
    ].join('\n');
    const { title, body } = pullRequestText({ id: 'task-3', title: 'Parse the thing', description }, log);
    expect(title).toBe('Parse the thing');
    expect(body).toBe(
      [
        'Brainfile task-3: Parse the thing',
        'Make it so.\nSecond line.\n3\n4\n5\n6\n…',
        'Last from the hand-off:\n- [claude] Wrote the parser\n- [claude] Tests pass',
        'Opened from the Brainfile board: merging it completes task-3.',
      ].join('\n\n')
    );
  });

  it('with no description or log, says the task and nothing more', () => {
    expect(pullRequestText({ id: 'task-4', title: 'Four' }).body).toBe('Brainfile task-4: Four\n\nOpened from the Brainfile board: merging it completes task-4.');
  });
});
