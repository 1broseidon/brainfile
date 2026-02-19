import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { migrateCommand } from '../commands/migrate';
import { readTaskFile } from '@brainfile/core';

describe('migrate command (legacy .brainfile source)', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-migrate-v2-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('converts v1 embedded tasks to v2 per-task files', () => {
    // Create a v1 brainfile with embedded tasks
    const dotDir = path.join(tempDir, '.brainfile');
    fs.mkdirSync(dotDir, { recursive: true });

    const v1Content = `---
title: Test Board
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: First task
        priority: high
        tags:
          - urgent
      - id: task-2
        title: Second task
        description: A task with description
  - id: in-progress
    title: In Progress
    tasks:
      - id: task-3
        title: Active task
        assignee: alice
  - id: done
    title: Done
    tasks:
      - id: task-4
        title: Completed task
---

# Test Board
`;

    const brainfilePath = path.join(dotDir, 'brainfile.md');
    fs.writeFileSync(brainfilePath, v1Content, 'utf-8');

    // Run v2 migration
    migrateCommand({ v2: true });

    // Verify board/ and logs/ directories were created
    const boardDir = path.join(dotDir, 'board');
    const logsDir = path.join(dotDir, 'logs');
    expect(fs.existsSync(boardDir)).toBe(true);
    expect(fs.existsSync(logsDir)).toBe(true);

    // Verify active tasks are in board/
    expect(fs.existsSync(path.join(boardDir, 'task-1.md'))).toBe(true);
    expect(fs.existsSync(path.join(boardDir, 'task-2.md'))).toBe(true);
    expect(fs.existsSync(path.join(boardDir, 'task-3.md'))).toBe(true);

    // Verify done tasks are in logs/
    expect(fs.existsSync(path.join(logsDir, 'task-4.md'))).toBe(true);

    // Verify task content
    const task1 = readTaskFile(path.join(boardDir, 'task-1.md'));
    expect(task1).not.toBeNull();
    expect(task1!.task.id).toBe('task-1');
    expect(task1!.task.title).toBe('First task');
    expect(task1!.task.priority).toBe('high');
    expect(task1!.task.column).toBe('todo');
    expect(task1!.task.position).toBe(0);

    const task3 = readTaskFile(path.join(boardDir, 'task-3.md'));
    expect(task3).not.toBeNull();
    expect(task3!.task.column).toBe('in-progress');
    expect(task3!.task.assignee).toBe('alice');

    // Verify completed task has completedAt and no column/position
    const task4 = readTaskFile(path.join(logsDir, 'task-4.md'));
    expect(task4).not.toBeNull();
    expect(task4!.task.completedAt).toBeDefined();
    expect(task4!.task.column).toBeFalsy();

    // Verify backup was created
    expect(fs.existsSync(brainfilePath + '.v1.bak')).toBe(true);

    // Verify brainfile.md is now config-only
    const updatedContent = fs.readFileSync(brainfilePath, 'utf-8');
    expect(updatedContent).toContain('columns:');
    // Should reference v2 schema
    expect(updatedContent).toContain('v2/board.json');
  });

  it('creates backup of original brainfile', () => {
    const dotDir = path.join(tempDir, '.brainfile');
    fs.mkdirSync(dotDir, { recursive: true });

    const v1Content = `---
title: Test
columns:
  - id: todo
    title: To Do
    tasks: []
---
`;

    const brainfilePath = path.join(dotDir, 'brainfile.md');
    fs.writeFileSync(brainfilePath, v1Content, 'utf-8');

    migrateCommand({ v2: true });

    const backupPath = brainfilePath + '.v1.bak';
    expect(fs.existsSync(backupPath)).toBe(true);
    const backupContent = fs.readFileSync(backupPath, 'utf-8');
    expect(backupContent).toBe(v1Content);
  });

  it('handles archived tasks during migration', () => {
    const dotDir = path.join(tempDir, '.brainfile');
    fs.mkdirSync(dotDir, { recursive: true });

    const v1Content = `---
title: Test
columns:
  - id: todo
    title: To Do
    tasks: []
archive:
  - id: task-99
    title: Archived task
---
`;

    const brainfilePath = path.join(dotDir, 'brainfile.md');
    fs.writeFileSync(brainfilePath, v1Content, 'utf-8');

    migrateCommand({ v2: true });

    // Archived tasks go to logs/
    const logsDir = path.join(dotDir, 'logs');
    expect(fs.existsSync(path.join(logsDir, 'task-99.md'))).toBe(true);

    const archivedTask = readTaskFile(path.join(logsDir, 'task-99.md'));
    expect(archivedTask).not.toBeNull();
    expect(archivedTask!.task.completedAt).toBeDefined();
  });

  it('migrates when only board/ exists (partial v2 scaffold)', () => {
    const dotDir = path.join(tempDir, '.brainfile');
    fs.mkdirSync(path.join(dotDir, 'board'), { recursive: true });

    const v1Content = `---
title: Partial Scaffold
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-7
        title: Needs migration
---
`;

    const brainfilePath = path.join(dotDir, 'brainfile.md');
    fs.writeFileSync(brainfilePath, v1Content, 'utf-8');

    migrateCommand({});

    expect(fs.existsSync(path.join(dotDir, 'board', 'task-7.md'))).toBe(true);
    expect(fs.existsSync(path.join(dotDir, 'logs'))).toBe(true);
  });
});

describe('migrate mixed workspace handling', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-migrate-mixed-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('backs up root brainfile.md when workspace is already v2', () => {
    const dotDir = path.join(tempDir, '.brainfile');
    fs.mkdirSync(path.join(dotDir, 'board'), { recursive: true });
    fs.mkdirSync(path.join(dotDir, 'logs'), { recursive: true });

    const v2Config = `---
title: V2 Board
columns:
  - id: todo
    title: To Do
---
`;
    fs.writeFileSync(path.join(dotDir, 'brainfile.md'), v2Config, 'utf-8');
    fs.writeFileSync(path.join(tempDir, 'brainfile.md'), 'legacy root file', 'utf-8');

    migrateCommand({});

    expect(fs.existsSync(path.join(tempDir, 'brainfile.md'))).toBe(false);

    const backups = fs.readdirSync(dotDir).filter((name) => name.startsWith('brainfile.root.legacy') && name.endsWith('.bak'));
    expect(backups.length).toBe(1);
    expect(fs.readFileSync(path.join(dotDir, backups[0]), 'utf-8')).toBe('legacy root file');
  });
});
