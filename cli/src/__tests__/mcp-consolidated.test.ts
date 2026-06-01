import { describe, test, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const mcpPath = path.join(__dirname, '..', 'commands', 'mcp.ts');
const source = fs.readFileSync(mcpPath, 'utf-8');

describe('mcp consolidated tools contract', () => {
  test('registers only the consolidated 10 tools', () => {
    const names = [...source.matchAll(/server\.registerTool\(\s*'([^']+)'/g)].map(match => match[1]);

    expect(names).toEqual([
      'list_tasks',
      'get_task',
      'search',
      'task_add',
      'task_move',
      'task_patch',
      'task_delete',
      'subtask',
      'contract',
      'task_complete',
    ]);
  });

  test('removes legacy mcp tools from registration surface', () => {
    const legacy = [
      'search_tasks',
      'add_task',
      'move_task',
      'patch_task',
      'delete_task',
      'complete_task',
      'archive_task',
      'restore_task',
      'add_subtask',
      'delete_subtask',
      'toggle_subtask',
      'update_subtask',
      'bulk_set_subtasks',
      'complete_all_subtasks',
      'bulk_move_tasks',
      'bulk_patch_tasks',
      'bulk_delete_tasks',
      'bulk_archive_tasks',
      'attach_contract',
      'contract_pickup',
      'contract_deliver',
      'contract_validate',
      'list_types',
      'list_rules',
      'add_rule',
      'delete_rule',
      'append_log',
      'search_logs',
    ];

    for (const tool of legacy) {
      expect(source).not.toContain(`'${tool}'`);
    }
  });

  test('subtask tool is unified and supports single/array/all targeting', () => {
    expect(source).toContain("server.registerTool(\n    'subtask'");
    expect(source).toContain("action: z.enum(['add', 'toggle', 'delete', 'update'])");
    expect(source).toContain('subtask: z.string().optional()');
    expect(source).toContain('subtasks: z.array(z.string()).optional()');
    expect(source).toContain('all: z.boolean().optional()');
  });

  test('contract tool stays unified with action parameter', () => {
    expect(source).toContain("server.registerTool(\n    'contract'");
    expect(source).toContain("action: z.enum(['attach', 'pickup', 'deliver', 'validate', 'graph', 'activate'])");
    expect(source).toContain("tasks: z.array(z.object({");
    expect(source).toContain("activate: z.boolean().optional().describe('graph only: when true, attached contracts start in ready instead of draft')");
  });

  test('task_move and task_patch support taskId as string or string[]', () => {
    const unionSnippet = "z.union([z.string(), z.array(z.string())]).optional().describe('Task ID or array of task IDs";
    expect(source).toContain(`taskId: ${unionSnippet} to move')`);
    expect(source).toContain(`taskId: ${unionSnippet} to update')`);
  });

  test('task_complete absorbs archive behavior via destination param', () => {
    expect(source).toContain("server.registerTool(\n    'task_complete'");
    expect(source).toContain("destination: z.enum(['local', 'github', 'linear']).optional()");
  });
});
