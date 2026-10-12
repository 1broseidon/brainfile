import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildDocGraph,
  checkDocumentLinks,
  decisionStatus,
  docPlace,
  flattenDocTree,
  idList,
  lintDocGraph,
} from '../docGraph';
import { findWorkOnSupersededDecisions, readBoardGraph } from '../boardGraph';
import { writeTaskFile } from '../taskFile';
import type { Task } from '../types';

const t = (id: string, extra: Partial<Task> & Record<string, unknown> = {}): Task => ({
  id,
  title: `Title of ${id}`,
  column: 'todo',
  ...extra,
});

/** A small board: an epic with a spec and a loose task, a plan under the spec, decisions old and new. */
function sampleBoard(): Task[] {
  return [
    t('epic-1', { type: 'epic' }),
    t('spec-1', { type: 'spec', parentId: 'epic-1', decisions: ['decision-1'] }),
    t('plan-1', { type: 'plan', parentId: 'spec-1' }),
    t('task-1', { parentId: 'plan-1', decisions: ['decision-2', 'adr-1'] }),
    t('task-2', { parentId: 'epic-1', column: 'in-progress' }),
    t('task-3'),
    t('decision-1', { type: 'decision', column: undefined, status: 'current' }),
    t('decision-2', { type: 'decision', column: undefined, status: 'superseded', supersededBy: 'decision-3' }),
    t('decision-3', { type: 'decision', column: undefined, supersedes: 'decision-2' }),
    // logs: a completed task under the epic, and a promoted legacy ADR
    t('task-9', { parentId: 'epic-1', column: undefined, completedAt: '2026-10-01T00:00:00Z', decisions: ['decision-2'] }),
    t('adr-1', { type: 'adr', column: undefined, status: 'promoted', completedAt: '2026-09-01T00:00:00Z' }),
  ];
}

describe('docGraph (spec-12)', () => {
  describe('decisionStatus', () => {
    it.each([
      [{ type: 'decision' }, 'current'],
      [{ type: 'decision', status: 'current' }, 'current'],
      [{ type: 'adr' }, 'proposed'],
      [{ type: 'adr', status: 'accepted' }, 'current'],
      [{ type: 'adr', status: 'promoted' }, 'current'],
      [{ type: 'adr', status: 'deprecated' }, 'stale'],
      [{ type: 'decision', status: 'rejected' }, 'rejected'],
      [{ type: 'decision', status: 'Superseded' }, 'superseded'],
      [{ type: 'decision', status: 'current', supersededBy: 'decision-9' }, 'superseded'],
    ] as const)('%j is %s', (task, expected) => {
      expect(decisionStatus(task as any)).toBe(expected);
    });
  });

  it('cleans list fields', () => {
    expect(idList([' a ', 'b', 'a', '', 3])).toEqual(['a', 'b']);
    expect(idList('decision-1')).toEqual(['decision-1']);
    expect(idList(undefined)).toEqual([]);
  });

  describe('containment', () => {
    const graph = buildDocGraph(sampleBoard());

    it('knows parents, children and ancestors', () => {
      expect(graph.parentOf('plan-1')?.id).toBe('spec-1');
      expect(graph.childrenOf('epic-1').map((c) => c.id)).toEqual(['spec-1', 'task-2', 'task-9']);
      expect(graph.openChildrenOf('epic-1').map((c) => c.id)).toEqual(['spec-1', 'task-2']);
      expect(graph.ancestorsOf('task-1').map((a) => a.id)).toEqual(['plan-1', 'spec-1', 'epic-1']);
      expect(graph.wouldCycle('epic-1', 'task-1')).toBe(true);
      expect(graph.wouldCycle('task-3', 'task-1')).toBe(false);
    });

    it('tells open work from decisions', () => {
      expect(graph.isOpenWork(graph.get('task-3')!)).toBe(true);
      expect(graph.isOpenWork(graph.get('decision-1')!)).toBe(false);
      expect(graph.isOpenWork(graph.get('task-9')!)).toBe(false);
      expect(graph.typeOf('adr').name).toBe('decision');
    });

    it('builds the outline of open work, leaving decisions out', () => {
      const flat = flattenDocTree(graph.tree());
      expect(flat.map((n) => `${'  '.repeat(n.depth)}${n.task.id}`)).toEqual([
        'epic-1',
        '  spec-1',
        '    plan-1',
        '      task-1',
        '  task-2',
        'task-3',
      ]);
      expect(flat.every((n) => n.match && !n.offPattern)).toBe(true);
    });

    it('keeps ancestors of a match as context, and roots a subtree', () => {
      const filtered = flattenDocTree(graph.tree({ include: (task) => task.id === 'task-1' }));
      expect(filtered.map((n) => [n.task.id, n.match])).toEqual([
        ['epic-1', false], ['spec-1', false], ['plan-1', false], ['task-1', true],
      ]);

      const subtree = flattenDocTree(graph.tree({ rootId: 'spec-1' }));
      expect(subtree.map((n) => [n.task.id, n.depth])).toEqual([['spec-1', 0], ['plan-1', 1], ['task-1', 2]]);
      expect(subtree[0].detachedFrom).toBeUndefined();
    });

    it('roots a document whose parent is completed, missing or a decision, and flags off-pattern parents', () => {
      const g = buildDocGraph([
        t('task-1', { parentId: 'epic-9' }),
        t('task-2', { parentId: 'epic-8' }),
        t('task-3', { parentId: 'decision-1' }),
        t('task-4'),
        t('epic-1', { type: 'epic', parentId: 'task-4' }),
        t('epic-8', { type: 'epic', completedAt: '2026-01-01T00:00:00Z', column: undefined }),
        t('decision-1', { type: 'decision', column: undefined }),
      ]);
      const roots = g.tree();
      const byId = new Map(flattenDocTree(roots).map((n) => [n.task.id, n]));
      expect(byId.get('task-1')!.detachedFrom).toEqual({ id: 'epic-9', state: 'missing' });
      expect(byId.get('task-2')!.detachedFrom).toEqual({ id: 'epic-8', state: 'completed' });
      expect(byId.get('task-3')!.detachedFrom).toEqual({ id: 'decision-1', state: 'outside' });
      expect(byId.get('task-3')!.offPattern).toBe(true);
      expect(byId.get('epic-1')!.depth).toBe(1);
      expect(byId.get('epic-1')!.offPattern).toBe(true);
    });

    it('shows documents in a parentId loop instead of losing them', () => {
      const g = buildDocGraph([t('task-1', { parentId: 'task-2' }), t('task-2', { parentId: 'task-1' })]);
      const flat = flattenDocTree(g.tree());
      expect(flat.map((n) => n.task.id).sort()).toEqual(['task-1', 'task-2']);
      expect(flat[0].cycle).toBe(true);
    });
  });

  describe('decisions', () => {
    const graph = buildDocGraph(sampleBoard());

    it('resolves a document\'s decisions:', () => {
      const links = graph.decisionsOf('task-1');
      expect(links.map((l) => [l.id, l.found, l.isDecision, l.status, l.superseded])).toEqual([
        ['decision-2', true, true, 'superseded', true],
        ['adr-1', true, true, 'current', false],
      ]);
      expect(links[0].supersededBy).toBe('decision-3');
    });

    it('computes the reverse, open and completed work alike', () => {
      expect(graph.restingOn('decision-2').map((x) => x.id)).toEqual(['task-1', 'task-9']);
      expect(graph.restingOn('decision-1').map((x) => x.id)).toEqual(['spec-1']);
      expect(graph.restingOn('decision-3')).toEqual([]);
    });

    it('finds open work resting on a superseded decision', () => {
      const flagged = graph.openWorkOnSupersededDecisions();
      expect(flagged.map((f) => [f.task.id, f.decisions.map((d) => d.id)])).toEqual([['task-1', ['decision-2']]]);
      expect(graph.supersededDecisionsOf('spec-1')).toEqual([]);
    });

    it('marks missing, external and non-decision references', () => {
      const g = buildDocGraph([t('task-1', { decisions: ['decision-7', 'web:decision-1', 'task-2'] }), t('task-2')]);
      expect(g.decisionsOf('task-1').map((l) => [l.id, l.found, l.external, l.isDecision])).toEqual([
        ['decision-7', false, false, false],
        ['web:decision-1', false, true, false],
        ['task-2', true, false, false],
      ]);
    });
  });

  describe('docPlace', () => {
    const graph = buildDocGraph(sampleBoard());

    it('projects a work document\'s place', () => {
      expect(docPlace(graph, 'task-1')).toEqual({
        id: 'task-1', type: 'task', role: 'task', glyph: '',
        parent: { id: 'plan-1', found: true, title: 'Title of plan-1', type: 'plan', done: false },
        children: [],
        decisions: [
          { id: 'decision-2', found: true, external: false, isDecision: true, title: 'Title of decision-2', status: 'superseded', supersededBy: 'decision-3', superseded: true },
          { id: 'adr-1', found: true, external: false, isDecision: true, title: 'Title of adr-1', status: 'current', superseded: false },
        ],
        restsOnSuperseded: ['decision-2'],
      });
      expect(docPlace(graph, 'epic-1')!.children.map((c) => [c.id, c.done])).toEqual([['spec-1', false], ['task-2', false], ['task-9', true]]);
      expect(docPlace(graph, 'task-9')!.restsOnSuperseded).toEqual([]);
      expect(docPlace(graph, 'nope')).toBeUndefined();
    });

    it('gives a decision the work resting on it, and flags an off-pattern parent', () => {
      expect(docPlace(graph, 'decision-2')!.restedOnBy!.map((w) => w.id)).toEqual(['task-1', 'task-9']);
      const g = buildDocGraph([t('task-1'), t('epic-1', { type: 'epic', parentId: 'task-1' })]);
      expect(docPlace(g, 'epic-1')!.parent!.offPattern).toBe('an epic sits at the top of the tree, not under a task');
    });
  });

  describe('checkDocumentLinks', () => {
    const graph = buildDocGraph(sampleBoard());

    it('accepts links that fit', () => {
      expect(checkDocumentLinks(graph, { type: 'spec', parentId: 'epic-1', decisions: ['decision-1'] })).toEqual({ errors: [], warnings: [] });
      expect(checkDocumentLinks(graph, { id: 'task-3', parentId: 'plan-1', dependsOn: ['task-2', 'mobile:task-1'] })).toEqual({ errors: [], warnings: [] });
    });

    it('warns about an off-pattern parent, and refuses it on a strict board', () => {
      const loose = checkDocumentLinks(graph, { type: 'epic', parentId: 'task-3' });
      expect(loose.errors).toEqual([]);
      expect(loose.warnings).toEqual(['the new epic under task-3: an epic sits at the top of the tree, not under a task']);

      const strict = checkDocumentLinks(graph, { id: 'spec-1', parentId: 'plan-1' }, { strict: true });
      expect(strict.errors[0]).toMatch(/plan-1 sits under spec-1/);

      const strictFit = checkDocumentLinks(graph, { id: 'task-3', type: 'spec', parentId: 'task-2' }, { strict: true });
      expect(strictFit.errors).toEqual(['task-3 under task-2: a spec goes under an epic, not under a task (refused on a strict board)']);
    });

    it('always refuses self links and loops', () => {
      expect(checkDocumentLinks(graph, { id: 'task-3', parentId: 'task-3' }).errors).toEqual(['task-3 cannot be its own parent']);
      expect(checkDocumentLinks(graph, { id: 'task-3', dependsOn: ['task-3'] }).errors).toEqual(['task-3 cannot depend on itself']);
      const g = buildDocGraph([t('task-1', { dependsOn: ['task-2'] }), t('task-2')]);
      expect(checkDocumentLinks(g, { id: 'task-2', dependsOn: ['task-1'] }).errors).toEqual(['task-1 already depends on task-2; depending on it would loop']);
    });

    it('checks decisions:', () => {
      expect(checkDocumentLinks(graph, { id: 'task-3', decisions: ['task-2'] }).warnings).toEqual([
        'task-2 is a task, not a decision; decisions: names decisions',
      ]);
      expect(checkDocumentLinks(graph, { id: 'task-3', decisions: ['decision-9'] }).warnings).toEqual(['decision decision-9 is not on this board']);
      expect(checkDocumentLinks(graph, { id: 'decision-1', decisions: ['decision-3'] }, { strict: true }).errors[0]).toContain('decisions link to each other with supersedes');
      expect(checkDocumentLinks(graph, { type: 'decision', parentId: 'epic-1' }).warnings[0]).toContain('decisions are never in the tree');
    });

    it('warns about IDs that are not on the board', () => {
      expect(checkDocumentLinks(graph, { parentId: 'epic-9', dependsOn: ['task-99'] }).warnings).toEqual([
        'parent epic-9 is not on this board',
        'dependency task-99 is not on this board',
      ]);
    });
  });

  describe('lintDocGraph', () => {
    it('is quiet on a board that fits', () => {
      expect(lintDocGraph(buildDocGraph(sampleBoard()))).toEqual([]);
    });

    it('reports off-pattern links as warnings, errors when strict', () => {
      const tasks = [
        t('task-1'),
        t('epic-1', { type: 'epic', parentId: 'task-1' }),
        t('task-2', { parentId: 'epic-9', decisions: ['task-1', 'decision-9'] }),
        t('decision-1', { type: 'decision', column: undefined, decisions: ['decision-2'], dependsOn: ['task-1'] }),
        t('task-3', { supersededBy: 'task-1' }),
        t('task-4', { parentId: 'task-5' }),
        t('task-5', { parentId: 'task-4' }),
        t('task-9', { parentId: 'task-1', completedAt: '2026-01-01T00:00:00Z', type: 'epic' }),
      ];
      const loose = lintDocGraph(buildDocGraph(tasks));
      expect(loose.map((i) => i.code)).toEqual([
        'OFF_PATTERN_PARENT',
        'PARENT_NOT_FOUND', 'NOT_A_DECISION', 'DECISION_NOT_FOUND',
        'DECISIONS_ON_DECISION', 'DECISION_NOT_FOUND', 'DEPENDS_ON_DECISION',
        'SUPERSEDES_ON_WORK',
        'PARENT_CYCLE', 'PARENT_CYCLE',
      ]);
      expect(loose.every((i) => i.type === 'warning')).toBe(true);
      expect(loose[0].message).toBe('epic-1: off-pattern parent task-1 (an epic sits at the top of the tree, not under a task)');

      const strict = lintDocGraph(buildDocGraph(tasks), { strict: true });
      const types = new Map(strict.map((i) => [i.code, i.type]));
      expect(types.get('OFF_PATTERN_PARENT')).toBe('error');
      expect(types.get('PARENT_NOT_FOUND')).toBe('warning');
      expect(types.get('DECISION_NOT_FOUND')).toBe('warning');
    });
  });

  describe('readBoardGraph', () => {
    let dir: string;

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-board-graph-'));
      fs.mkdirSync(path.join(dir, 'board'));
      fs.mkdirSync(path.join(dir, 'logs'));
      fs.writeFileSync(path.join(dir, 'brainfile.md'), '---\ntitle: G\ncolumns:\n  - id: todo\n    title: To Do\ntypes:\n  bug:\n    like: task\n---\n');
      for (const task of sampleBoard()) {
        const where = task.completedAt ? 'logs' : 'board';
        writeTaskFile(path.join(dir, where, `${task.id}.md`), task, '');
      }
      writeTaskFile(path.join(dir, 'board', 'bug-1.md'), t('bug-1', { type: 'bug', decisions: ['decision-2'] }), '');
    });

    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('reads board and logs with the board\'s types', () => {
      const { config, graph } = readBoardGraph(path.join(dir, 'brainfile.md'));
      expect(config?.title).toBe('G');
      expect(graph.typeOf('bug').role).toBe('task');
      expect(graph.get('task-9')?.completedAt).toBeDefined();
      expect(graph.restingOn('decision-2').map((x) => x.id).sort()).toEqual(['bug-1', 'task-1', 'task-9']);
    });

    it('is the hook for open work resting on a superseded decision', () => {
      const flagged = findWorkOnSupersededDecisions(path.join(dir, 'brainfile.md'));
      expect(flagged.map((f) => f.task.id).sort()).toEqual(['bug-1', 'task-1']);
    });
  });
});
