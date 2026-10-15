/**
 * An epic's lead (decision-15): its reading of the plan, the rules it cannot
 * bend, and how it is woken, with the agents, the board and time as fakes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Leads, planReport, readyOf, treeOf, type LeadDeps, type TreeDoc } from '../src/agents/lead.ts';
import type { AgentRun, LeadRecord, LeadView, PermissionPolicy } from '../src/shared/api.ts';

const doc = (id: string, extra: Partial<TreeDoc> = {}): TreeDoc => ({
  id,
  title: id,
  done: false,
  dependsOn: [],
  files: [`src/${id}.ts`],
  validation: ['npm test'],
  ...extra,
});

// ── The plan ────────────────────────────────────────────────────────────────

test('the tree is everything under the epic, at any depth', () => {
  const tree = treeOf([doc('epic-1'), doc('task-1', { parentId: 'epic-1' }), doc('task-2', { parentId: 'task-1' }), doc('task-3')], 'epic-1')!;
  assert.deepEqual(tree.children.map((c) => c.id), ['task-1', 'task-2']);
  assert.equal(treeOf([doc('task-3')], 'epic-1'), null);
});

test('the plan: code two children share with neither waiting is a conflict; a dependency, even through another, settles it', () => {
  const docs = [
    doc('epic-1'),
    doc('task-1', { parentId: 'epic-1', files: ['desktop/src/agents/agents.ts'] }),
    doc('task-2', { parentId: 'epic-1', files: ['desktop/src/agents'] }),
    doc('task-3', { parentId: 'epic-1', files: ['core/src/a.ts'] }),
    doc('task-4', { parentId: 'epic-1', files: ['core/src/a.ts'], dependsOn: ['task-5'] }),
    doc('task-5', { parentId: 'epic-1', files: ['core/src/b.ts'], dependsOn: ['task-3'] }),
  ];
  const { problems, waves } = planReport(treeOf(docs, 'epic-1')!);
  assert.deepEqual(problems, ['task-1 and task-2 both touch desktop/src/agents/agents.ts, and neither waits on the other: run together, they will conflict.']);
  assert.deepEqual(waves, [['task-1', 'task-2', 'task-3'], ['task-5'], ['task-4']]);
});

test('the plan: missing, circular, outside and open dependencies; no files, no validation; a child with children', () => {
  const docs = [
    doc('epic-1'),
    doc('task-9'),
    doc('task-1', { parentId: 'epic-1', dependsOn: ['task-404', 'task-9', 'mobile:task-2'] }),
    doc('task-2', { parentId: 'epic-1', dependsOn: ['task-3'] }),
    doc('task-3', { parentId: 'epic-1', dependsOn: ['task-2'] }),
    doc('task-4', { parentId: 'epic-1', files: [], validation: [] }),
    doc('task-5', { parentId: 'epic-1' }),
    doc('task-6', { parentId: 'task-5' }),
  ];
  const { problems, waves } = planReport(treeOf(docs, 'epic-1')!);
  assert.deepEqual(problems, [
    'task-1 depends on task-404, which is not on this board.',
    'task-1 waits on task-9, outside epic-1 and still open: it cannot start until someone does task-9.',
    'task-2 waits on itself through its dependencies: break the cycle.',
    'task-3 waits on itself through its dependencies: break the cycle.',
    'task-4 names no files: what it touches, and so what it collides with, cannot be seen. Add its relatedFiles.',
    'task-4 has no validation commands: only its agent\'s word says it is done.',
    'task-5 has children of its own: its children are handed off, not it.',
  ]);
  // A cycle leaves its members out of the order; the container's child goes, not it.
  assert.deepEqual(waves, [['task-1', 'task-4', 'task-6']]);
});

test('ready: open work whose dependencies are done; a container is not work', () => {
  const tree = treeOf(
    [
      doc('epic-1'),
      doc('task-1', { parentId: 'epic-1', done: true }),
      doc('task-2', { parentId: 'epic-1', dependsOn: ['task-1'] }),
      doc('task-3', { parentId: 'epic-1', dependsOn: ['task-2'] }),
      doc('task-4', { parentId: 'epic-1' }),
      doc('task-5', { parentId: 'task-4' }),
    ],
    'epic-1'
  )!;
  assert.deepEqual(readyOf(tree).map((c) => c.id), ['task-2', 'task-5']);
});

test('ready: a dependency complete on the board but not landed is still waited on', () => {
  const tree = treeOf(
    [
      doc('epic-1'),
      doc('task-1', { parentId: 'epic-1', done: true, unlanded: true }),
      doc('task-2', { parentId: 'epic-1', dependsOn: ['task-1'] }),
      doc('task-3', { parentId: 'epic-1' }),
    ],
    'epic-1'
  )!;
  assert.deepEqual(readyOf(tree).map((c) => c.id), ['task-3']);
});

// ── The lead, against fakes ──────────────────────────────────────────────────

function fake(docs: TreeDoc[], options: { policy?: PermissionPolicy; limit?: number } = {}) {
  let leads: Leads;
  const prompts: string[] = [];
  const views: LeadView[] = [];
  const records: Array<LeadRecord | null> = [];
  const completed: string[] = [];
  const landed: string[] = [];
  const closed: string[] = [];
  const live: AgentRun[] = [];
  const pending: Array<() => void> = [];
  let outcome: { ok: boolean; stopped?: boolean; reply?: string; error?: string } = { ok: true, reply: 'Handed off task-1.' };
  let fresh = true;
  let nextRun = 1;
  const settle: Array<() => void> = [];
  const deps: LeadDeps = {
    tree: (_p, epicId) => treeOf(docs, epicId),
    live: () => live,
    lastRun: (_p, taskId) => live.find((r) => r.taskId === taskId),
    policy: () => options.policy ?? 'ask',
    limit: () => options.limit ?? 2,
    turn(_lead, prompt) {
      prompts.push(prompt(fresh));
      fresh = false;
      const run = { id: `run-${nextRun++}`, kind: 'lead', state: 'working' } as AgentRun;
      const said = outcome;
      return { run, done: new Promise((resolve) => settle.push(() => resolve(said))) };
    },
    close: (lead) => closed.push(lead.epicId),
    record: async (_p, _e, record) => {
      records.push(record);
      return { ok: true, value: undefined };
    },
    complete: async (_p, epicId) => {
      completed.push(epicId);
      return { ok: true, value: undefined };
    },
    mergeable: (_p, taskId) => taskId === 'task-1',
    land: async (_p, taskId) => {
      landed.push(taskId);
      // As the host does: the task completes, and the board's change arrives before the landing returns.
      docs.find((d) => d.id === taskId)!.done = true;
      leads.boardChanged('/repo');
      return { ok: true, said: `${taskId} was landed: merged into main` };
    },
    emit: (view) => views.push(view),
    later: (_ms, fn) => {
      pending.push(fn);
      return 0 as unknown as ReturnType<typeof setTimeout>;
    },
  };
  leads = new Leads(deps);
  return {
    leads,
    docs,
    prompts,
    views,
    records,
    completed,
    landed,
    closed,
    live,
    /** Ends the turns under way, then lets their follow-ups settle. */
    async endTurns() {
      for (const done of settle.splice(0)) done();
      await new Promise((r) => setTimeout(r, 0));
    },
    /** Runs what was waiting to gather. */
    async flush() {
      for (const fn of pending.splice(0)) fn();
      await new Promise((r) => setTimeout(r, 0));
    },
    set outcome(value: typeof outcome) {
      outcome = value;
    },
    set fresh(value: boolean) {
      fresh = value;
    },
  };
}

const board = () => [
  doc('epic-1', { title: 'Build it' }),
  doc('task-1', { parentId: 'epic-1', createdAt: '2026-01-01T00:00:00.000Z' }),
  doc('task-2', { parentId: 'epic-1', dependsOn: ['task-1'], createdAt: '2026-01-01T00:00:00.000Z' }),
  doc('task-3', { parentId: 'epic-1', createdAt: '2026-01-01T00:00:00.000Z', maxRetries: 1 }),
];

test('a lead starts on an epic with open work, writes itself on it, and its first turn checks the plan', async () => {
  const f = fake(board());
  const started = await f.leads.start('/repo', 'epic-1', 'claude', { model: 'opus' });
  assert.ok(started.ok);
  assert.equal(started.value.run?.kind, 'lead');
  assert.deepEqual(f.records, [{ agent: 'claude', model: 'opus', by: 'person', at: f.records[0]!.at, until: 'review' }]);
  const first = f.prompts[0];
  assert.match(first, /You lead epic-1 \("Build it"\)/);
  assert.match(first, /First, check the plan before handing anything off/);
  assert.match(first, /at most 2 hand-offs at once/);
  assert.match(first, /The app's reading of the plan finds nothing wrong\./);
  assert.match(first, /1\. task-1, task-3\n2\. task-2/);
  assert.match(first, /- The person handed you epic-1\./);
  assert.match(first, /- task-1 "task-1" · open · ready/);
  assert.match(first, /- task-2 "task-2" · open · waits on task-1/);
});

test('no lead without open work, and one lead to a tree, above or below', async () => {
  const docs = [...board(), doc('epic-2'), doc('task-8', { parentId: 'epic-2', done: true }), doc('epic-3', { parentId: 'epic-1' }), doc('task-9', { parentId: 'epic-3' })];
  const f = fake(docs);
  assert.equal(((await f.leads.start('/repo', 'epic-2', 'claude')) as { error: string }).error, 'epic-2 has no open children to lead');
  assert.ok((await f.leads.start('/repo', 'epic-3', 'claude')).ok);
  assert.equal(((await f.leads.start('/repo', 'epic-1', 'claude')) as { error: string }).error, 'epic-3, under epic-1, has a lead already: stop it first');
  assert.equal(((await f.leads.start('/repo', 'epic-3', 'codex')) as { error: string }).error, 'epic-3 already has a lead: claude, leading');
});

test('the rules it cannot bend: its own children, not a container, the limit, retries, and what it added waits for the person', async () => {
  const docs = [...board(), doc('task-4', { parentId: 'epic-1' }), doc('task-5', { parentId: 'task-4' }), doc('task-7')];
  const f = fake(docs);
  await f.leads.start('/repo', 'epic-1', 'claude');
  const may = (id: string) => f.leads.mayDispatch('/repo', 'epic-1', id);
  assert.match((may('task-7') as { error: string }).error, /not under epic-1/);
  assert.match((may('task-4') as { error: string }).error, /has children of its own/);
  assert.ok(may('task-1').ok);
  // Tried, retried once (maxRetries 1), then it is the person's.
  f.leads.dispatched('/repo', 'epic-1', 'task-3');
  assert.ok(may('task-3').ok);
  f.leads.dispatched('/repo', 'epic-1', 'task-3');
  assert.match((may('task-3') as { error: string }).error, /handed off 2 times, and its contract allows 1 retry/);
  // The repository's limit counts every hand-off running there.
  f.live.push({ taskId: 'task-1' } as AgentRun, { taskId: 'task-x' } as AgentRun);
  assert.match((may('task-5') as { error: string }).error, /2 hand-offs are running in this repository, the most at once \(2\)/);
  f.live.length = 0;
  // A child it adds waits for the person, and the window says so.
  docs.push(doc('task-6', { parentId: 'epic-1', createdAt: new Date(Date.now() + 1000).toISOString() }));
  assert.match((may('task-6') as { error: string }).error, /added after you started: it waits for the person/);
  assert.deepEqual(f.leads.views()[0].waitingForYou, ['task-6']);
  // Paused, it hands off nothing.
  f.leads.pause('/repo', 'epic-1');
  assert.match((may('task-1') as { error: string }).error, /paused you/);
});

test('in a led tree only the lead dispatches: the chat is refused, the person is not', async () => {
  const f = fake(board());
  await f.leads.start('/repo', 'epic-1', 'claude');
  assert.match((f.leads.guard('/repo', 'task-2', 'chat') as { error: string }).error, /epic-1's lead runs that tree/);
  assert.ok(f.leads.guard('/repo', 'task-2', 'person').ok);
  assert.match((f.leads.guard('/repo', 'epic-1', 'person') as { error: string }).error, /already has a lead/);
  assert.ok(f.leads.guard('/repo', 'task-99', 'chat').ok);
});

test('woken, not polling: events that come together make one turn, after the one under way', async () => {
  const f = fake(board());
  await f.leads.start('/repo', 'epic-1', 'claude');
  // The first turn is still under way: what happens meanwhile waits for it.
  await f.leads.childEnded({ kind: 'dispatch', projectId: '/repo', taskId: 'task-3', agentId: 'codex', state: 'failed', error: 'tests failed' } as AgentRun);
  f.leads.wake('/repo', 'task-2', 'task-2 did not merge: conflicts');
  await f.flush();
  assert.equal(f.prompts.length, 1);
  await f.endTurns();
  await f.flush();
  assert.equal(f.prompts.length, 2);
  const second = f.prompts[1];
  assert.doesNotMatch(second, /You lead epic-1/);
  assert.match(second, /- task-3: codex failed: tests failed\.\n- task-2 did not merge: conflicts/);
  assert.equal(f.views.at(-1)?.note, 'Handed off task-1.');
});

test('until done, a child that ends ready to merge is landed by the app, and the lead hears both', async () => {
  const f = fake(board(), { policy: 'bypass' });
  await f.leads.start('/repo', 'epic-1', 'claude');
  assert.equal(f.records[0]?.until, 'done');
  await f.endTurns();
  await f.leads.childEnded({ kind: 'dispatch', projectId: '/repo', taskId: 'task-1', agentId: 'codex', state: 'done', reply: 'Added it.' } as AgentRun);
  await f.flush();
  assert.deepEqual(f.landed, ['task-1']);
  assert.match(f.prompts[1], /- task-1: codex finished: "Added it\."\.\n- task-1 was landed: merged into main\n\n/);
  // The landing said it; the board's change does not say it again.
  assert.doesNotMatch(f.prompts[1], /task-1 is done/);
  f.leads.boardChanged('/repo');
  await f.flush();
  assert.equal(f.prompts.length, 2);
});

test('a child the person completes wakes it once; the last one done completes the epic and ends the lead', async () => {
  const docs = board();
  const f = fake(docs);
  await f.leads.start('/repo', 'epic-1', 'claude');
  await f.endTurns();
  docs.find((d) => d.id === 'task-1')!.done = true;
  f.leads.boardChanged('/repo');
  f.leads.boardChanged('/repo');
  await f.flush();
  assert.equal(f.prompts.length, 2);
  assert.equal((f.prompts[1].match(/task-1 is done\./g) ?? []).length, 1);
  await f.endTurns();
  for (const d of docs) if (d.id !== 'epic-1') d.done = true;
  f.leads.boardChanged('/repo');
  await f.flush();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(f.prompts.length, 2);
  assert.deepEqual(f.completed, ['epic-1']);
  // The record comes off first, while the epic is still on the board to take it off.
  assert.deepEqual(f.records.at(-1), null);
  assert.equal(f.records.length, 2);
  assert.equal(f.views.at(-1)?.state, 'done');
  assert.deepEqual(f.closed, ['epic-1']);
});

test('paused, events wait; resumed, they make its next turn', async () => {
  const f = fake(board());
  await f.leads.start('/repo', 'epic-1', 'claude');
  await f.endTurns();
  f.leads.pause('/repo', 'epic-1');
  f.leads.wake('/repo', 'task-1', 'task-1 was merged by the person');
  await f.flush();
  assert.equal(f.prompts.length, 1);
  assert.equal(f.views.at(-1)?.queued, 1);
  assert.ok((await f.leads.resume('/repo', 'epic-1')).ok);
  assert.equal(f.prompts.length, 2);
  assert.match(f.prompts[1], /- task-1 was merged by the person\n- The person resumed you\./);
});

test('stopped, it ends and leaves the board; one on the board after a restart resumes from its notes', async () => {
  const f = fake(board());
  await f.leads.start('/repo', 'epic-1', 'claude');
  assert.ok((await f.leads.stop('/repo', 'epic-1')).ok);
  assert.equal(f.views.at(-1)?.state, 'stopped');
  assert.deepEqual(f.records.at(-1), null);

  const g = fake(board());
  assert.ok((await g.leads.resume('/repo', 'epic-1', { agentId: 'codex', model: 'gpt-5' })).ok);
  assert.match(g.prompts[0], /You are carrying on with epic-1: the plan is in the notes on epic-1/);
  assert.doesNotMatch(g.prompts[0], /check the plan|reading of the plan/);
  assert.match(g.prompts[0], /- The person resumed you\./);
});

test('a session let go while it waited is briefed again, as carrying on; three failed turns pause it; a stopped turn pauses it', async () => {
  const f = fake(board());
  await f.leads.start('/repo', 'epic-1', 'claude');
  await f.endTurns();
  f.fresh = true;
  f.leads.wake('/repo', 'task-1', 'task-1 was merged by the person');
  await f.flush();
  assert.match(f.prompts[1], /You are carrying on with epic-1/);
  assert.doesNotMatch(f.prompts[1], /reading of the plan/);

  f.outcome = { ok: false, error: 'agent crashed' };
  await f.endTurns();
  f.leads.wake('/repo', 'task-1', 'again');
  for (let i = 0; i < 4; i++) {
    await f.flush();
    await f.endTurns();
  }
  const last = f.views.at(-1)!;
  assert.equal(last.state, 'paused');
  assert.match(last.note ?? '', /Paused after 3 failed turns: agent crashed/);

  const g = fake(board());
  g.outcome = { ok: false, stopped: true };
  await g.leads.start('/repo', 'epic-1', 'claude');
  await g.endTurns();
  assert.equal(g.views.at(-1)?.state, 'paused');
  assert.match(g.views.at(-1)?.note ?? '', /its turn was stopped/);
});
