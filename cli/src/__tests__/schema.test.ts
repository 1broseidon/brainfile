import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { schemaCommand } from '../commands/schema';
import { MemoryLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';

describe('schema command', () => {
  let tempDir: string;
  let originalHome: string | undefined;
  let originalXdgConfigHome: string | undefined;
  let logger: MemoryLogger;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-schema-test-'));
    originalHome = process.env.HOME;
    originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    process.env.HOME = tempDir;
    process.env.XDG_CONFIG_HOME = path.join(tempDir, '.config');
    logger = new MemoryLogger();
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('list schemas', () => {
    it('should list all available schemas', () => {
      const result = schemaCommand({}, logger);

      expect(result.success).toBe(true);
      expect(result.action).toBe('list');
      expect(result.schemas).toContain('board');
      expect(result.schemas).toContain('base');

      const output = logger.getOutput();
      expect(output).toContain('Available schemas');
      expect(output).toContain('board');
      expect(output).toContain('base');
    });

    it('should output JSON when --json flag is set', () => {
      const result = schemaCommand({ json: true }, logger);

      expect(result.success).toBe(true);

      const output = logger.getOutput();
      const parsed = JSON.parse(output);

      expect(parsed.schemas).toBeDefined();
      expect(parsed.schemas.length).toBe(2);
      expect(parsed.schemas.some((s: any) => s.id === 'board')).toBe(true);
      expect(parsed.schemas.some((s: any) => s.id === 'base')).toBe(true);
    });
  });

  describe('show schema', () => {
    it('should display board schema content', () => {
      const result = schemaCommand({ name: 'board' }, logger);

      expect(result.success).toBe(true);
      expect(result.action).toBe('show');
      expect(result.schema).toBeDefined();

      const output = logger.getOutput();
      expect(output).toContain('Schema: board');
      expect(output).toContain('$schema');
      expect(output).toContain('board.json');
    });

    it('should display base schema content', () => {
      const result = schemaCommand({ name: 'base' }, logger);

      expect(result.success).toBe(true);
      expect(result.action).toBe('show');
      expect(result.schema).toBeDefined();

      const output = logger.getOutput();
      expect(output).toContain('Schema: base');
      expect(output).toContain('$schema');
    });

    it('should output JSON when --json flag is set', () => {
      const result = schemaCommand({ name: 'board', json: true }, logger);

      expect(result.success).toBe(true);

      const output = logger.getOutput();
      const parsed = JSON.parse(output);

      expect(parsed.$schema).toBeDefined();
      expect(parsed.$id).toContain('board.json');
    });

    it('should throw CLIError for unknown schema', () => {
      expect(() => {
        schemaCommand({ name: 'nonexistent' }, logger);
      }).toThrow(CLIError);

      try {
        schemaCommand({ name: 'nonexistent' }, logger);
      } catch (e) {
        expect(e).toBeInstanceOf(CLIError);
        expect((e as CLIError).message).toContain('Unknown schema');
      }
    });
  });

  describe('schema files', () => {
    it('should have bundled board.json schema', () => {
      // Check that the schema file exists in src/schemas
      const schemaPath = path.join(__dirname, '..', 'schemas', 'board.json');
      expect(fs.existsSync(schemaPath)).toBe(true);

      const content = fs.readFileSync(schemaPath, 'utf-8');
      const schema = JSON.parse(content);

      expect(schema.$schema).toBeDefined();
      expect(schema.$id).toContain('board.json');
      expect(schema.title).toBe('Brainfile Board Schema');
    });

    it('should have bundled base.json schema', () => {
      // Check that the schema file exists in src/schemas
      const schemaPath = path.join(__dirname, '..', 'schemas', 'base.json');
      expect(fs.existsSync(schemaPath)).toBe(true);

      const content = fs.readFileSync(schemaPath, 'utf-8');
      const schema = JSON.parse(content);

      expect(schema.$schema).toBeDefined();
      expect(schema.$id).toContain('base.json');
      expect(schema.title).toBe('Brainfile Base Schema');
    });
  });

  describe('update command', () => {
    let originalFetch: typeof globalThis.fetch;
    let fetchMock: jest.Mock;

    // schemaCommand({ name: 'update' }) returns synchronously but fires a
    // FLOATING async task that fetches the published schemas and writes them
    // over the bundled copies. Under jest, getBundledSchemasDir() resolves to
    // cli/src/schemas -- the real, checked-in source tree -- so an unmocked
    // fetch here silently reverts local schema edits to whatever is currently
    // published at brainfile.md/v1. Always stub the network in this block.
    beforeEach(() => {
      originalFetch = globalThis.fetch;
      fetchMock = jest.fn().mockRejectedValue(new Error('network disabled in tests'));
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    });

    afterEach(async () => {
      // Let the floating update promise settle before restoring real fetch,
      // otherwise it resolves after teardown against the unstubbed global.
      await new Promise((resolve) => setTimeout(resolve, 25));
      globalThis.fetch = originalFetch;
    });

    it('should return success for update action', () => {
      const result = schemaCommand({ name: 'update' }, logger);

      expect(result.success).toBe(true);
      expect(result.action).toBe('update');
    });

    it('should output JSON when --json flag is set for update', () => {
      const result = schemaCommand({ name: 'update', json: true }, logger);

      expect(result.success).toBe(true);
      expect(result.action).toBe('update');
    });

    it('should not overwrite the bundled schema sources', async () => {
      const schemasDir = path.join(__dirname, '..', 'schemas');
      const before = fs
        .readdirSync(schemasDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => [f, fs.readFileSync(path.join(schemasDir, f), 'utf-8')] as const);

      expect(before.length).toBeGreaterThan(0);

      schemaCommand({ name: 'update' }, logger);
      await new Promise((resolve) => setTimeout(resolve, 25));

      for (const [file, content] of before) {
        expect(fs.readFileSync(path.join(schemasDir, file), 'utf-8')).toBe(content);
      }
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  describe('bundled board schema (adr-2)', () => {
    it('should not document the removed rules field', () => {
      const result = schemaCommand({ name: 'board' }, logger);
      const schema = result.schema as { description?: string };

      expect(schema.description).toBeDefined();
      expect(schema.description).not.toMatch(/rules/i);
    });
  });
});
