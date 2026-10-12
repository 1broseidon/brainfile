import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { locateBoard } from '../repo';

const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };

function run(args: string[], cwd: string): void {
  const r = spawnSync('git', args, { cwd, env, encoding: 'utf-8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
}

function writeBoard(dotDir: string): void {
  fs.mkdirSync(path.join(dotDir, 'board'), { recursive: true });
  fs.mkdirSync(path.join(dotDir, 'logs'), { recursive: true });
  fs.writeFileSync(path.join(dotDir, 'brainfile.md'), '---\ntitle: Test\ncolumns:\n  - id: todo\n    title: To Do\n---\n');
  fs.writeFileSync(path.join(dotDir, 'board', '.gitkeep'), '');
}

describe('locateBoard', () => {
  let base: string;

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bf-locate-')));
  });

  afterEach(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  it('finds a plain board in the folder itself', () => {
    const project = path.join(base, 'plain');
    writeBoard(path.join(project, '.brainfile'));
    const located = locateBoard(project);
    expect(located).toMatchObject({ found: true, storage: 'plain', projectRoot: project, materialized: false });
  });

  it('does not walk above a folder that is not a repository', () => {
    writeBoard(path.join(base, '.brainfile'));
    const project = path.join(base, 'child');
    fs.mkdirSync(project);
    expect(locateBoard(project)).toEqual({ found: false, projectRoot: project, inRepo: false });
  });

  it('reports a v1 board as legacy', () => {
    const project = path.join(base, 'old');
    fs.mkdirSync(project);
    fs.writeFileSync(path.join(project, 'brainfile.md'), '---\ntitle: Old\n---\n');
    expect(locateBoard(project)).toMatchObject({ found: false, legacy: path.join(project, 'brainfile.md') });
  });

  it('resolves a subfolder of a repo to the repo root with no board', () => {
    const repo = path.join(base, 'repo');
    fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
    run(['init', '-q', '-b', 'main'], repo);
    expect(locateBoard(path.join(repo, 'src'))).toEqual({ found: false, projectRoot: repo, inRepo: true });
  });

  it('checks out a board that exists only on the brainfile branch', () => {
    const repo = path.join(base, 'repo');
    fs.mkdirSync(repo);
    run(['init', '-q', '-b', 'main'], repo);
    run(['commit', '-q', '--allow-empty', '-m', 'init'], repo);
    const wt = path.join(base, 'wt');
    run(['worktree', 'add', '-q', '--orphan', '-b', 'brainfile', wt], repo);
    writeBoard(wt);
    run(['add', '-A'], wt);
    run(['commit', '-q', '-m', 'board'], wt);
    run(['worktree', 'remove', wt], repo);

    expect(locateBoard(repo, { materialize: false })).toMatchObject({ found: false, inRepo: true });

    const located = locateBoard(repo);
    expect(located).toMatchObject({ found: true, storage: 'linked', materialized: true, dotDir: path.join(repo, '.brainfile') });
    expect(fs.readFileSync(path.join(repo, '.git', 'info', 'exclude'), 'utf-8')).toContain('.brainfile/');

    // Second call finds the checkout instead of making another.
    expect(locateBoard(repo)).toMatchObject({ found: true, storage: 'linked', materialized: false });
  });
});
