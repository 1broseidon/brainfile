/**
 * `brainfile issues` — the open issues of the repository the board's project
 * comes from, each marked with the task already made from it (task-77), and
 * `--import <n…>` to make a task from one. A task made from an issue keeps
 * the issue's page as `source:` (decision-4); an issue already on the board,
 * open or completed, is found again rather than made twice. GitHub is read
 * with core's client, in the desktop's order of credentials.
 */
import * as path from 'path';
import chalk from 'chalk';
import { addTaskFile, issueTask, linkedTask, readTasksDir, sourcesOf, type Issue } from '@brainfile/core';
import { detectForge, type ForgeRepo, type GitHub, type GitHubAuthSource } from '@brainfile/core/forge';
import { type Logger, defaultLogger } from '../utils/logger';
import { CLIError, columnNotFound, operationFailed } from '../utils/cli-error';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { assertV2Brainfile } from '../utils/v2-only';
import { composeBody, ensureV2Dirs } from '../utils/v2-detect';
import { readBoardGraph } from '../utils/graph';
import { gitHubClient } from '../utils/github-auth';

export const ISSUES_COMMAND_HELP = `
Examples:
  brainfile issues                      List the open issues; those on the board show their task
  brainfile issues --import 12 15       Make a task from issues #12 and #15
  brainfile issues --import 12 -c todo  Into the To Do column (default: the first that is not done)

A task made from an issue takes its title, its body as the description, its
labels as tags, and its page as source:. An issue already on the board, open
or completed, is not made again.

GitHub is asked with the gh CLI's login, then GH_TOKEN or GITHUB_TOKEN, then
the token \`brainfile auth github\` saved; with none, public repositories only.
`.trimEnd();

export interface IssuesOptions {
  file?: string;
  /** Issue numbers to make tasks from (`12`, `#12`, `12,15`). */
  import?: string[];
  /** The column the new tasks land in. */
  column?: string;
  json?: boolean;
}

/** An open issue, and the task already made from it, if any. */
export interface IssueRow extends Issue {
  task?: string;
}

export interface ImportedIssue {
  number: number;
  task: string;
  /** False when the issue was already on the board. */
  made: boolean;
}

export interface IssuesReport {
  repo: ForgeRepo;
  auth: GitHubAuthSource;
  /** More open issues than were read. */
  truncated: boolean;
  issues: IssueRow[];
  imported: ImportedIssue[];
}

/** `12`, `#12` and `12,15` as issue numbers. */
export function issueNumbers(values: string[] | undefined): number[] {
  const numbers: number[] = [];
  for (const part of (values ?? []).flatMap((v) => v.split(','))) {
    const text = part.trim().replace(/^#/, '');
    if (!text) continue;
    if (!/^\d+$/.test(text)) throw new CLIError(`Not an issue number: ${part.trim()}`);
    const n = Number(text);
    if (!numbers.includes(n)) numbers.push(n);
  }
  return numbers;
}

/**
 * The board's open issues and, with `import`, tasks made from those numbers.
 * The CLI and the MCP `issues` tool share it; throws CLIError when there is
 * nothing to read or a number is not an open issue.
 */
export async function issuesReport(
  filePath: string,
  options: { import?: number[]; column?: string },
  github: GitHub = gitHubClient(),
): Promise<IssuesReport> {
  assertV2Brainfile(filePath);
  const dotDir = path.dirname(filePath);
  const repo = await detectForge(path.dirname(dotDir));
  if (!repo) throw new CLIError("The project's origin is not on GitHub.", undefined, 'brainfile issues reads the issues of the repository origin points at.');

  const wanted = options.import ?? [];
  const first = await github.listIssues(repo);
  // An issue opened since the last read (a minute, in a long-lived MCP server) is not in it yet.
  const listed = first.ok && wanted.some((n) => !first.value.issues.some((i) => i.number === n)) ? await github.listIssues(repo, true) : first;
  if (!listed.ok) throw new CLIError(listed.error);
  const { issues, auth, truncated } = listed.value;

  const dirs = ensureV2Dirs(filePath);
  const onBoard = () => sourcesOf([...readTasksDir(dirs.boardDir), ...readTasksDir(dirs.logsDir)]);
  let sources = onBoard();

  const imported: ImportedIssue[] = [];
  if (wanted.length > 0) {
    const missing = wanted.filter((n) => !issues.some((i) => i.number === n));
    if (missing.length > 0) {
      throw new CLIError(`Not among ${repo.owner}/${repo.name}'s open issues: ${missing.map((n) => `#${n}`).join(', ')}`);
    }
    const board = readBoardGraph(filePath).config;
    if (!board) throw operationFailed(`Failed to parse brainfile: ${filePath}`);
    const column = options.column
      ? board.columns.find((c) => c.id === options.column) ?? board.columns.find((c) => c.title.toLowerCase() === options.column!.toLowerCase())
      : board.columns.find((c) => !c.completionColumn) ?? board.columns[0];
    if (!column) throw columnNotFound(options.column ?? '', board.columns.map((c) => `${c.id} (${c.title})`));

    for (const number of wanted) {
      const issue = issues.find((i) => i.number === number)!;
      const taken = linkedTask(issue, sources);
      if (taken) {
        imported.push({ number, task: taken, made: false });
        continue;
      }
      const { description, ...input } = issueTask(issue, column.id);
      const result = addTaskFile(dirs.boardDir, input, composeBody(description), dirs.logsDir, { types: board.types });
      if (!result.success || !result.task) throw operationFailed(result.error || `Failed to make a task from #${number}`);
      imported.push({ number, task: result.task.id, made: true });
      sources = onBoard();
    }
  }

  return {
    repo,
    auth,
    truncated,
    issues: issues.map((issue) => {
      const task = linkedTask(issue, sources);
      return task ? { ...issue, task } : issue;
    }),
    imported,
  };
}

const SIGNED_IN: Record<GitHubAuthSource, string> = {
  gh: "with the gh CLI's login",
  env: 'with the token in the environment',
  token: 'with the saved token',
  none: 'without signing in: public repositories only',
};

/** `brainfile issues [--import <n…>] [--column <id>]`. */
export async function issuesCommand(options: IssuesOptions, logger: Logger = defaultLogger, github?: GitHub): Promise<IssuesReport> {
  const filePath = resolveCliBrainfilePath(options.file);
  const report = await issuesReport(filePath, { import: issueNumbers(options.import), column: options.column }, github);

  if (options.json) {
    logger.log(JSON.stringify(report, null, 2));
    return report;
  }

  for (const done of report.imported) {
    logger.log(done.made ? chalk.green(`#${done.number} → ${done.task}`) : chalk.gray(`#${done.number} is already ${done.task}`));
  }
  if (report.imported.length > 0) return report;

  const where = `${report.repo.owner}/${report.repo.name}`;
  const count = `${report.issues.length}${report.truncated ? '+' : ''} open issue${report.issues.length === 1 ? '' : 's'}`;
  logger.log(`${chalk.bold(where)}: ${count}, read ${SIGNED_IN[report.auth]}`);
  if (report.issues.length === 0) return report;
  logger.log('');
  const width = Math.max(...report.issues.map((i) => String(i.number).length)) + 1;
  for (const issue of report.issues) {
    const number = `#${issue.number}`.padEnd(width);
    const labels = issue.labels.length > 0 ? chalk.gray(`  ${issue.labels.join(', ')}`) : '';
    const task = issue.task ? chalk.cyan(`  on the board: ${issue.task}`) : '';
    logger.log(`  ${issue.task ? chalk.gray(number) : number}  ${issue.title}${labels}${task}`);
  }
  const offered = report.issues.filter((i) => !i.task).length;
  if (offered > 0) {
    logger.log('');
    logger.log(chalk.gray(`Make a task from one: brainfile issues --import <number>`));
  }
  return report;
}
