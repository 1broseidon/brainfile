import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createV2TestWorkspace, readV2Task, writeV2Task, type V2TestWorkspace } from './helpers/v2';

describe('CLI failure result exit codes', () => {
  const distCli = path.join(__dirname, '..', '..', 'dist', 'cli.js');
  let workspace: V2TestWorkspace;

  beforeEach(() => {
    workspace = createV2TestWorkspace('brainfile-cli-result-');
  });

  afterEach(() => {
    fs.rmSync(workspace.tempDir, { recursive: true, force: true });
  });

  function runCli(...args: string[]) {
    const result = spawnSync(process.execPath, [distCli, ...args, '-f', workspace.brainfilePath], {
      cwd: workspace.tempDir,
      encoding: 'utf-8',
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    });
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    return result;
  }

  test.each(['missing deliverable', 'failing command'])('validation exits 1 for a %s and preserves feedback', (failure) => {
    writeV2Task(workspace, {
      id: 'task-1',
      title: 'Fail validation',
      column: 'in-progress',
      contract: {
        status: 'delivered',
        ...(failure === 'missing deliverable'
          ? { deliverables: [{ type: 'file' as const, path: 'missing.txt' }] }
          : { validation: { commands: ['node -e "process.exit(1)"'] } }),
      },
    });

    const result = runCli('contract', 'validate', '-t', 'task-1');

    expect(result.stdout).toContain('Contract validation failed: task-1');
    expect(result.status).toBe(1);
    const contract = readV2Task(workspace, 'task-1')?.task.contract;
    expect(contract?.status).toBe('failed');
    expect(contract?.feedback).toBeDefined();
  });

  test('successful validation exits 0', () => {
    writeV2Task(workspace, {
      id: 'task-1',
      title: 'Pass validation',
      column: 'in-progress',
      contract: { status: 'delivered', validation: { commands: ['node -e "process.exit(0)"'] } },
    });

    const result = runCli('contract', 'validate', '-t', 'task-1');
    expect(result.stdout).toContain('Contract validation passed: task-1');
    expect(result.status).toBe(0);
  });

  test('template without an action exits 1', () => {
    const result = runCli('template');
    expect(result.stderr).toContain('Please specify an action:');
    expect(result.status).toBe(1);
  });

  test('listing templates exits 0', () => {
    const result = runCli('template', '--list');
    expect(result.stdout).toContain('Available Templates');
    expect(result.status).toBe(0);
  });
});
