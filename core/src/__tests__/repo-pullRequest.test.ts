/**
 * A pull request as a landing (decision-16, spec-18-4, spec-18-5): the
 * hand-off's branch pushed to origin (a bare repository here), the pull
 * request opened through a fake forge and recorded on the task, out of Ready
 * to merge while it is open; closed, back in; merged on the forge, a merge
 * or a squash, the worktree and branch go unless something would be lost.
 * Nothing reaches the network.
 */
import assert from 'assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import {
  followHandOffPullRequest,
  handOffPullRequest,
  openBranchPullRequest,
  openHandOffPullRequest,
  pushBranch,
  type ForgeRepo,
  type NewPullRequest,
  type PullRequestForge,
  type PullRequestView,
} from '../forge';
import { carriedUnpushed, followOrigin, landReview, offerEpicBranch, prepareEpicBranch, prepareTarget, prepareWorktree, readyToMerge, reviewOf, unpushed, withOpenPullRequest } from '../repo';
import { parsePullRequest } from '../pullRequest';
import { readTaskFile } from '../taskFile';

jest.setTimeout(30_000);

const ENV_KEYS = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM'];
const saved: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  Object.assign(process.env, { GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: '1' });
});

afterAll(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function git(args: string[], cwd: string): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

const CONFIG = '---\ntitle: Test\ncolumns:\n  - id: todo\n    title: To Do\n  - id: review\n    title: Review\n---\n';
const TASK =
  '---\nid: task-1\ntitle: Parse the thing\ncolumn: review\n---\n\n## Description\nMake the parser read it.\n\n## Log\n- 2026-10-15T11:00:00.000Z [claude]: Wrote the parser\n';
const REPO: ForgeRepo = { forge: 'github', host: 'github.com', owner: 'o', name: 'r', url: 'https://github.com/o/r' };

let base: string;
let repo: string;
let root: string;
let origin: string;
let taskFile: string;

function identity(cwd: string): void {
  git(['config', 'user.name', 'Test'], cwd);
  git(['config', 'user.email', 'test@example.com'], cwd);
  git(['config', 'commit.gpgsign', 'false'], cwd);
}

beforeEach(() => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bf-pr-')));
  repo = path.join(base, 'repo');
  root = path.join(base, 'worktrees');
  fs.mkdirSync(repo);
  git(['init', '-q', '-b', 'main'], repo);
  identity(repo);
  fs.writeFileSync(path.join(repo, 'README.md'), 'code\n');
  git(['add', '-A'], repo);
  git(['commit', '-q', '-m', 'init'], repo);
  const home = path.join(repo, '.brainfile');
  git(['worktree', 'add', '-q', '--orphan', '-b', 'brainfile', home], repo);
  fs.mkdirSync(path.join(home, 'board'));
  fs.mkdirSync(path.join(home, 'logs'));
  fs.writeFileSync(path.join(home, 'brainfile.md'), CONFIG);
  taskFile = path.join(home, 'board', 'task-1.md');
  fs.writeFileSync(taskFile, TASK);
  git(['add', '-A'], home);
  git(['commit', '-q', '-m', 'board'], home);
  fs.appendFileSync(path.join(repo, '.git', 'info', 'exclude'), '.brainfile/\n');
  // origin is a bare repository on this machine; the forge is a fake.
  origin = path.join(base, 'origin.git');
  git(['clone', '-q', '--bare', repo, origin], base);
  git(['remote', 'add', 'origin', origin], repo);
  git(['fetch', '-q', 'origin'], repo);
  git(['remote', 'set-head', 'origin', 'main'], repo);
});

afterEach(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

function work(at: string, file: string, content: string, commit = true): void {
  fs.writeFileSync(path.join(at, file), content);
  if (!commit) return;
  identity(at);
  git(['add', '-A'], at);
  git(['commit', '-q', '-m', `edit ${file}`], at);
}

/** A forge that opens pull request #7 and says what `state` says, remembering what it was asked. */
function fakeForge(initial: Partial<PullRequestView> = {}) {
  const opened: NewPullRequest[] = [];
  let view: PullRequestView | null = null;
  const forge: PullRequestForge = {
    async openPullRequest(_repo, pr) {
      opened.push(pr);
      view = { number: 7, url: 'https://github.com/o/r/pull/7', state: 'open', base: pr.base, head: pr.head, headSha: git(['rev-parse', pr.head], repo), title: pr.title, fetchedAt: Date.now(), ...initial };
      return { ok: true, value: view };
    },
    async pullRequestState() {
      return view ? { ok: true, value: view } : { ok: false, error: 'no such pull request' };
    },
  };
  return { forge, opened, set: (patch: Partial<PullRequestView>) => (view = { ...view!, ...patch }) };
}

const onOrigin = (ref: string) => spawnSync('git', ['--git-dir', origin, 'rev-parse', '--verify', '--quiet', ref], { encoding: 'utf-8' }).stdout.trim();
const recorded = () => parsePullRequest(readTaskFile(taskFile)?.task.pullRequest);
const ready = () => readyToMerge(repo).map((r) => r.taskId);

/** Merges the branch into origin's main from another clone, as the forge's Merge button does. */
function mergeOnForge(branch: string, how: 'merge' | 'squash', after?: (clone: string) => void): void {
  const clone = path.join(base, `forge-${Math.random().toString(36).slice(2)}`);
  git(['clone', '-q', origin, clone], base);
  identity(clone);
  if (how === 'merge') git(['merge', '-q', '--no-ff', '-m', 'Merge pull request #7', `origin/${branch}`], clone);
  else {
    git(['merge', '-q', '--squash', `origin/${branch}`], clone);
    git(['commit', '-q', '-m', 'Parse the thing (#7)'], clone);
  }
  after?.(clone);
  git(['push', '-q', 'origin', 'HEAD:main'], clone);
}

test("Open pull request pushes the hand-off's branch, opens it against where it lands, and records it on the task", async () => {
  const wt = prepareWorktree(repo, 'task-1', root)!;
  work(wt.path, 'parser.ts', 'parse\n');
  assert.deepEqual(ready(), ['task-1']);

  const { forge, opened } = fakeForge();
  const result = await openHandOffPullRequest(repo, 'task-1', { github: forge, repo: REPO });
  assert.ok(result.ok, !result.ok ? result.error : '');
  assert.equal(onOrigin('refs/heads/dispatch/task-1'), git(['rev-parse', 'dispatch/task-1'], repo));
  // Only the hand-off's branch goes to origin: the trunk is never pushed.
  assert.equal(onOrigin('refs/heads/main'), git(['rev-parse', 'origin/main'], repo));
  assert.equal(opened.length, 1);
  assert.equal(opened[0].head, 'dispatch/task-1');
  assert.equal(opened[0].base, 'main');
  assert.equal(opened[0].title, 'Parse the thing');
  assert.match(opened[0].body, /^Brainfile task-1: Parse the thing\n\nMake the parser read it\.\n\nLast from the hand-off:\n- \[claude\] Wrote the parser/);

  const pr = recorded();
  assert.deepEqual({ ...pr, at: undefined }, { number: 7, url: 'https://github.com/o/r/pull/7', state: 'open', base: 'main', head: 'dispatch/task-1', at: undefined });
  assert.match(readTaskFile(taskFile)!.body, /Opened pull request #7 from dispatch\/task-1 into main: https:\/\/github\.com\/o\/r\/pull\/7/);
  // It waits on the forge now, not on Merge; and one is enough.
  assert.deepEqual(ready(), []);
  assert.deepEqual([...withOpenPullRequest(repo)], ['task-1']);
  const again = handOffPullRequest(repo, 'task-1');
  assert.equal(again.ok, false);
  if (!again.ok) assert.match(again.error, /has pull request #7 open already/);
});

test('a task its worker completed before it landed is held out of Ready to merge by its open pull request too', async () => {
  const wt = prepareWorktree(repo, 'task-1', root)!;
  work(wt.path, 'parser.ts', 'parse\n');
  const { forge } = fakeForge();
  await openHandOffPullRequest(repo, 'task-1', { github: forge, repo: REPO });
  const logged = path.join(path.dirname(path.dirname(taskFile)), 'logs', 'task-1.md');
  fs.renameSync(taskFile, logged);
  assert.deepEqual(ready(), []);
  assert.deepEqual([...withOpenPullRequest(repo)], ['task-1']);
});

test('a pull request is refused as Merge is: uncommitted work, nothing to land, no forge, no origin', async () => {
  const { forge, opened } = fakeForge();
  const none = await openHandOffPullRequest(repo, 'task-1', { github: forge, repo: REPO });
  assert.deepEqual(none, { ok: false, error: 'task-1 has no worktree to open a pull request for' });

  const wt = prepareWorktree(repo, 'task-1', root)!;
  const empty = await openHandOffPullRequest(repo, 'task-1', { github: forge, repo: REPO });
  assert.deepEqual(empty, { ok: false, error: 'dispatch/task-1 has no commits to open a pull request for' });

  work(wt.path, 'parser.ts', 'parse\n');
  work(wt.path, 'notes.md', 'half done\n', false);
  const dirty = await openHandOffPullRequest(repo, 'task-1', { github: forge, repo: REPO });
  assert.equal(dirty.ok, false);
  if (!dirty.ok) assert.match(dirty.error, /1 file is not committed in the worktree/);
  fs.rmSync(path.join(wt.path, 'notes.md'));

  const elsewhere = await openHandOffPullRequest(repo, 'task-1', { github: forge, repo: null });
  assert.deepEqual(elsewhere, { ok: false, error: "The project's origin is not on GitHub: a pull request has nowhere to go." });

  git(['remote', 'remove', 'origin'], repo);
  const unpushable = await openHandOffPullRequest(repo, 'task-1', { github: forge, repo: REPO });
  assert.deepEqual(unpushable, { ok: false, error: 'This repository has no origin to push to' });
  assert.equal(opened.length, 0);
  assert.equal(recorded(), null);
});

test('any branch can be opened into any other, for an epic branch', async () => {
  git(['branch', 'dispatch/epic-1', 'main'], repo);
  const { forge, opened } = fakeForge();
  const result = await openBranchPullRequest(repo, { head: 'dispatch/epic-1', base: 'release/1.0', title: 'Epic', body: '' }, { github: forge, repo: REPO });
  assert.ok(result.ok);
  assert.equal(result.value.base, 'release/1.0');
  assert.deepEqual(opened.map((p) => [p.head, p.base]), [['dispatch/epic-1', 'release/1.0']]);
  assert.ok(onOrigin('refs/heads/dispatch/epic-1'));
  assert.deepEqual(await pushBranch(repo, 'nope'), { ok: false, error: 'There is no branch nope to push' });
});

test("an epic's own branch, its last child landed, is opened as a pull request into the epic's target, its Merge's fourth choice", async () => {
  const board = path.dirname(taskFile);
  fs.writeFileSync(path.join(board, 'epic-1.md'), '---\nid: epic-1\ntitle: The epic\ncolumn: review\nepicBranch: true\n---\n');
  fs.writeFileSync(path.join(board, 'task-2.md'), '---\nid: task-2\ntitle: Two\ncolumn: review\nparentId: epic-1\n---\n');
  assert.equal(prepareEpicBranch(repo, 'epic-1'), 'dispatch/epic-1');
  const child = prepareWorktree(repo, 'task-2', root, false, prepareTarget(repo, 'task-2'))!;
  work(child.path, 'b.txt', 'b\n');
  const landed = await landReview(repo, 'task-2', { title: 'Two' });
  assert.ok(landed.ok);
  assert.deepEqual(offerEpicBranch(repo, 'epic-1'), { branch: 'dispatch/epic-1', into: 'main' });

  const { forge, opened } = fakeForge();
  const result = await openHandOffPullRequest(repo, 'epic-1', { github: forge, repo: REPO });
  assert.ok(result.ok, !result.ok ? result.error : '');
  assert.deepEqual(opened.map((p) => [p.head, p.base, p.title]), [['dispatch/epic-1', 'main', 'The epic']]);
  assert.ok(onOrigin('refs/heads/dispatch/epic-1'));
  assert.deepEqual(ready(), []);
});

test('followed while open, nothing changes; closed without merging, it is back in Ready to merge', async () => {
  const wt = prepareWorktree(repo, 'task-1', root)!;
  work(wt.path, 'parser.ts', 'parse\n');
  const { forge, set } = fakeForge();
  await openHandOffPullRequest(repo, 'task-1', { github: forge, repo: REPO });

  const open = await followHandOffPullRequest(repo, 'task-1', { github: forge, repo: REPO });
  assert.equal(open?.ok && open.value.state, 'open');
  assert.equal(recorded()?.state, 'open');

  set({ state: 'closed' });
  const closed = await followHandOffPullRequest(repo, 'task-1', { github: forge, repo: REPO });
  assert.equal(closed?.ok && closed.value.state, 'closed');
  assert.equal(recorded()?.state, 'closed');
  assert.match(readTaskFile(taskFile)!.body, /Pull request #7 was closed without merging: back in Ready to merge/);
  assert.deepEqual(ready(), ['task-1']);
  assert.ok(fs.existsSync(wt.path));
  // Nothing open is left to follow.
  assert.equal(await followHandOffPullRequest(repo, 'task-1', { github: forge, repo: REPO }), null);
});

test('merged on the forge, the worktree and the local branch go, and the record says merged', async () => {
  const wt = prepareWorktree(repo, 'task-1', root)!;
  work(wt.path, 'parser.ts', 'parse\n');
  const { forge, set } = fakeForge();
  await openHandOffPullRequest(repo, 'task-1', { github: forge, repo: REPO });
  mergeOnForge('dispatch/task-1', 'merge');
  set({ state: 'merged' });

  const merged = await followHandOffPullRequest(repo, 'task-1', { github: forge, repo: REPO });
  assert.ok(merged?.ok);
  assert.equal(merged.value.state, 'merged');
  assert.ok(merged.value.state === 'merged' && merged.value.released);
  assert.equal(fs.existsSync(wt.path), false);
  assert.equal(git(['branch', '--list', 'dispatch/task-1'], repo), '');
  assert.equal(recorded()?.state, 'merged');
  assert.match(readTaskFile(taskFile)!.body, /Pull request #7 was merged into main/);
  // origin's main was fetched, so the merge is seen; the local main is left where it was.
  assert.equal(git(['rev-list', '--count', 'main..origin/main'], repo), '2');
});

test('a squash merge git cannot see is trusted when the branch is what the pull request carried', async () => {
  const wt = prepareWorktree(repo, 'task-1', root)!;
  work(wt.path, 'parser.ts', 'parse\n');
  const { forge, set } = fakeForge();
  await openHandOffPullRequest(repo, 'task-1', { github: forge, repo: REPO });
  // Squashed, then changed again on main: no ancestry, and a merge now would change the file.
  mergeOnForge('dispatch/task-1', 'squash', (clone) => work(clone, 'parser.ts', 'parse\nand more\n'));
  git(['fetch', '-q', 'origin'], repo);
  assert.equal(reviewOf(repo, 'task-1')?.merged, false);
  set({ state: 'merged' });

  const merged = await followHandOffPullRequest(repo, 'task-1', { github: forge, repo: REPO });
  assert.ok(merged?.ok && merged.value.state === 'merged' && merged.value.released);
  assert.equal(fs.existsSync(wt.path), false);
});

test('work made after the pull request was pushed keeps the worktree, and says so', async () => {
  const wt = prepareWorktree(repo, 'task-1', root)!;
  work(wt.path, 'parser.ts', 'parse\n');
  const { forge, set } = fakeForge();
  await openHandOffPullRequest(repo, 'task-1', { github: forge, repo: REPO });
  mergeOnForge('dispatch/task-1', 'squash');
  work(wt.path, 'later.ts', 'later\n');
  set({ state: 'merged' });

  const merged = await followHandOffPullRequest(repo, 'task-1', { github: forge, repo: REPO });
  assert.ok(merged?.ok && merged.value.state === 'merged');
  assert.equal(merged.value.state === 'merged' && merged.value.released, false);
  assert.ok(merged.value.state === 'merged' && /commits the pull request did not carry/.test(merged.value.said));
  assert.ok(fs.existsSync(wt.path));
  assert.equal(recorded()?.state, 'merged');
  // The later work is the person's to land, as any other.
  assert.deepEqual(ready(), ['task-1']);
});

test('the trunk ahead of origin is counted from what origin was last fetched as', () => {
  assert.deepEqual(unpushed(repo), { branch: 'main', ahead: 0 });
  work(repo, 'a.ts', 'a\n');
  work(repo, 'b.ts', 'b\n');
  assert.deepEqual(unpushed(repo), { branch: 'main', ahead: 2 });
  assert.equal(unpushed(repo, 'dispatch/none'), null);
  git(['remote', 'remove', 'origin'], repo);
  assert.equal(unpushed(repo), null);
});

// ── What a pull request carries, and the branch it went into after (task-102) ──

/** A landing on the local `branch` that is never pushed, as Merge makes one. */
function landHere(branch: string, taskId: string, file: string): void {
  const tip = git(['rev-parse', branch], repo);
  const blob = spawnSync('git', ['hash-object', '-w', '--stdin'], { cwd: repo, input: `${taskId}\n`, encoding: 'utf-8' }).stdout.trim();
  const tree = spawnSync('git', ['mktree'], { cwd: repo, input: `${git(['ls-tree', tip], repo)}\n100644 blob ${blob}\t${file}\n`, encoding: 'utf-8' }).stdout.trim();
  const commit = git(['commit-tree', tree, '-p', tip, '-m', `Merge ${taskId}: landed here`], repo);
  git(['update-ref', `refs/heads/${branch}`, commit, tip], repo);
}

test('a pull request that would carry landings its branch has here and origin lacks is refused, naming them, and nothing is pushed', async () => {
  git(['branch', 'release'], repo);
  git(['push', '-q', 'origin', 'release'], repo);
  landHere('release', 'task-8', 'eight.txt');
  landHere('release', 'task-9', 'nine.txt');
  const wt = prepareWorktree(repo, 'task-1', root, false, 'release')!;
  work(wt.path, 'parser.ts', 'parse\n');
  assert.deepEqual(carriedUnpushed(repo, 'dispatch/task-1', 'release'), { base: 'release', count: 2, tasks: ['task-8', 'task-9'] });
  const { forge, opened } = fakeForge();

  const refused = await openHandOffPullRequest(repo, 'task-1', { github: forge, repo: REPO });
  assert.ok(!refused.ok);
  assert.match(refused.error, /release has 2 commits here that origin's release does not \(the landings of task-8, task-9\).*Push release first, or Merge instead/);
  assert.equal(opened.length, 0);
  assert.equal(onOrigin('refs/heads/dispatch/task-1'), '');
  assert.equal(recorded(), null);

  // Pushed, it carries only its own.
  git(['push', '-q', 'origin', 'release'], repo);
  assert.equal(carriedUnpushed(repo, 'dispatch/task-1', 'release'), null);
  const opens = await openHandOffPullRequest(repo, 'task-1', { github: forge, repo: REPO });
  assert.ok(opens.ok, opens.ok ? '' : opens.error);
});

test('squash-merged into a branch nobody has checked out, the local branch follows origin\'s, so the next hand-off starts from it', async () => {
  git(['branch', 'release'], repo);
  git(['push', '-q', 'origin', 'release'], repo);
  const wt = prepareWorktree(repo, 'task-1', root, false, 'release')!;
  work(wt.path, 'parser.ts', 'parse\n');
  const { forge, set } = fakeForge();
  await openHandOffPullRequest(repo, 'task-1', { github: forge, repo: REPO });
  const clone = path.join(base, 'forge-release');
  git(['clone', '-q', '-b', 'release', origin, clone], base);
  identity(clone);
  git(['merge', '-q', '--squash', 'origin/dispatch/task-1'], clone);
  git(['commit', '-q', '-m', 'Parse the thing (#7)'], clone);
  git(['push', '-q', 'origin', 'HEAD:release'], clone);
  set({ state: 'merged', base: 'release' });

  const merged = await followHandOffPullRequest(repo, 'task-1', { github: forge, repo: REPO });
  assert.ok(merged?.ok && merged.value.state === 'merged' && merged.value.released);
  assert.equal(git(['rev-parse', 'release'], repo), git(['rev-parse', 'origin/release'], repo));
  assert.match(readTaskFile(taskFile)!.body, /Pull request #7 was merged into release; release here is brought up to origin's/);
});

test('the local branch follows origin\'s only when nothing would be lost and nobody has it checked out', () => {
  git(['branch', 'release'], repo);
  git(['push', '-q', 'origin', 'release'], repo);
  assert.equal(followOrigin(repo, 'release'), null);
  // Landed here, then squashed onto origin's from another clone: diverged, but origin's has it all.
  landHere('release', 'task-8', 'eight.txt');
  const clone = path.join(base, 'forge-squash');
  git(['clone', '-q', '-b', 'release', origin, clone], base);
  identity(clone);
  fs.writeFileSync(path.join(clone, 'eight.txt'), 'task-8\n');
  git(['add', '-A'], clone);
  git(['commit', '-q', '-m', 'task-8 (#3)'], clone);
  git(['push', '-q', 'origin', 'HEAD:release'], clone);
  git(['fetch', '-q', 'origin'], repo);
  assert.deepEqual(followOrigin(repo, 'release'), { moved: true, said: "release here now matches origin's, which has everything it had" });
  assert.equal(git(['rev-parse', 'release'], repo), git(['rev-parse', 'origin/release'], repo));
  // Something here origin's lacks: left as it is.
  landHere('release', 'task-9', 'nine.txt');
  fs.writeFileSync(path.join(clone, 'other.txt'), 'other\n');
  git(['add', '-A'], clone);
  git(['commit', '-q', '-m', 'other'], clone);
  git(['push', '-q', 'origin', 'HEAD:release'], clone);
  git(['fetch', '-q', 'origin'], repo);
  const tip = git(['rev-parse', 'release'], repo);
  assert.deepEqual(followOrigin(repo, 'release'), { moved: false, said: "release here has commits origin's release does not: it is left as it is" });
  assert.equal(git(['rev-parse', 'release'], repo), tip);
  // Behind, but checked out in the person's folder: they pull it themselves.
  git(['push', '-q', 'origin', 'main'], repo);
  work(clone, 'x.txt', 'x\n');
  git(['push', '-q', 'origin', 'HEAD:main'], clone);
  git(['fetch', '-q', 'origin'], repo);
  assert.match(followOrigin(repo, 'main')!.said, /main is checked out at .*: pull origin's main there/);
});
