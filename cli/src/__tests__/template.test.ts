import * as fs from 'fs';
import * as path from 'path';
import { templateCommand } from '../commands/template';
import { readTaskFile } from '@brainfile/core';
import { MemoryLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';
import { createV2TestWorkspace, type V2TestWorkspace } from './helpers/v2';

describe('template command', () => {
  let workspace: V2TestWorkspace;
  let tempBoardPath: string;
  let logger: MemoryLogger;

  beforeEach(() => {
    workspace = createV2TestWorkspace('brainfile-template-test-');
    tempBoardPath = workspace.brainfilePath;
    logger = new MemoryLogger();
  });

  afterEach(() => {
    fs.rmSync(workspace.tempDir, { recursive: true, force: true });
  });

  function readCreatedTask(id: string) {
    return readTaskFile(path.join(workspace.boardDir, `${id}.md`));
  }

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
      expect(result.taskId).toBe('task-1');
      expect(logger.getOutput()).toContain('Task created from template');

      const doc = readCreatedTask('task-1');
      const newTask = doc?.task;

      expect(newTask).toBeDefined();
      expect(newTask?.title).toBe('Test bug');
      expect(newTask?.column).toBe('todo');
      expect(newTask?.template).toBe('bug');
      expect(newTask?.priority).toBe('high');
      expect(newTask?.tags).toContain('bug');
      expect(newTask?.tags).toContain('needs-triage');
      expect(newTask?.subtasks).toHaveLength(5);
    });

    it('should create task from feature-request template', () => {
      const result = templateCommand({
        file: tempBoardPath,
        use: 'feature-request',
        title: 'New feature',
        column: 'todo',
      }, logger);

      const newTask = readCreatedTask(result.taskId!)?.task;

      expect(newTask).toBeDefined();
      expect(newTask?.template).toBe('feature');
      expect(newTask?.priority).toBe('medium');
      expect(newTask?.tags).toContain('feature');
      expect(newTask?.subtasks).toHaveLength(6);
    });

    it('should create task from refactor template', () => {
      const result = templateCommand({
        file: tempBoardPath,
        use: 'refactor',
        title: 'Code cleanup',
        column: 'todo',
      }, logger);

      const newTask = readCreatedTask(result.taskId!)?.task;

      expect(newTask).toBeDefined();
      expect(newTask?.template).toBe('refactor');
      expect(newTask?.priority).toBe('low');
      expect(newTask?.tags).toContain('refactor');
    });

    it('should require title when using template', () => {
      expect(() => templateCommand({
        file: tempBoardPath,
        use: 'bug-report',
        column: 'todo',
      }, logger)).toThrow(CLIError);
    });

    it('should handle invalid template', () => {
      expect(() => templateCommand({
        file: tempBoardPath,
        use: 'invalid-template',
        title: 'Test',
        column: 'todo',
      }, logger)).toThrow(CLIError);

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
      const result = templateCommand({
        file: tempBoardPath,
        use: 'bug-report',
        title: 'Bug with description',
        description: 'Custom description text',
        column: 'todo',
      }, logger);

      const doc = readCreatedTask(result.taskId!);
      expect(doc?.body).toContain('Custom description text');
    });

    it('should add task to specified column', () => {
      const result = templateCommand({
        file: tempBoardPath,
        use: 'feature-request',
        title: 'Feature in progress',
        column: 'in-progress',
      }, logger);

      const newTask = readCreatedTask(result.taskId!)?.task;
      expect(newTask).toBeDefined();
      expect(newTask?.column).toBe('in-progress');
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
