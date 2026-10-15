/**
 * Discuss (task-35): talking a task over with an agent, wherever it is in its
 * life. The agent gets the task as a block of context it need not look up
 * again, can read the code and the board, asks and pushes back, and with the
 * person's agreement changes the task's description, subtasks or contract and
 * records the decisions they settle (task-44). It writes no code and starts
 * no work: its session never runs in a bypass mode, its board lists no dispatch, and what
 * it asks to do is sorted here before anyone is asked.
 */
import { extractDescription, extractLog, findV2Task, getV2Dirs, parseNotes, readBoardConfig, readDecisionDocs, summarizeDecision } from '@brainfile/core';
import { BOARD_TOOL_NAME, REFUSED_KINDS, leadPermission, readOnlyMode } from '@brainfile/core/dispatch';
import type { AgentModes, ReviewView } from '../shared/api';
export { commandOf } from '@brainfile/core/dispatch';

/** A decision the task rests on, in full: the agent works within it. */
export interface DiscussDecision {
  id: string;
  title: string;
  claimKey?: string;
  /** `current`, `superseded`, …; unset when the decision cannot be found. */
  status?: string;
  supersededBy?: string;
  stance?: string;
  subject?: string;
  holdsWhile?: string;
  recheck?: string;
  /** The decision and why, without its title. */
  text?: string;
}

/** A line of the task's log. */
export interface DiscussNote {
  at: string;
  agent?: string;
  text: string;
}

/**
 * The task's code, when it was handed off (phase 2): its branch and worktree,
 * what is on them, and whether an agent is on it now. In Review the code that
 * matters is there, not in the main checkout.
 */
export interface DiscussWork {
  /** The hand-off's branch and worktree; null when it has none. */
  review: ReviewView | null;
  /** Files changed in the worktree and not committed, the first few; `review.uncommitted` counts them all. */
  uncommittedFiles: string[];
  /** The hand-off running on it now, if any. */
  working?: { agent: string; state: string; model?: string; effort?: string };
}

/** What the agent is told about the task, read from the board. */
export interface DiscussContext {
  id: string;
  title: string;
  type?: string;
  /** Its column's title; unset once it is done. */
  column?: string;
  /** The board's columns, in order, so the column says how far along it is. */
  columns: string[];
  /** Completed: it is in logs/. */
  done: boolean;
  priority?: string;
  assignee?: string;
  tags: string[];
  description: string;
  /** The latest notes, oldest first. */
  notes: DiscussNote[];
  /** Notes older than those shown. */
  earlierNotes: number;
  /** Its deliverables and constraints, one line each. */
  contract?: { status: string; lines: string[] };
  subtasks: { title: string; completed: boolean }[];
  parent?: { id: string; title: string; type?: string };
  decisions: DiscussDecision[];
  relatedFiles: string[];
  /** The board's other current decisions, one line each. */
  standing: string[];
  /** When the board was read. */
  asOf: Date;
  /** Its branch and worktree, read from git by the caller; unset when not looked at. */
  work?: DiscussWork;
}

/** How many of the task's notes the agent is given; the rest it can read with the log tool. */
const NOTES_SHOWN = 10;
/** How many of the board's other decisions the agent is told about by name. */
const STANDING_SHOWN = 15;

/** A decision's text without the title its body repeats. */
function decisionText(body: string, title: string): string | undefined {
  const text = (extractDescription(body) ?? body).trim();
  const lines = text.split('\n');
  if (lines[0]?.trim() === title.trim()) lines.shift();
  return lines.join('\n').trim() || undefined;
}

/**
 * The task a discussion is about, as the agent first sees it: where it is,
 * its description, subtasks and contract, its parent, the decisions it rests
 * on in full, the files it names, its latest notes, and the board's other
 * current decisions.
 */
export function discussContext(brainfilePath: string, taskId: string, now = new Date()): DiscussContext {
  const dirs = getV2Dirs(brainfilePath);
  const found = findV2Task(dirs, taskId, true);
  if (!found) throw new Error(`Task ${taskId} not found`);
  const { task, body } = found.doc;
  const parent = task.parentId ? findV2Task(dirs, task.parentId, true)?.doc.task : undefined;
  const config = readBoardConfig(brainfilePath)?.config;
  const columns = config?.columns ?? [];
  const decisions = (task.decisions ?? []).map((id): DiscussDecision => {
    const doc = findV2Task(dirs, id, true)?.doc;
    if (!doc) return { id, title: id };
    const d = summarizeDecision(doc.task);
    return {
      id,
      title: d.title,
      claimKey: d.claimKey,
      status: d.status,
      supersededBy: d.supersededBy,
      stance: d.stance,
      subject: d.subject,
      holdsWhile: d.holdsWhile,
      recheck: d.recheck,
      text: decisionText(doc.body, d.title),
    };
  });
  const own = new Set(decisions.map((d) => d.id));
  const standing = readDecisionDocs(dirs, config?.types)
    .map((doc) => summarizeDecision(doc.task))
    .filter((d) => d.status === 'current' && !own.has(d.id))
    .map((d) => `${d.id}${d.claimKey ? ` [${d.claimKey}]` : ''} ${d.title}`);
  if (standing.length > STANDING_SHOWN) standing.splice(STANDING_SHOWN, Infinity, `and ${standing.length - STANDING_SHOWN} more (list_tasks with type decision)`);
  const parsed = parseNotes(body).reverse();
  // A log with no dated lines is still shown, as it is.
  const notes: DiscussNote[] = parsed.length ? parsed.slice(-NOTES_SHOWN).map((n) => ({ at: n.at, agent: n.agent, text: n.text })) : (extractLog(body) ? [{ at: '', text: extractLog(body)! }] : []);
  const contract = task.contract
    ? {
        status: task.contract.status,
        lines: [
          ...(task.contract.deliverables ?? []).map((d) => `${d.type} ${d.path}${d.description ? `: ${d.description}` : ''}`),
          ...(task.contract.constraints ?? []).map((c) => `constraint: ${c}`),
        ],
      }
    : undefined;
  return {
    id: task.id,
    title: task.title,
    type: task.type,
    column: found.isLog ? undefined : (columns.find((c) => c.id === task.column)?.title ?? task.column),
    columns: columns.map((c) => c.title),
    done: found.isLog,
    priority: task.priority,
    assignee: task.assignee,
    tags: task.tags ?? [],
    description: (extractDescription(body) ?? body.split(/^## Log$/m)[0]).trim(),
    notes,
    earlierNotes: Math.max(0, parsed.length - NOTES_SHOWN),
    contract,
    subtasks: (task.subtasks ?? []).map((st) => ({ title: st.title, completed: !!st.completed })),
    parent: parent ? { id: parent.id, title: parent.title, type: parent.type } : undefined,
    decisions,
    relatedFiles: task.relatedFiles ?? [],
    standing,
    asOf: now,
  };
}

/** `2026-10-13 16:05 UTC`: to the minute, and said to be UTC. */
function stamp(at: string | Date): string {
  const iso = typeof at === 'string' ? at : at.toISOString();
  return `${iso.slice(0, 16).replace('T', ' ')} UTC`;
}

/** `a, b or c`. */
function either(items: string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

/** Where the task is: its column among the board's, or done. */
function stage(ctx: DiscussContext): string {
  if (ctx.done) return 'Stage: done (completed, in logs/).';
  if (!ctx.column) return 'Stage: no column.';
  return `Stage: ${ctx.column}${ctx.columns.length > 1 ? ` (${ctx.columns.join(' → ')})` : ''}.`;
}

/** The task's branch, worktree and live agent, so a discussion in Review reads the code where it is. */
export function workInformation(work: DiscussWork): string {
  const { review: r, working } = work;
  const now = working
    ? `${working.agent}${working.model ? ` (${working.model}${working.effort ? `, ${working.effort}` : ''})` : ''} is working on it now (${working.state}): its worktree may change while you talk.`
    : 'No agent is working on it now.';
  if (!r) return ['<work>', 'No branch or worktree: it has not been handed off to one. Its code, if any, is in the main checkout.', now, '</work>'].join('\n');
  const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
  const lines = [
    `<work branch="${r.branch}" worktree="${r.path}">`,
    `Started from ${r.base ?? 'an unknown commit'}; ${plural(r.ahead, 'commit')} ahead, ${plural(r.filesChanged, 'file')} changed (+${r.added} −${r.removed}).` +
      (r.merged ? ` Already merged into ${r.into}.` : r.into ? ` Not merged into ${r.into}.` : ''),
  ];
  if (r.commits.length) {
    lines.push('Commits, newest first:', ...r.commits.map((c) => `- ${c.sha} ${c.subject}`));
    if (r.ahead > r.commits.length) lines.push(`- and ${r.ahead - r.commits.length} more`);
  }
  if (r.files.length) {
    lines.push('Files changed on the branch:', ...r.files.map((f) => `- ${f.path} +${f.added} −${f.removed}`));
    if (r.filesChanged > r.files.length) lines.push(`- and ${r.filesChanged - r.files.length} more`);
  }
  if (r.uncommitted) {
    const more = r.uncommitted - work.uncommittedFiles.length;
    lines.push(`Not committed in the worktree (${r.uncommitted}): ${work.uncommittedFiles.join(', ')}${more > 0 ? ` and ${more} more` : ''}.`);
  } else lines.push('Nothing uncommitted in the worktree.');
  lines.push(now, '</work>');
  return lines.join('\n');
}

/** The task as data, in a block the person does not see: everything the board says about it, so the agent need not look it up. */
export function taskInformation(ctx: DiscussContext): string {
  const facts = [
    ctx.type ?? 'task',
    ctx.priority && `priority ${ctx.priority}`,
    ctx.assignee && `assigned to ${ctx.assignee}`,
    ctx.tags.length > 0 && `tags ${ctx.tags.join(', ')}`,
  ].filter(Boolean);
  const missing = [
    !ctx.parent && 'parent',
    ctx.subtasks.length === 0 && 'subtasks',
    !ctx.contract && 'contract',
    ctx.decisions.length === 0 && 'decisions',
    ctx.relatedFiles.length === 0 && 'files',
  ].filter((x): x is string => !!x);

  const lines = [
    `<task-information id="${ctx.id}" as-of="${stamp(ctx.asOf)}">`,
    `${ctx.id} · ${ctx.title}`,
    stage(ctx),
    facts.join(' · '),
  ];
  if (ctx.parent) lines.push(`Parent: ${ctx.parent.id}${ctx.parent.type ? ` (${ctx.parent.type})` : ''} · ${ctx.parent.title}`);
  if (missing.length) lines.push(`No ${either(missing)}.`);
  lines.push('', '<description>', ctx.description || '(none)', '</description>');
  if (ctx.subtasks.length) lines.push('', '<subtasks>', ...ctx.subtasks.map((s) => `- [${s.completed ? 'x' : ' '}] ${s.title}`), '</subtasks>');
  if (ctx.contract) lines.push('', `<contract status="${ctx.contract.status}">`, ...ctx.contract.lines.map((d) => `- ${d}`), '</contract>');
  if (ctx.relatedFiles.length) lines.push('', `<files>${ctx.relatedFiles.join(', ')}</files>`);
  if (ctx.decisions.length) {
    lines.push('', '<decisions>');
    for (const d of ctx.decisions) {
      if (!d.status) {
        lines.push(`${d.id} (not found on the board)`);
        continue;
      }
      const state = d.supersededBy ? `${d.status} by ${d.supersededBy}` : d.status;
      const stance = d.stance && d.subject ? ` · ${d.stance}: ${d.subject}` : '';
      lines.push(`${d.id}${d.claimKey ? ` [${d.claimKey}]` : ''} ${state}${stance}`, `  ${d.title}`);
      if (d.text) lines.push(...d.text.split('\n').map((l) => (l.trim() ? `  ${l}` : '')));
      if (d.holdsWhile) lines.push(`  Holds while: ${d.holdsWhile}`);
      if (d.recheck) lines.push(`  Recheck: ${d.recheck}`);
    }
    lines.push('</decisions>');
  }
  if (ctx.notes.length) {
    lines.push('', '<log newest="last">');
    if (ctx.earlierNotes) lines.push(`(${ctx.earlierNotes} earlier ${ctx.earlierNotes === 1 ? 'note' : 'notes'}: the brainfile log tool)`);
    lines.push(...ctx.notes.map((n) => (n.at ? `${stamp(n.at)}${n.agent ? ` ${n.agent}` : ''}: ${n.text}` : n.text)), '</log>');
  }
  if (ctx.standing.length) lines.push('', '<board-decisions>', ...ctx.standing, '</board-decisions>');
  if (ctx.work) lines.push('', workInformation(ctx.work));
  lines.push('</task-information>');
  return lines.join('\n');
}

/** What the agent may and may not do in a discussion, at any stage of the task's life. */
export function discussRules(ctx: DiscussContext): string {
  return [
    '<discussion-rules>',
    `The person wants to talk ${ctx.id} over with you, wherever it is in its life: shaping it before it is handed off, steering it while it is worked on, reviewing what was done, or looking back. ` +
      'Start from its stage. The block above is what the board says about it, so you need not look the task up again; read the code it touches as you need to. ' +
      'Ask what is unclear, push back on what seems wrong or too big, and suggest changes.',
    'With the person\'s yes, you may change this task\'s description (the brainfile task_patch tool), its subtasks (subtask) and its contract (contract). Say what you would change and wait for a yes before you change it.',
    'When the person settles something that should outlive this task, you may record it as a decision on the same terms. ' +
      'Run check on it first; then say its claim key, title and text, and which decision it replaces or retires, and wait for a yes. ' +
      `Then record it with decide (its claim family's current decision is replaced) or supersede (to replace a given one), with ${ctx.id} in forWork so the task rests on it, or retire one as rejected or stale.`,
    ...(ctx.work?.review
      ? [
          `Its code is on the branch ${ctx.work.review.branch}, in the worktree at ${ctx.work.review.path}, not in the main checkout: read its files there. ` +
            'You run no commands, so the commits and files in <work> are its history; compare a file with the main checkout\'s to see what changed. ' +
            'A merge takes only what is committed: say so when something that matters is uncommitted.',
        ]
      : []),
    'Work within the decisions above. Before going against one, run check and say so in your reply.',
    'Each time you change the task or record a decision, add one short note to it with the brainfile note tool saying what was agreed and why, so whoever works on it next sees it. ' +
      'If the person says the discussion is done and nothing was noted yet, note what was agreed then.',
    'Do not change other tasks, or move, complete or delete this one; suggest those instead. Do not write or edit code, run commands that change anything, start the work or hand the task off: the person does that.',
    `The block was read at the time it gives. If the task may have changed since, read it again with get_task${ctx.work?.review ? ', and the worktree\'s files again' : ''}.`,
    'Keep replies short: a question or two at a time, or the change you propose. Do not list the board changes you made: the window shows them under your reply.',
    '</discussion-rules>',
  ].join('\n');
}

/** The first turn's preamble, ahead of what the person sees they said: the task as data, then the rules. */
export function discussPreamble(ctx: DiscussContext): string {
  return `${taskInformation(ctx)}\n\n${discussRules(ctx)}\n\n`;
}

/** The board tools a discussion may use: reading anything (its server offers review's show and ready only); changing this task's description, subtasks and contract, and its log; and recording, replacing or retiring decisions. */
const DISCUSS_TOOLS = new Set(['brief', 'get_task', 'list_tasks', 'search', 'check', 'log', 'where', 'types', 'columns', 'template', 'lint', 'task_patch', 'subtask', 'contract', 'note', 'decide', 'supersede', 'retire', 'dispatch_status', 'review', 'agents']);

/**
 * How a discussion answers an agent that asks before it acts: a board tool it
 * may use is allowed, any other board tool or anything that changes the code
 * or the session is refused, and the rest (reading, searching) is asked as
 * usual.
 */
export function discussPermission(title: string, kind?: string | null): 'allow' | 'refuse' | 'usual' {
  const board = BOARD_TOOL_NAME.exec(title.trim());
  if (board) return DISCUSS_TOOLS.has(board[1].toLowerCase()) ? 'allow' : 'refuse';
  return kind && REFUSED_KINDS.has(kind) ? 'refuse' : 'usual';
}

/**
 * How the board's chat answers an agent that asks before it acts
 * (decision-14): it manages the board and hands code to hand-offs, through
 * its brainfile mcp's dispatch tools. Board tools, the brainfile command
 * line and git that only reads are
 * allowed; an edit, a delete, a move, a change of mode or any other command
 * is refused before anyone is asked; reading and searching are asked as
 * usual.
 */
export function chatPermission(title: string, kind?: string | null, rawInput?: unknown): 'allow' | 'refuse' | 'usual' {
  // A lead's rule (core's): the board, the brainfile command line and git that only reads.
  return leadPermission(title.trim(), kind, rawInput);
}

/**
 * The mode a discussion runs in: one that only reads when the agent has one;
 * else the one it starts in, its own default, which asks before an edit or a
 * command; never the hand-offs' mode or bypass (core's readOnlyMode, which a
 * lead keeps too).
 */
export const discussMode: (modes: AgentModes) => string = readOnlyMode;
