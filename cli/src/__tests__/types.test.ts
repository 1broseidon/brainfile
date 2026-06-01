import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { MemoryLogger } from '../utils/logger';
import { typesAddCommand, typesListCommand } from '../commands/types';

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

function writeV1Board(filePath: string, extraYaml: string = ''): void {
  const content = `---
title: Test Board
columns:
  - id: todo
    title: To Do
    tasks: []
  - id: done
    title: Done
    tasks: []
${extraYaml}---
`;
  fs.writeFileSync(filePath, content, 'utf-8');
}

function writeV2Board(brainfilePath: string, extraYaml: string = ''): void {
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
  fs.writeFileSync(brainfilePath, content, 'utf-8');
}

describe('types command', () => {
  let tempDir: string;
  let logger: MemoryLogger;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-types-test-'));
    logger = new MemoryLogger();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('list with no types shows empty message', () => {
    const v1Path = path.join(tempDir, 'brainfile.md');
    writeV1Board(v1Path);

    const result = typesListCommand({ file: v1Path }, logger);

    expect(result.success).toBe(true);
    expect(result.types).toEqual({});

    const output = logger.getOutput();
    expect(output).toContain('Strict mode: off');
    expect(output).toContain("No custom types defined. Add types to your brainfile.md or use 'brainfile types add'.");
  });

  it('list with types defined shows each type', () => {
    const v1Path = path.join(tempDir, 'brainfile.md');
    writeV1Board(
      v1Path,
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

    const result = typesListCommand({ file: v1Path }, logger);

    expect(result.success).toBe(true);
    expect(result.strict).toBe(true);
    expect(result.types.epic?.idPrefix).toBe('epic');
    expect(result.types.bug?.idPrefix).toBe('bug');

    const output = logger.getOutput();
    expect(output).toContain('Strict mode: on');
    expect(output).toContain('epic: idPrefix=epic, completable=false');
    expect(output).toContain('bug: idPrefix=bug, completable=true, schema=https://example.com/bug.schema.json');
  });

  it('list --json returns JSON', () => {
    const v1Path = path.join(tempDir, 'brainfile.md');
    writeV1Board(
      v1Path,
      `strict: true
types:
  adr:
    idPrefix: adr
`
    );

    const result = typesListCommand({ file: v1Path, json: true }, logger);

    expect(result.success).toBe(true);

    const output = JSON.parse(logger.getOutput());
    expect(output.strict).toBe(true);
    expect(output.types.adr.idPrefix).toBe('adr');
  });

  it('types add writes new type to frontmatter', () => {
    const v1Path = path.join(tempDir, 'brainfile.md');
    writeV1Board(
      v1Path,
      `agent:
  instructions:
    - Keep tests updated
`
    );

    const result = typesAddCommand(
      {
        file: v1Path,
        name: 'epic',
        idPrefix: 'epic',
        completable: false,
        schema: 'https://example.com/epic.schema.json',
      },
      logger
    );

    expect(result.success).toBe(true);

    const parsed = readFrontmatter(v1Path);
    const types = parsed.data.types as Record<string, any>;
    expect(types.epic.idPrefix).toBe('epic');
    expect(types.epic.completable).toBe(false);
    expect(types.epic.schema).toBe('https://example.com/epic.schema.json');

    // Verify unrelated fields are preserved
    expect(parsed.data.title).toBe('Test Board');
    expect((parsed.data.agent as any).instructions).toEqual(['Keep tests updated']);
  });

  it('types add existing updates existing entry', () => {
    const v1Path = path.join(tempDir, 'brainfile.md');
    writeV1Board(
      v1Path,
      `types:
  bug:
    idPrefix: bug-old
    completable: false
    schema: https://example.com/old.schema.json
`
    );

    const result = typesAddCommand(
      {
        file: v1Path,
        name: 'bug',
        idPrefix: 'bug',
        completable: true,
        schema: 'https://example.com/new.schema.json',
      },
      logger
    );

    expect(result.success).toBe(true);

    const parsed = readFrontmatter(v1Path);
    const types = parsed.data.types as Record<string, any>;
    expect(types.bug.idPrefix).toBe('bug');
    expect(types.bug.completable).toBe(true);
    expect(types.bug.schema).toBe('https://example.com/new.schema.json');
  });

  it('supports v2 board config for list and add', () => {
    const dotDir = path.join(tempDir, '.brainfile');
    const boardDir = path.join(dotDir, 'board');
    const logsDir = path.join(dotDir, 'logs');
    fs.mkdirSync(boardDir, { recursive: true });
    fs.mkdirSync(logsDir, { recursive: true });

    const v2Path = path.join(dotDir, 'brainfile.md');
    writeV2Board(
      v2Path,
      `strict: true
types:
  adr:
    idPrefix: adr
`
    );

    const listResult = typesListCommand({ file: v2Path }, logger);
    expect(listResult.success).toBe(true);
    expect(listResult.strict).toBe(true);
    expect(listResult.types.adr.idPrefix).toBe('adr');

    typesAddCommand(
      {
        file: v2Path,
        name: 'design',
        idPrefix: 'design',
        completable: true,
      },
      logger
    );

    const parsed = readFrontmatter(v2Path);
    const types = parsed.data.types as Record<string, any>;
    expect(types.design.idPrefix).toBe('design');
    expect(types.design.completable).toBe(true);
  });
});
