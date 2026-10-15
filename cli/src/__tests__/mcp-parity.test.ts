/**
 * MCP parity (spec-13): every CLI capability that reads or changes a board
 * has an MCP equivalent, so an agent never falls back to the CLI or, worse,
 * edits board files by hand.
 *
 * The CLI's commands come from the real commander program (`createProgram`),
 * subcommands included where they are distinct capabilities (`columns add`,
 * `contract pickup`). Each must map to a tool the real server advertises, to
 * a resource it serves, or sit on the exclusion list with a reason. A new
 * command fails this test until it is given one of the three.
 */
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Command } from 'commander';
import { createProgram } from '../program';
import { BUNDLED_SCHEMAS } from '../commands/schema';
import { TOOL_PURPOSES } from '../mcp/instructions';
import { WireClient } from './helpers/mcp-wire';

/** CLI capability → the MCP tool that does the same. */
const TOOL_FOR: Record<string, string> = {
  list: 'list_tasks',
  show: 'get_task',
  add: 'task_add',
  patch: 'task_patch',
  move: 'task_move',
  complete: 'task_complete',
  // `archive --to github|linear` is task_complete's destination; local is complete.
  archive: 'task_complete',
  delete: 'task_delete',
  restore: 'task_restore',
  subtask: 'subtask',
  note: 'note',
  log: 'log',
  search: 'search',
  brief: 'brief',
  check: 'check',
  decide: 'decide',
  supersede: 'supersede',
  retire: 'retire',
  'adr promote': 'adr_promote',
  'contract pickup': 'contract',
  'contract deliver': 'contract',
  'contract validate': 'contract',
  'contract attach': 'contract',
  'contract graph': 'contract',
  'contract activate': 'contract',
  // Plans are documents of type plan (spec-12).
  'plan add': 'task_add', // type: plan, status, parentId
  'plan list': 'list_tasks', // type: plan, status
  'plan show': 'get_task',
  'plan link': 'task_patch', // parentId: the plan
  'columns list': 'columns',
  'columns add': 'columns',
  'columns rename': 'columns',
  'columns reorder': 'columns',
  'columns remove': 'columns',
  types: 'types',
  template: 'template',
  lint: 'lint',
  sync: 'sync',
  where: 'where',
  fix: 'where', // action: fix | undo, with expected
};

/** CLI capability → the MCP resources that serve it. */
const RESOURCES_FOR: Record<string, string[]> = {
  schema: BUNDLED_SCHEMAS.map((s) => `brainfile://schema/${s.id}`),
};

/** CLI capabilities with no MCP equivalent, on purpose. */
const EXCLUDED: Record<string, string> = {
  tui: 'The interactive board for a person at a terminal; MCP is itself the agent\'s interface.',
  mcp: 'Starts this server.',
  'merge-driver': 'git runs it during a merge of board files; nobody calls it by hand.',
  'hooks after-edit': 'A hook event the agent host fires, not something an agent asks for.',
  'hooks before-prompt': 'A hook event the agent host fires, not something an agent asks for.',
  'hooks session-start': 'A hook event the agent host fires; what it injects is the brief tool\'s text.',
  'hooks install': 'Changes the person\'s own agent settings.',
  'hooks uninstall': 'Changes the person\'s own agent settings.',
  'hooks list': 'Reads the person\'s agent settings, not the board.',
  'auth github': 'GitHub credentials: the person\'s secrets.',
  'auth linear': 'Linear credentials: the person\'s secrets.',
  'auth status': 'About the person\'s credentials, not the board.',
  'auth logout': 'Removes the person\'s credentials.',
  'config list': 'The person\'s user config (~/.config/brainfile), not the board.',
  'config get': 'The person\'s user config (~/.config/brainfile), not the board.',
  'config set': 'The person\'s user config (~/.config/brainfile), not the board.',
  'config path': 'The person\'s user config (~/.config/brainfile), not the board.',
  init: 'Creates a board and decides how it is stored: one-off, the person\'s call.',
  migrate: 'Upgrades a v1 board or changes how one is stored: one-off, the person\'s call.',
  index: 'Maintains the local search cache in state/; search, brief and check refresh it on every call.',
  adopt: 'Decides which of two boards is the board: the person\'s call. Writes refuse with this command named.',
  'merge-boards': 'Decides how two boards become one: the person\'s call. Writes refuse with this command named.',
  backups: 'Local safety copies of replaced boards, and putting one back: the person\'s call.',
};

/** Every leaf command, `parent child` for a subcommand. */
function capabilities(command: Command, prefix = ''): string[] {
  return command.commands.flatMap((sub) => {
    const name = prefix ? `${prefix} ${sub.name()}` : sub.name();
    return sub.commands.length > 0 ? capabilities(sub, name) : [name];
  });
}

function makeBoard(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-mcp-parity-'));
  const dotDir = path.join(dir, '.brainfile');
  fs.mkdirSync(path.join(dotDir, 'board'), { recursive: true });
  fs.mkdirSync(path.join(dotDir, 'logs'), { recursive: true });
  fs.writeFileSync(path.join(dotDir, 'brainfile.md'), '---\ntitle: Parity\ncolumns:\n  - id: todo\n    title: To Do\n---\n');
  return path.join(dotDir, 'brainfile.md');
}

describe('MCP parity with the CLI (spec-13)', () => {
  const cli = capabilities(createProgram());
  let client: WireClient;
  let brainfilePath: string;

  beforeAll(async () => {
    brainfilePath = makeBoard();
    client = await WireClient.open(brainfilePath, 'modern');
  });

  afterAll(async () => {
    await client?.close();
    fs.rmSync(path.dirname(path.dirname(brainfilePath)), { recursive: true, force: true });
  });

  test('the program has the commands this test expects to see', () => {
    // A sanity floor, so an empty enumeration cannot pass vacuously.
    expect(cli.length).toBeGreaterThan(50);
    expect(cli).toEqual(expect.arrayContaining(['list', 'columns add', 'contract pickup', 'hooks install', 'schema']));
  });

  test('every CLI capability maps to a tool, a resource or a reasoned exclusion', () => {
    const unaccounted = cli.filter((name) => !(name in TOOL_FOR) && !(name in RESOURCES_FOR) && !(name in EXCLUDED));
    expect(unaccounted).toEqual([]);
  });

  test('nothing is both mapped and excluded', () => {
    const both = Object.keys(EXCLUDED).filter((name) => name in TOOL_FOR || name in RESOURCES_FOR);
    expect(both).toEqual([]);
  });

  test('the lists name only commands the CLI has', () => {
    const stale = [...Object.keys(TOOL_FOR), ...Object.keys(RESOURCES_FOR), ...Object.keys(EXCLUDED)]
      .filter((name) => !cli.includes(name));
    expect(stale).toEqual([]);
  });

  test('every exclusion says why', () => {
    for (const [name, reason] of Object.entries(EXCLUDED)) {
      expect(`${name}: ${reason.trim().length > 10}`).toBe(`${name}: true`);
    }
  });

  test('every mapped tool is one the server advertises', async () => {
    const advertised = new Set((await client.listTools()).map((t) => t.name));
    const missing = [...new Set(Object.values(TOOL_FOR))].filter((tool) => !advertised.has(tool));
    expect(missing).toEqual([]);
  });

  test('every advertised tool is one a CLI capability maps to, or reads or edits the board config', async () => {
    // board is the one tool with no command of its own: the config's title,
    // instructions and related boards are edited by hand in brainfile.md by a
    // person, and an agent must never do that.
    const mapped = new Set([...Object.values(TOOL_FOR), 'board']);
    const extra = (await client.listTools()).map((t) => t.name).filter((name) => !mapped.has(name));
    expect(extra).toEqual([]);
  });

  test('the schemas are served as resources, the same files as brainfile schema', async () => {
    const listed = await client.request('resources/list', {});
    const uris = (listed.resources as Array<{ uri: string }>).map((r) => r.uri).sort();
    expect(uris).toEqual([...RESOURCES_FOR.schema].sort());

    for (const uri of RESOURCES_FOR.schema) {
      const read = await client.request('resources/read', { uri });
      const contents = read.contents as Array<{ uri: string; mimeType: string; text: string }>;
      expect(contents[0].uri).toBe(uri);
      expect(contents[0].mimeType).toBe('application/schema+json');
      const schema = JSON.parse(contents[0].text);
      expect(schema.$schema).toMatch(/json-schema\.org/);
    }
  });

  test.each(['legacy', 'modern'] as const)('the server instructions say how to use it, one line per tool (%s era)', async (era) => {
    const opened = await WireClient.open(brainfilePath, era);
    try {
      const instructions = String(opened.opening.instructions ?? '');
      expect(instructions).toContain('Use these tools for every board change.');
      expect(instructions).toContain('Never create, edit, move or delete files under .brainfile/ by hand');
      const advertised = (await opened.listTools()).map((t) => t.name).sort();
      const lines = instructions.split('\n').filter((line) => /^- [a-z_]+: /.test(line));
      expect(lines.map((line) => line.slice(2, line.indexOf(':'))).sort()).toEqual(advertised);
      expect(TOOL_PURPOSES.map(([name]) => name).sort()).toEqual(advertised);
      for (const uri of RESOURCES_FOR.schema) expect(instructions).toContain(uri);
    } finally {
      await opened.close();
    }
  });
});
