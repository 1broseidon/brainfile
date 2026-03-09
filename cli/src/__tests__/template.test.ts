import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { templateCommand } from '../commands/template';
import { Brainfile, type Column, type Task } from '@brainfile/core';
import { MemoryLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';

describe('template command', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const testBoardPath = path.join(fixturesDir, 'test-board.md');
  let tempDir: string;
  let tempBoardPath: string;
  let logger: MemoryLogger;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-template-test-'));
    tempBoardPath = path.join(tempDir, 'temp-board-template.md');
    fs.copyFileSync(testBoardPath, tempBoardPath);
    logger = new MemoryLogger();
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('list templates', () => {
    it('should list all built-in templates', () => {
      const result = templateCommand({
        file: tempBoardPath,
        list: true,
        column: 'todo',
      }, logger);

      expect(result.success).toBe(true);

      const output = logger.getOutput();
      expect(output).toContain('Available Templates');
      expect(output).toContain('bug-report');
      expect(output).toContain('feature-request');
      expect(output).toContain('refactor');
    });

    it('should show template details', () => {
      templateCommand({
        file: tempBoardPath,
        list: true,
        column: 'todo',
      }, logger);

      const output = logger.getOutput();

      expect(output).toContain('Bug Report');
      expect(output).toContain('Default Priority');
      expect(output).toContain('Default Tags');
      expect(output).toContain('Subtasks');
    });
  });

  describe('use template', () => {
    it('should create task from bug-report template', () => {
      const result = templateCommand({
        file: tempBoardPath,
        use: 'bug-report',
        title: 'Test bug',
        column: 'todo',
      }, logger);

      expect(result.success).toBe(true);
      expect(logger.getOutput()).toContain('Task created from template');

      const content = fs.readFileSync(tempBoardPath, 'utf-8');
      const board = Brainfile.parse(content);

      const todoColumn = board?.columns.find((col: Column) => col.id === 'todo');
      const newTask = todoColumn?.tasks.find((t: Task) => t.title === 'Test bug');

      expect(newTask).toBeDefined();
      expect(newTask?.template).toBe('bug');
      expect(newTask?.priority).toBe('high');
      expect(newTask?.tags).toContain('bug');
      expect(newTask?.tags).toContain('needs-triage');
      expect(newTask?.subtasks).toHaveLength(5);
    });

    it('should create task from feature-request template', () => {
      templateCommand({
        file: tempBoardPath,
        use: 'feature-request',
        title: 'New feature',
        column: 'todo',
      }, logger);

      const content = fs.readFileSync(tempBoardPath, 'utf-8');
      const board = Brainfile.parse(content);

      const todoColumn = board?.columns.find((col: Column) => col.id === 'todo');
      const newTask = todoColumn?.tasks.find((t: Task) => t.title === 'New feature');

      expect(newTask).toBeDefined();
      expect(newTask?.template).toBe('feature');
      expect(newTask?.priority).toBe('medium');
      expect(newTask?.tags).toContain('feature');
      expect(newTask?.subtasks).toHaveLength(6);
    });

    it('should create task from refactor template', () => {
      templateCommand({
        file: tempBoardPath,
        use: 'refactor',
        title: 'Code cleanup',
        column: 'todo',
      }, logger);

      const content = fs.readFileSync(tempBoardPath, 'utf-8');
      const board = Brainfile.parse(content);

      const todoColumn = board?.columns.find((col: Column) => col.id === 'todo');
      // Refactor template uses {area} variable, so title may be different
      const newTask = todoColumn?.tasks[todoColumn.tasks.length - 1]; // Get last added task

      expect(newTask).toBeDefined();
      expect(newTask?.template).toBe('refactor');
      expect(newTask?.priority).toBe('low');
      expect(newTask?.tags).toContain('refactor');
    });

    it('should require title when using template', () => {
      try {
        templateCommand({
          file: tempBoardPath,
          use: 'bug-report',
          column: 'todo',
        }, logger);
      } catch (error) {
        expect(error).toBeInstanceOf(CLIError);
        expect((error as CLIError).message).toContain('--title is required');
      }
    });

    it('should handle invalid template', () => {
      try {
        templateCommand({
          file: tempBoardPath,
          use: 'invalid-template',
          title: 'Test',
          column: 'todo',
        }, logger);
      } catch (error) {
        expect(error).toBeInstanceOf(CLIError);
        expect((error as CLIError).message).toContain('Template not found');
      }
    });

    it('should support custom description', () => {
      templateCommand({
        file: tempBoardPath,
        use: 'bug-report',
        title: 'Bug with description',
        description: 'Custom description text',
        column: 'todo',
      }, logger);

      const content = fs.readFileSync(tempBoardPath, 'utf-8');
      const board = Brainfile.parse(content);

      const todoColumn = board?.columns.find((col: Column) => col.id === 'todo');
      const newTask = todoColumn?.tasks.find((t: Task) => t.title === 'Bug with description');

      expect(newTask?.description).toContain('Custom description text');
    });

    it('should add task to specified column', () => {
      templateCommand({
        file: tempBoardPath,
        use: 'feature-request',
        title: 'Feature in progress',
        column: 'in-progress',
      }, logger);

      const content = fs.readFileSync(tempBoardPath, 'utf-8');
      const board = Brainfile.parse(content);

      const inProgressColumn = board?.columns.find((col: Column) => col.id === 'in-progress');
      const newTask = inProgressColumn?.tasks.find((t: Task) => t.title === 'Feature in progress');

      expect(newTask).toBeDefined();
    });
  });

  describe('no action specified', () => {
    it('should show help when no flags provided', () => {
      const result = templateCommand({
        file: tempBoardPath,
        column: 'todo',
      }, logger);

      expect(result.success).toBe(false);
      expect(logger.getOutput()).toContain('Please specify an action');
    });
  });
});
