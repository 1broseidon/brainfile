import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { migrateCommand } from '../commands/migrate';
import { readTaskFile } from '@brainfile/core';

describe('migrate command', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-migrate-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('migrates root legacy brainfile.md to v2 in one command', () => {
    const legacyContent = `---
title: Legacy Board
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: First task
  - id: done
    title: Done
    tasks:
      - id: task-2
        title: Completed task
---
`;

    fs.writeFileSync(path.join(tempDir, 'brainfile.md'), legacyContent, 'utf-8');

    migrateCommand({});

    const rootPath = path.join(tempDir, 'brainfile.md');
    const dotPath = path.join(tempDir, '.brainfile', 'brainfile.md');
    const boardTaskPath = path.join(tempDir, '.brainfile', 'board', 'task-1.md');
    const logTaskPath = path.join(tempDir, '.brainfile', 'logs', 'task-2.md');

    expect(fs.existsSync(rootPath)).toBe(false);
    expect(fs.existsSync(dotPath)).toBe(true);
    expect(fs.existsSync(dotPath + '.v1.bak')).toBe(true);
    expect(fs.existsSync(boardTaskPath)).toBe(true);
    expect(fs.existsSync(logTaskPath)).toBe(true);

    const configContent = fs.readFileSync(dotPath, 'utf-8');
    expect(configContent).toContain('schema: https://brainfile.md/v2/board.json');

    const boardTask = readTaskFile(boardTaskPath);
    expect(boardTask).not.toBeNull();
    expect(boardTask!.task.column).toBe('todo');

    const logTask = readTaskFile(logTaskPath);
    expect(logTask).not.toBeNull();
    expect(logTask!.task.completedAt).toBeDefined();
  });

  it('never writes a rules block into the v2 config (adr-2)', () => {
    // A real v1 board carrying the removed feature. Migration must not carry
    // it forward: the v2 config is freshly constructed, and reintroducing
    // `rules` there would resurrect a field the schema no longer has.
    const legacyContent = `---
title: Legacy Board With Rules
agent:
  instructions:
    - Preserve all IDs
rules:
  always:
    - id: 1
      rule: write tests first
  never:
    - id: 2
      rule: commit secrets
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: First task
---
`;

    fs.writeFileSync(path.join(tempDir, 'brainfile.md'), legacyContent, 'utf-8');

    migrateCommand({});

    const configContent = fs.readFileSync(
      path.join(tempDir, '.brainfile', 'brainfile.md'),
      'utf-8',
    );

    expect(configContent).not.toMatch(/^rules:/m);
    expect(configContent).not.toContain('write tests first');
    expect(configContent).not.toContain('commit secrets');

    // Everything else still migrates normally.
    expect(configContent).toContain('title: Legacy Board With Rules');
    expect(configContent).toContain('Preserve all IDs');
    expect(fs.existsSync(path.join(tempDir, '.brainfile', 'board', 'task-1.md'))).toBe(true);

    // The v1 backup keeps the original, so nothing is lost — `lint --fix` on
    // that file is the documented path to fold the rules into instructions.
    const backup = fs.readFileSync(
      path.join(tempDir, '.brainfile', 'brainfile.md.v1.bak'),
      'utf-8',
    );
    expect(backup).toContain('write tests first');
  });
});
