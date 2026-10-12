import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { MemoryLogger } from '../utils/logger';
import { typesAddCommand, typesListCommand } from '../commands/types';
import { createV2TestWorkspace, type V2TestWorkspace } from './helpers/v2';

interface FrontmatterDoc {
  data: Record<string, unknown>;
  body: string;
}

function readFrontmatter(filePath: string): FrontmatterDoc {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    throw new Error('Invalid frontmatter in test fixture');
  }

  const data = yaml.load(lines.slice(1, endIndex).join('\n')) as Record<string, unknown>;

  return {
    data,
    body: lines.slice(endIndex + 1).join('\n'),
  };
}

function writeV2Board(workspace: V2TestWorkspace, extraYaml: string = ''): void {
  const content = `---
title: Test V2 Board
schema: https://brainfile.md/v2/board.json
columns:
  - id: todo
    title: To Do
    order: 1
  - id: done
    title: Done
    order: 2
${extraYaml}---
`;
  fs.writeFileSync(workspace.brainfilePath, content, 'utf-8');
}

describe('types command', () => {
  let workspace: V2TestWorkspace;
  let logger: MemoryLogger;

  beforeEach(() => {
    workspace = createV2TestWorkspace('brainfile-types-test-');
    logger = new MemoryLogger();
  });

  afterEach(() => {
    fs.rmSync(workspace.tempDir, { recursive: true, force: true });
  });

  // spec-12: the five built-ins are listed with their place in the graph, configured or not.
  it('list with no types shows the five built-ins and their place in the graph', () => {
    writeV2Board(workspace);

    const result = typesListCommand({ file: workspace.brainfilePath }, logger);

    expect(result.success).toBe(true);
    expect(result.types).toEqual({});
    expect(result.graph.map((t) => t.name)).toEqual(['epic', 'spec', 'plan', 'task', 'decision']);

    const lines = logger.getOutput().split('\n');
    expect(lines[0]).toBe('Strict mode: off');
    expect(lines.find((l) => l.startsWith('▸ epic'))).toMatch(/^▸ epic\s+epic-N\s+top level\s+spec · plan · task$/);
    expect(lines.find((l) => l.startsWith('◆ spec'))).toMatch(/^◆ spec\s+spec-N\s+epic\s+plan · task$/);
    expect(lines.find((l) => l.startsWith('⎘ plan'))).toMatch(/^⎘ plan\s+plan-N\s+epic · spec\s+task$/);
    expect(lines.find((l) => l.startsWith('  task'))).toMatch(/^  task\s+task-N\s+epic · spec · plan · task\s+task\s+alias issue$/);
    expect(lines.find((l) => l.startsWith('● decision'))).toMatch(/never in the tree\s+—\s+alias adr · no column, never completed$/);
    expect(logger.getOutput()).toContain('No types of your own.');
  });

  it('list with types defined shows each type', () => {
    writeV2Board(
      workspace,
      `strict: true
types:
  epic:
    idPrefix: epic
    completable: false
  bug:
    idPrefix: bug
    schema: https://example.com/bug.schema.json
`
    );

    const result = typesListCommand({ file: workspace.brainfilePath }, logger);

    expect(result.success).toBe(true);
    expect(result.strict).toBe(true);
    expect(result.types.epic?.idPrefix).toBe('epic');
    expect(result.types.bug?.idPrefix).toBe('bug');

    const output = logger.getOutput();
    expect(output).toContain('Strict mode: on');
    expect(output).toMatch(/▸ epic\s+epic-N\s+top level\s+spec · plan · task\s+not completable/);
    expect(output).toMatch(/ {2}bug\s+bug-N\s+epic · spec · plan · task\s+task\s+behaves as a task · schema https:\/\/example\.com\/bug\.schema\.json/);
    expect(result.graph.find((t) => t.name === 'bug')).toMatchObject({ role: 'task', builtIn: false, configured: true, completable: true });
  });

  it('list shows like: types in their model\'s place, and flags alias entries', () => {
    writeV2Board(
      workspace,
      `types:
  rfc:
    like: spec
  adr:
    idPrefix: adr
    completable: false
`
    );

    const result = typesListCommand({ file: workspace.brainfilePath }, logger);
    const output = logger.getOutput();
    expect(output).toMatch(/◆ rfc\s+rfc-N\s+epic\s+plan · task\s+like spec/);
    expect(output).toContain("types.adr: 'adr' is an alias of decision; that entry is not used. Configure decision instead.");
    expect(result.aliasEntries).toEqual(['adr']);
    expect(result.graph.map((t) => t.name)).toEqual(['epic', 'spec', 'plan', 'task', 'decision', 'rfc']);
  });

  it('list --json carries every type with its place in the graph', () => {
    writeV2Board(workspace, `types:\n  bug:\n    like: task\n`);
    typesListCommand({ file: workspace.brainfilePath, json: true }, logger);
    const output = JSON.parse(logger.getOutput());
    expect(output.graph.find((t: any) => t.name === 'decision')).toMatchObject({
      role: 'decision', glyph: '●', parents: [], children: [], work: false, completable: false, aliases: ['adr'],
    });
    expect(output.graph.find((t: any) => t.name === 'bug')).toMatchObject({ role: 'task', like: 'task', parents: ['epic', 'spec', 'plan', 'task'] });
  });

  it('types add --like writes like and leaves completable to the model', () => {
    writeV2Board(workspace);
    const result = typesAddCommand({ file: workspace.brainfilePath, name: 'bug', like: 'issue' }, logger);
    expect(result.entry).toEqual({ idPrefix: 'bug', like: 'task' });
    const types = readFrontmatter(workspace.brainfilePath).data.types as Record<string, any>;
    expect(types.bug).toEqual({ idPrefix: 'bug', like: 'task' });
  });

  it('types add refuses an alias name and an unknown like', () => {
    writeV2Board(workspace);
    expect(() => typesAddCommand({ file: workspace.brainfilePath, name: 'adr' }, logger)).toThrow(/alias of decision/);
    expect(() => typesAddCommand({ file: workspace.brainfilePath, name: 'bug', like: 'nope' }, logger)).toThrow(/Cannot use like: 'nope'/);
    expect(() => typesAddCommand({ file: workspace.brainfilePath, name: 'bug', like: 'bug' }, logger)).toThrow(/Cannot use like/);
  });

  it('list --json returns JSON', () => {
    writeV2Board(
      workspace,
      `strict: true
types:
  adr:
    idPrefix: adr
`
    );

    const result = typesListCommand({ file: workspace.brainfilePath, json: true }, logger);

    expect(result.success).toBe(true);

    const output = JSON.parse(logger.getOutput());
    expect(output.strict).toBe(true);
    expect(output.types.adr.idPrefix).toBe('adr');
  });

  it('types add writes new type to frontmatter', () => {
    writeV2Board(
      workspace,
      `agent:
  instructions:
    - Keep tests updated
`
    );

    const result = typesAddCommand(
      {
        file: workspace.brainfilePath,
        name: 'epic',
        idPrefix: 'epic',
        completable: false,
        schema: 'https://example.com/epic.schema.json',
      },
      logger
    );

    expect(result.success).toBe(true);

    const parsed = readFrontmatter(workspace.brainfilePath);
    const types = parsed.data.types as Record<string, any>;
    expect(types.epic.idPrefix).toBe('epic');
    expect(types.epic.completable).toBe(false);
    expect(types.epic.schema).toBe('https://example.com/epic.schema.json');

    // Verify unrelated fields are preserved
    expect(parsed.data.title).toBe('Test V2 Board');
    expect((parsed.data.agent as any).instructions).toEqual(['Keep tests updated']);
  });

  it('types add existing updates existing entry', () => {
    writeV2Board(
      workspace,
      `types:
  bug:
    idPrefix: bug-old
    completable: false
    schema: https://example.com/old.schema.json
`
    );

    const result = typesAddCommand(
      {
        file: workspace.brainfilePath,
        name: 'bug',
        idPrefix: 'bug',
        completable: true,
        schema: 'https://example.com/new.schema.json',
      },
      logger
    );

    expect(result.success).toBe(true);

    const parsed = readFrontmatter(workspace.brainfilePath);
    const types = parsed.data.types as Record<string, any>;
    expect(types.bug.idPrefix).toBe('bug');
    expect(types.bug.completable).toBe(true);
    expect(types.bug.schema).toBe('https://example.com/new.schema.json');
  });
});
