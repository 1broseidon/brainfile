import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  parseBoardConfig,
  serializeBoardConfig,
  readBoardConfig,
  writeBoardConfig,
} from '../boardFile';
import type { BoardConfig } from '../types';

describe('boardFile', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-boardfile-test-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  const minimalConfig: BoardConfig = {
    title: 'Test Board',
    columns: [
      { id: 'todo', title: 'To Do' },
      { id: 'done', title: 'Done', completionColumn: true },
    ],
  };

  describe('parseBoardConfig', () => {
    it('parses minimal board config', () => {
      const content = [
        '---',
        'title: Test Board',
        'columns:',
        '  - id: todo',
        '    title: To Do',
        '---',
        '',
      ].join('\n');

      const result = parseBoardConfig(content);

      expect(result).not.toBeNull();
      expect(result!.config.title).toBe('Test Board');
      expect(result!.config.columns).toHaveLength(1);
      expect(result!.config.columns[0].id).toBe('todo');
      expect(result!.body).toBe('');
    });

    it('parses config with body', () => {
      const content = [
        '---',
        'title: Test Board',
        'columns:',
        '  - id: todo',
        '    title: To Do',
        '---',
        '',
        '## Notes',
        'Some project notes here.',
        '',
      ].join('\n');

      const result = parseBoardConfig(content);

      expect(result).not.toBeNull();
      expect(result!.config.title).toBe('Test Board');
      expect(result!.body).toContain('## Notes');
      expect(result!.body).toContain('Some project notes here.');
    });

    it('parses config with agent identity', () => {
      const content = [
        '---',
        'title: Test Board',
        'columns:',
        '  - id: todo',
        '    title: To Do',
        'agent:',
        '  instructions:',
        '    - Always write tests',
        '  identity: You are a senior engineer',
        '---',
        '',
      ].join('\n');

      const result = parseBoardConfig(content);

      expect(result).not.toBeNull();
      expect(result!.config.agent).toBeDefined();
      expect(result!.config.agent!.identity).toBe('You are a senior engineer');
      expect(result!.config.agent!.instructions).toEqual(['Always write tests']);
    });

    it('returns null for content without frontmatter', () => {
      expect(parseBoardConfig('Just plain text')).toBeNull();
    });

    it('returns null for content without closing frontmatter delimiter', () => {
      const content = '---\ntitle: Test\ncolumns:\n  - id: todo\n    title: To Do\n';
      expect(parseBoardConfig(content)).toBeNull();
    });

    it('returns null for empty YAML', () => {
      expect(parseBoardConfig('---\n---\n')).toBeNull();
    });

    it('handles empty body', () => {
      const content = '---\ntitle: Test Board\ncolumns:\n  - id: todo\n    title: To Do\n---\n';
      const result = parseBoardConfig(content);
      expect(result).not.toBeNull();
      expect(result!.body).toBe('');
    });

    it('round-trips through serialize and parse', () => {
      const content = [
        '---',
        'title: Round Trip',
        'type: board',
        'columns:',
        '  - id: todo',
        '    title: To Do',
        '  - id: done',
        '    title: Done',
        '    completionColumn: true',
        'agent:',
        '  instructions:',
        '    - Be concise',
        '  identity: You are a task manager',
        '---',
        '',
        '## Notes',
        'Some notes.',
        '',
      ].join('\n');

      const result = parseBoardConfig(content);
      expect(result).not.toBeNull();

      const serialized = serializeBoardConfig(result!.config, result!.body);
      const result2 = parseBoardConfig(serialized);

      expect(result2).not.toBeNull();
      expect(result2!.config.title).toBe(result!.config.title);
      expect(result2!.config.columns).toHaveLength(result!.config.columns.length);
      expect(result2!.config.columns[0].id).toBe(result!.config.columns[0].id);
      expect(result2!.config.columns[1].completionColumn).toBe(result!.config.columns[1].completionColumn);
      expect(result2!.config.agent!.identity).toBe(result!.config.agent!.identity);
      expect(result2!.config.agent!.instructions).toEqual(result!.config.agent!.instructions);
      expect(result2!.body).toContain('Some notes.');
    });
  });

  describe('serializeBoardConfig', () => {
    it('serializes minimal config', () => {
      const result = serializeBoardConfig(minimalConfig);

      expect(result).toMatch(/^---\n/);
      expect(result).toContain('title: Test Board');
      expect(result).toMatch(/---\n$/);
    });

    it('serializes with body', () => {
      const result = serializeBoardConfig(minimalConfig, '## Notes\nHello\n');

      expect(result).toContain('---\n\n## Notes');
      expect(result).toMatch(/Hello\n$/);
    });

    it('ensures trailing newline on body', () => {
      const result = serializeBoardConfig(minimalConfig, 'No trailing newline');
      expect(result).toMatch(/No trailing newline\n$/);
    });

    it('serializes with no body argument', () => {
      const result = serializeBoardConfig(minimalConfig);
      expect(result).toMatch(/---\n$/);
    });

    it('serializes empty body without extra content', () => {
      const result = serializeBoardConfig(minimalConfig, '');
      expect(result).toMatch(/---\n$/);
    });

    it('serializes agent identity', () => {
      const config: BoardConfig = {
        title: 'Test',
        columns: [{ id: 'todo', title: 'To Do' }],
        agent: {
          instructions: ['Write tests'],
          identity: 'You are a senior backend engineer',
        },
      };

      const result = serializeBoardConfig(config);
      expect(result).toContain('identity: You are a senior backend engineer');
    });
  });

  describe('readBoardConfig / writeBoardConfig roundtrip', () => {
    it('roundtrips board config and body', () => {
      const config: BoardConfig = {
        title: 'Roundtrip Test',
        columns: [
          { id: 'todo', title: 'To Do' },
          { id: 'in-progress', title: 'In Progress' },
          { id: 'done', title: 'Done', completionColumn: true },
        ],
        agent: {
          instructions: ['Always write tests', 'Use type hints'],
          identity: 'You are a Python expert',
        },
      };
      const body = '## Notes\nProject-level notes.\n';

      const filePath = path.join(testDir, 'brainfile.md');
      writeBoardConfig(filePath, config, body);

      const result = readBoardConfig(filePath);

      expect(result).not.toBeNull();
      expect(result!.config.title).toBe('Roundtrip Test');
      expect(result!.config.columns).toHaveLength(3);
      expect(result!.config.columns[2].completionColumn).toBe(true);
      expect(result!.config.agent!.identity).toBe('You are a Python expert');
      expect(result!.config.agent!.instructions).toEqual(['Always write tests', 'Use type hints']);
      expect(result!.body).toContain('Project-level notes.');
      expect(result!.filePath).toBe(path.resolve(filePath));
    });

    it('creates parent directories automatically', () => {
      const filePath = path.join(testDir, 'nested', 'deep', 'brainfile.md');

      writeBoardConfig(filePath, minimalConfig);

      expect(fs.existsSync(filePath)).toBe(true);
      const result = readBoardConfig(filePath);
      expect(result!.config.title).toBe('Test Board');
    });

    it('handles empty body', () => {
      const filePath = path.join(testDir, 'brainfile.md');

      writeBoardConfig(filePath, minimalConfig);

      const result = readBoardConfig(filePath);
      expect(result).not.toBeNull();
      expect(result!.config.title).toBe('Test Board');
      expect(result!.body).toBe('');
    });
  });

  describe('readBoardConfig', () => {
    it('returns null for non-existent file', () => {
      expect(readBoardConfig(path.join(testDir, 'nope.md'))).toBeNull();
    });

    it('returns null for invalid content', () => {
      const filePath = path.join(testDir, 'bad.md');
      fs.writeFileSync(filePath, 'no frontmatter here', 'utf-8');
      expect(readBoardConfig(filePath)).toBeNull();
    });
  });

  describe('extension fields', () => {
    it('preserves extension fields on agent through parse', () => {
      const content = [
        '---',
        'title: Test Board',
        'columns:',
        '  - id: todo',
        '    title: To Do',
        'agent:',
        '  instructions:',
        '    - Be concise',
        '  x-otto:',
        '    model: gpt-4',
        '    temperature: 0.7',
        '---',
        '',
      ].join('\n');

      const result = parseBoardConfig(content);
      expect(result).not.toBeNull();
      expect(result!.config.agent!['x-otto']).toEqual({
        model: 'gpt-4',
        temperature: 0.7,
      });
    });

    it('round-trips agent extension fields through serialize and parse', () => {
      const config: BoardConfig = {
        title: 'Test Board',
        columns: [{ id: 'todo', title: 'To Do' }],
        agent: {
          instructions: ['Be concise'],
          'x-otto': { model: 'gpt-4', temperature: 0.7 },
        },
      };

      const serialized = serializeBoardConfig(config);
      expect(serialized).toContain('x-otto:');

      const result = parseBoardConfig(serialized);
      expect(result).not.toBeNull();
      expect(result!.config.agent!['x-otto']).toEqual({
        model: 'gpt-4',
        temperature: 0.7,
      });
    });

    it('round-trips board config extension fields through file write/read', () => {
      const config: BoardConfig = {
        title: 'Extensions Test',
        columns: [{ id: 'todo', title: 'To Do' }],
        agent: {
          instructions: ['Be fast'],
          identity: 'Speed daemon',
          'x-otto': { model: 'gpt-4o', chain: ['think', 'act'] },
        },
        'x-custom': { version: 2 },
      } as BoardConfig;

      const filePath = path.join(testDir, 'brainfile.md');
      writeBoardConfig(filePath, config);

      const result = readBoardConfig(filePath);
      expect(result).not.toBeNull();
      expect(result!.config.agent!['x-otto']).toEqual({
        model: 'gpt-4o',
        chain: ['think', 'act'],
      });
      expect(result!.config.agent!.identity).toBe('Speed daemon');
      expect(result!.config['x-custom']).toEqual({ version: 2 });
    });

    it('extension values are opaque (keys not transformed)', () => {
      const content = [
        '---',
        'title: Test Board',
        'columns:',
        '  - id: todo',
        '    title: To Do',
        'agent:',
        '  instructions:',
        '    - Test',
        '  x-otto:',
        '    model_chain:',
        '      - a',
        '    retry_count: 3',
        '---',
        '',
      ].join('\n');

      const result = parseBoardConfig(content);
      const ext = result!.config.agent!['x-otto'] as Record<string, unknown>;
      // Keys inside x-otto must stay as-is (snake_case), not be camel-cased
      expect(ext['model_chain']).toEqual(['a']);
      expect(ext['retry_count']).toBe(3);
    });
  });
});
