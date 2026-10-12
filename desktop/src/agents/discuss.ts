/**
 * Discuss (task-35): talking a task over with an agent before it is handed
 * off. The agent gets the task as context, can read the code and the board,
 * asks and pushes back, and with the person's agreement changes the task's
 * description, subtasks or contract. It writes no code and starts no work:
 * its session never runs in a bypass mode, it has no desk, and what it asks
 * to do is sorted here before anyone is asked.
 */
import { findV2Task, getV2Dirs, readBoardConfig } from '@brainfile/core';
import type { AgentModes } from '../shared/api';

/** What the agent is told about the task, read from the board. */
export interface DiscussContext {
  id: string;
  title: string;
  type?: string;
  column?: string;
  body: string;
  /** Its deliverables and constraints, one line each. */
  contract?: { status: string; lines: string[] };
  subtasks: { title: string; completed: boolean }[];
  parent?: { id: string; title: string; type?: string };
  /** The decisions the task rests on, one line each. */
  decisions: string[];
  relatedFiles: string[];
  /** The board's standing decisions, as `standingDecisions` writes them; empty when none. */
  standing: string;
}

/**
 * The task a discussion is about, as the agent first sees it: its body,
 * subtasks and contract, its parent, the decisions it rests on, the files it
 * names. `standing` is the board's standing decisions, as the agents process
 * words them for every brief.
 */
export function discussContext(brainfilePath: string, taskId: string, standing = ''): DiscussContext {
  const dirs = getV2Dirs(brainfilePath);
  const found = findV2Task(dirs, taskId);
  if (!found) throw new Error(`Task ${taskId} not found`);
  const { task, body } = found.doc;
  const parent = task.parentId ? findV2Task(dirs, task.parentId, true)?.doc.task : undefined;
  const config = readBoardConfig(brainfilePath)?.config;
  const column = config?.columns?.find((c) => c.id === task.column);
  const decisions = (task.decisions ?? []).map((id) => {
    const doc = findV2Task(dirs, id, true)?.doc.task;
    return doc ? `${id}: ${doc.title}` : id;
  });
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
    column: column?.title ?? task.column,
    body,
    contract,
    subtasks: (task.subtasks ?? []).map((st) => ({ title: st.title, completed: !!st.completed })),
    parent: parent ? { id: parent.id, title: parent.title, type: parent.type } : undefined,
    decisions,
    relatedFiles: task.relatedFiles ?? [],
    standing,
  };
}

/** The first turn's preamble: the task loaded, and what the agent may and may not do with it. */
export function discussPreamble(ctx: DiscussContext): string {
  const lines: string[] = [
    `You are talking ${ctx.id} on this repository's Brainfile board over with the person before it is handed off to a coding agent. ` +
      'Help them get the spec right: read the task, its parent, its decisions and the code it touches; ask what is unclear, push back on what seems wrong or too big, and suggest changes.',
    '',
    'You may change this task on the board, and only with the person\'s agreement: its description (the brainfile task_patch tool), its subtasks (subtask) and its contract (contract). ' +
      'Say what you would change and wait for a yes before you change it. Do not change other tasks, move, complete or delete this one, or record decisions; suggest those instead.',
    'Do not write or edit code, run commands that change anything, or start the work, and do not hand the task off: the person does that when the discussion is done, and the agent they hand it to reads the task as you leave it.',
    `Each time you change the task, add one short note to it with the brainfile note tool saying what was agreed and why, so the agent that does the work sees it. ` +
      'If the person says the discussion is done and nothing was noted yet, note what was agreed then.',
    'Keep replies short: a question or two at a time, or the change you propose. Do not list the board changes you made: the window shows them under your reply.',
    '',
    `The task: ${ctx.id}${ctx.type && ctx.type !== 'task' ? ` (${ctx.type})` : ''}, "${ctx.title}"${ctx.column ? `, in ${ctx.column}` : ''}.`,
  ];
  if (ctx.parent) lines.push(`Its parent: ${ctx.parent.id}${ctx.parent.type ? ` (${ctx.parent.type})` : ''}, "${ctx.parent.title}".`);
  if (ctx.body.trim()) lines.push('', ctx.body.trim());
  if (ctx.subtasks.length) lines.push('', 'Subtasks:', ...ctx.subtasks.map((s) => `- [${s.completed ? 'x' : ' '}] ${s.title}`));
  if (ctx.contract) {
    lines.push('', `Contract (status ${ctx.contract.status})${ctx.contract.lines.length ? ':' : '.'}`, ...ctx.contract.lines.map((d) => `- ${d}`));
  }
  if (ctx.decisions.length) lines.push('', 'It rests on these decisions:', ...ctx.decisions.map((d) => `- ${d}`));
  if (ctx.relatedFiles.length) lines.push('', `The code it touches: ${ctx.relatedFiles.join(', ')}.`);
  if (ctx.standing.trim()) lines.push('', ctx.standing.trim());
  return `${lines.join('\n')}\n\n`;
}

/** Brainfile's board tools as an agent names them: `mcp__brainfile__task_patch`, `brainfile_get_task`, `mcp.brainfile.note`. */
const BOARD_TOOL_NAME = /^(?:mcp(?:__|\.))?brainfile(?:__|[_.])(\w+)/i;

/** The board tools a discussion may use: reading anything, and changing this task's description, subtasks and contract, and its log. */
const DISCUSS_TOOLS = new Set(['brief', 'get_task', 'list_tasks', 'search', 'check', 'log', 'where', 'types', 'columns', 'template', 'lint', 'task_patch', 'subtask', 'contract', 'note']);

/** What the agent does to the code, or to how it runs: never in a discussion. */
const REFUSED_KINDS = new Set(['edit', 'delete', 'move', 'execute', 'switch_mode']);

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

/** A mode that only reads: Codex's Read Only. */
const READ_ONLY = /read.?only/i;

/**
 * The mode a discussion runs in: one that only reads when the agent has one;
 * else the one it starts in, its own default, which asks before an edit or a
 * command. Never the mode chosen for hand-offs, which may accept edits
 * unasked, and never the bypass mode, where nothing would be asked and so
 * nothing refused.
 */
export function discussMode(modes: AgentModes): string {
  const readOnly = modes.options.find((m) => READ_ONLY.test(m.id) || READ_ONLY.test(m.name));
  if (readOnly) return readOnly.id;
  if (modes.initial !== modes.bypass) return modes.initial;
  return modes.options.find((m) => m.id !== modes.bypass)?.id ?? modes.initial;
}
