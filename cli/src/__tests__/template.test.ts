import * as fs from 'fs';
import * as path from 'path';
import { templateCommand } from '../commands/template';
import { Brainfile } from '@brainfile/core';

describe('template command', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const testBoardPath = path.join(fixturesDir, 'test-board.md');
  const tempBoardPath = path.join(fixturesDir, 'temp-board.md');

  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;

  beforeEach(() => {
    fs.copyFileSync(testBoardPath, tempBoardPath);

    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
  });

  afterEach(() => {
    if (fs.existsSync(tempBoardPath)) {
      fs.unlinkSync(tempBoardPath);
    }

    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('list templates', () => {
    it('should list all built-in templates', () => {
      templateCommand({
        file: tempBoardPath,
        list: true,
        column: 'todo',
      });

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls.map(call => call.join(' ')).join('\n');

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
      });

      const output = consoleLogSpy.mock.calls.map(call => call.join(' ')).join('\n');

      expect(output).toContain('Bug Report');
      expect(output).toContain('Default Priority');
      expect(output).toContain('Default Tags');
      expect(output).toContain('Subtasks');
    });
  });

  describe('use template', () => {
    it('should create task from bug-report template', () => {
      templateCommand({
        file: tempBoardPath,
        use: 'bug-report',
        title: 'Test bug',
        column: 'todo',
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Task created from template')
      );

      const content = fs.readFileSync(tempBoardPath, 'utf-8');
      const board = Brainfile.parse(content);

      const todoColumn = board?.columns.find(col => col.id === 'todo');
      const newTask = todoColumn?.tasks.find(t => t.title === 'Test bug');

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
      });

      const content = fs.readFileSync(tempBoardPath, 'utf-8');
      const board = Brainfile.parse(content);

      const todoColumn = board?.columns.find(col => col.id === 'todo');
      const newTask = todoColumn?.tasks.find(t => t.title === 'New feature');

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
      });

      const content = fs.readFileSync(tempBoardPath, 'utf-8');
      const board = Brainfile.parse(content);

      const todoColumn = board?.columns.find(col => col.id === 'todo');
      // Refactor template uses {area} variable, so title may be different
      const newTask = todoColumn?.tasks[todoColumn.tasks.length - 1]; // Get last added task

      expect(newTask).toBeDefined();
      expect(newTask?.template).toBe('refactor');
      expect(newTask?.priority).toBe('low');
      expect(newTask?.tags).toContain('refactor');
    });

    it('should require title when using template', () => {
      expect(() => {
        templateCommand({
          file: tempBoardPath,
          use: 'bug-report',
          column: 'todo',
        });
      }).toThrow('process.exit');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('--title is required')
      );
    });

    it('should handle invalid template', () => {
      expect(() => {
        templateCommand({
          file: tempBoardPath,
          use: 'invalid-template',
          title: 'Test',
          column: 'todo',
        });
      }).toThrow('process.exit');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Template not found')
      );
    });

    it('should support custom description', () => {
      templateCommand({
        file: tempBoardPath,
        use: 'bug-report',
        title: 'Bug with description',
        description: 'Custom description text',
        column: 'todo',
      });

      const content = fs.readFileSync(tempBoardPath, 'utf-8');
      const board = Brainfile.parse(content);

      const todoColumn = board?.columns.find(col => col.id === 'todo');
      const newTask = todoColumn?.tasks.find(t => t.title === 'Bug with description');

      expect(newTask?.description).toContain('Custom description text');
    });

    it('should add task to specified column', () => {
      templateCommand({
        file: tempBoardPath,
        use: 'feature-request',
        title: 'Feature in progress',
        column: 'in-progress',
      });

      const content = fs.readFileSync(tempBoardPath, 'utf-8');
      const board = Brainfile.parse(content);

      const inProgressColumn = board?.columns.find(col => col.id === 'in-progress');
      const newTask = inProgressColumn?.tasks.find(t => t.title === 'Feature in progress');

      expect(newTask).toBeDefined();
    });
  });

  describe('no action specified', () => {
    it('should show help when no flags provided', () => {
      templateCommand({
        file: tempBoardPath,
        column: 'todo',
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Please specify an action')
      );
    });
  });
});
