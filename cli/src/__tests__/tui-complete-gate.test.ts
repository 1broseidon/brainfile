/**
 * `archiveTaskAction` / `archiveTaskActionAsync` epic-safety threading.
 *
 * Core already refuses to complete an epic with active children unless forced,
 * and returns the blocking children with the failure. Before TUI v3 the TUI
 * wrapper dropped both halves: no way to force, and no way to learn *which*
 * children blocked. The `c complete` interaction (design §5) needs both.
 *
 * The parameter is optional and the response field additive, so every existing
 * two-argument call site keeps working — asserted below.
 */
import * as fs from 'fs';
import * as path from 'path';
import { archiveTaskAction, archiveTaskActionAsync } from '../tui/actions';
import { createV2TestWorkspace, writeV2Task, type V2TestWorkspace } from './helpers/v2';

describe('archiveTaskAction epic-safety gate', () => {
  let ws: V2TestWorkspace;

  beforeEach(() => {
    ws = createV2TestWorkspace('brainfile-tui-complete-');
    writeV2Task(ws, {
      id: 'epic-1',
      title: 'Post-migration cleanup',
      type: 'epic',
      column: 'todo',
      position: 0,
    });
    writeV2Task(ws, {
      id: 'task-1',
      title: 'Triage marketing board',
      parentId: 'epic-1',
      column: 'todo',
      position: 1,
    });
    writeV2Task(ws, {
      id: 'task-2',
      title: 'Prune supervisor remnants',
      parentId: 'epic-1',
      column: 'todo',
      position: 2,
    });
  });

  afterEach(() => {
    fs.rmSync(ws.tempDir, { recursive: true, force: true });
  });

  it('refuses an epic with active children and names them', () => {
    const result = archiveTaskAction(ws.brainfilePath, 'epic-1');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/incomplete child/i);
    expect(result.incompleteChildren).toEqual([
      { id: 'task-1', title: 'Triage marketing board' },
      { id: 'task-2', title: 'Prune supervisor remnants' },
    ]);
    expect(fs.existsSync(path.join(ws.boardDir, 'epic-1.md'))).toBe(true);
  });

  const ledgerIds = (): string[] =>
    fs
      .readFileSync(path.join(ws.logsDir, 'ledger.jsonl'), 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line).id);

  it('completes the epic once forced', () => {
    const result = archiveTaskAction(ws.brainfilePath, 'epic-1', { force: true });

    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(ws.boardDir, 'epic-1.md'))).toBe(false);
    expect(ledgerIds()).toContain('epic-1');
  });

  it('completes a childless document without any options argument', () => {
    const result = archiveTaskAction(ws.brainfilePath, 'task-1');

    expect(result.success).toBe(true);
    expect(result.incompleteChildren).toBeUndefined();
    expect(ledgerIds()).toContain('task-1');
  });

  it('forwards the gate through the async (destination-aware) wrapper', async () => {
    const blocked = await archiveTaskActionAsync(ws.brainfilePath, 'epic-1');
    expect(blocked.success).toBe(false);
    expect(blocked.incompleteChildren).toHaveLength(2);

    const forced = await archiveTaskActionAsync(ws.brainfilePath, 'epic-1', { force: true });
    expect(forced.success).toBe(true);
  });
});
