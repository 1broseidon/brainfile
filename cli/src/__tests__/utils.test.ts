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

describe('tui: decisions and aliases (spec-12)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { isCompletable } = require('../tui/utils');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getTypeGlyph } = require('../tui/theme');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getTypeCycleOptions } = require('../tui/typeCycle');

  it('gives a decision the ● glyph under either name, and never offers to complete it', () => {
    expect(getTypeGlyph('decision')).toBe('●');
    expect(getTypeGlyph('ADR')).toBe('●');
    expect(getTypeGlyph('issue')).toBe('');
    expect(isCompletable({ id: 'decision-1', title: 'D', type: 'decision' })).toBe(false);
    expect(isCompletable({ id: 'adr-1', title: 'A', type: 'adr' })).toBe(false);
    expect(isCompletable({ id: 'spec-1', title: 'S', type: 'spec' })).toBe(true);
  });

  it('cycles through built-ins that have documents, one stop for adr and decision', () => {
    const board = (types: Record<string, unknown>, docTypes: string[]) => ({
      types,
      columns: [{ id: 'todo', title: 'To Do', tasks: docTypes.map((type, i) => ({ id: `x-${i}`, title: 'x', type })) }],
    });
    expect(getTypeCycleOptions(board({}, ['epic', 'decision']))).toEqual(['all', 'task', 'epic', 'decision']);
    expect(getTypeCycleOptions(board({ adr: {} }, ['decision']))).toEqual(['all', 'task', 'decision']);
    expect(getTypeCycleOptions(board({ adr: {}, issue: {}, bug: {} }, []))).toEqual(['all', 'task', 'adr', 'bug']);
  });
});
