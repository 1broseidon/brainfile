import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  addColumn,
  columnIdFromTitle,
  findColumnConfig,
  orderedColumns,
  readBoardSettings,
  removeColumn,
  renameColumn,
  reorderColumns,
  updateBoardSettings,
} from '../boardConfigEdits';
import {
  addColumnFile,
  listColumnsFile,
  readBoardSettingsFile,
  removeColumnFile,
  renameColumnFile,
  reorderColumnsFile,
  updateBoardSettingsFile,
} from '../boardConfigOperations';
import { readBoardConfig } from '../boardFile';
import { readTaskFile, writeTaskFile } from '../taskFile';
import type { BoardConfig } from '../types';

const base = (): BoardConfig => ({
  title: 'Board',
  columns: [
    { id: 'todo', title: 'To Do' },
    { id: 'in-progress', title: 'In Progress' },
    { id: 'done', title: 'Done', completionColumn: true },
  ],
});

const ids = (config?: BoardConfig) => (config?.columns ?? []).map((c) => c.id);

describe('board config edits (spec-13)', () => {
  describe('columns', () => {
    it('makes an ID from a title', () => {
      expect(columnIdFromTitle('In Review')).toBe('in-review');
      expect(columnIdFromTitle('  QA / Ready ')).toBe('qa-ready');
      expect(columnIdFromTitle('Café')).toBe('cafe');
      expect(columnIdFromTitle('!!!')).toBe('');
    });

    it('finds a column by ID, then by title', () => {
      const config = base();
      expect(findColumnConfig(config, 'todo')?.id).toBe('todo');
      expect(findColumnConfig(config, 'in progress')?.id).toBe('in-progress');
      expect(findColumnConfig(config, 'nope')).toBeUndefined();
    });

    it('orders columns by order, then as listed', () => {
      const config: BoardConfig = {
        title: 'B',
        columns: [
          { id: 'a', title: 'A', order: 3 },
          { id: 'b', title: 'B' },
          { id: 'c', title: 'C', order: 1 },
        ],
      };
      expect(orderedColumns(config).map((c) => c.id)).toEqual(['c', 'a', 'b']);
    });

    it('adds a column last, or after or before another', () => {
      const config = base();
      const last = addColumn(config, { title: 'Review' });
      expect(last.success).toBe(true);
      expect(ids(last.config)).toEqual(['todo', 'in-progress', 'done', 'review']);
      expect(last.column).toEqual({ id: 'review', title: 'Review' });
      // The config passed in is untouched.
      expect(ids(config)).toEqual(['todo', 'in-progress', 'done']);

      const after = addColumn(config, { title: 'Review', after: 'in-progress' });
      expect(ids(after.config)).toEqual(['todo', 'in-progress', 'review', 'done']);

      const before = addColumn(config, { title: 'Backlog', before: 'To Do', id: 'backlog', completionColumn: false });
      expect(ids(before.config)).toEqual(['backlog', 'todo', 'in-progress', 'done']);

      const done2 = addColumn(config, { title: 'Shipped', completionColumn: true });
      expect(done2.column).toEqual({ id: 'shipped', title: 'Shipped', completionColumn: true });
    });

    it('refuses a bad or duplicate column', () => {
      const config = base();
      expect(addColumn(config, { title: '  ' }).error).toMatch(/needs a title/);
      expect(addColumn(config, { title: '!!!' }).error).toMatch(/give one/);
      expect(addColumn(config, { title: 'X', id: 'has space' }).error).toMatch(/letters, digits/);
      expect(addColumn(config, { title: 'Doing', id: 'todo' }).error).toMatch(/ID 'todo' already exists/);
      expect(addColumn(config, { title: 'to do', id: 'todo2' }).error).toMatch(/titled 'to do' already exists/);
      expect(addColumn(config, { title: 'X', after: 'todo', before: 'done' }).error).toMatch(/not both/);
      expect(addColumn(config, { title: 'X', after: 'nope' }).error).toMatch(/column not found: nope/);
    });

    it('renumbers order when the board uses it', () => {
      const config: BoardConfig = {
        title: 'B',
        columns: [
          { id: 'todo', title: 'To Do', order: 1 },
          { id: 'done', title: 'Done', order: 2 },
        ],
      };
      const added = addColumn(config, { title: 'Doing', after: 'todo' });
      expect(added.config?.columns).toEqual([
        { id: 'todo', title: 'To Do', order: 1 },
        { id: 'doing', title: 'Doing', order: 2 },
        { id: 'done', title: 'Done', order: 3 },
      ]);
    });

    it('renames a column and keeps its ID', () => {
      const renamed = renameColumn(base(), 'in-progress', 'Doing');
      expect(renamed.success).toBe(true);
      expect(renamed.column).toEqual({ id: 'in-progress', title: 'Doing' });
      expect(renameColumn(base(), 'nope', 'X').error).toMatch(/column not found/);
      expect(renameColumn(base(), 'todo', ' ').error).toMatch(/needs a title/);
      expect(renameColumn(base(), 'todo', 'done').error).toMatch(/already exists/);
      // Its own title, in another case, is fine.
      expect(renameColumn(base(), 'todo', 'TO DO').success).toBe(true);
    });

    it('reorders: the columns named first, the rest after', () => {
      expect(ids(reorderColumns(base(), ['done', 'todo', 'in-progress']).config)).toEqual(['done', 'todo', 'in-progress']);
      expect(ids(reorderColumns(base(), ['In Progress']).config)).toEqual(['in-progress', 'todo', 'done']);
      expect(reorderColumns(base(), []).error).toMatch(/name the columns/);
      expect(reorderColumns(base(), ['todo', 'todo']).error).toMatch(/named twice/);
      expect(reorderColumns(base(), ['nope']).error).toMatch(/column not found/);
    });

    it('removes a column but never the last one', () => {
      const removed = removeColumn(base(), 'In Progress');
      expect(removed.success).toBe(true);
      expect(removed.column?.id).toBe('in-progress');
      expect(ids(removed.config)).toEqual(['todo', 'done']);
      expect(removeColumn(base(), 'nope').error).toMatch(/column not found/);
      expect(removeColumn({ title: 'B', columns: [{ id: 'only', title: 'Only' }] }, 'only').error).toMatch(/only column/);
    });
  });

  describe('title, instructions and related boards', () => {
    const withAgent = (): BoardConfig => ({
      ...base(),
      agent: { instructions: ['Write tests', 'Keep IDs'], identity: 'a careful engineer' },
      related: { mobile: '../mobile' },
    });

    it('reads the settings', () => {
      expect(readBoardSettings(withAgent())).toEqual({
        title: 'Board',
        instructions: ['Write tests', 'Keep IDs'],
        related: { mobile: '../mobile' },
      });
      expect(readBoardSettings(base())).toEqual({ title: 'Board', instructions: [], related: {} });
    });

    it('sets the title', () => {
      const result = updateBoardSettings(base(), { title: '  New title ' });
      expect(result.changed).toEqual(['title']);
      expect(result.config?.title).toBe('New title');
      expect(updateBoardSettings(base(), { title: 'Board' }).changed).toEqual([]);
      expect(updateBoardSettings(base(), { title: ' ' }).error).toMatch(/cannot be empty/);
    });

    it('replaces, removes and adds instructions, keeping the rest of agent', () => {
      const replaced = updateBoardSettings(withAgent(), { instructions: ['One', ' ', 'Two'] });
      expect(replaced.config?.agent).toEqual({ instructions: ['One', 'Two'], identity: 'a careful engineer' });

      const edited = updateBoardSettings(withAgent(), { removeInstructions: ['Keep IDs'], addInstructions: ['Write tests', 'Run lint'] });
      expect(edited.changed).toEqual(['instructions']);
      expect(edited.config?.agent?.instructions).toEqual(['Write tests', 'Run lint']);

      const fresh = updateBoardSettings(base(), { addInstructions: ['First'] });
      expect(fresh.config?.agent).toEqual({ instructions: ['First'] });

      expect(updateBoardSettings(withAgent(), { removeInstructions: ['Nope'] }).error).toMatch(/not an instruction on this board: "Nope"/);
      expect(updateBoardSettings(withAgent(), { addInstructions: ['Keep IDs'] }).changed).toEqual([]);
    });

    it('adds, repoints and removes related boards', () => {
      const added = updateBoardSettings(withAgent(), { addRelated: { sdk: ' ../sdk ', mobile: '../mobile-app' } });
      expect(added.changed).toEqual(['related']);
      expect(added.config?.related).toEqual({ mobile: '../mobile-app', sdk: '../sdk' });

      const removed = updateBoardSettings(withAgent(), { removeRelated: ['mobile'] });
      expect(removed.changed).toEqual(['related']);
      expect(removed.config && 'related' in removed.config).toBe(false);

      expect(updateBoardSettings(withAgent(), { removeRelated: ['nope'] }).error).toMatch(/no related board named 'nope'/);
      expect(updateBoardSettings(withAgent(), { addRelated: { 'bad name': '../x' } }).error).toMatch(/letters, digits/);
      expect(updateBoardSettings(withAgent(), { addRelated: { ok: ' ' } }).error).toMatch(/needs a folder/);
      expect(updateBoardSettings(withAgent(), { addRelated: { mobile: '../mobile' } }).changed).toEqual([]);
    });

    it('changes nothing on an error part-way through', () => {
      const config = withAgent();
      const result = updateBoardSettings(config, { title: 'Other', removeRelated: ['nope'] });
      expect(result.success).toBe(false);
      expect(result.config).toBeUndefined();
      expect(config.title).toBe('Board');
    });
  });

  describe('on disk', () => {
    let dir: string;
    let brainfilePath: string;
    let boardDir: string;

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-board-config-'));
      const dotDir = path.join(dir, '.brainfile');
      boardDir = path.join(dotDir, 'board');
      fs.mkdirSync(boardDir, { recursive: true });
      fs.mkdirSync(path.join(dotDir, 'logs'), { recursive: true });
      brainfilePath = path.join(dotDir, 'brainfile.md');
      fs.writeFileSync(brainfilePath, [
        '---',
        'title: Disk Board',
        'x-otto:',
        '  keep: true',
        'columns:',
        '  - id: todo',
        '    title: To Do',
        '  - id: review',
        '    title: Review',
        '  - id: done',
        '    title: Done',
        '    completionColumn: true',
        '---',
        '',
        '# Disk Board',
        '',
        'Notes stay.',
        '',
      ].join('\n'));
      writeTaskFile(path.join(boardDir, 'task-1.md'), { id: 'task-1', title: 'One', column: 'review', position: 1 }, '');
      writeTaskFile(path.join(boardDir, 'task-2.md'), { id: 'task-2', title: 'Two', column: 'review', position: 0 }, '');
      writeTaskFile(path.join(boardDir, 'task-3.md'), { id: 'task-3', title: 'Three', column: 'todo' }, '');
    });

    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('lists columns with task counts', () => {
      const listed = listColumnsFile(brainfilePath);
      expect(listed.columns?.map((c) => [c.id, c.taskCount])).toEqual([['todo', 1], ['review', 2], ['done', 0]]);
      expect(listColumnsFile(path.join(dir, 'missing.md')).error).toMatch(/Failed to read/);
    });

    it('adds, renames and reorders, keeping other keys and the body', () => {
      expect(addColumnFile(brainfilePath, { title: 'Doing', after: 'todo' }).success).toBe(true);
      expect(renameColumnFile(brainfilePath, 'doing', 'In Progress').column).toEqual({ id: 'doing', title: 'In Progress' });
      const reordered = reorderColumnsFile(brainfilePath, ['review', 'todo']);
      expect(reordered.columns?.map((c) => c.id)).toEqual(['review', 'todo', 'doing', 'done']);

      const board = readBoardConfig(brainfilePath)!;
      expect(board.config.columns.map((c) => c.id)).toEqual(['review', 'todo', 'doing', 'done']);
      expect(board.config['x-otto']).toEqual({ keep: true });
      expect(board.body).toContain('Notes stay.');
      expect(addColumnFile(brainfilePath, { title: 'Review' }).error).toMatch(/already exists/);
    });

    it('refuses to remove a column with tasks unless told where they go', () => {
      const refused = removeColumnFile(brainfilePath, 'review');
      expect(refused.success).toBe(false);
      expect(refused.error).toMatch(/holds 2 tasks \(task-2, task-1\); say which column they move to/);
      expect(readBoardConfig(brainfilePath)!.config.columns.map((c) => c.id)).toContain('review');

      expect(removeColumnFile(brainfilePath, 'review', { moveTo: 'nope' }).error).toMatch(/column not found: nope/);
      expect(removeColumnFile(brainfilePath, 'review', { moveTo: 'Review' }).error).toMatch(/into itself/);
    });

    it('moves the tasks, in order and not completed, then removes the column', () => {
      const removed = removeColumnFile(brainfilePath, 'Review', { moveTo: 'done' });
      expect(removed.success).toBe(true);
      expect(removed.moved).toEqual(['task-2', 'task-1']);
      expect(removed.movedTo?.id).toBe('done');
      expect(removed.columns?.map((c) => [c.id, c.taskCount])).toEqual([['todo', 1], ['done', 2]]);
      // Still on the board: a removal never completes work.
      expect(readTaskFile(path.join(boardDir, 'task-1.md'))?.task.column).toBe('done');
      expect(readTaskFile(path.join(boardDir, 'task-2.md'))?.task.column).toBe('done');
    });

    it('removes an empty column', () => {
      const removed = removeColumnFile(brainfilePath, 'done');
      expect(removed.success).toBe(true);
      expect(removed.moved).toEqual([]);
      expect(readBoardConfig(brainfilePath)!.config.columns.map((c) => c.id)).toEqual(['todo', 'review']);
    });

    it('reads and updates the settings, writing only on a change', () => {
      expect(readBoardSettingsFile(brainfilePath).settings).toEqual({ title: 'Disk Board', instructions: [], related: {} });
      const before = fs.readFileSync(brainfilePath, 'utf-8');
      expect(updateBoardSettingsFile(brainfilePath, { title: 'Disk Board' }).changed).toEqual([]);
      expect(fs.readFileSync(brainfilePath, 'utf-8')).toBe(before);

      const updated = updateBoardSettingsFile(brainfilePath, {
        title: 'Renamed',
        addInstructions: ['Write tests'],
        addRelated: { sdk: '../sdk' },
      });
      expect(updated.changed).toEqual(['title', 'instructions', 'related']);
      expect(readBoardSettingsFile(brainfilePath).settings).toEqual({
        title: 'Renamed',
        instructions: ['Write tests'],
        related: { sdk: '../sdk' },
      });
      expect(updateBoardSettingsFile(brainfilePath, { removeRelated: ['nope'] }).error).toMatch(/no related board/);
      expect(readBoardSettingsFile(path.join(dir, 'missing.md')).success).toBe(false);
      expect(updateBoardSettingsFile(path.join(dir, 'missing.md'), { title: 'x' }).success).toBe(false);
    });
  });
});
