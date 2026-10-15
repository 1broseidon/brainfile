/**
 * A hand-off's brief: the first prompt an agent handed a task gets. The task
 * itself, its contract, what the tasks it builds on left for it, the board's
 * standing decisions, where it works and where the finished work goes. (Not
 * core's session brief, brief.ts at the top, which is what an agent should
 * know when it starts a session of its own.)
 */
import { readBoardConfig } from '../boardFile';
import { readDecisionDocs } from '../decisionOperations';
import { summarizeDecision } from '../decisions';
import { locateBoard } from '../repo/locate';
import { findV2Task, getV2Dirs } from '../workspace';

/** What the brief says of a hand-off's worktree: the desktop's Worktree (worktree.ts) has these. */
export interface BriefWorktree {
  path: string;
  /** Null for a hand-off that only reads: a detached checkout of the trunk's tip. */
  branch: string | null;
  /** The branch it was started from, or the commit when that was detached. */
  base: string | null;
  /** The branch already carries commits: this is not the first pass. */
  resumed: boolean;
}

/** How many standing decisions an agent is told about by name; the rest it can list. */
export const DECISIONS_SHOWN = 15;

/**
 * The board's standing decisions, one line each, for an agent's first
 * prompt: the choices it should work within (spec-11). Empty when there are
 * none, or when the board cannot be read.
 */
export function standingDecisions(brainfilePath: string): string {
  try {
    const types = readBoardConfig(brainfilePath)?.config?.types;
    const current = readDecisionDocs(getV2Dirs(brainfilePath), types)
      .map((doc) => summarizeDecision(doc.task))
      .filter((d) => d.status === 'current');
    if (current.length === 0) return '';
    const lines = current.slice(0, DECISIONS_SHOWN).map((d) => `- ${d.id}${d.claimKey ? ` (${d.claimKey})` : ''}: ${d.title}`);
    if (current.length > DECISIONS_SHOWN) lines.push(`- and ${current.length - DECISIONS_SHOWN} more (\`brainfile list --type decision\`)`);
    return (
      `\n\nStanding decisions on this board:\n${lines.join('\n')}\n` +
      'Work within them. Before going against one, run the brainfile check tool and say so in your reply; record a new lasting choice with decide, which replaces the decision on the same claim key.'
    );
  } catch {
    return '';
  }
}

/**
 * Where finished work goes. A board with a review column wants a person to
 * look before it is done, so the agent moves the task there and leaves
 * completing it to them; a board without one lets the agent complete it,
 * unless its work is on a branch, which completes the task when it lands.
 */
export function finish(brainfilePath: string, taskId: string, lands: boolean): string {
  const columns = readBoardConfig(brainfilePath)?.config?.columns ?? [];
  const review = columns.find((c) => /review/i.test(c.id) || /review/i.test(c.title ?? ''));
  if (review) return `Then move ${taskId} to ${review.title ?? review.id} (column id \`${review.id}\`) for review. Do not complete it: a person completes it after looking at the work.`;
  // Complete would say it is there to build on before its branch has landed.
  return lands ? `Do not complete ${taskId}: it is completed when its branch lands on the trunk.` : `Then complete ${taskId}.`;
}

/**
 * Where the hand-off works, when it has its own worktree: the branch, that
 * its work is committed there, and what it must leave to the person.
 */
export function workplace(worktree: BriefWorktree | null): string {
  if (!worktree) return '';
  if (!worktree.branch) {
    return (
      `\n\nYou are in a read-only checkout of this repository, at ${worktree.path}: the tip of ${worktree.base ?? 'the trunk'}, detached, with no branch. ` +
      'Read and run what you need, but change no files and make no commits: nothing here is kept, and the checkout goes when you finish. ' +
      'What you find goes on the board, in notes on the task or in tasks you add. Untracked files such as installed dependencies are not here; set them up if you need to build or test. ' +
      'The board is shared: the brainfile tools reach it from here.'
    );
  }
  const from = worktree.base ? ` (started from ${worktree.base})` : '';
  const again = worktree.resumed
    ? ' It has been here before: the branch already carries earlier work on this task. Pick up from there; the task\'s log says what the reviewer asked for.'
    : '';
  return (
    `\n\nYou are working in your own git worktree of this repository, at ${worktree.path}, on the branch \`${worktree.branch}\`${from}. ` +
    'Commit your work on this branch as you go, with clear messages, and leave nothing uncommitted when you finish: a person reviews and merges the branch. ' +
    `Do not switch branches, rebase or push, and merge nothing but ${worktree.base ?? 'the branch it goes into'} into this branch, only when the task's log asks you to settle a conflict with it. Untracked files such as installed dependencies are not here; set them up if you need to build or test. ` +
    `The board is shared: the brainfile tools reach it from here.${again}`
  );
}

/**
 * What the tasks this one depends on said when they finished: their last
 * notes, where a worker leaves what it did not wire up for the task after it.
 */
export function leftFor(dirs: ReturnType<typeof getV2Dirs>, dependsOn: unknown): string {
  const refs = Array.isArray(dependsOn) ? dependsOn.filter((r): r is string => typeof r === 'string' && !r.includes(':')) : [];
  const said = refs.flatMap((ref) => {
    const doc = findV2Task(dirs, ref, true)?.doc;
    const log = doc?.body.split(/^## Log\s*$/m)[1]?.split(/^## /m)[0] ?? '';
    const notes = log.split('\n').filter((l) => /^- \S+: /.test(l)).slice(-3).map((l) => {
      const text = l.replace(/^- \S+: (\[[^\]]*\] )?/, '').trim();
      return text.length > 1500 ? `${text.slice(0, 1500)}…` : text;
    });
    return notes.length ? [`${ref} ("${doc!.task.title}"):\n${notes.map((n) => `- ${n}`).join('\n')}`] : [];
  });
  if (!said.length) return '';
  return `\n\nIt builds on work already landed. What those tasks said when they finished, including anything they left for the task after them:\n${said.join('\n')}\nWire your part into theirs where this task needs it. Whatever you leave unwired, say in your note on the task, so the task after you knows.`;
}

/**
 * The brief for `taskId` on the board in `projectId`. `ledBy` is the epic
 * whose lead hands this task off (decision-15), when one does: the brief
 * then says the lead reads the board, not the conversation.
 */
export function brief(projectId: string, taskId: string, worktree: BriefWorktree | null = null, ledBy: string | null = null): string {
  const located = locateBoard(projectId, { materialize: false });
  if (!located.found) throw new Error(`No board in ${projectId}`);
  const found = findV2Task(getV2Dirs(located.brainfilePath), taskId);
  if (!found) throw new Error(`Task ${taskId} not found`);
  const { task, body } = found.doc;
  const contract = task.contract
    ? `\n\nIt carries a contract (status ${task.contract.status}). Pick it up with the brainfile MCP contract tool before you start, meet its deliverables and validation, and deliver it when you are done.`
    : '';
  const led = ledBy && ledBy !== taskId
    ? `\n\nThis task is part of ${ledBy}, which an agent leads: it hands off the epic's children in order and reads the board, not your conversation. Put what the tasks after this one need to know in a note on ${task.id}.`
    : '';
  return [
    `You have been handed ${task.id} on this repository's Brainfile board: "${task.title}".`,
    body.trim() ? `\n${body.trim()}` : '',
    contract,
    leftFor(getV2Dirs(located.brainfilePath), task.dependsOn),
    led,
    standingDecisions(located.brainfilePath),
    workplace(worktree),
    `\n\nUse the brainfile MCP tools for the board (or, if they are not available, the \`brainfile\` command line here; never edit the board's files by hand): move ${task.id} to In Progress when you start, and when you finish add a short log note to it saying what you did${worktree?.branch ? ' and that it is on its branch' : ''}. ${finish(located.brainfilePath, task.id, !!worktree?.branch)} Do the work in ${worktree ? 'this worktree' : 'this repository'}. Finish with a reply of one or two sentences.`,
  ].join('');
}
