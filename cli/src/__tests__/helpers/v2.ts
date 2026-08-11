import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readTaskFile, taskFileName, writeTaskFile, type Task } from '@brainfile/core';

export interface V2TestWorkspace {
  tempDir: string;
  dotDir: string;
  brainfilePath: string;
  boardDir: string;
  logsDir: string;
}

export function createV2TestWorkspace(
  prefix = 'brainfile-v2-test-',
  config = `---
title: Test Board
schema: https://brainfile.md/v2/board.json
columns:
  - id: todo
    title: To Do
  - id: in-progress
    title: In Progress
  - id: done
    title: Done
---
`,
): V2TestWorkspace {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const dotDir = path.join(tempDir, '.brainfile');
  const boardDir = path.join(dotDir, 'board');
  const logsDir = path.join(dotDir, 'logs');
  const brainfilePath = path.join(dotDir, 'brainfile.md');

  fs.mkdirSync(boardDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });
  fs.writeFileSync(brainfilePath, config, 'utf-8');

  return { tempDir, dotDir, brainfilePath, boardDir, logsDir };
}

export function writeV2Task(workspace: V2TestWorkspace, task: Task, body = ''): string {
  const filePath = path.join(workspace.boardDir, taskFileName(task.id));
  writeTaskFile(filePath, task, body);
  return filePath;
}

export function readV2Task(workspace: V2TestWorkspace, taskId: string) {
  return readTaskFile(path.join(workspace.boardDir, taskFileName(taskId)));
}
