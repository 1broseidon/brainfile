import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import {
  boardProjectRoot,
  describeRelatedBoard,
  describeTaskRefState,
  locateRelatedBoard,
  readRelated,
  relatedBoards,
} from '../repo';

const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };

function run(args: string[], cwd: string): void {
  const r = spawnSync('git', args, { cwd, env, encoding: 'utf-8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
}

function writeBoard(dotDir: string, title: string, related?: Record<string, string>): void {
  fs.mkdirSync(path.join(dotDir, 'board'), { recursive: true });
  fs.mkdirSync(path.join(dotDir, 'logs'), { recursive: true });
  const relatedYaml = related
    ? `related:\n${Object.entries(related).map(([k, v]) => `  ${k}: ${v}`).join('\n')}\n`
    : '';
  fs.writeFileSync(
    path.join(dotDir, 'brainfile.md'),
    `---\ntitle: ${title}\n${relatedYaml}columns:\n  - id: todo\n    title: To Do\n  - id: in-progress\n    title: In Progress\n---\n`,
  );
  fs.writeFileSync(path.join(dotDir, 'board', '.gitkeep'), '');
}

function writeTask(dir: string, id: string, extra: string = ''): void {
  fs.mkdirSync(dir, { recursive: true });
  const column = /^column:/m.test(extra) ? '' : 'column: todo\n';
  fs.writeFileSync(path.join(dir, `${id}.md`), `---\nid: ${id}\ntitle: Task ${id}\n${column}${extra}---\n`);
}

/** A repository whose board lives on the `brainfile` branch, checked out at <repo>/.brainfile. */
function makeBranchRepo(repo: string, title: string, related?: Record<string, string>): string {
  fs.mkdirSync(repo, { recursive: true });
  run(['init', '-q', '-b', 'main'], repo);
  run(['commit', '-q', '--allow-empty', '-m', 'init'], repo);
  const dotDir = path.join(repo, '.brainfile');
  run(['worktree', 'add', '-q', '--orphan', '-b', 'brainfile', dotDir], repo);
  writeBoard(dotDir, title, related);
  return dotDir;
}

describe('related boards on disk', () => {
  let base: string;

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bf-related-')));
  });

  afterEach(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  it('resolves related paths from the code repo root, not the board worktree', () => {
    const appDot = makeBranchRepo(path.join(base, 'app'), 'App', { mobile: '../mobile' });
    const mobileDot = makeBranchRepo(path.join(base, 'mobile'), 'Mobile');
    writeTask(path.join(mobileDot, 'board'), 'task-12', 'column: in-progress\n');
    writeTask(path.join(mobileDot, 'logs'), 'task-3');

    expect(boardProjectRoot(appDot)).toBe(path.join(base, 'app'));

    const rel = relatedBoards(path.join(appDot, 'brainfile.md'));
    expect(rel.aliases).toEqual(['mobile']);
    const board = rel.board('mobile');
    expect(board).toMatchObject({
      status: 'found',
      folder: path.join(base, 'mobile'),
      dotDir: mobileDot,
      title: 'Mobile',
    });
    expect(describeRelatedBoard(board!)).toBe('mobile (../mobile)');

    const open = rel.lookup('mobile:task-12');
    expect(open).toMatchObject({ state: 'open', done: false, alias: 'mobile', id: 'task-12' });
    expect(describeTaskRefState(open)).toBe('open (in-progress)');
    expect(rel.lookup('mobile:task-3')).toMatchObject({ state: 'completed', done: true });
    expect(describeTaskRefState(rel.lookup('mobile:task-3'))).toBe('completed');
    expect(rel.lookup('mobile:task-99')).toMatchObject({ state: 'not-found', done: false });
    expect(describeTaskRefState(rel.lookup('mobile:task-99'))).toBe('not on mobile');
  });

  it('finds a plain board, and counts a ledger-only completion as done', () => {
    const appDot = path.join(base, 'app', '.brainfile');
    writeBoard(appDot, 'App', { web: '../web' });
    const webDot = path.join(base, 'web', '.brainfile');
    writeBoard(webDot, 'Web');
    writeTask(path.join(webDot, 'board'), 'task-1');
    fs.writeFileSync(path.join(webDot, 'logs', 'ledger.jsonl'), `${JSON.stringify({ id: 'task-2', title: 'x', completedAt: '2026-01-01T00:00:00.000Z' })}\n`);
    // A file whose name does not match its ID is still found.
    fs.writeFileSync(path.join(webDot, 'board', 'renamed.md'), '---\nid: task-5\ntitle: Renamed\ncolumn: todo\n---\n');
    fs.writeFileSync(path.join(webDot, 'logs', 'old.md'), '---\nid: task-6\ntitle: Old\n---\n');

    const rel = relatedBoards(path.join(appDot, 'brainfile.md'));
    expect(rel.projectRoot).toBe(path.join(base, 'app'));
    expect(rel.board('web')).toMatchObject({ status: 'found', dotDir: webDot });
    expect(rel.lookup('web:task-1').state).toBe('open');
    expect(rel.lookup('web:task-2')).toMatchObject({ state: 'completed', done: true });
    expect(rel.lookup('web:task-2').doc).toBeUndefined();
    expect(rel.lookup('web:task-5').state).toBe('open');
    expect(rel.lookup('web:task-6').state).toBe('completed');
  });

  it('keeps a reference to a missing folder valid but not done', () => {
    const appDot = path.join(base, 'app', '.brainfile');
    writeBoard(appDot, 'App', { gone: '../gone', empty: '../empty' });
    fs.mkdirSync(path.join(base, 'empty'));
    const rel = relatedBoards(path.join(appDot, 'brainfile.md'));

    const missing = rel.lookup('gone:task-1');
    expect(missing).toMatchObject({ state: 'missing', done: false, board: { status: 'missing', folder: path.join(base, 'gone') } });
    expect(describeTaskRefState(missing)).toBe('gone is not on this machine');
    expect(describeRelatedBoard(missing.board!)).toBe('gone (../gone) is not on this machine');

    const empty = rel.lookup('empty:task-1');
    expect(empty).toMatchObject({ state: 'no-board', board: { status: 'no-board', onBranch: false } });
    expect(describeTaskRefState(empty)).toBe('empty has no board');
    expect(describeRelatedBoard(empty.board!)).toBe('empty (../empty) has no board');
  });

  it('never checks out a board that is only on the branch', () => {
    const appDot = path.join(base, 'app', '.brainfile');
    writeBoard(appDot, 'App', { mobile: '../mobile' });
    const mobile = path.join(base, 'mobile');
    const mobileDot = makeBranchRepo(mobile, 'Mobile');
    run(['add', '-A'], mobileDot);
    run(['commit', '-q', '-m', 'board'], mobileDot);
    run(['worktree', 'remove', mobileDot], mobile);

    const board = relatedBoards(path.join(appDot, 'brainfile.md')).board('mobile')!;
    expect(board).toMatchObject({ status: 'no-board', onBranch: true });
    expect(describeRelatedBoard(board)).toContain('not checked out');
    expect(fs.existsSync(mobileDot)).toBe(false);
  });

  it('resolves plain IDs on this board, unknown aliases and malformed refs', () => {
    const appDot = path.join(base, 'app', '.brainfile');
    writeBoard(appDot, 'App', { mobile: '../mobile' });
    writeTask(path.join(appDot, 'board'), 'task-1');
    writeTask(path.join(appDot, 'logs'), 'task-2');
    const rel = relatedBoards(path.join(appDot, 'brainfile.md'));

    expect(rel.lookup('task-1')).toMatchObject({ state: 'open', id: 'task-1' });
    expect(rel.lookup('task-1').alias).toBeUndefined();
    expect(rel.lookup('task-2')).toMatchObject({ state: 'completed', done: true });
    expect(rel.lookup('task-9').state).toBe('not-found');
    expect(describeTaskRefState(rel.lookup('task-9'))).toBe('not on this board');
    expect(describeTaskRefState(rel.lookup('task-1'))).toBe('open (todo)');
    expect(rel.lookup('web:task-1')).toMatchObject({ state: 'unknown-alias', alias: 'web' });
    expect(describeTaskRefState(rel.lookup('web:task-1'))).toBe('no related board named web');
    expect(rel.lookup('mobile:')).toMatchObject({ state: 'malformed', alias: 'mobile', id: '' });
    expect(describeTaskRefState(rel.lookup('mobile:'))).toBe('not a task reference');
    expect(rel.board('web')).toBeNull();
  });

  it('blocks only on cross-repo dependencies that are not completed', () => {
    const appDot = path.join(base, 'app', '.brainfile');
    writeBoard(appDot, 'App', { web: '../web', gone: '../gone' });
    const webDot = path.join(base, 'web', '.brainfile');
    writeBoard(webDot, 'Web');
    writeTask(path.join(webDot, 'board'), 'task-1');
    writeTask(path.join(webDot, 'logs'), 'task-2');
    const rel = relatedBoards(path.join(appDot, 'brainfile.md'));

    const task = { dependsOn: ['task-7', 'web:task-1', 'web:task-2', 'gone:task-1', ' web:task-1 '] };
    expect(rel.dependencies(task).map((d) => [d.ref, d.state])).toEqual([
      ['task-7', 'not-found'],
      ['web:task-1', 'open'],
      ['web:task-2', 'completed'],
      ['gone:task-1', 'missing'],
    ]);
    expect(rel.blockers(task).map((d) => d.ref)).toEqual(['web:task-1', 'gone:task-1']);
    expect(rel.blockers({ dependsOn: ['task-7'] })).toEqual([]);
    expect(rel.blockers({})).toEqual([]);
  });

  it('lists open tasks this board depends on, or every open task with all', () => {
    const appDot = path.join(base, 'app', '.brainfile');
    writeBoard(appDot, 'App', { web: '../web', gone: '../gone', idle: '../idle' });
    writeTask(path.join(appDot, 'board'), 'task-1', 'dependsOn:\n  - web:task-2\n  - web:task-9\n  - gone:task-1\n  - nope:task-1\n');
    writeTask(path.join(appDot, 'board'), 'task-2', 'dependsOn:\n  - web:task-2\n  - web:task-3\n');
    const webDot = path.join(base, 'web', '.brainfile');
    writeBoard(webDot, 'Web');
    writeTask(path.join(webDot, 'board'), 'task-1', 'position: 0\n');
    writeTask(path.join(webDot, 'board'), 'task-2', 'column: in-progress\n');
    writeTask(path.join(webDot, 'logs'), 'task-3');
    writeBoard(path.join(base, 'idle', '.brainfile'), 'Idle');

    const rel = relatedBoards(path.join(appDot, 'brainfile.md'));
    const depends = rel.openTasks();
    expect(depends.map((l) => l.board.alias)).toEqual(['web', 'gone']);
    expect(depends[0].tasks.map((t) => t.id)).toEqual(['task-2']);
    expect(depends[0].neededBy).toEqual({ 'task-2': ['task-1', 'task-2'] });
    expect(depends[0].notFound).toEqual(['task-9']);
    expect(depends[1]).toMatchObject({ board: { status: 'missing' }, tasks: [], neededBy: { 'task-1': ['task-1'] } });

    const all = rel.openTasks('all');
    expect(all.map((l) => [l.board.alias, l.board.status, l.tasks.map((t) => t.id)])).toEqual([
      ['web', 'found', ['task-1', 'task-2']],
      ['gone', 'missing', []],
      ['idle', 'found', []],
    ]);
  });

  it('reads no related boards from a board without the map, or an unreadable file', () => {
    const appDot = path.join(base, 'app', '.brainfile');
    writeBoard(appDot, 'App');
    expect(readRelated(path.join(appDot, 'brainfile.md'))).toEqual({});
    expect(readRelated(path.join(base, 'nowhere.md'))).toEqual({});
    expect(relatedBoards(path.join(appDot, 'brainfile.md')).openTasks('all')).toEqual([]);
  });

  it('expands ~ and accepts absolute folders', () => {
    const web = path.join(base, 'web');
    writeBoard(path.join(web, '.brainfile'), 'Web');
    expect(locateRelatedBoard('web', web, '/elsewhere')).toMatchObject({ status: 'found', folder: web });
    expect(locateRelatedBoard('home', '~', base).folder).toBe(os.homedir());
    expect(locateRelatedBoard('h', '~/x-brainfile-test-none', base)).toMatchObject({
      status: 'missing',
      folder: path.join(os.homedir(), 'x-brainfile-test-none'),
    });
  });
});
