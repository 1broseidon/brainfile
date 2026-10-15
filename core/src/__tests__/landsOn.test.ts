/**
 * Where a hand-off lands (decision-16): the target a task inherits from its
 * parent up the tree, an epic's own branch for what is under it, and the
 * branch names the board may hold.
 */
import { epicBranchOf, isBranchName, landsOnOf, targetOf } from '../landsOn';
import type { Task } from '../types';

const doc = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, ...extra });

describe('landsOnOf', () => {
  it('is none, the trunk, when nothing up the tree names one', () => {
    const docs = [doc('epic-1'), doc('task-1', { parentId: 'epic-1' })];
    expect(landsOnOf(docs, 'task-1')).toBeNull();
    expect(landsOnOf(docs, 'task-404')).toBeNull();
  });

  it('is the nearest that sets landsOn: the task, else its parent, up the tree', () => {
    const docs = [
      doc('epic-1', { landsOn: 'release/0.38.0' }),
      doc('spec-1', { parentId: 'epic-1' }),
      doc('task-1', { parentId: 'spec-1' }),
      doc('task-2', { parentId: 'spec-1', landsOn: 'main' }),
    ];
    expect(targetOf(docs, 'task-1')).toEqual({ branch: 'release/0.38.0', from: 'epic-1', epicBranch: false });
    expect(targetOf(docs, 'task-2')).toEqual({ branch: 'main', from: 'task-2', epicBranch: false });
    expect(landsOnOf(new Map(docs.map((d) => [d.id, d])), 'epic-1')).toBe('release/0.38.0');
  });

  it('is an epic\'s own branch under an epic with epicBranch; the epic itself lands on its own target', () => {
    const docs = [
      doc('epic-1', { landsOn: 'release', epicBranch: true }),
      doc('task-1', { parentId: 'epic-1' }),
      doc('task-2', { parentId: 'task-1' }),
      doc('task-3', { parentId: 'epic-1', landsOn: 'hotfix' }),
    ];
    expect(targetOf(docs, 'task-2')).toEqual({ branch: 'dispatch/epic-1', from: 'epic-1', epicBranch: true });
    expect(landsOnOf(docs, 'task-3')).toBe('hotfix');
    expect(landsOnOf(docs, 'epic-1')).toBe('release');
    expect(epicBranchOf('epic-1')).toBe('dispatch/epic-1');
  });

  it('stops at a loop, and at a parent that is not there', () => {
    const docs = [doc('task-1', { parentId: 'task-2' }), doc('task-2', { parentId: 'task-1' }), doc('task-3', { parentId: 'epic-9' })];
    expect(landsOnOf(docs, 'task-1')).toBeNull();
    expect(landsOnOf(docs, 'task-3')).toBeNull();
  });
});

describe('isBranchName', () => {
  it.each(['main', 'release/0.38.0', 'feature/a-b_c', 'v1.2'])('takes %s', (name) => expect(isBranchName(name)).toBe(true));
  it.each(['', ' main', 'two words', '-x', 'a..b', 'a/', '/a', 'a//b', 'a.lock', 'a/.b', 'a~1', 'a^', 'a:b', 'a?', 'a*', 'a[b', 'a\\b', 'a@{1}', '@', 'a.'])(
    'refuses %p',
    (name) => expect(isBranchName(name)).toBe(false)
  );
});
