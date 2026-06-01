import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  rulesCommand,
  rulesListCommand,
  rulesAddCommand,
  rulesDeleteCommand,
  type RulesListOptions,
  type RulesAddOptions,
  type RulesDeleteOptions,
} from '../commands/rules';
import { Brainfile } from '@brainfile/core';
import { MemoryLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';

describe('rules command', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const testBoardPath = path.join(fixturesDir, 'test-board.md');
  let tempDir: string;
  let tempBoardPath: string;
  let logger: MemoryLogger;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-rules-test-'));
    tempBoardPath = path.join(tempDir, 'temp-board-rules.md');
    fs.copyFileSync(testBoardPath, tempBoardPath);
    logger = new MemoryLogger();
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('rulesListCommand', () => {
    it('should list no rules when none exist', () => {
      const result = rulesListCommand(
        { file: tempBoardPath },
        logger
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe('list');
      expect(result.totalCount).toBe(0);

      const output = logger.getOutput();
      expect(output).toContain('No rules defined');
    });

    it('should list all rules when they exist', () => {
      // Add some rules first
      rulesAddCommand({ file: tempBoardPath, category: 'always', text: 'Use TypeScript' }, logger);
      rulesAddCommand({ file: tempBoardPath, category: 'never', text: 'Skip tests' }, logger);
      logger.clear();

      const result = rulesListCommand(
        { file: tempBoardPath },
        logger
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe('list');
      expect(result.totalCount).toBe(2);

      const output = logger.getOutput();
      expect(output).toContain('ALWAYS');
      expect(output).toContain('Use TypeScript');
      expect(output).toContain('NEVER');
      expect(output).toContain('Skip tests');
    });

    it('should filter by category when specified', () => {
      // Add rules to different categories
      rulesAddCommand({ file: tempBoardPath, category: 'always', text: 'Always rule' }, logger);
      rulesAddCommand({ file: tempBoardPath, category: 'never', text: 'Never rule' }, logger);
      logger.clear();

      const result = rulesListCommand(
        { file: tempBoardPath, category: 'always' },
        logger
      );

      expect(result.success).toBe(true);
      expect(result.rules.always).toBeDefined();
      expect(result.rules.always?.length).toBe(1);
      expect(result.rules.never).toBeUndefined();

      const output = logger.getOutput();
      expect(output).toContain('Always rule');
      expect(output).not.toContain('Never rule');
    });

    it('should output JSON when --json flag is set', () => {
      rulesAddCommand({ file: tempBoardPath, category: 'prefer', text: 'Functional style' }, logger);
      logger.clear();

      const result = rulesListCommand(
        { file: tempBoardPath, json: true },
        logger
      );

      expect(result.success).toBe(true);

      const output = logger.getOutput();
      const parsed = JSON.parse(output);

      expect(parsed.rules).toBeDefined();
      expect(parsed.totalCount).toBe(1);
      expect(parsed.rules.prefer).toHaveLength(1);
      expect(parsed.rules.prefer[0].rule).toBe('Functional style');
    });
  });

  describe('rulesAddCommand', () => {
    it('should add a rule to always category', () => {
      const result = rulesAddCommand(
        {
          file: tempBoardPath,
          category: 'always',
          text: 'Use strict mode',
        },
        logger
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe('add');
      expect(result.category).toBe('always');
      expect(result.rule).toBeDefined();
      expect(result.rule.rule).toBe('Use strict mode');

      const output = logger.getOutput();
      expect(output).toContain('Added');
      expect(output).toContain('always');
      expect(output).toContain('Use strict mode');

      // Verify rule was added to file
      const content = fs.readFileSync(tempBoardPath, 'utf-8');
      const board = Brainfile.parse(content);
      expect(board?.rules?.always).toHaveLength(1);
      expect(board?.rules?.always?.[0].rule).toBe('Use strict mode');
    });

    it('should add a rule to never category', () => {
      const result = rulesAddCommand(
        {
          file: tempBoardPath,
          category: 'never',
          text: 'Commit .env files',
        },
        logger
      );

      expect(result.success).toBe(true);
      expect(result.category).toBe('never');
      expect(result.rule.rule).toBe('Commit .env files');
    });

    it('should add a rule to prefer category', () => {
      const result = rulesAddCommand(
        {
          file: tempBoardPath,
          category: 'prefer',
          text: 'Composition over inheritance',
        },
        logger
      );

      expect(result.success).toBe(true);
      expect(result.category).toBe('prefer');
      expect(result.rule.rule).toBe('Composition over inheritance');
    });

    it('should add a rule to context category', () => {
      const result = rulesAddCommand(
        {
          file: tempBoardPath,
          category: 'context',
          text: 'Use Express for API routes',
        },
        logger
      );

      expect(result.success).toBe(true);
      expect(result.category).toBe('context');
      expect(result.rule.rule).toBe('Use Express for API routes');
    });

    it('should auto-assign rule IDs', () => {
      rulesAddCommand({ file: tempBoardPath, category: 'always', text: 'First rule' }, logger);
      rulesAddCommand({ file: tempBoardPath, category: 'always', text: 'Second rule' }, logger);

      const content = fs.readFileSync(tempBoardPath, 'utf-8');
      const board = Brainfile.parse(content);

      expect(board?.rules?.always?.[0].id).toBe(1);
      expect(board?.rules?.always?.[1].id).toBe(2);
    });

    it('should output JSON when --json flag is set', () => {
      const result = rulesAddCommand(
        {
          file: tempBoardPath,
          category: 'always',
          text: 'Test rule',
          json: true,
        },
        logger
      );

      expect(result.success).toBe(true);

      const output = logger.getOutput();
      const parsed = JSON.parse(output);

      expect(parsed.success).toBe(true);
      expect(parsed.action).toBe('add');
      expect(parsed.category).toBe('always');
      expect(parsed.rule.rule).toBe('Test rule');
    });

    it('should throw CLIError for invalid category', () => {
      expect(() => {
        rulesAddCommand(
          {
            file: tempBoardPath,
            category: 'invalid' as any,
            text: 'Test',
          },
          logger
        );
      }).toThrow(CLIError);

      try {
        rulesAddCommand(
          {
            file: tempBoardPath,
            category: 'invalid' as any,
            text: 'Test',
          },
          logger
        );
      } catch (e) {
        expect(e).toBeInstanceOf(CLIError);
        expect((e as CLIError).message).toContain('Invalid category');
      }
    });

    it('should throw CLIError for non-existent file', () => {
      expect(() => {
        rulesAddCommand(
          {
            file: 'non-existent.md',
            category: 'always',
            text: 'Test',
          },
          logger
        );
      }).toThrow(CLIError);
    });
  });

  describe('rulesDeleteCommand', () => {
    it('should delete an existing rule', () => {
      // Add a rule first
      rulesAddCommand({ file: tempBoardPath, category: 'always', text: 'Rule to delete' }, logger);
      logger.clear();

      const result = rulesDeleteCommand(
        {
          file: tempBoardPath,
          category: 'always',
          id: 1,
        },
        logger
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe('delete');
      expect(result.category).toBe('always');
      expect(result.id).toBe(1);

      const output = logger.getOutput();
      expect(output).toContain('Deleted');
      expect(output).toContain('always');
      expect(output).toContain('Rule to delete');

      // Verify rule was deleted from file
      const content = fs.readFileSync(tempBoardPath, 'utf-8');
      const board = Brainfile.parse(content);
      expect(board?.rules?.always?.length || 0).toBe(0);
    });

    it('should output JSON when --json flag is set', () => {
      rulesAddCommand({ file: tempBoardPath, category: 'never', text: 'Rule to delete' }, logger);
      logger.clear();

      const result = rulesDeleteCommand(
        {
          file: tempBoardPath,
          category: 'never',
          id: 1,
          json: true,
        },
        logger
      );

      expect(result.success).toBe(true);

      const output = logger.getOutput();
      const parsed = JSON.parse(output);

      expect(parsed.success).toBe(true);
      expect(parsed.action).toBe('delete');
      expect(parsed.category).toBe('never');
      expect(parsed.id).toBe(1);
      expect(parsed.deletedRule).toBeDefined();
    });

    it('should throw CLIError for non-existent rule ID', () => {
      expect(() => {
        rulesDeleteCommand(
          {
            file: tempBoardPath,
            category: 'always',
            id: 999,
          },
          logger
        );
      }).toThrow(CLIError);

      try {
        rulesDeleteCommand(
          {
            file: tempBoardPath,
            category: 'always',
            id: 999,
          },
          logger
        );
      } catch (e) {
        expect(e).toBeInstanceOf(CLIError);
        expect((e as CLIError).message).toContain('not found');
      }
    });

    it('should throw CLIError for invalid category', () => {
      expect(() => {
        rulesDeleteCommand(
          {
            file: tempBoardPath,
            category: 'invalid' as any,
            id: 1,
          },
          logger
        );
      }).toThrow(CLIError);
    });
  });

  describe('rulesCommand (dispatcher)', () => {
    it('should default to list action when no action specified', () => {
      const result = rulesCommand(
        undefined,
        [],
        { file: tempBoardPath },
        logger
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe('list');
    });

    it('should dispatch to list action', () => {
      const result = rulesCommand(
        'list',
        [],
        { file: tempBoardPath },
        logger
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe('list');
    });

    it('should dispatch to add action with args', () => {
      const result = rulesCommand(
        'add',
        ['always', 'My', 'rule', 'text'],
        { file: tempBoardPath },
        logger
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe('add');

      // Verify the text was joined correctly
      const content = fs.readFileSync(tempBoardPath, 'utf-8');
      const board = Brainfile.parse(content);
      expect(board?.rules?.always?.[0].rule).toBe('My rule text');
    });

    it('should dispatch to delete action with args', () => {
      rulesAddCommand({ file: tempBoardPath, category: 'prefer', text: 'Test rule' }, logger);
      logger.clear();

      const result = rulesCommand(
        'delete',
        ['prefer', '1'],
        { file: tempBoardPath },
        logger
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe('delete');
    });

    it('should throw CLIError for add without enough args', () => {
      expect(() => {
        rulesCommand(
          'add',
          ['always'],
          { file: tempBoardPath },
          logger
        );
      }).toThrow(CLIError);
    });

    it('should throw CLIError for delete without enough args', () => {
      expect(() => {
        rulesCommand(
          'delete',
          ['always'],
          { file: tempBoardPath },
          logger
        );
      }).toThrow(CLIError);
    });

    it('should throw CLIError for delete with invalid ID', () => {
      expect(() => {
        rulesCommand(
          'delete',
          ['always', 'not-a-number'],
          { file: tempBoardPath },
          logger
        );
      }).toThrow(CLIError);

      try {
        rulesCommand(
          'delete',
          ['always', 'not-a-number'],
          { file: tempBoardPath },
          logger
        );
      } catch (e) {
        expect(e).toBeInstanceOf(CLIError);
        expect((e as CLIError).message).toContain('Invalid rule ID');
      }
    });

    it('should support --json flag for all actions', () => {
      // Test list with json
      const listResult = rulesCommand(
        'list',
        [],
        { file: tempBoardPath, json: true },
        logger
      );
      expect(listResult.success).toBe(true);

      const listOutput = logger.getOutput();
      expect(() => JSON.parse(listOutput)).not.toThrow();
      logger.clear();

      // Test add with json
      const addResult = rulesCommand(
        'add',
        ['context', 'JSON test rule'],
        { file: tempBoardPath, json: true },
        logger
      );
      expect(addResult.success).toBe(true);

      const addOutput = logger.getOutput();
      expect(() => JSON.parse(addOutput)).not.toThrow();
    });

    it('should pass category filter to list command', () => {
      rulesAddCommand({ file: tempBoardPath, category: 'always', text: 'Always' }, logger);
      rulesAddCommand({ file: tempBoardPath, category: 'never', text: 'Never' }, logger);
      logger.clear();

      const result = rulesCommand(
        'list',
        [],
        { file: tempBoardPath, category: 'never' },
        logger
      );

      expect(result.success).toBe(true);
      const output = logger.getOutput();
      expect(output).toContain('NEVER');
      expect(output).not.toContain('ALWAYS');
    });
  });
});
