/**
 * What `brainfile mcp` tells a client about itself (the MCP `instructions`):
 * use these tools for every board change, never edit `.brainfile/` by hand,
 * and one line per tool on what it is for. The parity test holds this list
 * to the tools actually registered.
 */
import { BUNDLED_SCHEMAS } from '../commands/schema';
import { schemaResourceUri } from './resources';

/** Every tool, in the order the server registers them, and what it is for. */
export const TOOL_PURPOSES: ReadonlyArray<readonly [string, string]> = [
  ['list_tasks', 'the board\'s documents by column, tag, type or status; tree for the outline, related for other repos\' boards'],
  ['get_task', 'one document in full, with its parent, children and the decisions it rests on'],
  ['search', 'the board, its history and the project\'s docs in one search; recent completions; one log entry'],
  ['brief', 'what this agent should know now: current decisions, its tasks, what changed since it last looked, the docs that bear on them'],
  ['check', 'whether a decision speaks to an action and still holds: use, review, use_replacement or no_decision'],
  ['task_add', 'create a document (task, epic, spec, plan, decision or one of the board\'s types) with its parent, dependencies and a contract'],
  ['task_patch', 'change fields on one task or many, parentId, dependsOn and decisions included'],
  ['task_move', 'move one task or many to another column'],
  ['task_complete', 'finish a task (it moves to logs/ and the ledger), or export it to GitHub or Linear'],
  ['task_restore', 'reopen a completed task: back from logs/ to a column, out of the ledger'],
  ['task_delete', 'remove a task for good'],
  ['subtask', 'add, toggle, update or delete a task\'s subtasks'],
  ['contract', 'attach, pick up, deliver, validate, graph or activate a task\'s contract'],
  ['note', 'append a line to a task\'s log: what you found, decided or did'],
  ['log', 'read completed work: one task\'s log, a search, or the most recent'],
  ['decide', 'record a decision in its claim family; the family\'s current one is superseded'],
  ['supersede', 'replace one decision with a new one by hand'],
  ['retire', 'mark a decision rejected or stale; it moves to logs/'],
  ['adr_promote', 'accept a legacy type: adr document and move it to logs/'],
  ['columns', 'list, add, rename, reorder or remove the board\'s columns'],
  ['board', 'read or set the board\'s title, agent instructions and related boards'],
  ['types', 'every document type and its place in the graph; add one'],
  ['template', 'list the task templates; add a task from one'],
  ['lint', 'check the board and fix what can be fixed'],
  ['sync', 'fetch, merge and push a shared board now'],
  ['where', 'where the board lives, how it is stored and how fresh it is; fix or undo a problem with it when nothing would be lost'],
  ['issues', 'the project\'s open GitHub issues, marked when on the board; import one as a task'],
  ['pull_request', 'open a task\'s hand-off as a GitHub pull request, or ask where it stands'],
];

/** The server instructions `brainfile mcp` sends in its handshake. */
export function serverInstructions(): string {
  const schemas = BUNDLED_SCHEMAS.map((s) => schemaResourceUri(s.id)).join(' and ');
  return [
    'Brainfile is this project\'s board: tasks, epics, specs, plans and decisions in .brainfile/, one Markdown file each, with completed work in logs/ and the ledger.',
    '',
    'Use these tools for every board change. Never create, edit, move or delete files under .brainfile/ by hand, and do not shell out to the brainfile CLI for what a tool here does: the tools keep IDs, the ledger, the graph and the board\'s git history right, and commit each change.',
    '',
    'Start a session with brief. Leave a note on the task you are working on as you go. Before acting on something a decision may cover, check it; when you settle something, decide it.',
    '',
    'Tools (each takes file to point at another board):',
    ...TOOL_PURPOSES.map(([name, purpose]) => `- ${name}: ${purpose}`),
    '',
    `The board's JSON Schemas are resources: ${schemas}.`,
  ].join('\n');
}
