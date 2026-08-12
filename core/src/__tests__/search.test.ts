import {
  parseSearchQuery,
  taskMatchesFilters,
  scoreTaskDocument,
  searchTasksRanked,
  type SearchFilters,
} from '../search';
import type { Task, TaskDocument } from '../types';

function makeTask(overrides: Partial<Task> = {}): Task {
  return { id: 'task-1', title: 'A task', ...overrides };
}

function makeDoc(task: Partial<Task> = {}, body = ''): TaskDocument {
  return { task: makeTask(task), body };
}

describe('search', () => {
  describe('parseSearchQuery', () => {
    it('parses priority tokens', () => {
      expect(parseSearchQuery('p:high')).toEqual({ text: '', priority: 'high' });
      expect(parseSearchQuery('priority:critical')).toEqual({ text: '', priority: 'critical' });
    });

    it('parses tag tokens in all three forms', () => {
      expect(parseSearchQuery('t:bug')).toEqual({ text: '', tag: 'bug' });
      expect(parseSearchQuery('tag:feature')).toEqual({ text: '', tag: 'feature' });
      expect(parseSearchQuery('#backend')).toEqual({ text: '', tag: 'backend' });
    });

    it('parses assignee tokens', () => {
      expect(parseSearchQuery('@alice')).toEqual({ text: '', assignee: 'alice' });
      expect(parseSearchQuery('assignee:bob')).toEqual({ text: '', assignee: 'bob' });
    });

    it('parses due and contract tokens, ignoring unknown values', () => {
      expect(parseSearchQuery('due:overdue')).toEqual({ text: '', due: 'overdue' });
      expect(parseSearchQuery('contract:ready')).toEqual({ text: '', contract: 'ready' });
      expect(parseSearchQuery('due:someday')).toEqual({ text: '' });
    });

    it('parses the type token', () => {
      expect(parseSearchQuery('type:plan')).toEqual({ text: '', type: 'plan' });
    });

    it('keeps unmatched tokens as lowercased free text', () => {
      expect(parseSearchQuery('Fix Login Bug')).toEqual({ text: 'fix login bug' });
    });

    it('mixes filters and free text', () => {
      expect(parseSearchQuery('p:high @alice auth bug')).toEqual({
        text: 'auth bug',
        priority: 'high',
        assignee: 'alice',
      });
    });
  });

  describe('taskMatchesFilters', () => {
    it('filters by column', () => {
      expect(taskMatchesFilters(makeTask({ column: 'todo' }), { column: 'todo' })).toBe(true);
      expect(taskMatchesFilters(makeTask({ column: 'done' }), { column: 'todo' })).toBe(false);
    });

    it('filters by type, treating untyped as task', () => {
      expect(taskMatchesFilters(makeTask(), { type: 'task' })).toBe(true);
      expect(taskMatchesFilters(makeTask({ type: 'plan' }), { type: 'plan' })).toBe(true);
      expect(taskMatchesFilters(makeTask({ type: 'plan' }), { type: 'epic' })).toBe(false);
    });

    it('filters by priority', () => {
      expect(taskMatchesFilters(makeTask({ priority: 'high' }), { priority: 'high' })).toBe(true);
      expect(taskMatchesFilters(makeTask(), { priority: 'high' })).toBe(false);
    });

    it('filters by tag substring', () => {
      expect(taskMatchesFilters(makeTask({ tags: ['backend'] }), { tag: 'back' })).toBe(true);
      expect(taskMatchesFilters(makeTask({ tags: ['ui'] }), { tag: 'back' })).toBe(false);
    });

    it('filters by assignee substring', () => {
      expect(taskMatchesFilters(makeTask({ assignee: 'alice' }), { assignee: 'ali' })).toBe(true);
      expect(taskMatchesFilters(makeTask({ assignee: 'bob' }), { assignee: 'ali' })).toBe(false);
    });

    it('filters by contract status', () => {
      expect(taskMatchesFilters(makeTask({ contract: { status: 'ready' } }), { contract: 'ready' })).toBe(true);
      expect(taskMatchesFilters(makeTask(), { contract: 'ready' })).toBe(false);
    });

    it('rejects a due filter when the task has no due date', () => {
      expect(taskMatchesFilters(makeTask(), { due: 'today' })).toBe(false);
    });

    it('combines multiple filters conjunctively', () => {
      const task = makeTask({ priority: 'high', assignee: 'alice', tags: ['backend'] });
      expect(taskMatchesFilters(task, { priority: 'high', assignee: 'alice', tag: 'backend' })).toBe(true);
      expect(taskMatchesFilters(task, { priority: 'high', assignee: 'bob' })).toBe(false);
    });
  });

  describe('scoreTaskDocument', () => {
    it('awards 20 for an exact ID match', () => {
      expect(scoreTaskDocument(makeDoc({ id: 'task-7', title: 'x' }), 'task-7')).toBe(20);
    });

    it('awards 10 for a title substring and 15 when it also starts with the query', () => {
      expect(scoreTaskDocument(makeDoc({ title: 'Fix the login' }), 'login')).toBe(10);
      expect(scoreTaskDocument(makeDoc({ title: 'Login is broken' }), 'login')).toBe(15);
    });

    it('awards 5 for a frontmatter description match', () => {
      expect(scoreTaskDocument(makeDoc({ title: 'x', description: 'auth flow' }), 'auth')).toBe(5);
    });

    it('awards 5 for a body Description section match', () => {
      expect(scoreTaskDocument(makeDoc({ title: 'x' }, '## Description\nauth flow\n'), 'auth')).toBe(5);
    });

    it('awards 3 for a tag match', () => {
      expect(scoreTaskDocument(makeDoc({ title: 'x', tags: ['auth'] }), 'auth')).toBe(3);
    });

    it('awards 2 for log-body text on any document, active or completed', () => {
      const activeDoc = makeDoc({ title: 'x', column: 'todo' }, '## Log\n- 2026-01-01: fixed the widget\n');
      expect(scoreTaskDocument(activeDoc, 'widget')).toBe(2);
    });
  });

  describe('searchTasksRanked', () => {
    it('sorts by score descending', () => {
      const docs = [
        makeDoc({ id: 'task-1', title: 'Something about auth' }),
        makeDoc({ id: 'task-2', title: 'Auth is the topic' }),
      ];

      const results = searchTasksRanked(docs, 'auth');

      expect(results.map((r) => r.doc.task.id)).toEqual(['task-2', 'task-1']);
    });

    it('breaks ties by input order', () => {
      const docs = [
        makeDoc({ id: 'task-1', title: 'contains auth here' }),
        makeDoc({ id: 'task-2', title: 'also auth inside' }),
      ];

      const results = searchTasksRanked(docs, 'auth');

      expect(results.map((r) => r.doc.task.id)).toEqual(['task-1', 'task-2']);
    });

    it('excludes documents that score zero', () => {
      const docs = [makeDoc({ id: 'task-1', title: 'unrelated' })];
      expect(searchTasksRanked(docs, 'auth')).toEqual([]);
    });

    it('returns every filter-surviving doc with score 1 for a filter-only query', () => {
      const docs = [
        makeDoc({ id: 'task-1', priority: 'high' }),
        makeDoc({ id: 'task-2', priority: 'low' }),
      ];

      const results = searchTasksRanked(docs, 'p:high');

      expect(results).toHaveLength(1);
      expect(results[0].doc.task.id).toBe('task-1');
      expect(results[0].score).toBe(1);
    });

    it('lets the explicit filters param win over an embedded token', () => {
      const docs = [
        makeDoc({ id: 'task-1', priority: 'high' }),
        makeDoc({ id: 'task-2', priority: 'low' }),
      ];

      const results = searchTasksRanked(docs, 'p:high', { priority: 'low' });

      expect(results.map((r) => r.doc.task.id)).toEqual(['task-2']);
    });

    it('keeps embedded tokens when the filters object has explicit undefined keys', () => {
      // Production call shape: frontends build the filters object from optional
      // params, so omitted options are present as `undefined` properties.
      const docs = [
        makeDoc({ id: 'task-1', priority: 'high', title: 'Fix login bug' }),
        makeDoc({ id: 'task-2', priority: 'low', title: 'Fix login bug' }),
      ];

      const filters = {
        column: undefined,
        priority: undefined,
        assignee: undefined,
      } as SearchFilters;

      const results = searchTasksRanked(docs, 'p:high bug', filters);

      expect(results.map((r) => r.doc.task.id)).toEqual(['task-1']);
    });

    it('keeps every embedded token dimension against an all-undefined filters object', () => {
      const docs = [
        makeDoc({
          id: 'task-1',
          title: 'Fix login bug',
          column: 'todo',
          assignee: 'alice',
          tags: ['auth'],
          type: 'plan',
        }),
        makeDoc({
          id: 'task-2',
          title: 'Fix login bug',
          column: 'done',
          assignee: 'bob',
          tags: ['ui'],
          type: 'task',
        }),
      ];

      const filters = {
        column: undefined,
        priority: undefined,
        assignee: undefined,
        tag: undefined,
        type: undefined,
        due: undefined,
        contract: undefined,
      } as SearchFilters;

      const results = searchTasksRanked(docs, '@alice t:auth type:plan bug', filters);

      expect(results.map((r) => r.doc.task.id)).toEqual(['task-1']);
    });

    it('still lets a defined filters value override an embedded token', () => {
      const docs = [
        makeDoc({ id: 'task-1', priority: 'high', assignee: 'alice' }),
        makeDoc({ id: 'task-2', priority: 'low', assignee: 'alice' }),
      ];

      const results = searchTasksRanked(docs, 'p:high @alice', {
        priority: 'low',
        assignee: undefined,
      } as SearchFilters);

      expect(results.map((r) => r.doc.task.id)).toEqual(['task-2']);
    });

    it('applies structural filters alongside free-text scoring', () => {
      const docs = [
        makeDoc({ id: 'task-1', title: 'auth work', column: 'todo' }),
        makeDoc({ id: 'task-2', title: 'auth work', column: 'done' }),
      ];

      const results = searchTasksRanked(docs, 'auth', { column: 'todo' });

      expect(results.map((r) => r.doc.task.id)).toEqual(['task-1']);
    });
  });
});
