import type { Task } from '@brainfile/core';

import { parseSearchQuery, taskMatchesFilter } from '../tui/utils';

describe('tui utils search: contract status filters', () => {
  const makeTask = (overrides: Partial<any> = {}): Task =>
    ({
      id: 'task-1',
      title: 'Example task',
      tags: ['backend'],
      priority: 'high',
      assignee: 'alice',
      ...overrides,
    }) as any;

  it('parseSearchQuery should parse contract:<status> filters', () => {
    expect(parseSearchQuery('contract:ready')).toEqual({ text: '', contract: 'ready' });
    expect(parseSearchQuery('contract:in_progress')).toEqual({ text: '', contract: 'in_progress' });
    expect(parseSearchQuery('contract:delivered')).toEqual({ text: '', contract: 'delivered' });
    expect(parseSearchQuery('contract:done')).toEqual({ text: '', contract: 'done' });
    expect(parseSearchQuery('contract:failed')).toEqual({ text: '', contract: 'failed' });
  });

  it('taskMatchesFilter should match only tasks with matching contract status', () => {
    const taskReady = makeTask({ contract: { status: 'ready' } });
    const taskInProgress = makeTask({ id: 'task-2', contract: { status: 'in_progress' } });
    const taskNoContract = makeTask({ id: 'task-3' });

    const filter = parseSearchQuery('contract:in_progress');

    expect(taskMatchesFilter(taskReady, filter)).toBe(false);
    expect(taskMatchesFilter(taskInProgress, filter)).toBe(true);
    expect(taskMatchesFilter(taskNoContract, filter)).toBe(false);
  });

  it('contract filters should combine with other filters (tag + contract)', () => {
    const taskBackendReady = makeTask({ contract: { status: 'ready' }, tags: ['backend'] });
    const taskFrontendReady = makeTask({ id: 'task-2', contract: { status: 'ready' }, tags: ['frontend'] });
    const taskBackendDone = makeTask({ id: 'task-3', contract: { status: 'done' }, tags: ['backend'] });

    const filter = parseSearchQuery('#backend contract:ready');

    expect(taskMatchesFilter(taskBackendReady, filter)).toBe(true);
    expect(taskMatchesFilter(taskFrontendReady, filter)).toBe(false);
    expect(taskMatchesFilter(taskBackendDone, filter)).toBe(false);
  });

  it('contract filters should combine with priority + assignee', () => {
    const taskMatch = makeTask({ contract: { status: 'failed' }, priority: 'high', assignee: 'alice' });
    const taskWrongPriority = makeTask({ id: 'task-2', contract: { status: 'failed' }, priority: 'low', assignee: 'alice' });
    const taskWrongAssignee = makeTask({ id: 'task-3', contract: { status: 'failed' }, priority: 'high', assignee: 'bob' });

    const filter = parseSearchQuery('p:high @alice contract:failed');

    expect(taskMatchesFilter(taskMatch, filter)).toBe(true);
    expect(taskMatchesFilter(taskWrongPriority, filter)).toBe(false);
    expect(taskMatchesFilter(taskWrongAssignee, filter)).toBe(false);
  });
});
