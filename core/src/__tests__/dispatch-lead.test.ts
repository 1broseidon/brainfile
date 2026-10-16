/**
 * An epic's lead (decision-15, task-83): its reading of the plan, the rules
 * it cannot bend and how it is woken, with the agents, the board and time as
 * fakes; then run by the shared runner against a real board and a fake ACP
 * agent, two runners standing for two processes: the lead request taken up
 * from the queue, one lead per tree, tries counted on the board, pause and
 * stop from anywhere, a lead resumed from the board, and the epic completed
 * with its last child.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { changeLeadFile, claimDispatchFile, readDispatchRecord, readLeadRecord, requestDispatchFile } from '../dispatchRecord';
import { Leads, leadAbove, leadRefusal, leadRefusalOnBoard, planReport, readyOf, treeOf, type LeadDeps, type LeadView, type TreeDoc } from '../dispatch/lead';
import { leadPermission, readOnlyMode, readsBoard } from '../dispatch/readOnly';
import { Runner, type RunnerOptions } from '../dispatch/runner';
import { findV2Task, getV2Dirs } from '../workspace';
import type { AgentRun, PermissionPolicy } from '../dispatch/types';
import type { LeadAction } from '../dispatchRecord';
import type { DispatchRequest } from '../types';

const nodeRequire = (process as unknown as { getBuiltinModule(id: 'module'): typeof import('module') }).getBuiltinModule('module').createRequire(__filename);
jest.mock('@agentclientprotocol/sdk', () => nodeRequire('@agentclientprotocol/sdk'));

jest.setTimeout(60_000);

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
  expect(tree.children.map((c) => c.id)).toEqual(['task-1', 'task-2']);
  expect(treeOf([doc('task-3')], 'epic-1')).toBeNull();
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
  expect(problems).toEqual(['task-1 and task-2 both touch desktop/src/agents/agents.ts, and neither waits on the other: run together, they will conflict.']);
  // dependsOn order: each wave waits only on earlier ones.
  expect(waves).toEqual([['task-1', 'task-2', 'task-3'], ['task-5'], ['task-4']]);
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
    doc('task-7', { parentId: 'epic-1', dependsOn: ['epic-1'] }),
  ];
  const { problems, waves } = planReport(treeOf(docs, 'epic-1')!);
  expect(problems).toEqual([
    'task-1 depends on task-404, which is not on this board.',
    'task-1 waits on task-9, outside epic-1 and still open: it cannot start until someone does task-9.',
    'task-2 waits on itself through its dependencies: break the cycle.',
    'task-3 waits on itself through its dependencies: break the cycle.',
    'task-7 depends on its own epic, epic-1, which is done only after it: drop that dependency.',
    'task-4 names no files: what it touches, and so what it collides with, cannot be seen. Add its relatedFiles.',
    "task-4 has no validation commands: only its agent's word says it is done.",
    'task-5 has children of its own: its children are handed off, not it.',
  ]);
  // A cycle leaves its members out of the order; the container's child goes, not it.
  expect(waves).toEqual([['task-1', 'task-4', 'task-7', 'task-6']]);
});

test('ready: open work whose dependencies are done and landed; a container is not work', () => {
  const tree = treeOf(
    [
      doc('epic-1'),
      doc('task-1', { parentId: 'epic-1', done: true }),
      doc('task-2', { parentId: 'epic-1', dependsOn: ['task-1'] }),
      doc('task-3', { parentId: 'epic-1', dependsOn: ['task-2'] }),
      doc('task-4', { parentId: 'epic-1' }),
      doc('task-5', { parentId: 'task-4' }),
      doc('task-6', { parentId: 'epic-1', done: true, unlanded: true }),
      doc('task-7', { parentId: 'epic-1', dependsOn: ['task-6'] }),
    ],
    'epic-1'
  )!;
  expect(readyOf(tree).map((c) => c.id)).toEqual(['task-2', 'task-5']);
});

test('the brainfile command line reads when it only reads: list, show, review, dispatch status, lint without --fix, issues without --import, pr --status, --help', () => {
  for (const command of [
    'brainfile list --column todo', 'brainfile show -t task-1', 'brainfile -g brief --peek', 'npx brainfile search "a b"', 'brainfile log --recent', 'brainfile check deploy',
    'brainfile where', 'brainfile lint', 'brainfile issues --json', 'brainfile dispatch status', 'brainfile review task-1', 'brainfile review --ready', 'brainfile pr task-1 --status',
    'brainfile agents', 'brainfile types', 'brainfile columns list', 'brainfile land --help', 'brainfile --version',
  ]) {
    expect([command, readsBoard(command)]).toEqual([command, true]);
  }
  for (const command of [
    'brainfile', 'brainfile land task-1', 'brainfile discard task-1', 'brainfile dispatch task-1', 'brainfile dispatch task-1 --now', 'brainfile dispatch stop task-1', 'brainfile run',
    'brainfile discuss task-1', 'brainfile pr task-1', 'brainfile lint --fix', 'brainfile issues --import 12', 'brainfile add -t x', 'brainfile types add bug', 'brainfile list; brainfile land task-1',
    'BRAINFILE_AGENT_ROLE= brainfile land task-1', 'git status',
  ]) {
    expect([command, readsBoard(command)]).toEqual([command, false]);
  }
});

test('a lead writes no code: board tools, and the brainfile command line and git where they only read; a mode that only reads', () => {
  expect(leadPermission('mcp__brainfile__dispatch', 'other')).toBe('allow');
  expect(leadPermission('`brainfile list`', 'execute')).toBe('allow');
  // Its tools keep to its tree; the command line would not, so only what reads is let through (task-81).
  expect(leadPermission('Bash', 'execute', { command: 'brainfile land task-9' })).toBe('refuse');
  expect(leadPermission('Bash', 'execute', { command: 'brainfile dispatch task-9 --now' })).toBe('refuse');
  expect(leadPermission('Bash', 'execute', { command: ['git', 'log', '-3'] })).toBe('allow');
  expect(leadPermission('`git status && rm -rf src`', 'execute')).toBe('refuse');
  expect(leadPermission('`npm test`', 'execute')).toBe('refuse');
  expect(leadPermission('Edit src/app.ts', 'edit')).toBe('refuse');
  expect(leadPermission('Read src/app.ts', 'read')).toBe('usual');
  expect(leadPermission('mcp__desk__dispatch', 'other')).toBe('usual');
  expect(readOnlyMode({ initial: 'default', bypass: 'bypassPermissions', options: [{ id: 'default', name: 'Default' }, { id: 'read-only', name: 'Read Only' }] })).toBe('read-only');
  expect(readOnlyMode({ initial: 'bypassPermissions', bypass: 'bypassPermissions', options: [{ id: 'bypassPermissions', name: 'Bypass' }, { id: 'default', name: 'Default' }] })).toBe('default');
  expect(readOnlyMode({ initial: 'plan', bypass: 'yolo', options: [{ id: 'plan', name: 'Plan' }] })).toBe('plan');
});

// ── The lead, against fakes ──────────────────────────────────────────────────

function fake(docs: TreeDoc[], options: { policy?: PermissionPolicy; limit?: number; extra?: Partial<LeadDeps> } = {}) {
  // eslint-disable-next-line prefer-const
  let leads: Leads;
  const prompts: string[] = [];
  const views: LeadView[] = [];
  const records: Array<{ request?: DispatchRequest } | LeadAction> = [];
  const completed: string[] = [];
  const landed: string[] = [];
  const closed: string[] = [];
  const live: AgentRun[] = [];
  const pending: Array<() => void> = [];
  let outcome: { ok: boolean; stopped?: boolean; reply?: string; error?: string } = { ok: true, reply: 'Handed off task-1.' };
  let fresh = true;
  let nextRun = 1;
  const settle: Array<() => void> = [];
  const find = (id: string) => docs.find((d) => d.id === id)!;
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
    claim: async (_p, epicId, request) => {
      const epic = find(epicId);
      if (epic.lead?.held && !epic.lead.mine) return { ok: false, error: `${epicId} is claimed by another runner` };
      records.push(request ? { request } : {});
      epic.lead = { agent: request?.agent ?? epic.lead?.agent ?? 'claude', held: true, mine: true, paused: !!epic.lead?.paused };
      return { ok: true, value: undefined };
    },
    mark: async (_p, epicId, action) => {
      records.push(action);
      const epic = find(epicId);
      if (action === 'end') delete epic.lead;
      else if (epic.lead) epic.lead.paused = action === 'pause';
      return { ok: true, value: undefined };
    },
    complete: async (_p, epicId) => {
      completed.push(epicId);
      return { ok: true, value: undefined };
    },
    mergeable: (_p, taskId) => taskId === 'task-1',
    land: async (_p, taskId) => {
      landed.push(taskId);
      // As the board does: the task completes, and the board's change arrives before the landing returns.
      find(taskId).done = true;
      leads.boardChanged('/repo');
      return { ok: true, said: `${taskId} was landed: merged into main` };
    },
    emit: (view) => views.push(view),
    later: (_ms, fn) => {
      pending.push(fn);
      return 0 as unknown as ReturnType<typeof setTimeout>;
    },
    ...options.extra,
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

const errorOf = (result: { ok: boolean }) => (result as unknown as { error: string }).error;

test('a lead starts on an epic with open work, claims it with its request, and its first turn checks the plan and names the board tools', async () => {
  const f = fake(board());
  const started = await f.leads.start('/repo', 'epic-1', 'claude', { model: 'opus' });
  expect(started.ok).toBe(true);
  if (!started.ok) return;
  expect(started.value.run?.kind).toBe('lead');
  expect(f.records).toEqual([{ request: { agent: 'claude', model: 'opus', by: 'person', at: expect.any(String), until: 'review', role: 'lead' } }]);
  const first = f.prompts[0];
  expect(first).toMatch(/You lead epic-1 \("Build it"\)/);
  expect(first).toMatch(/`dispatch` hands a child to a coding agent \(name the agent and model for each; you are claude, model opus\)/);
  expect(first).toMatch(/`dispatch_status`/);
  expect(first).not.toMatch(/desk/);
  expect(first).toMatch(/First, check the plan before handing anything off/);
  expect(first).toMatch(/at most 2 hand-offs at once/);
  expect(first).toMatch(/The app's reading of the plan finds nothing wrong\./);
  expect(first).toMatch(/1\. task-1, task-3\n2\. task-2/);
  expect(first).toMatch(/- The person handed you epic-1\./);
  expect(first).toMatch(/- task-1 "task-1" · open · ready/);
  expect(first).toMatch(/- task-2 "task-2" · open · waits on task-1/);
});

test('no lead without open work, and one lead to a tree, above or below, here or in another runner', async () => {
  const docs = [...board(), doc('epic-2'), doc('task-8', { parentId: 'epic-2', done: true }), doc('epic-3', { parentId: 'epic-1' }), doc('task-9', { parentId: 'epic-3' })];
  const f = fake(docs);
  expect(errorOf(await f.leads.start('/repo', 'epic-2', 'claude'))).toBe('epic-2 has no open children to lead');
  expect(errorOf(await f.leads.start('/repo', 'epic-9', 'claude'))).toBe('epic-9 is not on this board');
  expect((await f.leads.start('/repo', 'epic-3', 'claude')).ok).toBe(true);
  expect(errorOf(await f.leads.start('/repo', 'epic-1', 'claude'))).toBe('epic-3, under epic-1, has a lead already: stop it first');
  expect(errorOf(await f.leads.start('/repo', 'epic-3', 'codex'))).toBe('epic-3 already has a lead: claude, leading');

  // Another runner's claims, as the board shows them.
  const other = { agent: 'codex', held: true, mine: false, paused: false, where: 'cli on mac (pid 9)' };
  const g = fake([...board(), doc('epic-3', { parentId: 'epic-1', lead: other }), doc('task-9', { parentId: 'epic-3' })]);
  expect(errorOf(await g.leads.start('/repo', 'epic-1', 'claude'))).toBe('epic-3, under epic-1, has a lead already, in cli on mac (pid 9): stop it first');
  const h = fake([doc('epic-0', { lead: other }), { ...doc('epic-1'), parentId: 'epic-0' }, doc('task-1', { parentId: 'epic-1' })]);
  expect(errorOf(await h.leads.start('/repo', 'epic-1', 'claude'))).toBe('epic-1 is under epic-0, whose lead runs it, in cli on mac (pid 9)');
  const i = fake([doc('epic-1', { lead: other }), doc('task-1', { parentId: 'epic-1' })]);
  expect(errorOf(await i.leads.start('/repo', 'epic-1', 'claude'))).toBe('epic-1 already has a lead: codex, in cli on mac (pid 9)');
  // A lost claim is no lead: it is taken up.
  const j = fake([doc('epic-1', { lead: { ...other, held: false } }), doc('task-1', { parentId: 'epic-1' })]);
  expect((await j.leads.start('/repo', 'epic-1', 'claude', { fromBoard: true })).ok).toBe(true);
  expect(j.records).toEqual([{}]);
});

test('the rules it cannot bend: its own children, not a container, the limit, tries from the board, and what it added or left a draft waits for the person', async () => {
  const docs = [...board(), doc('task-4', { parentId: 'epic-1' }), doc('task-5', { parentId: 'task-4' }), doc('task-7'), doc('task-8', { parentId: 'epic-1', draft: true })];
  const f = fake(docs);
  await f.leads.start('/repo', 'epic-1', 'claude');
  const may = (id: string) => f.leads.mayDispatch('/repo', 'epic-1', id);
  expect(may('task-7')).toMatchObject({ ok: false, then: 'never', error: expect.stringMatching(/not under epic-1/) });
  expect(may('task-4')).toMatchObject({ ok: false, then: 'never', error: expect.stringMatching(/has children of its own/) });
  expect(may('task-1').ok).toBe(true);
  // Tried, retried once (maxRetries 1), then it waits in Review for the person: the count is the board's.
  const task3 = docs.find((d) => d.id === 'task-3')!;
  task3.tries = 1;
  expect(may('task-3').ok).toBe(true);
  task3.tries = 2;
  expect(may('task-3')).toMatchObject({ ok: false, then: 'review', error: expect.stringMatching(/handed off 2 times, and its contract allows 1 retry: it waits in Review/) });
  // The repository's limit counts every hand-off running there.
  f.live.push({ taskId: 'task-1' } as AgentRun, { taskId: 'task-x' } as AgentRun);
  expect(may('task-5')).toMatchObject({ ok: false, then: 'wait', error: expect.stringMatching(/2 hand-offs are running in this repository, the most at once \(2\)/) });
  f.live.length = 0;
  // A draft waits for the person to make it ready; so does a child it adds, and the window says so.
  expect(may('task-8')).toMatchObject({ ok: false, then: 'wait', error: expect.stringMatching(/contract is a draft/) });
  docs.push(doc('task-6', { parentId: 'epic-1', createdAt: new Date(Date.now() + 1000).toISOString() }));
  expect(may('task-6')).toMatchObject({ ok: false, then: 'wait', error: expect.stringMatching(/added after you started: it waits for the person/) });
  expect(f.leads.views()[0].waitingForYou).toEqual(['task-8', 'task-6']);
  // Paused, it hands off nothing, and the board says so.
  await f.leads.pause('/repo', 'epic-1');
  expect(f.records.at(-1)).toBe('pause');
  expect(may('task-1')).toMatchObject({ ok: false, then: 'wait', error: expect.stringMatching(/paused you/) });
  expect(f.leads.mayDispatch('/repo', 'epic-2', 'task-1')).toMatchObject({ ok: false, then: 'never' });
});

test('until done (bypass), what it adds and drafts may go', () => {
  const tree = treeOf([doc('epic-1'), doc('task-1', { parentId: 'epic-1', draft: true, createdAt: '2027-01-01T00:00:00.000Z' })], 'epic-1')!;
  const terms = { epicId: 'epic-1', startedIso: '2026-01-01T00:00:00.000Z', paused: false };
  expect(leadRefusal(tree, { ...terms, until: 'done' }, 'task-1')).toBeNull();
  expect(leadRefusal(tree, { ...terms, until: 'review' }, 'task-1')?.then).toBe('wait');
  const done = treeOf([doc('epic-1'), doc('task-1', { parentId: 'epic-1', done: true })], 'epic-1')!;
  expect(leadRefusal(done, { ...terms, until: 'done' }, 'task-1')).toEqual({ why: 'task-1 is done', then: 'never' });
});

test('in a led tree only the lead dispatches: the chat is refused, the person is not', async () => {
  const f = fake(board());
  await f.leads.start('/repo', 'epic-1', 'claude');
  expect(errorOf(f.leads.guard('/repo', 'task-2', 'chat'))).toMatch(/epic-1's lead runs that tree/);
  expect(f.leads.guard('/repo', 'task-2', 'person').ok).toBe(true);
  expect(errorOf(f.leads.guard('/repo', 'epic-1', 'person'))).toMatch(/already has a lead/);
  expect(f.leads.guard('/repo', 'task-99', 'chat').ok).toBe(true);
});

test('woken, not polling: events that come together make one turn, after the one under way', async () => {
  const f = fake(board());
  await f.leads.start('/repo', 'epic-1', 'claude');
  // The first turn is still under way: what happens meanwhile waits for it.
  await f.leads.childEnded({ kind: 'dispatch', projectId: '/repo', taskId: 'task-3', agentId: 'codex', state: 'failed', error: 'tests failed' } as AgentRun);
  f.leads.wake('/repo', 'task-2', 'task-2 did not merge: conflicts');
  await f.flush();
  expect(f.prompts.length).toBe(1);
  await f.endTurns();
  await f.flush();
  expect(f.prompts.length).toBe(2);
  const second = f.prompts[1];
  expect(second).not.toMatch(/You lead epic-1/);
  expect(second).toMatch(/- task-3: codex failed: tests failed\.\n- task-2 did not merge: conflicts/);
  expect(f.views.at(-1)?.note).toBe('Handed off task-1.');
});

test('until done, a child that ends ready to merge is landed by the app, and the lead hears both', async () => {
  const f = fake(board(), { policy: 'bypass' });
  await f.leads.start('/repo', 'epic-1', 'claude');
  expect(f.records[0]).toMatchObject({ request: { until: 'done' } });
  await f.endTurns();
  await f.leads.childEnded({ kind: 'dispatch', projectId: '/repo', taskId: 'task-1', agentId: 'codex', state: 'done', reply: 'Added it.' } as AgentRun);
  await f.flush();
  expect(f.landed).toEqual(['task-1']);
  expect(f.prompts[1]).toMatch(/- task-1: codex finished: "Added it\."\.\n- task-1 was landed: merged into main\n\n/);
  // The landing said it; the board's change does not say it again.
  expect(f.prompts[1]).not.toMatch(/task-1 is done/);
  f.leads.boardChanged('/repo');
  await f.flush();
  expect(f.prompts.length).toBe(2);
});

test('until done, a child whose branch conflicts is landed too, so the landing sends it back to its agent; one with nothing to land is not', async () => {
  const sentBack = 'task-2 could not land: task-2 conflicts with main in shared.txt: sent back to Codex to settle (1 of 1)';
  const tried: string[] = [];
  const f = fake(board(), {
    policy: 'bypass',
    extra: {
      mergeable: () => false,
      landable: (_p, taskId) => taskId === 'task-2',
      land: async (_p, taskId) => (tried.push(taskId), { ok: false, said: sentBack }),
    },
  });
  await f.leads.start('/repo', 'epic-1', 'claude');
  await f.endTurns();
  await f.leads.childEnded({ kind: 'dispatch', projectId: '/repo', taskId: 'task-2', agentId: 'codex', state: 'done', reply: 'Did it.' } as AgentRun);
  await f.leads.childEnded({ kind: 'dispatch', projectId: '/repo', taskId: 'task-1', agentId: 'codex', state: 'done', reply: 'Read it.' } as AgentRun);
  await f.flush();
  expect(tried).toEqual(['task-2']);
  expect(f.prompts[1]).toContain(`- ${sentBack}`);
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
  expect(f.prompts.length).toBe(2);
  expect((f.prompts[1].match(/task-1 is done\./g) ?? []).length).toBe(1);
  await f.endTurns();
  for (const d of docs) if (d.id !== 'epic-1') d.done = true;
  f.leads.boardChanged('/repo');
  await f.flush();
  await new Promise((r) => setTimeout(r, 0));
  expect(f.prompts.length).toBe(2);
  expect(f.completed).toEqual(['epic-1']);
  // The record comes off first, while the epic is still on the board to take it off.
  expect(f.records.at(-1)).toBe('end');
  expect(f.records.length).toBe(2);
  expect(f.views.at(-1)?.state).toBe('done');
  expect(f.closed).toEqual(['epic-1']);
});

test('paused, events wait; resumed, they make its next turn', async () => {
  const f = fake(board());
  await f.leads.start('/repo', 'epic-1', 'claude');
  await f.endTurns();
  expect((await f.leads.pause('/repo', 'epic-1')).ok).toBe(true);
  expect((await f.leads.pause('/repo', 'epic-1')).ok).toBe(false);
  f.leads.wake('/repo', 'task-1', 'task-1 was merged by the person');
  await f.flush();
  expect(f.prompts.length).toBe(1);
  expect(f.views.at(-1)?.queued).toBe(1);
  expect((await f.leads.resume('/repo', 'epic-1')).ok).toBe(true);
  expect(f.records.slice(-2)).toEqual(['pause', 'resume']);
  expect(f.prompts.length).toBe(2);
  expect(f.prompts[1]).toMatch(/- task-1 was merged by the person\n- The person resumed you\./);
  expect((await f.leads.resume('/repo', 'epic-1')).ok).toBe(true);
  expect((await f.leads.resume('/repo', 'epic-2')).ok).toBe(false);
});

test('paused, resumed and stopped from anywhere: the lead follows its record on the board', async () => {
  const docs = board();
  const f = fake(docs);
  await f.leads.start('/repo', 'epic-1', 'claude');
  await f.endTurns();
  const epic = docs[0];
  // `brainfile dispatch pause epic-1`, in another process.
  epic.lead!.paused = true;
  f.leads.boardChanged('/repo');
  expect(f.views.at(-1)?.state).toBe('paused');
  epic.lead!.paused = false;
  f.leads.boardChanged('/repo');
  expect(f.views.at(-1)?.state).toBe('leading');
  expect(f.prompts.at(-1)).toMatch(/- The person resumed you\./);
  await f.endTurns();
  // Another runner took it over: this one lets go, and writes nothing.
  epic.lead = { agent: 'codex', held: true, mine: false, paused: false, where: 'desktop on mac (pid 7)' };
  const before = f.records.length;
  f.leads.boardChanged('/repo');
  expect(f.views.at(-1)).toMatchObject({ state: 'stopped', note: "epic-1's lead was taken over, in desktop on mac (pid 7)" });
  expect(f.records.length).toBe(before);

  // `brainfile dispatch stop epic-1`: the record is taken off.
  const g = fake(board());
  await g.leads.start('/repo', 'epic-1', 'claude');
  delete g.docs[0].lead;
  g.leads.boardChanged('/repo');
  expect(g.views.at(-1)?.state).toBe('stopped');
  expect(g.closed).toEqual(['epic-1']);
});

test('stopped, it ends and leaves the board; a new lead resumes from its record and notes, paused when it was', async () => {
  const f = fake(board());
  await f.leads.start('/repo', 'epic-1', 'claude');
  expect((await f.leads.stop('/repo', 'epic-1')).ok).toBe(true);
  expect(f.views.at(-1)?.state).toBe('stopped');
  expect(f.records.at(-1)).toBe('end');
  // None here: the record is taken off.
  expect((await f.leads.stop('/repo', 'epic-1')).ok).toBe(true);
  expect(f.records.at(-1)).toBe('end');

  const g = fake(board());
  expect((await g.leads.resume('/repo', 'epic-1', { agentId: 'codex', model: 'gpt-5', fromBoard: true })).ok).toBe(true);
  expect(g.prompts[0]).toMatch(/You are carrying on with epic-1: the plan is in the notes on epic-1/);
  expect(g.prompts[0]).not.toMatch(/check the plan|reading of the plan/);
  expect(g.prompts[0]).toMatch(/- The person resumed you\./);

  const h = fake(board());
  const started = await h.leads.start('/repo', 'epic-1', 'claude', { fromBoard: true, resumed: true, paused: true });
  expect(started.ok && started.value.run).toBeNull();
  expect(h.views.at(-1)?.state).toBe('paused');
});

test('a session let go while it waited is briefed again, as carrying on; three failed turns pause it; a stopped turn pauses it', async () => {
  const f = fake(board());
  await f.leads.start('/repo', 'epic-1', 'claude');
  await f.endTurns();
  f.fresh = true;
  f.leads.wake('/repo', 'task-1', 'task-1 was merged by the person');
  await f.flush();
  expect(f.prompts[1]).toMatch(/You are carrying on with epic-1/);
  expect(f.prompts[1]).not.toMatch(/reading of the plan/);

  f.outcome = { ok: false, error: 'agent crashed' };
  await f.endTurns();
  f.leads.wake('/repo', 'task-1', 'again');
  for (let i = 0; i < 4; i++) {
    await f.flush();
    await f.endTurns();
  }
  const last = f.views.at(-1)!;
  expect(last.state).toBe('paused');
  expect(last.note).toMatch(/Paused after 3 failed turns: agent crashed/);
  expect(f.records.at(-1)).toBe('pause');

  const g = fake(board());
  g.outcome = { ok: false, stopped: true };
  await g.leads.start('/repo', 'epic-1', 'claude');
  await g.endTurns();
  expect(g.views.at(-1)?.state).toBe('paused');
  expect(g.views.at(-1)?.note).toMatch(/its turn was stopped/);
});

test('an epic with a branch of its own: the lead makes it as it starts and says so; one that cannot be made starts nothing', async () => {
  const made: string[] = [];
  const f = fake(board(), {
    extra: {
      branch: (_p, epicId) => {
        made.push(epicId);
        return { ok: true, value: `dispatch/${epicId}` };
      },
    },
  });
  expect((await f.leads.start('/repo', 'epic-1', 'claude')).ok).toBe(true);
  expect(made).toEqual(['epic-1']);
  expect(f.prompts[0]).toMatch(/epic-1 has a branch of its own, dispatch\/epic-1: each child forks from it and lands on it/);
  expect(f.prompts[0]).toMatch(/landed on their own target/);

  const g = fake(board(), { extra: { branch: () => ({ ok: false, error: 'There is no branch release' }) } });
  expect(errorOf(await g.leads.start('/repo', 'epic-1', 'claude'))).toBe("epic-1's branch could not be made: There is no branch release");
  expect(g.prompts.length).toBe(0);
  expect(g.records.length).toBe(0);
});

test('its last child done, an epic with a branch of its own waits in Ready to merge instead of being completed', async () => {
  const docs = board();
  const offered: string[] = [];
  const f = fake(docs, {
    extra: {
      branch: (_p, epicId) => ({ ok: true, value: `dispatch/${epicId}` }),
      offer: async (_p, epicId) => {
        offered.push(epicId);
        return { ok: true, value: { branch: `dispatch/${epicId}`, into: 'release' } };
      },
    },
  });
  await f.leads.start('/repo', 'epic-1', 'claude');
  await f.endTurns();
  for (const d of docs) if (d.id !== 'epic-1') d.done = true;
  f.leads.boardChanged('/repo');
  await f.flush();
  await new Promise((r) => setTimeout(r, 0));
  expect(offered).toEqual(['epic-1']);
  expect(f.completed).toEqual([]);
  expect(f.views.at(-1)).toMatchObject({ state: 'done', note: 'Every child is done: epic-1 is in Ready to merge, dispatch/epic-1 into release.' });
});

// ── Run by the shared runner, on a real board ───────────────────────────────

const SDK = pathToFileURL(nodeRequire.resolve('@agentclientprotocol/sdk')).href;

/** A fake agent: a lead's turn writes its prompt and answers; a worker's waits for its release file. */
const FAKE_AGENT = `
import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from ${JSON.stringify(SDK)};
import { Readable, Writable } from 'node:stream';
import fs from 'node:fs';
import path from 'node:path';
const dir = process.env.FAKE_DIR;
const sessions = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
new AgentSideConnection((conn) => ({
  async initialize() { return { protocolVersion: PROTOCOL_VERSION, agentCapabilities: {} }; },
  async newSession() { const sessionId = 's' + sessions.size; sessions.set(sessionId, { cancelled: false }); return { sessionId }; },
  async authenticate() { return {}; },
  async prompt({ sessionId, prompt }) {
    const text = prompt.map((p) => p.text ?? '').join('');
    const lead = /You lead ([a-z]+-\\d+)/.exec(text)?.[1] ?? (/What happened:/.test(text) ? 'turn' : null);
    const taskId = lead ? null : /You have been handed ([a-z]+-\\d+)/.exec(text)?.[1] ?? 'none';
    const session = sessions.get(sessionId);
    if (lead) {
      fs.appendFileSync(path.join(dir, 'lead-turns'), JSON.stringify({ env: process.env.BRAINFILE_AGENT_ROLE ?? null, text }) + '\\n');
    } else {
      fs.appendFileSync(path.join(dir, 'started'), taskId + '\\n');
      while (!session.cancelled && !fs.existsSync(path.join(dir, 'release-' + taskId)) && !fs.existsSync(path.join(dir, 'release-all'))) await sleep(20);
      if (session.cancelled) return { stopReason: 'cancelled' };
    }
    await conn.sessionUpdate({ sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: lead ? 'Planned it.' : 'Did ' + taskId } } });
    return { stopReason: 'end_turn' };
  },
  async cancel({ sessionId }) { const s = sessions.get(sessionId); if (s) s.cancelled = true; },
}), ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)));
`;

const AGENT = 'custom:Fake' as const;
const CONFIG = `---\ntitle: Test\ncolumns:\n  - id: todo\n    title: To Do\n  - id: in-progress\n    title: In Progress\n  - id: review\n    title: Review\n---\n`;
const OTHER_PID = process.ppid;

describe('run by the shared runner', () => {
  let base: string;
  let project: string;
  let dataDir: string;
  let fakeDir: string;
  const runners: Runner[] = [];

  const home = () => path.join(project, '.brainfile');
  const brainfile = () => path.join(home(), 'brainfile.md');
  const dirs = () => getV2Dirs(brainfile());
  const fileOf = (id: string) => findV2Task(dirs(), id, true)!.filePath;
  const taskOf = (id: string) => findV2Task(dirs(), id, true)?.doc.task;
  const recordOf = (id: string) => readDispatchRecord(taskOf(id)!);
  const leadOf = (id: string) => readLeadRecord(taskOf(id)! as never);
  const lines = (name: string) => (fs.existsSync(path.join(fakeDir, name)) ? fs.readFileSync(path.join(fakeDir, name), 'utf-8').split('\n').filter(Boolean) : []);
  const turns = () => lines('lead-turns').map((l) => JSON.parse(l) as { env: string | null; text: string });

  function write(id: string, fields: string[] = []): void {
    fs.writeFileSync(path.join(home(), 'board', `${id}.md`), ['---', `id: ${id}`, `title: Task ${id}`, 'column: todo', ...fields, '---', '', `Do ${id}.`, ''].join('\n'));
  }

  /** epic-1 with task-1, and task-2 after it; no git, so a hand-off works in the folder itself. */
  function epicBoard(extra: Record<string, string[]> = {}): void {
    fs.mkdirSync(path.join(home(), 'board'), { recursive: true });
    fs.mkdirSync(path.join(home(), 'logs'), { recursive: true });
    fs.writeFileSync(brainfile(), CONFIG);
    write('epic-1', ['type: epic']);
    write('task-1', ['parentId: epic-1', 'relatedFiles: [a.ts]', 'contract:', '  status: ready', '  maxRetries: 1', '  deliverables: []', '  validation:', '    commands: [true]']);
    write('task-2', ['parentId: epic-1', 'dependsOn: [task-1]']);
    for (const [id, fields] of Object.entries(extra)) write(id, fields);
  }

  function runner(options: Partial<RunnerOptions> = {}): Runner {
    const made = new Runner({ dataDir, runner: 'cli', ask: async () => null, watchMs: 50, leads: true, ...options });
    runners.push(made);
    return made;
  }

  async function until<T>(what: string, check: () => T | undefined | null | false, ms = 20_000): Promise<T> {
    const deadline = Date.now() + ms;
    for (;;) {
      const value = check();
      if (value) return value;
      if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bf-lead-')));
    project = path.join(base, 'repo');
    dataDir = path.join(base, 'data');
    fakeDir = path.join(base, 'fake');
    for (const dir of [project, dataDir, fakeDir]) fs.mkdirSync(dir);
    fs.writeFileSync(path.join(fakeDir, 'agent.mjs'), FAKE_AGENT);
    fs.writeFileSync(
      path.join(dataDir, 'dispatch.json'),
      JSON.stringify({ agentServers: { Fake: { command: process.execPath, args: [path.join(fakeDir, 'agent.mjs')], env: { FAKE_DIR: fakeDir } } } })
    );
  });

  afterEach(async () => {
    fs.writeFileSync(path.join(fakeDir, 'release-all'), '');
    for (const r of runners.splice(0)) r.close();
    await new Promise((r) => setTimeout(r, 100));
    fs.rmSync(base, { recursive: true, force: true });
  });

  test('a lead request is queued on the epic, and a runner with leads takes it up: its claim, its turn as the lead of its tree', async () => {
    epicBoard();
    const views: LeadView[] = [];
    const a = runner({ onLead: (v) => views.push(v) });
    expect((await a.queue(project, ['epic-1'], { agent: AGENT, by: 'cli', role: 'lead' })).ok).toBe(true);
    expect(leadOf('epic-1')).toMatchObject({ agent: AGENT, role: 'lead', until: 'review' });
    // A worker's queue never takes a lead's request.
    expect(a.queued(project)).toEqual([]);
    expect(a.queuedLeads(project)).toEqual(['epic-1']);

    await a.work(project);
    expect(leadOf('epic-1')!.claim).toMatchObject({ runner: 'cli', pid: process.pid });
    expect(a.queuedLeads(project)).toEqual([]);
    const [turn] = await until('the lead to take its turn', () => (turns().length ? turns() : null));
    expect(turn.text).toMatch(/You lead epic-1/);
    await until('the turn to end', () => views.some((v) => v.note === 'Planned it.'));
    expect(views.at(-1)).toMatchObject({ epicId: 'epic-1', state: 'leading', agentId: AGENT });
    expect(leadAbove(project, 'task-2')).toMatchObject({ epicId: 'epic-1' });
    expect(a.ledBy(project, 'task-2')).toBe('epic-1');

    // One lead per tree across processes: another runner cannot lead it, or the tree above or under it.
    const b = runner({ pid: OTHER_PID });
    expect(await b.lead(project, 'epic-1', { agent: AGENT, by: 'cli' })).toMatchObject({ ok: false, error: expect.stringMatching(/epic-1 already has a lead: custom:Fake, in cli on .* \(pid \d+\)/) });
    expect(b.queuedLeads(project)).toEqual([]);
  });

  test('what the lead queues is started by its runner inside its rules: tries counted on the board, a draft waits, spent tries wait in Review', async () => {
    epicBoard({ 'task-3': ['parentId: epic-1', 'contract:', '  status: draft', '  deliverables: []'] });
    const a = runner();
    const started = await a.lead(project, 'epic-1', { agent: AGENT, by: 'person' });
    expect(started.ok).toBe(true);
    // As the lead's brainfile mcp does: a request by the lead on its children.
    for (const id of ['task-1', 'task-3']) requestDispatchFile(fileOf(id), { agent: AGENT, by: 'lead', at: new Date().toISOString() });
    expect(leadRefusalOnBoard(project, 'epic-1', 'task-3')).toMatchObject({ then: 'wait', why: expect.stringMatching(/draft/) });
    expect(leadRefusalOnBoard(project, 'epic-1', 'task-1')).toBeNull();
    a.boardChanged(project);
    await until('task-1 to start', () => lines('started').includes('task-1'));
    expect(recordOf('task-1')).toMatchObject({ tries: 1, claim: { pid: process.pid } });
    // The draft stays queued for the person.
    expect(a.queued(project)).toEqual(['task-3']);

    fs.writeFileSync(path.join(fakeDir, 'release-task-1'), '');
    await until('task-1 to end', () => recordOf('task-1')?.claim?.outcome === 'review');
    // Asked again twice: the second try is its one retry, the third waits in Review.
    fs.rmSync(path.join(fakeDir, 'release-task-1'));
    requestDispatchFile(fileOf('task-1'), { agent: AGENT, by: 'lead', at: new Date().toISOString() });
    await a.workLed(project);
    await until('task-1 to start again', () => recordOf('task-1')?.tries === 2);
    fs.writeFileSync(path.join(fakeDir, 'release-task-1'), '');
    await until('task-1 to end again', () => recordOf('task-1')?.claim?.ended);
    requestDispatchFile(fileOf('task-1'), { agent: AGENT, by: 'lead', at: new Date().toISOString() });
    expect(leadRefusalOnBoard(project, 'epic-1', 'task-1')).toMatchObject({ then: 'review' });
    await a.workLed(project);
    await until('task-1 to wait in Review', () => taskOf('task-1')?.column === 'review');
    expect(recordOf('task-1')).toMatchObject({ tries: 2, claim: { outcome: 'review' } });
    expect(fs.readFileSync(fileOf('task-1'), 'utf-8')).toMatch(/Not handed off: task-1 has been handed off 2 times/);
    expect(lines('started').filter((t) => t === 'task-1').length).toBe(2);
  });

  test('pause, resume and stop from another process: the runner leading it follows the board', async () => {
    epicBoard();
    const views: LeadView[] = [];
    const a = runner({ onLead: (v) => views.push(v) });
    await a.lead(project, 'epic-1', { agent: AGENT, by: 'cli' });
    await until('the first turn', () => views.some((v) => v.note === 'Planned it.'));

    // `brainfile dispatch pause epic-1`: a short-lived runner writes the board.
    const cli = runner({ pid: OTHER_PID, leads: false });
    expect((await cli.pauseLead(project, 'epic-1')).ok).toBe(true);
    expect(leadOf('epic-1')?.paused).toBeTruthy();
    a.boardChanged(project);
    expect(views.at(-1)?.state).toBe('paused');

    const resumed = await cli.resumeLead(project, 'epic-1');
    expect(resumed).toMatchObject({ ok: true, value: expect.stringMatching(/epic-1's lead carries on, in cli on/) });
    a.boardChanged(project);
    expect(views.at(-1)?.state).toBe('leading');
    await until('the resumed turn', () => turns().some((t) => /The person resumed you/.test(t.text)));

    expect((await cli.stopLead(project, 'epic-1')).ok).toBe(true);
    expect(leadOf('epic-1')).toBeNull();
    // The runner watches its leads' boards by itself, too.
    await until('the lead to stop', () => views.at(-1)?.state === 'stopped');
  });

  test("a lead whose runner went away is taken up from the board, carrying on from its notes; the old desktop's lead: is one too", async () => {
    epicBoard();
    requestDispatchFile(fileOf('epic-1'), { agent: AGENT, by: 'person', at: '2026-01-01T00:00:00.000Z', until: 'review', role: 'lead' });
    // Claimed by a process that has gone.
    claimDispatchFile(fileOf('epic-1'), { host: os.hostname().replace(/\.local$/i, ''), runner: 'desktop', pid: 999_999 });
    const a = runner();
    expect(a.queuedLeads(project)).toEqual(['epic-1']);
    await a.work(project);
    const [turn] = await until('the lead to take its turn', () => (turns().length ? turns() : null));
    expect(turn.text).toMatch(/You are carrying on with epic-1/);
    expect(leadOf('epic-1')).toMatchObject({ at: '2026-01-01T00:00:00.000Z', claim: { pid: process.pid } });
    a.close();

    const legacy = fs.readFileSync(fileOf('epic-1'), 'utf-8').replace(/dispatch:[\s\S]*?(?=---)/, `lead:\n  agent: ${AGENT}\n  by: person\n  at: 2026-01-02T00:00:00.000Z\n  until: review\n`);
    fs.writeFileSync(fileOf('epic-1'), legacy);
    const b = runner();
    expect(b.queuedLeads(project)).toEqual(['epic-1']);
    expect((await b.lead(project, 'epic-1')).ok).toBe(true);
    const task = taskOf('epic-1') as Record<string, unknown>;
    expect(task.lead).toBeUndefined();
    expect(leadOf('epic-1')).toMatchObject({ role: 'lead', at: '2026-01-02T00:00:00.000Z', claim: { pid: process.pid } });
    expect((await b.lead(project, 'task-1')).ok).toBe(false);
  });

  test('the epic completes with its last child, and its lead ends', async () => {
    epicBoard();
    const views: LeadView[] = [];
    const a = runner({ onLead: (v) => views.push(v) });
    await a.lead(project, 'epic-1', { agent: AGENT, by: 'cli' });
    await until('the first turn', () => views.some((v) => v.note === 'Planned it.'));
    for (const id of ['task-1', 'task-2']) fs.renameSync(fileOf(id), path.join(home(), 'logs', `${id}.md`));
    a.boardChanged(project);
    await until('the lead to finish', () => views.at(-1)?.state === 'done');
    expect(views.at(-1)?.note).toBe('epic-1 is done: every child is.');
    expect(findV2Task(dirs(), 'epic-1', true)?.isLog).toBe(true);
    expect(leadOf('epic-1')).toBeNull();
  });

  test('pause and resume of a lead no runner holds: the record changes, and resume here takes it up', async () => {
    epicBoard();
    const a = runner({ leads: false });
    expect((await a.queue(project, ['epic-1'], { agent: AGENT, by: 'cli', role: 'lead' })).ok).toBe(true);
    expect((await a.pauseLead(project, 'epic-1')).ok).toBe(true);
    expect(leadOf('epic-1')?.paused).toBeTruthy();
    expect(await a.resumeLead(project, 'epic-1')).toMatchObject({ ok: true, value: "epic-1's lead waits for a runner to take it up" });
    expect(leadOf('epic-1')?.paused).toBeUndefined();
    expect(changeLeadFile(fileOf('task-1'), 'pause')).toMatchObject({ ok: false, reason: 'no-lead' });
    expect(await a.resumeLead(project, 'epic-1', { here: true })).toMatchObject({ ok: true, value: "epic-1's lead carries on here" });
    await until('the lead to take its turn', () => turns().length);
  });
});
